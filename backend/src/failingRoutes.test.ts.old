import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import jwt from 'jsonwebtoken';
import { createApp } from './app';
import { resetEnvForTests, validateEnv } from './env';

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  task: { findMany: vi.fn(), count: vi.fn() },
  dailyStats: { findMany: vi.fn() },
  xPTransaction: {
    aggregate: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  habit: { findFirst: vi.fn() },
  habitCompletion: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    upsert: vi.fn(),
  },
  habitDayEvent: { create: vi.fn() },
  notification: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('./lib/prisma', () => ({ prisma: db }));
vi.mock('./lib/notifications', () => ({
  generateNotifications: vi.fn().mockResolvedValue(undefined),
  refreshNotificationsInBackground: vi.fn(),
}));

const SECRET = 'test-only-jwt-secret-0123456789abcdef-0123456789abcdef';
const USER = {
  id: 'test-user',
  role: 'USER',
  status: 'ACTIVE',
  passwordChangedAt: null,
  timezone: 'UTC',
};
const TOKEN = jwt.sign({ userId: USER.id }, SECRET);
const FRONTEND_ORIGIN = 'https://www.cheeryhub.space';

let server: http.Server;
let base: string;
let consoleError: ReturnType<typeof vi.spyOn>;

async function listen(app: ReturnType<typeof createApp>): Promise<void> {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
}

function headers(authenticated = true): HeadersInit {
  return {
    Origin: FRONTEND_ORIGIN,
    ...(authenticated ? { Authorization: `Bearer ${TOKEN}` } : {}),
  };
}

async function close(serverToClose: http.Server): Promise<void> {
  await new Promise<void>((resolve) => serverToClose.close(() => resolve()));
}

