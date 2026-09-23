
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit, { type MemoryStore } from 'express-rate-limit';
import { getFrontendUrl } from './lib/config';
import { prisma } from './lib/prisma';

import { requireAuth, requireAdmin } from './utils/auth';
import { login, logout, me } from './controllers/auth';
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
} from './controllers/data';
import {
  startFocus,
  completeFocus,
  focusHistory,
  journalList,
  journalByDate,
  journalSave,
  xp,
  importBackup,
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
  createGoalMilestone,
  updateGoalMilestone,
  deleteGoalMilestone,
  createBrandMilestone,
  updateBrandMilestone,
  deleteBrandMilestone,
} from './controllers/settings';

type LimitEntry = { totalHits: number; resetTime: Date };

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

function createLimit(windowMs: number, limit: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    store: new TimerFreeStore(windowMs) as unknown as MemoryStore,
  });
}

export function createApp(options?: { rateLimit?: boolean }) {
  const app = express();
  const enableRateLimit = options?.rateLimit ?? true;

  const allowedOrigins = getFrontendUrl()
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const isAllowedOrigin = (origin: string | undefined): boolean => {
    if (!origin) return true;
    if (allowedOrigins.includes(origin)) return true;

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

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    })
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  const apiLimiter = enableRateLimit
    ? createLimit(15 * 60 * 1000, 300)
    : ((_request: Request, _response: Response, next: NextFunction) => next());

  const authLimiter = enableRateLimit
    ? createLimit(15 * 60 * 1000, 30)
    : ((_request: Request, _response: Response, next: NextFunction) => next());

  app.get('/api/health', async (_request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      response.json({ status: 'ok', database: 'connected' });
    } catch {
      response.status(503).json({ status: 'error', database: 'disconnected' });
    }
  });

  app.post('/api/auth/login', authLimiter, login);
  app.post('/api/auth/logout', logout);
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

  app.post('/api/habits/:id/complete', completeHabit);
  app.post('/api/habits/:id/fail', failHabitToday);
  app.post('/api/habits/:id/skip', skipHabitToday);
  app.delete('/api/habits/:id/today', clearHabitToday);

  app.get('/api/goals/:id/milestones', getOne);
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
  app.post('/api/backup/import', importBackup);

  const transactionRouter = express.Router();

  transactionRouter.get('/', listTransactions);
  transactionRouter.post('/', createTransaction);
  transactionRouter.put('/:id', updateTransaction);
  transactionRouter.delete('/:id', deleteTransaction);
  transactionRouter.get('/report/weekly', getWeeklyReport);
  transactionRouter.get('/report/monthly', getMonthlyReport);

  app.use('/api/transactions', transactionRouter);

  app.use(
    (
      error: Error,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction
    ) => {
      console.error(error);

      if (error.message === 'Not allowed by CORS') {
        return response
          .status(403)
          .json({ error: 'CORS: Origin not allowed' });
      }

      response.status(500).json({ error: 'Internal server error' });
    }
  );

  return app;
}