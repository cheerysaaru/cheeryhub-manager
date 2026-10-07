
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import cors, { type CorsOptionsDelegate } from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit, { type MemoryStore, ipKeyGenerator } from 'express-rate-limit';
import { getCorsOrigins } from './lib/config';
import { envStatus, getEnv } from './env';
import { newRequestId } from './lib/logger';
import { apiErrorHandler } from './utils/errors';
import { prisma } from './lib/prisma';

import { requireAuth, requireAdmin } from './utils/auth';
import {
  login,
  logout,
  me,
  register,
  forgotPassword,
  resetPasswordWithToken,
  refreshSession,
} from './controllers/auth';
import {
  listUsers,
  createUser,
  updateUser,
  resetPassword,
  disableUser,
  enableUser,
  deleteUser,
} from './controllers/admin';
import { analytics, exportData } from './controllers/analytics';
import {
  list,
  getOne,
  create,
  update,
  remove,
  completeTask,
  completeHabit,
  clearHabitToday,
  failHabitToday,
  skipHabitToday,
  checkInTask,
  startTaskTimer,
  stopTaskTimer,
  listTrash,
  restoreTask,
  purgeTask,
  markNotCompleted,
  extendTaskDeadline,
} from './controllers/data';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  regenerateNotifications,
} from './controllers/notifications';
import {
  startFocus,
  completeFocus,
  focusHistory,
  journalList,
  journalByDate,
  journalSave,
  xp,
  importBackup,
  unlockAchievement,
  streaks,
} from './controllers/misc';
import {
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getWeeklyReport,
  getMonthlyReport,
} from './controllers/transactions';
import {
  getSettings,
  updateSettings,
  getGoalMilestones,
  createGoalMilestone,
  updateGoalMilestone,
  deleteGoalMilestone,
  createBrandMilestone,
  updateBrandMilestone,
  deleteBrandMilestone,
} from './controllers/settings';

type LimitEntry = { totalHits: number; resetTime: Date };

type RequestWithId = Request & { requestId?: string };

/**
 * Rate-limit key: the real client IP behind Cloudflare (CF-Connecting-IP),
 * otherwise the last X-Forwarded-For entry (the one appended by the proxy),
 * otherwise the socket address. Client-supplied left-most entries are ignored
 * so the limit cannot be bypassed by spoofing headers.
 */
function clientKey(request: Request): string {
  const header =
    request.headers['cf-connecting-ip'] ?? request.headers['x-forwarded-for'];
  const raw = Array.isArray(header) ? header[0] : header;
  const forwarded = raw?.split(',').pop()?.trim();
  const address = forwarded || request.socket.remoteAddress || 'unknown';
  return ipKeyGenerator(address);
}

class TimerFreeStore {
  private hits = new Map<string, LimitEntry>();
  constructor(private windowMs: number) {}

  async increment(key: string) {
    const now = Date.now();
    let entry = this.hits.get(key);
    if (!entry || entry.resetTime.getTime() <= now) {
      entry = { totalHits: 0, resetTime: new Date(now + this.windowMs) };
      this.hits.set(key, entry);
    }
    entry.totalHits += 1;
    return { totalHits: entry.totalHits, resetTime: entry.resetTime, localKeys: this.hits.size };
  }

  async decrement(key: string) {
    const entry = this.hits.get(key);
    if (entry) entry.totalHits = Math.max(0, entry.totalHits - 1);
  }

  async resetKey(key: string) {
    this.hits.delete(key);
  }

  async resetAll() {
    this.hits.clear();
  }

  async localKeys() {
    const now = Date.now();
    return [...this.hits.entries()]
      .filter(([, value]) => value.resetTime.getTime() > now)
      .map(([key]) => key);
  }
}

