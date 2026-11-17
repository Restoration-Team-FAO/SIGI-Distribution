import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { URL } from 'url';
import { getValidatedEnv } from '../config/env';

type InternalJsonRequestOptions = {
  serviceName: string;
  baseUrl: string;
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: Buffer | string;
  timeoutMs?: number;
  maxRetries?: number;
  authorize?: boolean;
};

type HttpResponsePayload = {
  statusCode: number;
  bodyText: string;
};

export async function requestInternalJson<T>(
  options: InternalJsonRequestOptions,
): Promise<T> {
  const env = getValidatedEnv();
  const endpoint = new URL(options.path, options.baseUrl);
  const timeoutMs = options.timeoutMs ?? env.httpClientTimeoutMs;
  const maxRetries = Math.max(0, options.maxRetries ?? env.httpClientMaxRetries);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await performRequest({
        ...options,
        endpoint,
        timeoutMs,
        authorize: options.authorize ?? true,
      });
      return parseJsonResponse<T>(response, options.serviceName);
    } catch (error) {
      const normalized = normalizeRequestError(error, options.serviceName);
      if (attempt >= maxRetries || shouldStopRetrying(normalized)) {
        throw normalized;
      }
      lastError = normalized;
    }
  }

  throw (
    lastError ??
    new ServiceUnavailableException(
      `${options.serviceName} request failed after retries`,
    )
  );
}

async function performRequest(
  options: InternalJsonRequestOptions & { endpoint: URL; timeoutMs: number; authorize: boolean },
) {
  const env = getValidatedEnv();
  const payload =
    typeof options.body === 'string'
      ? Buffer.from(options.body, 'utf-8')
      : options.body ?? null;
  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  };

  if (payload && !headers['Content-Length']) {
    headers['Content-Length'] = String(payload.length);
  }
  if (options.authorize && !headers.Authorization) {
    headers.Authorization = `Bearer ${env.internalServiceToken}`;
  }

  return new Promise<HttpResponsePayload>((resolve, reject) => {
    const transport =
      options.endpoint.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = transport(
      options.endpoint,
      {
        method: options.method ?? 'GET',
        headers,
        timeout: options.timeoutMs,
      },
      (res) => {
        let rawResponse = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          rawResponse += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 500,
            bodyText: rawResponse,
          });
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error(`${options.serviceName} request timed out`));
    });
    req.on('error', (error) => reject(error));

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function parseJsonResponse<T>(
  response: HttpResponsePayload,
  serviceName: string,
): T {
  if (response.statusCode >= 400) {
    throw mapStatusToException(
      response.statusCode,
      serviceName,
      extractResponseMessage(response.bodyText),
    );
  }

  try {
    return JSON.parse(response.bodyText) as T;
  } catch {
    throw new ServiceUnavailableException(
      `${serviceName} returned an invalid payload`,
    );
  }
}

function mapStatusToException(
  statusCode: number,
  serviceName: string,
  responseMessage: string | null,
) {
  const fallbackMessage = `${serviceName} returned ${statusCode}`;
  const message = responseMessage ?? fallbackMessage;

  if (statusCode === 400 || statusCode === 409 || statusCode === 413 || statusCode === 422) {
    return new BadRequestException(message);
  }
  if (statusCode === 401 || statusCode === 403) {
    return new ServiceUnavailableException(
      `${serviceName} authentication failed`,
    );
  }
  if (statusCode >= 500) {
    return new ServiceUnavailableException(message);
  }
  return new ServiceUnavailableException(fallbackMessage);
}

function extractResponseMessage(bodyText: string) {
  if (!bodyText.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(bodyText) as {
      detail?: string;
      message?: string | string[];
      error?: string;
    };
    if (Array.isArray(parsed.message) && parsed.message.length > 0) {
      return parsed.message.join(', ');
    }
    if (typeof parsed.message === 'string' && parsed.message.trim().length > 0) {
      return parsed.message;
    }
    if (typeof parsed.detail === 'string' && parsed.detail.trim().length > 0) {
      return parsed.detail;
    }
    if (typeof parsed.error === 'string' && parsed.error.trim().length > 0) {
      return parsed.error;
    }
  } catch {
    return bodyText.trim().slice(0, 300);
  }

  return null;
}

function normalizeRequestError(error: unknown, serviceName: string) {
  if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) {
    return error;
  }
  if (error instanceof Error) {
    return new ServiceUnavailableException(
      `${serviceName} request failed: ${error.message}`,
    );
  }
  return new ServiceUnavailableException(`${serviceName} request failed`);
}

function shouldStopRetrying(error: Error) {
  return error instanceof BadRequestException;
}
