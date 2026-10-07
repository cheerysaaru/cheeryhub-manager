// @ts-nocheck - itty-router v6 strict generics incompatible with custom Request type
import { Router } from 'itty-router';
import type { AppRequest } from './types/index';
import { corsMiddleware, withCors } from './middleware/cors';
import { verifyAuth } from './middleware/auth';
import { parseJsonBody } from './middleware/parseBody';
import { requestLogger } from './middleware/logging';
import { errorHandler } from './middleware/errorHandler';
import * as authRoutes from './routes/auth';
import * as healthRoutes from './routes/health';
import * as tasksRoutes from './routes/tasks';
import * as habitsRoutes from './routes/habits';
import * as goalsRoutes from './routes/goals';
import * as skillsRoutes from './routes/skills';
import * as notificationsRoutes from './routes/notifications';
import * as remindersRoutes from './routes/reminders';
import * as transactionsRoutes from './routes/transactions';
import * as settingsRoutes from './routes/settings';
import * as streaksRoutes from './routes/streaks';
import * as analyticsRoutes from './routes/analytics';
import * as brandRoutes from './routes/brand';
import * as backupRoutes from './routes/backup';

const router = Router() as any;

// Middleware stack - CORS first, then logging, then body parsing
router.all('*', corsMiddleware);
router.all('*', requestLogger);
router.all('*', async (req: any) => {
  await parseJsonBody(req);
});

// Public routes (no auth required)
router.get('/api/health', (req: any) => healthRoutes.health(req));
router.post('/api/auth/register', (req: any) => authRoutes.register(req));
router.post('/api/auth/login', (req: any) => authRoutes.login(req));
router.post('/api/auth/logout', (req: any) => authRoutes.logout(req));

// Auth check middleware for protected routes
const authRequired = async (req: any) => {
  const result = await verifyAuth(req);
  if (result instanceof Response) {
    return result; // Return 401 error
  }
  // Update req with user info
  Object.assign(req, result);
};

// Protected routes (auth required)
router.get('/api/auth/me', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return authRoutes.me(req);
});

// Tasks routes
router.get('/api/tasks', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return tasksRoutes.listTasks(req);
});
router.post('/api/tasks', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return tasksRoutes.createTask(req);
});
router.put('/api/tasks/:id', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return tasksRoutes.updateTask(req);
});
router.delete('/api/tasks/:id', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return tasksRoutes.deleteTask(req);
});

// Habits routes
router.get('/api/habits', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return habitsRoutes.listHabits(req);
});
router.post('/api/habits', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return habitsRoutes.createHabit(req);
});
router.put('/api/habits/:id', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return habitsRoutes.updateHabit(req);
});
router.delete('/api/habits/:id', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return habitsRoutes.deleteHabit(req);
});
router.post('/api/habits/:id/complete', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return habitsRoutes.completeHabit(req);
});

// Goals routes
router.get('/api/goals', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return goalsRoutes.listGoals(req);
});
router.post('/api/goals', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return goalsRoutes.createGoal(req);
});
router.put('/api/goals/:id', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return goalsRoutes.updateGoal(req);
});
router.delete('/api/goals/:id', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return goalsRoutes.deleteGoal(req);
});

// Skills routes
router.get('/api/skills', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return skillsRoutes.listSkills(req);
});
router.post('/api/skills', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return skillsRoutes.createSkill(req);
});
router.put('/api/skills/:id', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return skillsRoutes.updateSkill(req);
});
router.delete('/api/skills/:id', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return skillsRoutes.deleteSkill(req);
});

// Notifications routes
router.get('/api/notifications', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return notificationsRoutes.listNotifications(req);
});
router.post('/api/notifications/:id/read', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return notificationsRoutes.markNotificationAsRead(req);
});

// Reminders routes
// @ts-expect-error TS2554 - itty-router v6 type mismatch
router.get('/api/reminders', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return remindersRoutes.listReminders(req);
});
// @ts-expect-error TS2554
router.post('/api/reminders', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return remindersRoutes.createReminder(req);
});
// @ts-expect-error TS2554
router.put('/api/reminders/:id', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return remindersRoutes.updateReminder(req);
});
// @ts-expect-error TS2554
router.delete('/api/reminders/:id', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return remindersRoutes.deleteReminder(req);
});

// Transactions routes
router.get('/api/transactions', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return transactionsRoutes.listTransactions(req);
});
router.post('/api/transactions', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return transactionsRoutes.createTransaction(req);
});

// Settings routes
router.get('/api/settings', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return settingsRoutes.getSettings(req);
});
router.put('/api/settings', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return settingsRoutes.updateSettings(req);
});

// Streaks routes
router.get('/api/streaks', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return streaksRoutes.getStreaks(req);
});
router.post('/api/streaks/:id/check-in', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return streaksRoutes.checkIn(req);
});

// Analytics routes
router.get('/api/analytics', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return analyticsRoutes.getAnalytics(req);
});

// Brand routes
router.get('/api/brand', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return brandRoutes.getBrand(req);
});
router.put('/api/brand', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return brandRoutes.updateBrand(req);
});

// Backup routes
router.post('/api/backup/export', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return backupRoutes.exportData(req);
});
router.get('/api/backup/history', async (req: any) => {
  const authResult = await authRequired(req);
  if (authResult instanceof Response) return authResult;
  return backupRoutes.getBackupHistory(req);
});

// 404 handler
router.all('*', () => {
  return new Response(
    JSON.stringify({ error: 'Not Found', code: 'NOT_FOUND' }),
    { status: 404, headers: { 'Content-Type': 'application/json' } }
  );
});

export default {
  fetch: async (request: Request, env: any, ctx: ExecutionContext) => {
    try {
      const req = request as any as AppRequest;
      req.env = env;
            const response = await router.handle(req);
      return withCors(response || new Response('', { status: 204 }), req);
    } catch (error) {
      const req = request as any as AppRequest;
      req.env = env;
      return errorHandler(error as Error, req);
    }
  },
};


