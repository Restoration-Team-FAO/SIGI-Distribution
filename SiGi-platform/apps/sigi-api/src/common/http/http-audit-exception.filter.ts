import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuditService } from '../../modules/audit/audit.service';
import { AuthPrincipal } from '../../modules/auth/auth.types';

type AuthenticatedRequest = Request & {
  user?: AuthPrincipal;
};

@Catch(HttpException)
export class HttpAuditExceptionFilter implements ExceptionFilter {
  constructor(private readonly auditService: AuditService) {}

  catch(exception: HttpException, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<AuthenticatedRequest>();
    const response = context.getResponse<Response>();
    const status = exception.getStatus();
    const payload = exception.getResponse();
    const message = this.resolveMessage(payload, exception.message);
    const requestId = request.header('x-request-id') ?? null;
    const code = this.resolveCode(status, payload);

    if ([401, 403, 429].includes(status)) {
      void this.auditService.recordAccessEvent({
        actorUserId: request.user?.userId ?? null,
        egiId: getRequestedEgiId(request),
        action: this.resolveAction(status),
        result: 'failed',
        details: {
          statusCode: status,
          message,
          method: request.method,
          path: request.originalUrl,
          routePath: request.route?.path ?? null,
          requestId,
          ipAddress: getClientIp(request),
          userAgent: request.header('user-agent') ?? null,
          roles: request.user?.roles ?? [],
          permissions: request.user?.permissions ?? [],
          code,
        },
      }).catch(() => undefined);
    }

    const responseBody =
      typeof payload === 'object' && payload !== null
        ? {
            ...(payload as Record<string, unknown>),
            statusCode: status,
            message,
            code,
            requestId,
          }
        : {
            statusCode: status,
            message,
            error: exception.name,
            code,
            requestId,
          };

    response.status(status).json(responseBody);
  }

  private resolveAction(status: number) {
    if (status === 401) {
      return 'access.unauthorized';
    }
    if (status === 403) {
      return 'access.forbidden';
    }
    if (status === 429) {
      return 'access.rate_limited';
    }
    return 'access.http_error';
  }

  private resolveMessage(payload: unknown, fallback: string) {
    if (typeof payload === 'string' && payload.trim().length > 0) {
      return payload;
    }
    if (
      payload &&
      typeof payload === 'object' &&
      'message' in payload
    ) {
      const message = (payload as { message?: string | string[] }).message;
      if (Array.isArray(message)) {
        return message.join(', ');
      }
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
    }
    return fallback;
  }

  private resolveCode(status: number, payload: unknown) {
    if (payload && typeof payload === 'object' && 'code' in payload) {
      const code = (payload as { code?: unknown }).code;
      if (typeof code === 'string' && code.trim().length > 0) {
        return code;
      }
    }

    if (status === 401) {
      return 'auth.unauthorized';
    }
    if (status === 403) {
      return 'auth.forbidden';
    }
    if (status === 404) {
      return 'resource.not_found';
    }
    if (status === 409) {
      return 'request.conflict';
    }
    if (status === 422) {
      return 'request.invalid';
    }
    if (status === 429) {
      return 'request.rate_limited';
    }
    if (status >= 500) {
      return 'server.error';
    }
    return 'request.failed';
  }
}

function getRequestedEgiId(request: Request) {
  const headerValue = request.header('x-sigi-egi-id');
  if (typeof headerValue === 'string' && headerValue.trim().length > 0) {
    return headerValue.trim();
  }

  const routeParamId =
    typeof request.params?.id === 'string' && request.params.id.trim().length > 0
      ? request.params.id.trim()
      : null;
  if (
    routeParamId &&
    request.originalUrl.includes('/admin/egi/') &&
    request.originalUrl.includes('/summary')
  ) {
    return routeParamId;
  }

  return null;
}

function getClientIp(request: Request) {
  const forwardedFor = request.header('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}
