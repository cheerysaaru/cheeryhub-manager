import { describe, expect, it } from 'vitest';

const apiUrl = process.env.STAGING_API_URL;

describe.skipIf(!apiUrl)('staging API smoke tests', () => {
  it('reports that the isolated staging D1 is connected', async () => {
    const response = await fetch(`${apiUrl}/health`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.database).toBe('connected');
  }, 30_000);

  it('returns CORS headers for the staging frontend origin', async () => {
    const response = await fetch(`${apiUrl}/tasks`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:4173',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'content-type',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:4173'
    );
  }, 30_000);

  it('includes the request ID in unauthenticated API errors', async () => {
    const response = await fetch(`${apiUrl}/tasks`, {
      headers: { 'X-Request-Id': 'staging-e2e-request-id' },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(body.code).toBe('AUTH_REQUIRED');
    expect(body.requestId).toBe('staging-e2e-request-id');
    expect(response.headers.get('x-request-id')).toBe('staging-e2e-request-id');
  }, 30_000);

  it('includes the request ID in invalid-credentials responses', async () => {
    const requestId = `staging-login-${Date.now()}`;
    const response = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
      },
      body: JSON.stringify({
        email: `${requestId}@example.test`,
        password: 'WrongPassword9!',
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(body.code).toBe('INVALID_CREDENTIALS');
    expect(body.requestId).toBe(requestId);
    expect(response.headers.get('x-request-id')).toBe(requestId);
  }, 30_000);
});