function createLimit(
  windowMs: number,
  limit: number,
  options?: {
    skipSuccessfulRequests?: boolean;
    keyGenerator?: (request: Request) => string;
  }
) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    keyGenerator: options?.keyGenerator ?? clientKey,
    // The IP is derived from proxy headers above, and request.ip is unreliable
    // behind Cloudflare / inside the Worker runtime.
    validate: { ip: false, xForwardedForHeader: false },
    handler: (request, response, next, optionsUsed) => {
      response.setHeader('Retry-After', Math.ceil(optionsUsed.windowMs / 1000).toString());
      response.status(optionsUsed.statusCode ?? 429).json({
        error: 'Too many requests. Please wait a moment and try again.',
        code: 'RATE_LIMITED',
        requestId: (request as RequestWithId).requestId,
        retryAfterSeconds: Math.ceil(optionsUsed.windowMs / 1000),
      });
      next();
    },
    store: new TimerFreeStore(windowMs) as unknown as MemoryStore,
    ...(options?.skipSuccessfulRequests !== undefined
      ? { skipSuccessfulRequests: options.skipSuccessfulRequests }
      : {}),
  });
}

/** Env-tuned limiter settings, falling back to safe defaults. */
function limitConfig() {
  try {
    const env = getEnv();
    return {
      window: env.RATE_LIMIT_WINDOW_MS,
      api: env.RATE_LIMIT_MAX,
      auth: env.AUTH_RATE_LIMIT_MAX,
      login: env.LOGIN_RATE_LIMIT_MAX,
      register: env.REGISTER_RATE_LIMIT_MAX,
    };
  } catch {
    return {
      window: 15 * 60 * 1000,
      api: 600,
      auth: 30,
      login: 5,
      register: 3,
    };
  }
}

