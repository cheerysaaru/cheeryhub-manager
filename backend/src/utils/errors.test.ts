import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { apiErrorHandler } from './errors';
import { EnvError, resetEnvForTests, validateEnv } from '../env';

const SECRET = 'super-secret-jwt-value-0123456789abcdef';

type Handler = (
  error: unknown,
  request: Partial<Request>,
  response: Partial<Response>,
  next: NextFunction
) => unknown;

function run(
  error: unknown,
  overrides: { requestId?: string; headersSent?: boolean; origin?: string } = {}
) {
  const result: { status?: number; body?: unknown; headers: Record<string, unknown> } = { headers: {} };
  const request = {
    method: 'POST',
    path: '/api/tasks',
    requestId: overrides.requestId,
    headers: overrides.origin ? { origin: overrides.origin } : {},
  } as unknown as Request;
  const response = {
    headersSent: overrides.headersSent ?? false,
    status(code: number) {
      result.status = code;
      return this;
    },
    json(payload: unknown) {
      result.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      result.headers[name.toLowerCase()] = value;
      return this;
    },
  } as unknown as Response;
  const next = (() => {
    result.status = undefined;
    result.body = 'next-called';
  }) as unknown as NextFunction;

  (apiErrorHandler as unknown as Handler)(error, request, response, next);
  return result;
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetEnvForTests();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('apiErrorHandler', () => {
  it('hides details in production and never leaks secrets', () => {
    validateEnv({ JWT_SECRET: SECRET, NODE_ENV: 'production' }, { cache: true });

    const result = run(
      new Error(`jwt failure while verifying ${SECRET} with provider response {"token":"${SECRET}"}`),
      { requestId: 'req-123' }
    );

    expect(result.status).toBe(500);
    const body = result.body as Record<string, unknown>;
    expect(body.error).toBe('Something went wrong. Please try again.');
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.requestId).toBe('req-123');
    expect(JSON.stringify(body)).not.toContain(SECRET);

    // The detailed log line is written server-side, scrubbed of the secret.
    const logged = consoleError.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain('jwt failure while verifying');
    expect(logged).toContain('"method":"POST"');
    expect(logged).toContain('"url":"/api/tasks"');
    expect(logged).not.toContain(SECRET);
    expect(logged).toContain('[redacted]');
  });

  it('shows a redacted message outside production for debugging', () => {
    validateEnv({ JWT_SECRET: SECRET, NODE_ENV: 'development' }, { cache: true });

    const result = run(new Error(`prisma blew up on ${SECRET}`));
    const body = result.body as Record<string, unknown>;

    expect(result.status).toBe(500);
    expect(body.error).toBe('prisma blew up on [redacted]');
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it('maps CORS rejections to 403 with a friendly message', () => {
    validateEnv({ JWT_SECRET: SECRET, NODE_ENV: 'production' }, { cache: true });

    const result = run(new Error('Not allowed by CORS'));
    const body = result.body as Record<string, unknown>;

    expect(result.status).toBe(403);
    expect(body.code).toBe('ORIGIN_NOT_ALLOWED');
    expect(String(body.error)).toMatch(/origin/i);
  });

  it('maps validation errors to 400 without echoing input', () => {
    validateEnv({ JWT_SECRET: SECRET, NODE_ENV: 'development' }, { cache: true });

    const zodish = Object.assign(new Error('Invalid input'), { name: 'ZodError' });
    const result = run(zodish);
    const body = result.body as Record<string, unknown>;

    expect(result.status).toBe(400);
    expect(body.code).toBe('INVALID_REQUEST');
    expect(body.error).toBe('Invalid request. Please check your input and try again.');
  });

  it('maps malformed request bodies to 400', () => {
    validateEnv({ JWT_SECRET: SECRET, NODE_ENV: 'production' }, { cache: true });

    const result = run(
      Object.assign(new SyntaxError('Unexpected end of JSON input'), {
        type: 'entity.parse.failed',
      })
    );

    expect(result.status).toBe(400);
    expect((result.body as Record<string, unknown>).code).toBe('INVALID_REQUEST');
  });

  it('keeps CORS headers on unexpected errors for an allowed origin', () => {
    validateEnv(
      { JWT_SECRET: SECRET, NODE_ENV: 'production', FRONTEND_URL: 'http://localhost:5173' },
      { cache: true }
    );
    const result = run(new Error('database unavailable'), {
      requestId: 'req-cors',
      origin: 'http://localhost:5173',
    });

    expect(result.status).toBe(500);
    expect(result.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(result.headers['access-control-allow-credentials']).toBe('true');
    expect((result.body as Record<string, unknown>).requestId).toBe('req-cors');
  });

  it('delegates when headers were already sent', () => {
    const result = run(new Error('late failure'), { headersSent: true });
    expect(result.body).toBe('next-called');
  });

  it('fails safe when the environment itself is broken', () => {
    resetEnvForTests();
    process.env.JWT_SECRET = '';
    const result = run(new Error('boom'));
    const body = result.body as Record<string, unknown>;
    expect(result.status).toBe(500);
    expect(body.error).toBeTruthy();
    expect(EnvError).toBeDefined();
  });
});
