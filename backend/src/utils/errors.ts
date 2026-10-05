import type { ErrorRequestHandler, Request, Response } from 'express';
import { redactSecrets, getEnv } from '../env';
import { logError } from '../lib/logger';
import { getCorsOrigins } from '../lib/config';

type RequestWithId = Request & { requestId?: string };

function productionMode(): boolean {
  try {
    return getEnv().NODE_ENV === 'production';
  } catch {
    return process.env.NODE_ENV === 'production';
  }
}

function statusFor(error: unknown): number {
  const name = (error as { name?: string } | null)?.name;
  const type = (error as { type?: string } | null)?.type;
  if (name === 'PrismaClientValidationError') return 400;
  if (name === 'ZodError') return 400;
  if (type === 'entity.parse.failed' || type === 'entity.too.large') return 400;
  if ((error as Error | null)?.message === 'Not allowed by CORS') return 403;
  return 500;
}

/**
 * Single place where unexpected errors become responses: details (with a
 * request id) are logged server-side, the client gets a friendly message
 * and never a stack trace, provider payload or secret value.
 */
export const apiErrorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) return next(error);

  const requestWithId = request as RequestWithId;
  const status = statusFor(error);

  logError(requestWithId.requestId, error, {
    method: request.method,
    url: request.originalUrl || request.url || request.path,
    status,
  });

  const origin = request.headers.origin;
  if (origin && getCorsOrigins().includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    response.setHeader('Vary', 'Origin');
  }

  if (status === 403) {
    return response.status(403).json({
      error: 'This origin is not allowed to call the API.',
      code: 'ORIGIN_NOT_ALLOWED',
      requestId: requestWithId.requestId,
    });
  }

  if (status === 400) {
    const message =
      (error as Error | null)?.message === 'Not allowed by CORS'
        ? 'This origin is not allowed to call the API.'
        : 'Invalid request. Please check your input and try again.';
    return response.status(400).json({
      error: message,
      code: 'INVALID_REQUEST',
      requestId: requestWithId.requestId,
    });
  }

  const isProduction = productionMode();
  const detail = redactSecrets((error as Error | null)?.message ?? '');
  const message = isProduction
    ? 'Something went wrong. Please try again.'
    : detail || 'Internal server error';

  return response.status(500).json({
    error: message,
    code: 'INTERNAL_ERROR',
    requestId: requestWithId.requestId,
  });
};