beforeAll(async () => {
  process.env.JWT_SECRET = SECRET;
  process.env.NODE_ENV = 'production';
  process.env.FRONTEND_URL = 'https://cheeryhub.space,https://www.cheeryhub.space';
  resetEnvForTests();
  validateEnv(process.env, { cache: true });
  await listen(createApp({ rateLimit: false }));
});

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue(USER);
  db.task.findMany.mockResolvedValue([]);
  db.task.count.mockResolvedValue(0);
  db.dailyStats.findMany.mockResolvedValue([]);
  db.xPTransaction.aggregate.mockResolvedValue({ _sum: { amount: 12 } });
  db.xPTransaction.count.mockResolvedValue(0);
  db.xPTransaction.findUnique.mockResolvedValue(null);
  db.xPTransaction.create.mockResolvedValue({ id: 'xp-1' });
  db.habit.findFirst.mockResolvedValue({
    id: 'habit-1',
    createdAt: new Date('2020-01-01T00:00:00.000Z'),
  });
  db.habitCompletion.count.mockResolvedValue(0);
  db.habitCompletion.findMany.mockResolvedValue([]);
  db.habitCompletion.findUnique.mockResolvedValue(null);
  db.habitCompletion.findUniqueOrThrow.mockResolvedValue({
    id: 'completion-1',
    habitId: 'habit-1',
    userId: USER.id,
    date: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`),
    status: 'COMPLETED',
    completedAt: new Date(),
  });
  db.habitCompletion.upsert.mockResolvedValue({ id: 'completion-1' });
  db.habitDayEvent.create.mockResolvedValue({ id: 'event-1' });
  db.notification.findMany.mockResolvedValue([]);
  db.notification.count.mockResolvedValue(0);
  db.$transaction.mockResolvedValue([]);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

afterAll(async () => {
  if (server) await close(server);
  resetEnvForTests();
});

describe('affected API routes', () => {
  it.each(['/api/streaks', '/api/analytics', '/api/notifications'])(
    'rejects unauthenticated requests to %s with CORS',
    async (path) => {
      const response = await fetch(`${base}${path}`, { headers: headers(false) });
      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(401);
      expect(body.code).toBe('AUTH_REQUIRED');
      expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN);
    }
  );

  it.each(['/api/streaks', '/api/analytics', '/api/notifications'])(
    'answers a preflight for %s with the configured CORS policy',
    async (path) => {
      const response = await fetch(`${base}${path}`, {
        method: 'OPTIONS',
        headers: {
          Origin: FRONTEND_ORIGIN,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN);
      expect(response.headers.get('access-control-allow-methods')).toContain('GET');
      expect(response.headers.get('access-control-allow-headers')).toMatch(/authorization/i);
      expect(response.headers.get('access-control-allow-headers')).toMatch(/content-type/i);
    }
  );

  it('serves streak data for an authenticated user', async () => {
    const response = await fetch(`${base}/api/streaks`, { headers: headers() });
    const body = (await response.json()) as { data: { current: number; best: number } };

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ current: 0, best: 0 });
  });

  it('serves analytics totals for an authenticated user', async () => {
    db.task.count.mockResolvedValue(4);
    db.habitCompletion.count.mockResolvedValue(3);

    const response = await fetch(`${base}/api/analytics`, { headers: headers() });
    const body = (await response.json()) as {
      data: { totals: { xp: number; tasksCompleted: number; habitsCompleted: number } };
    };

    expect(response.status).toBe(200);
    expect(body.data.totals).toEqual({
      xp: 12,
      tasksCompleted: 4,
      habitsCompleted: 3,
    });
  });

  it('serves notifications for an authenticated user', async () => {
    const response = await fetch(`${base}/api/notifications`, { headers: headers() });
    const body = (await response.json()) as {
      data: { items: unknown[]; unreadCount: number };
    };

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ items: [], unreadCount: 0 });
  });

  it('returns 400 for invalid commitment check-in input without writing', async () => {
    const response = await fetch(`${base}/api/habits/habit-1/complete`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: 42 }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid date');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid notification regeneration input', async () => {
    const response = await fetch(`${base}/api/notifications/regenerate`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify([]),
    });

    expect(response.status).toBe(400);
    expect(db.notification.count).not.toHaveBeenCalled();
  });

  it('writes a check-in, ledger award, and day event in one D1-compatible transaction', async () => {
    const today = new Date().toISOString().slice(0, 10);
    db.habitCompletion.findUniqueOrThrow.mockResolvedValue({
      id: 'completion-1',
      habitId: 'habit-1',
      userId: USER.id,
      date: new Date(`${today}T00:00:00.000Z`),
      status: 'COMPLETED',
      completedAt: new Date(),
    });

    const response = await fetch(`${base}/api/habits/habit-1/complete`, {
      method: 'POST',
      headers: headers(),
    });

    expect(response.status).toBe(201);
    expect(db.xPTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 4,
          dedupeKey: `habit:checkin:habit-1:${today}`,
        }),
      })
    );
    expect(db.habitDayEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ toStatus: 'COMPLETED', pointsDelta: 4 }),
      })
    );
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(Array.isArray(db.$transaction.mock.calls[0][0])).toBe(true);
  });

  it('returns logged JSON 500 errors with CORS and a request id', async () => {
    db.dailyStats.findMany.mockRejectedValueOnce(new Error(`database failure ${SECRET}`));

    const response = await fetch(`${base}/api/analytics`, { headers: headers() });
    const body = (await response.json()) as Record<string, unknown>;
    const logged = consoleError.mock.calls.map((call) => String(call[0])).join('\n');

    expect(response.status).toBe(500);
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN);
    expect(body).toMatchObject({
      error: 'Something went wrong. Please try again.',
      code: 'INTERNAL_ERROR',
    });
    expect(body.requestId).toBe(response.headers.get('x-request-id'));
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(JSON.stringify(body)).not.toContain('database failure');
    expect(logged).toContain('database failure');
    expect(logged).not.toContain(SECRET);
  });

  it('does not disguise D1 authentication lookup failures as expired sessions', async () => {
    db.user.findUnique.mockRejectedValueOnce(new Error('D1 read failed'));

    const response = await fetch(`${base}/api/streaks`, { headers: headers() });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN);
    expect(body.requestId).toBe(response.headers.get('x-request-id'));
  });

  it('returns a JSON 404 with CORS for an unknown API route', async () => {
    const response = await fetch(`${base}/api/not-a-route`, { headers: headers() });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.requestId).toBe(response.headers.get('x-request-id'));
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN);
  });

  it('returns a JSON 404 with CORS for an unknown frontend route', async () => {
    const response = await fetch(`${base}/not-a-page`, {
      headers: { Origin: FRONTEND_ORIGIN, Accept: 'application/json' },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.requestId).toBe(response.headers.get('x-request-id'));
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN);
  });
});
