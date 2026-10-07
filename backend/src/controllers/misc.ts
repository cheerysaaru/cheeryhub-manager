import { z } from 'zod';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../utils/auth';
import { prisma } from '../lib/prisma';
import { fail, ok } from '../utils/response';
import { emitToUser } from '../lib/socket';
import { POINTS, awardPoints } from '../lib/points';
import { timezoneOf, todayKey, dayKeyInTz } from '../lib/time';
import { streakFromDays } from '../lib/streak';

export async function startFocus(request: AuthRequest, response: Response) { const parsed = z.object({ durationMinutes: z.number().int().positive().max(480), taskId: z.string().optional() }).safeParse(request.body); if (!parsed.success) return fail(response, 'A valid focus duration is required'); if (parsed.data.taskId) { const task = await prisma.task.findFirst({ where: { id: parsed.data.taskId, userId: request.userId!, deletedAt: null } }); if (!task) return fail(response, 'Task not found', 404); } const session = await prisma.focusSession.create({ data: { ...parsed.data, userId: request.userId! } }); emitToUser(request.userId!, 'focus:created', session); return ok(response, session, 201); }
export async function completeFocus(request: AuthRequest, response: Response) { const session = await prisma.focusSession.findFirst({ where: { id: String(request.params.id), userId: request.userId! } }); if (!session) return fail(response, 'Focus session not found', 404); const updated = await prisma.focusSession.update({ where: { id: session.id }, data: { status: 'COMPLETED', completedAt: new Date() } }); emitToUser(request.userId!, 'focus:completed', updated); return ok(response, updated); }
export async function focusHistory(request: AuthRequest, response: Response) { return ok(response, await prisma.focusSession.findMany({ where: { userId: request.userId }, orderBy: { startedAt: 'desc' } })); }
const journalSchema = z.object({ date: z.coerce.date(), accomplishments: z.string().max(10000).optional(), lessons: z.string().max(10000).optional(), procrastination: z.string().max(10000).optional(), improvements: z.string().max(10000).optional(), gratitude: z.string().max(10000).optional(), passionScore: z.number().int().min(1).max(10).optional() });
export async function journalList(request: AuthRequest, response: Response) { return ok(response, await prisma.journalEntry.findMany({ where: { userId: request.userId }, orderBy: { date: 'desc' } })); }
export async function journalByDate(request: AuthRequest, response: Response) { const raw = String(request.params.date ?? ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fail(response, 'Invalid journal date', 400); const date = new Date(`${raw}T00:00:00.000Z`); if (Number.isNaN(date.getTime())) return fail(response, 'Invalid journal date', 400); return ok(response, await prisma.journalEntry.findUnique({ where: { userId_date: { userId: request.userId!, date } } })); }
export async function journalSave(request: AuthRequest, response: Response) { const parsed = journalSchema.safeParse(request.body); if (!parsed.success) return fail(response, 'Invalid journal entry'); const existing = await prisma.journalEntry.findUnique({ where: { userId_date: { userId: request.userId!, date: parsed.data.date } } }); const entry = await prisma.journalEntry.upsert({ where: { userId_date: { userId: request.userId!, date: parsed.data.date } }, update: parsed.data, create: { ...parsed.data, userId: request.userId! } }); emitToUser(request.userId!, existing ? 'journal:updated' : 'journal:created', entry); return ok(response, entry, 201); }
export async function xp(request: AuthRequest, response: Response) { const history = await prisma.xPTransaction.findMany({ where: { userId: request.userId }, orderBy: { createdAt: 'desc' } }); return ok(response, { total: history.reduce((sum, item) => sum + item.amount, 0), history }); }
export async function importBackup(request: AuthRequest, response: Response) {
  const input = z.object({
    version: z.number(),
    tasks: z.array(z.object({
      title: z.string().min(1).max(200),
      description: z.string().optional(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    })).optional(),
    habits: z.array(z.object({
      name: z.string().min(1).max(200),
      frequency: z.string().max(100),
    })).optional(),
  }).safeParse(request.body);
  if (!input.success) return fail(response, 'Backup format is invalid');

  const data = input.data;
  const operations = [
    ...(data.tasks?.length
      ? [prisma.task.createMany({
          data: data.tasks.map((task) => ({ ...task, userId: request.userId! })),
        })]
      : []),
    ...(data.habits?.length
      ? [prisma.habit.createMany({
          data: data.habits.map((habit) => ({ ...habit, userId: request.userId! })),
        })]
      : []),
  ];
  const results = operations.length ? await prisma.$transaction(operations) : [];
  let index = 0;
  const tasks = data.tasks?.length ? results[index++].count : 0;
  const habits = data.habits?.length ? results[index].count : 0;
  return ok(response, { tasks, habits }, 201);
}
export async function unlockAchievement(request: AuthRequest, response: Response) {
  const parsed = z.object({ id: z.string().min(1).max(120), title: z.string().min(1).max(200) }).safeParse(request.body);
  if (!parsed.success) return fail(response, 'Invalid achievement');
  const applied = await awardPoints(prisma, {
    userId: request.userId!,
    amount: POINTS.ACHIEVEMENT,
    reason: `Achievement unlocked: ${parsed.data.title}`,
    dedupeKey: `achievement:${parsed.data.id}`,
  });
  if (applied) emitToUser(request.userId!, 'xp:updated', { reason: 'Achievement unlocked', amount: POINTS.ACHIEVEMENT });
  return ok(response, { awarded: applied ? POINTS.ACHIEVEMENT : 0 });
}

export async function streaks(
  request: AuthRequest,
  response: Response,
  next: NextFunction
) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: request.userId! },
      select: { timezone: true },
    });
    const timezone = timezoneOf(user?.timezone);
    const today = todayKey(timezone);
    // A day counts only when the user was logged in AND added at least one
    // task that day — task creation is the login evidence we keep.
    const tasks = await prisma.task.findMany({
      where: { userId: request.userId! },
      select: { createdAt: true },
    });
    const activeDays = tasks.map((task) => dayKeyInTz(task.createdAt, timezone));
    return ok(response, streakFromDays(activeDays, today));
  } catch (error) {
    return next(error);
  }
}
