import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import http from 'http';
import type { AddressInfo } from 'net';
import { createApp } from './app';
import { resetEnvForTests, validateEnv } from './env';

const SECRET = 'app-integration-secret-0123456789abcdef-0123456789abcdef';

let openServer: http.Server;
let limitedServer: http.Server;
let base: string;
let limitedBase: string;

async function listen(app: ReturnType<typeof createApp>): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

beforeAll(async () => {
  process.env.JWT_SECRET = SECRET;
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'file:./dev.db';
  process.env.AUTH_RATE_LIMIT_MAX = '2';
  resetEnvForTests();
  validateEnv(process.env, { cache: true });

  const open = await listen(createApp({ rateLimit: false }));
  openServer = open.server;
  base = open.url;

  const limited = await listen(createApp({ rateLimit: true }));
  limitedServer = limited.server;
  limitedBase = limited.url;
});

afterAll(async () => {
  for (const server of [openServer, limitedServer]) {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('GET /api/health', () => {
  it('reports status and config presence without any secret values', async () => {
    const response = await fetch(`${base}/api/health`);
    const body = (await response.json()) as Record<string, unknown>;

    expect([200, 503]).toContain(response.status);
    expect(typeof body.status).toBe('string');
    expect(typeof body.database).toBe('string');
    expect(response.headers.get('x-request-id')).toBeTruthy();

    const config = body.config as Record<string, boolean>;
    expect(config).toBeTruthy();
    expect(config.jwtSecret).toBe(true);
    expect(config.frontendUrl).toBe(true);
    expect(Object.values(config).every((value) => typeof value === 'boolean')).toBe(true);

    const raw = JSON.stringify(body);
    expect(raw).not.toContain(SECRET);
    expect(raw).not.toContain('replace-with-a-long-random-secret');
  });
});

describe('auth errors', () => {
  it('answers 401 with a machine-readable code instead of a bare message', async () => {
    const response = await fetch(`${base}/api/tasks`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(body.code).toBe('AUTH_REQUIRED');
    expect(String(body.error)).toMatch(/authentication/i);
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(body.requestId).toBe(response.headers.get('x-request-id'));
  });

  it('rejects an unreadable refresh token as an expired session', async () => {
    const response = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: 'auth_token=not-a-jwt' },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(body.code).toBe('SESSION_EXPIRED');
    expect(String(body.error)).toMatch(/expired/i);
    expect(body.requestId).toBe(response.headers.get('x-request-id'));
  });

  it('tells a cookie-less refresh call there is nothing to refresh', async () => {
    const response = await fetch(`${base}/api/auth/refresh`, { method: 'POST' });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(body.code).toBe('AUTH_REQUIRED');
    expect(body.requestId).toBe(response.headers.get('x-request-id'));
  });
});

describe('request validation and CORS', () => {
  it('answers 400 for a malformed JSON body', async () => {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: '{"email": ',
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body.code).toBe('INVALID_REQUEST');
    expect(String(body.error)).toMatch(/check your input/i);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('answers preflight with the configured methods and headers', async () => {
    const response = await fetch(`${base}/api/tasks`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(response.headers.get('access-control-allow-methods')).toContain('PATCH');
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('authorization');
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('content-type');
  });

  it('rejects a disallowed origin with a friendly message', async () => {
    const response = await fetch(`${base}/api/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(body.code).toBe('ORIGIN_NOT_ALLOWED');
    expect(String(body.error)).toMatch(/origin/i);
  });

  it('allows the configured frontend origin', async () => {
    const response = await fetch(`${base}/api/health`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(response.headers.get('content-security-policy')).toContain(
      "connect-src 'self' http://localhost:5173"
    );
  });
});

// The Tasks page and the Commitments history page are hidden from the navbar
// but must keep working when someone refreshes or pastes their URL directly.
const clientBuilt = fs.existsSync(
  path.resolve(__dirname, '../../frontend/dist/index.html')
);

describe.skipIf(!clientBuilt)('SPA deep links', () => {
  it.each(['/tasks', '/commitments/history', '/commitments'])(
    'answers %s with the app shell so a refresh never 404s',
    async (route) => {
      const response = await fetch(`${base}${route}`, {
        headers: { Accept: 'text/html' },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      const html = await response.text();
      expect(html).toContain('<div id="root">');
    }
  );
});

describe('rate limiting', () => {
  it('returns JSON with a code and Retry-After instead of plain text', async () => {
    const attempt = () =>
      fetch(`${limitedBase}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

    const first = await attempt();
    const second = await attempt();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const third = await attempt();
    const body = (await third.json()) as Record<string, unknown>;

    expect(third.status).toBe(429);
    expect(body.code).toBe('RATE_LIMITED');
    expect(String(body.error)).toMatch(/too many requests/i);
    expect(third.headers.get('retry-after')).toBeTruthy();
    expect(third.headers.get('x-request-id')).toBeTruthy();
  });
});
