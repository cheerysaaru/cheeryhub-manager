import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { requireAuth } from './utils/auth';
import { register, login, logout, me } from './controllers/auth';
import { analytics, exportData } from './controllers/analytics';
import { list, getOne, create, update, remove, completeTask, completeHabit, clearHabitToday, checkInTask, startTaskTimer, stopTaskTimer } from './controllers/data';
import { startFocus, completeFocus, focusHistory, journalList, journalByDate, journalSave, xp, importBackup } from './controllers/misc';
import { listTransactions, createTransaction, updateTransaction, deleteTransaction, getWeeklyReport, getMonthlyReport } from './controllers/transactions';
import { getSettings, updateSettings, createGoalMilestone, updateGoalMilestone, deleteGoalMilestone, createBrandMilestone, updateBrandMilestone, deleteBrandMilestone } from './controllers/settings';
import { prisma } from './lib/prisma';
import { initSocket } from './lib/socket';

const app = express();
const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',').map((o) => o.trim());
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (origin && allowedOrigins.includes(origin)) {
        callback(null, true);
      } else if (!origin) {
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

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true });

app.get('/api/health', async (_request, response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    response.json({ status: 'ok', database: 'connected' });
  } catch {
    response.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.post('/api/auth/register', authLimiter, register);
app.post('/api/auth/login', authLimiter, login);
app.post('/api/auth/logout', logout);
app.get('/api/auth/me', requireAuth, me);

app.use('/api', apiLimiter, requireAuth);

for (const resource of ['tasks', 'habits', 'goals', 'skills', 'reminders', 'brand']) {
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
app.delete('/api/habits/:id/today', clearHabitToday);

app.get('/api/goals/:id/milestones', getOne);
app.post('/api/goals/:id/milestones', createGoalMilestone);
app.put('/api/goals/:id/milestones/:milestoneId', updateGoalMilestone);
app.delete('/api/goals/:id/milestones/:milestoneId', deleteGoalMilestone);

app.post('/api/brand/:id/milestones', createBrandMilestone);
app.put('/api/brand/:id/milestones/:milestoneId', updateBrandMilestone);
app.delete('/api/brand/:id/milestones/:milestoneId', deleteBrandMilestone);

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

app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  if (error.message === 'Not allowed by CORS') {
    return response.status(403).json({ error: 'CORS: Origin not allowed' });
  }
  response.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT ?? 4000);
const server = http.createServer(app);
initSocket(server);
server.listen(port, () => console.log(`API listening on port ${port}`));