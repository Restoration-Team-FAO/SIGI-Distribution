import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { getValidatedEnv } from './common/config/env';
import { HttpAuditExceptionFilter } from './common/http/http-audit-exception.filter';
import { MulterExceptionFilter } from './common/http/multer-exception.filter';
import { AuditService } from './modules/audit/audit.service';
import {
  completeRequest,
  incrementRequests,
  recordRequestCompletion,
} from './common/observability/metrics';

async function bootstrap() {
  const env = getValidatedEnv();
  const app = await NestFactory.create(AppModule);
  const auditService = app.get(AuditService);
  app.getHttpAdapter().getInstance().set('trust proxy', env.trustProxyHops);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(
    new MulterExceptionFilter(),
    new HttpAuditExceptionFilter(auditService),
  );
  app.enableCors({
    origin: env.corsAllowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-SIGI-EGI-ID',
      'X-SIGI-VIEW-SCOPE',
      'X-Request-ID',
    ],
    // Content-Disposition/X-SIGI-Export-* must be exposed explicitly — CORS
    // hides all response headers from browser JS by default except the
    // small always-safe set (Content-Type among them), so without this the
    // export download silently fell back to a generic file name/no
    // truncation notice (P0-8 frontend verification).
    exposedHeaders: ['X-Request-ID', 'Content-Disposition', 'X-SIGI-Export-Total', 'X-SIGI-Export-Exported', 'X-SIGI-Export-Truncated'],
    credentials: true,
  });
  const logger = new Logger('Bootstrap');
  const requestBuckets = new Map<string, { count: number; resetAt: number }>();

  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = req.header('x-request-id')?.trim() || buildRequestId();
    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isRateLimitExempt(req.path)) {
      next();
      return;
    }

    const now = Date.now();
    cleanupExpiredBuckets(requestBuckets, now);
    const clientIp = getClientIp(req);
    const limit = isSensitivePath(req.path)
      ? env.sensitiveRateLimitMaxRequests
      : env.rateLimitMaxRequests;
    const bucketKey = `${clientIp}:${classifyPath(req.path)}`;
    const current = requestBuckets.get(bucketKey);

    if (!current || current.resetAt <= now) {
      requestBuckets.set(bucketKey, {
        count: 1,
        resetAt: now + env.rateLimitWindowMs,
      });
      next();
      return;
    }

    if (current.count >= limit) {
      void auditService.recordAccessEvent({
        actorUserId: null,
        egiId: getRequestedEgiId(req),
        action: 'access.rate_limited',
        result: 'failed',
        details: {
          statusCode: 429,
          message: 'Rate limit exceeded',
          code: 'request.rate_limited',
          method: req.method,
          path: req.originalUrl,
          routePath: req.route?.path ?? null,
          requestId: req.header('x-request-id') ?? null,
          ipAddress: getClientIp(req),
          userAgent: req.header('user-agent') ?? null,
          bucketKey,
          limit,
          windowMs: env.rateLimitWindowMs,
        },
      }).catch(() => undefined);
      res.status(429).json({
        statusCode: 429,
        message: 'Too many requests',
        error: 'Rate limit exceeded',
        code: 'request.rate_limited',
        requestId: req.header('x-request-id') ?? null,
      });
      return;
    }

    current.count += 1;
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    incrementRequests();
    const requestId = req.header('x-request-id') ?? 'unknown';

    res.on('finish', () => {
      completeRequest();
      recordRequestCompletion(res.statusCode);
      logger.log(
        JSON.stringify({
          event: 'http_request',
          requestId,
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
          clientIp: getClientIp(req),
        }),
      );
    });

    next();
  });

  logger.log(
    JSON.stringify({
      event: 'startup_config',
      logLevel: env.logLevel,
      httpClientTimeoutMs: env.httpClientTimeoutMs,
      httpClientMaxRetries: env.httpClientMaxRetries,
      integrationServiceUrl: env.integrationServiceUrl,
      gisServiceUrl: env.gisServiceUrl,
      authTokensConfigured: env.allowLegacyAdminTokens,
      legacyAdminTokensEnabled: env.allowLegacyAdminTokens,
      corsAllowedOrigins: env.corsAllowedOrigins,
      trustProxyHops: env.trustProxyHops,
    }),
  );

  await app.listen(env.sigiApiPort);
}

bootstrap();

function buildRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getRequestedEgiId(req: Request) {
  const headerValue = req.header('x-sigi-egi-id');
  return typeof headerValue === 'string' && headerValue.trim().length > 0
    ? headerValue.trim()
    : null;
}

function getClientIp(req: Request) {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function isRateLimitExempt(path: string) {
  return path === '/api/health' || path === '/api/ready';
}

function isSensitivePath(path: string) {
  return (
    path.startsWith('/api/auth') ||
    path.startsWith('/api/admin/') ||
    path.startsWith('/api/sync-jobs') ||
    path.startsWith('/api/datasets/import/') ||
    path.startsWith('/api/metrics') ||
    path.startsWith('/api/exports')
  );
}

function classifyPath(path: string) {
  if (isSensitivePath(path)) {
    return 'sensitive';
  }
  return 'general';
}

function cleanupExpiredBuckets(
  buckets: Map<string, { count: number; resetAt: number }>,
  now: number,
) {
  for (const [key, bucket] of Array.from(buckets.entries())) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}