export function createApp(options?: { rateLimit?: boolean }) {
  const app = express();
  const enableRateLimit = options?.rateLimit ?? true;

  // Identifies every response for support/debugging: clients may echo it back
  // in X-Request-Id and it appears in error payloads and server logs.
  app.use((request: Request, response: Response, next: NextFunction) => {
    const incoming = request.headers['x-request-id'];
    const provided =
      typeof incoming === 'string' && incoming.trim() ? incoming.trim().slice(0, 64) : null;
    (request as RequestWithId).requestId = provided ?? newRequestId();
    response.setHeader('x-request-id', (request as RequestWithId).requestId!);
    next();
  });

  const allowedOrigins = getCorsOrigins();

  const isAllowedOrigin = (origin: string | undefined): boolean => {
    if (!origin) return true;
    if (allowedOrigins.includes(origin)) return true;

    if (process.env.NODE_ENV === 'production') return false;

    try {
      const url = new URL(origin);
      const host = url.hostname;

      return (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        (host === 'localhost' ||
          host === '127.0.0.1' ||
          host === '[::1]' ||
          host === '::1')
      );
    } catch {
      return false;
    }
  };

  const corsOptions: CorsOptionsDelegate<Request> = (request, callback) => {
    const origin = request.get('origin');
    const requestHost = request.get('host');

    if (origin && requestHost) {
      try {
        if (new URL(origin).host === requestHost) {
          callback(null, { origin: false });
          return;
        }
      } catch {
        // Let the allow-list check reject malformed origins.
      }
    }

    if (isAllowedOrigin(origin)) {
      callback(null, {
        origin: Boolean(origin),
        credentials: true,
        exposedHeaders: [
          'x-request-id',
          'ratelimit-limit',
          'ratelimit-remaining',
          'ratelimit-reset',
          'retry-after',
        ],
      });
      return;
    }

    callback(new Error('Not allowed by CORS'));
  };

  app.use(cors(corsOptions));

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    })
  );

  // Shrink JSON/API/SPA payloads on the wire (skips tiny responses and any
  // already-compressed content-type).
  app.use(compression());

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  // API responses are private per-user data; never let browsers or shared caches store them.
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  const limits = limitConfig();
  const passthrough = (
    _request: Request,
    _response: Response,
    next: NextFunction
  ) => next();

  const apiLimiter = enableRateLimit
    ? createLimit(limits.window, limits.api)
    : passthrough;

  const authLimiter = enableRateLimit
    ? createLimit(limits.window, limits.auth)
    : passthrough;

  // Max 5 login attempts per IP per 15 minutes (only failed attempts count).
  const loginLimiter = enableRateLimit
    ? createLimit(limits.window, limits.login, { skipSuccessfulRequests: true })
    : passthrough;

  // Max 3 register attempts per IP per hour.
  const registerLimiter = enableRateLimit
    ? createLimit(60 * 60 * 1000, limits.register)
    : passthrough;

  // Forgot-password: max 3 requests per IP per hour.
  const forgotPasswordLimiter = enableRateLimit
    ? createLimit(60 * 60 * 1000, limits.register)
    : passthrough;

  // Forgot-password: max 3 requests per target account per hour, so
  // distributed IPs cannot probe one account's email address.
  const forgotAccountLimiter = enableRateLimit
    ? createLimit(60 * 60 * 1000, 3, {
        keyGenerator: (request: Request) => {
          const body = (request.body ?? {}) as Record<string, unknown>;
          return `forgot:${String(body.email ?? '').toLowerCase()}`;
        },
      })
    : passthrough;

  // Token reset attempts: max 10 per IP per hour.
  const resetTokenLimiter = enableRateLimit
    ? createLimit(60 * 60 * 1000, 10)
    : passthrough;

  // Liveness + configuration report. Reports only booleans — whether each
  // variable is present — never the values themselves.
  app.get('/api/health', async (_request, response) => {
    let database: 'connected' | 'disconnected' = 'disconnected';
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = 'connected';
    } catch {
      database = 'disconnected';
    }

    let config: Record<string, boolean> = {};
    let configError: string | undefined;
    try {
      config = envStatus();
    } catch (error) {
      configError = error instanceof Error ? error.name : 'EnvError';
    }

    const healthy = database === 'connected' && !configError && config.jwtSecret !== false;
    response.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'error',
      database,
      config,
      ...(configError ? { configError } : {}),
      uptimeSeconds: Math.round(process.uptime()),
      time: new Date().toISOString(),
    });
  });

  app.post('/api/auth/register', registerLimiter, register);
  app.post('/api/auth/login', loginLimiter, login);
  app.post('/api/auth/forgot', forgotPasswordLimiter, forgotAccountLimiter, forgotPassword);
  app.post('/api/auth/reset', resetTokenLimiter, resetPasswordWithToken);
  // The old display-name reset was an account-takeover vector; keep it gone.
  app.post('/api/auth/reset-password', (_request: Request, response: Response) =>
    response.status(410).json({ error: 'This endpoint has been removed' })
  );
  app.post('/api/auth/logout', authLimiter, logout);
  // Silent session renewal for the frontend: re-issues the cookie from a
  // still-signed but expired token (never for tokens from before a password
  // change) so users are not logged out the moment the 7-day cookie lapses.
  app.post('/api/auth/refresh', authLimiter, refreshSession);
  app.get('/api/auth/me', requireAuth, me);

  app.use('/api', apiLimiter, requireAuth);

  app.get('/api/admin/users', requireAdmin, listUsers);
  app.post('/api/admin/users', requireAdmin, createUser);
  app.put('/api/admin/users/:id', requireAdmin, updateUser);
  app.post('/api/admin/users/:id/reset-password', requireAdmin, resetPassword);
  app.post('/api/admin/users/:id/disable', requireAdmin, disableUser);
  app.post('/api/admin/users/:id/enable', requireAdmin, enableUser);
  app.delete('/api/admin/users/:id', requireAdmin, deleteUser);

  for (const resource of [
    'tasks',
    'habits',
    'goals',
    'skills',
    'reminders',
    'brand',
  ]) {
    const router = express.Router();

    // Must be registered before '/:id' so "trash" is not treated as a task id.
    if (resource === 'tasks') router.get('/trash', listTrash);

    router.get('/', list);
    router.get('/:id', getOne);
    router.post('/', create);
    router.put('/:id', update);
    router.delete('/:id', remove);

    app.use(`/api/${resource}`, router);
  }

  app.patch('/api/tasks/:id/complete', completeTask);
  app.post('/api/tasks/:id/checkin', checkInTask);
  app.post('/api/tasks/:id/timer/start', startTaskTimer);
  app.post('/api/tasks/:id/timer/stop', stopTaskTimer);
  app.post('/api/tasks/:id/restore', restoreTask);
  app.delete('/api/tasks/:id/permanent', purgeTask);
  app.post('/api/tasks/:id/mark-not-completed', markNotCompleted);
  app.post('/api/tasks/:id/extend', extendTaskDeadline);

  app.get('/api/notifications', listNotifications);
  app.post('/api/notifications/read-all', markAllNotificationsRead);
  app.post('/api/notifications/regenerate', regenerateNotifications);
  app.post('/api/notifications/:id/read', markNotificationRead);

  app.post('/api/habits/:id/complete', completeHabit);
  app.post('/api/habits/:id/fail', failHabitToday);
  app.post('/api/habits/:id/skip', skipHabitToday);
  app.delete('/api/habits/:id/today', clearHabitToday);

  app.get('/api/goals/:id/milestones', getGoalMilestones);
  app.post('/api/goals/:id/milestones', createGoalMilestone);
  app.put(
    '/api/goals/:id/milestones/:milestoneId',
    updateGoalMilestone
  );
  app.delete(
    '/api/goals/:id/milestones/:milestoneId',
    deleteGoalMilestone
  );

  app.post('/api/brand/:id/milestones', createBrandMilestone);
  app.put(
    '/api/brand/:id/milestones/:milestoneId',
    updateBrandMilestone
  );
  app.delete(
    '/api/brand/:id/milestones/:milestoneId',
    deleteBrandMilestone
  );

  app.get('/api/analytics/:period', analytics);
  app.get('/api/analytics', analytics);
  app.get('/api/backup/export', exportData);

  app.get('/api/settings', getSettings);
  app.put('/api/settings', updateSettings);

  app.post('/api/focus/start', startFocus);
  app.post('/api/focus/:id/complete', completeFocus);
  app.get('/api/focus/history', focusHistory);

  app.get('/api/journal', journalList);
  app.get('/api/journal/:date', journalByDate);
  app.post('/api/journal', journalSave);
  app.put('/api/journal/:id', journalSave);

  app.get('/api/xp', xp);
  app.get('/api/xp/history', xp);
  app.get('/api/streaks', streaks);
  app.post('/api/achievements/unlock', unlockAchievement);
  app.post('/api/backup/import', importBackup);

  const transactionRouter = express.Router();

  transactionRouter.get('/', listTransactions);
  transactionRouter.post('/', createTransaction);
  transactionRouter.put('/:id', updateTransaction);
  transactionRouter.delete('/:id', deleteTransaction);
  transactionRouter.get('/report/weekly', getWeeklyReport);
  transactionRouter.get('/report/monthly', getMonthlyReport);

  app.use('/api/transactions', transactionRouter);

  // Serve the built client in production so refreshing a deep link
  // (e.g. /goals) does not fall through to a 404.
  const candidateClientDirs = [
    path.resolve(__dirname, '../../frontend/dist'),
    path.resolve(process.cwd(), 'frontend/dist'),
    path.resolve(process.cwd(), '../frontend/dist'),
  ];
  const clientDist = candidateClientDirs.find((dir) =>
    fs.existsSync(path.join(dir, 'index.html'))
  );

  if (clientDist) {
    app.use(express.static(clientDist, { index: false }));
    app.use((request: Request, response: Response, next: NextFunction) => {
      if (request.method !== 'GET') return next();
      if (request.path.startsWith('/api')) return next();
      if (request.path.startsWith('/assets/')) return next();
      if (!request.accepts('html')) return next();
      response.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use((request: Request, response: Response) =>
    response.status(404).json({
      error: request.path.startsWith('/api')
        ? 'API route not found.'
        : 'Resource not found.',
      code: 'NOT_FOUND',
      requestId: (request as RequestWithId).requestId,
    })
  );

  app.use(apiErrorHandler);

  return app;
}
