import { z } from 'zod';
import type { Response } from 'express';
import type { AuthRequest } from '../utils/auth';
import { prisma } from '../lib/prisma';
import { fail, ok } from '../utils/response';
import { emitToUser } from '../lib/socket';
import { generateNotifications } from '../lib/notifications';
import {
  timezoneOf,
  todayKey,
  dayKeyInTz,
  resolveDeadline,
} from '../lib/time';

const bodySchema = z.object({ title: z.string().trim().min(1).max(200).optional(), name: z.string().trim().min(1).max(200).optional(), description: z.string().max(5000).optional(), category: z.string().max(100).optional(), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(), status: z.string().max(30).optional(), scheduledDate: z.coerce.date().optional(), scheduledTime: z.string().max(20).optional(), deadlineTime: z.string().max(20).optional(), dueAt: z.union([z.string().max(40), z.date()]).optional(), recurrence: z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']).optional(), isMandatory: z.boolean().optional(), reminderEnabled: z.boolean().optional(), estimatedMinutes: z.number().int().positive().max(1440).optional(), progress: z.number().int().min(0).max(100).optional(), deadline: z.coerce.date().optional(), currentLevel: z.number().int().min(1).max(100).optional(), targetLevel: z.number().int().min(1).max(100).optional(), reminderDate: z.coerce.date().optional(), reminderTime: z.string().max(20).optional(), repeatType: z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']).optional(), enabled: z.boolean().optional() }).passthrough();
const modelMap = { tasks: 'task', habits: 'habit', goals: 'goal', skills: 'skill', reminders: 'reminder', brand: 'brandProject' } as const;
type Resource = keyof typeof modelMap;
function getResource(request: AuthRequest): Resource { const segment = request.baseUrl.split('/').filter(Boolean).pop() ?? 'tasks'; return (segment in modelMap ? segment : 'tasks') as Resource; }
function emitEvent(userId: string, resource: string, action: 'created' | 'updated' | 'deleted', data: unknown) {
  const singular = resource.endsWith('s') ? resource.slice(0, -1) : resource;
  emitToUser(userId, `${singular}:${action}`, data);
}

const FORBIDDEN_WRITE_KEYS = new Set(['id', 'userId', 'createdAt', 'updatedAt', 'deletedAt', 'startAt', 'extendedAt']);

// Scalar foreign-key fields a client may set: each must reference a record owned by the caller.
const REFERENCE_MODELS: Record<string, 'goal' | 'skill' | 'habit' | 'task'> = {
  goalId: 'goal',
  skillId: 'skill',
  habitId: 'habit',
  taskId: 'task',
};

// Strips ownership/PK/timestamp columns and nested-write vectors (plain objects and
// arrays of objects) from validated-but-passthrough request bodies so a client cannot
// reassign records or create rows for other users through relation payloads.
function sanitizeWriteData(input: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN_WRITE_KEYS.has(key)) continue;
    if (Array.isArray(value)) {
      if (value.some((item) => item !== null && typeof item === 'object')) continue;
      clean[key] = value;
      continue;
    }
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) continue;
    clean[key] = value;
  }
  return clean;
}

async function validateReferences(
  data: Record<string, unknown>,
  userId: string
): Promise<string | null> {
  for (const [field, value] of Object.entries(data)) {
    const modelKey = REFERENCE_MODELS[field];
    if (!modelKey || value === null || value === undefined) continue;
    const model = prisma[modelKey] as any;
    const owned = await model.findFirst({ where: { id: String(value), userId } });
    if (!owned) return field;
  }
  return null;
}

function getUserToday(timezone: string): Date {
  return new Date(`${todayKey(timezoneOf(timezone))}T00:00:00.000Z`);
}

function getWeekStart(date: Date): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weekDateKeys(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart.getTime());
    date.setUTCDate(weekStart.getUTCDate() + index);
    return dayKey(date);
  });
}

export async function list(request: AuthRequest, response: Response) {
  const key = getResource(request); const model = prisma[modelMap[key]] as any;
  const user = await prisma.user.findUnique({ where: { id: request.userId }, select: { timezone: true } });
  const today = getUserToday(user?.timezone || 'UTC');
  const where = { userId: request.userId, ...(key === 'tasks' || key === 'habits' ? { deletedAt: null } : {}) };
  const records = await model.findMany({ where, orderBy: { createdAt: 'desc' }, ...(key === 'tasks' ? { include: { checkIns: { where: { userId: request.userId, date: today } } } } : key === 'habits' ? { include: { completions: { where: { userId: request.userId } } } } : {}) });
  if (key === 'tasks') {
    return ok(response, await Promise.all(records.map(async (task: { id: string; recurrence: string; completedAt: Date | null; status: string; scheduledDate: Date | null; dueAt: Date | null; startAt: Date | null; extendedAt: Date | null; checkIns: Array<{ checked: boolean }> }) => {
      let normalized = task;
      if (task.recurrence !== 'NONE' && task.completedAt) {
        const completed = new Date(task.completedAt); completed.setUTCHours(0, 0, 0, 0);
        const elapsedDays = Math.floor((today.getTime() - completed.getTime()) / 86400000);
        const dueAgain = task.recurrence === 'DAILY' ? elapsedDays >= 1 : task.recurrence === 'WEEKLY' ? elapsedDays >= 7 : elapsedDays >= 28;
        normalized = dueAgain ? { ...task, status: 'TODO', completedAt: null } : task;
      }
      let overdueStatus = false;
      if (task.status !== 'COMPLETED' && task.status !== 'ARCHIVED' && task.status !== 'IN_PROGRESS') {
        if (task.dueAt) {
          overdueStatus = Date.now() > new Date(task.dueAt).getTime();
        } else if (task.scheduledDate) {
          const scheduled = new Date(task.scheduledDate);
          scheduled.setUTCHours(23, 59, 59, 999);
          overdueStatus = today.getTime() > scheduled.getTime();
        }
      }
      const history = await prisma.taskCheckIn.groupBy({ by: ['checked'], where: { taskId: task.id, userId: request.userId }, _count: { _all: true } });
      return { ...normalized, checkedToday: task.checkIns[0]?.checked ?? false, checkedDays: history.find((item) => item.checked)?._count._all ?? 0, missedDays: history.find((item) => !item.checked)?._count._all ?? 0, isOverdue: overdueStatus };
    })));
  }
  if (key === 'habits') {
    return ok(response, await Promise.all(records.map((habit: { id: string }) => habitDayPayload(habit, request.userId!, today))));
  }
  return ok(response, records);
}
export async function create(request: AuthRequest, response: Response) {
  const key = getResource(request); const parsed = bodySchema.safeParse(request.body); if (!parsed.success) return fail(response, 'Invalid request data');
  const data = sanitizeWriteData(parsed.data);
  const badRef = await validateReferences(data, request.userId!);
  if (badRef) return fail(response, `Invalid ${badRef} reference`, 400);
  if (key === 'tasks') {
    const rawDue = data.dueAt;
    const user = await prisma.user.findUnique({ where: { id: request.userId! }, select: { timezone: true } });
    const timezone = timezoneOf(user?.timezone);
    const startAt = new Date();
    const deadline = resolveDeadline(rawDue, startAt, timezone);
    if (!deadline.ok) return fail(response, deadline.error, 400);
    data.startAt = startAt;
    data.dueAt = deadline.dueAt;
    if (!data.scheduledDate && rawDue !== undefined && rawDue !== null && rawDue !== '') {
      data.scheduledDate = new Date(`${dayKeyInTz(deadline.dueAt, timezone)}T00:00:00.000Z`);
    }
  }
  const model = prisma[modelMap[key]] as any; const record = await model.create({ data: { ...data, userId: request.userId } });
  emitEvent(request.userId!, key, 'created', record);
  if (key === 'tasks') void generateNotifications(request.userId!).catch(() => undefined);
  return ok(response, record, 201);
}
export async function update(request: AuthRequest, response: Response) {
  const key = getResource(request); const parsed = bodySchema.safeParse(request.body); if (!parsed.success) return fail(response, 'Invalid request data');
  const data = sanitizeWriteData(parsed.data);
  const badRef = await validateReferences(data, request.userId!);
  if (badRef) return fail(response, `Invalid ${badRef} reference`, 400);
  const model = prisma[modelMap[key]] as any; const existing = await model.findFirst({ where: { id: request.params.id, userId: request.userId } });
  if (!existing) return fail(response, 'Record not found', 404);
  if (key === 'tasks' && data.dueAt !== undefined) {
    const user = await prisma.user.findUnique({ where: { id: request.userId! }, select: { timezone: true } });
    const timezone = timezoneOf(user?.timezone);
    const startAt = existing.startAt ?? existing.createdAt ?? new Date();
    const deadline = resolveDeadline(data.dueAt, startAt, timezone);
    if (!deadline.ok) return fail(response, deadline.error, 400);
    data.dueAt = deadline.dueAt;
  }
  const record = await model.update({ where: { id: existing.id }, data });
  emitEvent(request.userId!, key, 'updated', record);
  if (key === 'tasks') void generateNotifications(request.userId!).catch(() => undefined);
  return ok(response, record);
}
export async function remove(request: AuthRequest, response: Response) {
  const key = getResource(request); const model = prisma[modelMap[key]] as any; const existing = await model.findFirst({ where: { id: request.params.id, userId: request.userId } });
  if (!existing) return fail(response, 'Record not found', 404);
  try {
    if (key === 'tasks' || key === 'habits') await model.update({ where: { id: existing.id }, data: { deletedAt: new Date() } }); else await model.delete({ where: { id: existing.id } });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') return fail(response, 'Record not found', 404);
    throw error;
  }
  emitEvent(request.userId!, key, 'deleted', { id: existing.id });
  return ok(response, { deleted: true });
}
export async function completeTask(request: AuthRequest, response: Response) {
  const taskId = String(request.params.id); const task = await prisma.task.findFirst({ where: { id: taskId, userId: request.userId!, deletedAt: null } }); if (!task) return fail(response, 'Task not found', 404);
  const updated = await prisma.$transaction(async (tx) => { const result = await tx.task.update({ where: { id: task.id }, data: { status: 'COMPLETED', completedAt: new Date() } }); await tx.xPTransaction.create({ data: { userId: request.userId!, taskId: task.id, amount: 10, reason: 'Task completed' } }); return result; });
  emitEvent(request.userId!, 'tasks', 'updated', updated);
  emitToUser(request.userId!, 'xp:updated', { reason: 'Task completed', amount: 10 });
  return ok(response, updated);
}
async function getUserTodayFor(userId: string): Promise<Date> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return getUserToday(user?.timezone || 'UTC');
}

type HabitDayStatus = 'COMPLETED' | 'FAILED' | 'SKIPPED';

function completionStatus(status: string | null | undefined): HabitDayStatus {
  if (status === 'FAILED' || status === 'SKIPPED') return status;
  return 'COMPLETED';
}

async function habitDayPayload(habit: { id: string; completions?: Array<{ date: Date; status?: string | null }> }, userId: string, date: Date) {
  const weekStart = getWeekStart(date);
  const weekKeys = weekDateKeys(weekStart);
  const todayKey = dayKey(date);
  const completions = habit.completions
    ?? await prisma.habitCompletion.findMany({ where: { habitId: habit.id, userId }, select: { date: true, status: true } });
  const byStatus: Record<HabitDayStatus, string[]> = { COMPLETED: [], FAILED: [], SKIPPED: [] };
  for (const completion of completions) byStatus[completionStatus(completion.status)].push(dayKey(new Date(completion.date)));
  const completedDates = byStatus.COMPLETED;
  const weekCompletedDays = completedDates.filter((k) => weekKeys.includes(k)).length;
  const { completions: _omit, ...rest } = habit as { completions?: unknown } & Record<string, unknown>;
  return {
    ...rest,
    completedToday: completedDates.includes(todayKey),
    failedToday: byStatus.FAILED.includes(todayKey),
    skippedToday: byStatus.SKIPPED.includes(todayKey),
    completedDays: completedDates.length,
    weekCompletedDays,
    weekStart: dayKey(weekStart),
    weekDates: weekKeys,
    completedDates,
    failedDates: byStatus.FAILED,
    skippedDates: byStatus.SKIPPED,
  };
}

async function setHabitDayStatus(request: AuthRequest, response: Response, status: HabitDayStatus) {
  const habitId = String(request.params.id);
  const habit = await prisma.habit.findFirst({ where: { id: habitId, userId: request.userId!, deletedAt: null } });
  if (!habit) return fail(response, 'Habit not found', 404);
  const date = await getUserTodayFor(request.userId!);
  const existing = await prisma.habitCompletion.findUnique({ where: { habitId_date: { habitId: habit.id, date } } });
  const previouslyCompleted = existing != null && completionStatus(existing.status) === 'COMPLETED';
  const completion = await prisma.habitCompletion.upsert({
    where: { habitId_date: { habitId: habit.id, date } },
    update: { status, completedAt: new Date() },
    create: { habitId: habit.id, userId: request.userId!, date, status },
  });
  const awardXp = status === 'COMPLETED' && !previouslyCompleted;
  if (awardXp) await prisma.xPTransaction.create({ data: { userId: request.userId!, habitId: habit.id, amount: 5, reason: 'Daily commitment completed' } });
  const payload = await habitDayPayload(habit, request.userId!, date);
  emitEvent(request.userId!, 'habits', 'updated', payload);
  if (awardXp) emitToUser(request.userId!, 'xp:updated', { reason: 'Daily commitment completed', amount: 5 });
  if (status === 'COMPLETED') {
    return ok(response, { ...completion, weekCompletedDays: payload.weekCompletedDays, weekComplete: payload.weekCompletedDays === 7 }, 201);
  }
  return ok(response, { ...completion, ...payload });
}

export async function completeHabit(request: AuthRequest, response: Response) {
  return setHabitDayStatus(request, response, 'COMPLETED');
}
export async function failHabitToday(request: AuthRequest, response: Response) {
  return setHabitDayStatus(request, response, 'FAILED');
}
export async function skipHabitToday(request: AuthRequest, response: Response) {
  return setHabitDayStatus(request, response, 'SKIPPED');
}
export async function getOne(request: AuthRequest, response: Response) {
  const key = getResource(request); const model = prisma[modelMap[key]] as any; const record = await model.findFirst({ where: { id: request.params.id, userId: request.userId } });
  return record ? ok(response, record) : fail(response, 'Record not found', 404);
}
export async function checkInTask(request: AuthRequest, response: Response) {
  const taskId = String(request.params.id); const task = await prisma.task.findFirst({ where: { id: taskId, userId: request.userId!, deletedAt: null } }); if (!task) return fail(response, 'Task not found', 404);
  const parsed = z.object({ checked: z.boolean() }).safeParse(request.body); if (!parsed.success) return fail(response, 'Check-in state is required');
  const date = await getUserTodayFor(request.userId!);
  const checkIn = await prisma.taskCheckIn.upsert({ where: { taskId_date: { taskId, date } }, update: { checked: parsed.data.checked, checkedAt: parsed.data.checked ? new Date() : null }, create: { taskId, userId: request.userId!, date, checked: parsed.data.checked, checkedAt: parsed.data.checked ? new Date() : null } });
  const [checkedDays, missedDays] = await Promise.all([prisma.taskCheckIn.count({ where: { taskId, userId: request.userId!, checked: true } }), prisma.taskCheckIn.count({ where: { taskId, userId: request.userId!, checked: false } })]);
  emitEvent(request.userId!, 'tasks', 'updated', { id: task.id, checkedToday: parsed.data.checked, checkedDays, missedDays });
  return ok(response, { ...checkIn, checkedDays, missedDays });
}
export async function startTaskTimer(request: AuthRequest, response: Response) {
  const task = await prisma.task.findFirst({ where: { id: String(request.params.id), userId: request.userId!, deletedAt: null } }); if (!task) return fail(response, 'Task not found', 404);
  return ok(response, await prisma.task.update({ where: { id: task.id }, data: { timerStartedAt: new Date() } }));
}
export async function stopTaskTimer(request: AuthRequest, response: Response) {
  const task = await prisma.task.findFirst({ where: { id: String(request.params.id), userId: request.userId!, deletedAt: null } }); if (!task) return fail(response, 'Task not found', 404);
  return ok(response, await prisma.task.update({ where: { id: task.id }, data: { timerStartedAt: null } }));
}
export async function clearHabitToday(request: AuthRequest, response: Response) {
  const habitId = String(request.params.id); const habit = await prisma.habit.findFirst({ where: { id: habitId, userId: request.userId!, deletedAt: null } }); if (!habit) return fail(response, 'Habit not found', 404);
  const date = await getUserTodayFor(request.userId!);
  await prisma.habitCompletion.deleteMany({ where: { habitId, userId: request.userId!, date } });
  const payload = await habitDayPayload(habit, request.userId!, date);
  emitEvent(request.userId!, 'habits', 'updated', { ...payload, completedToday: false, failedToday: false, skippedToday: false });
  return ok(response, { cleared: true });
}

/** Soft-deleted tasks = the Trash Bin. */
export async function listTrash(request: AuthRequest, response: Response) {
  const records = await prisma.task.findMany({
    where: { userId: request.userId, deletedAt: { not: null } },
    orderBy: { deletedAt: 'desc' },
  });
  return ok(response, records);
}

async function findOwnTask(request: AuthRequest, response: Response) {
  const task = await prisma.task.findFirst({
    where: { id: String(request.params.id), userId: request.userId },
  });
  if (!task) {
    fail(response, 'Task not found', 404);
    return null;
  }
  return task;
}

export async function restoreTask(request: AuthRequest, response: Response) {
  const task = await findOwnTask(request, response);
  if (!task) return;
  if (!task.deletedAt) return fail(response, 'Task is not in the trash', 400);
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { deletedAt: null },
  });
  emitToUser(request.userId!, 'task:restored', updated);
  void generateNotifications(request.userId!).catch(() => undefined);
  return ok(response, updated);
}

export async function purgeTask(request: AuthRequest, response: Response) {
  const task = await findOwnTask(request, response);
  if (!task) return;
  try {
    await prisma.task.delete({ where: { id: task.id } });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') return fail(response, 'Task not found', 404);
    throw error;
  }
  emitToUser(request.userId!, 'task:deleted', { id: task.id, permanent: true });
  return ok(response, { deleted: true });
}

export async function markNotCompleted(request: AuthRequest, response: Response) {
  const task = await findOwnTask(request, response);
  if (!task) return;
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { status: 'NOT_COMPLETED', completedAt: null, deletedAt: new Date() },
  });
  emitToUser(request.userId!, 'task:deleted', { id: task.id });
  void generateNotifications(request.userId!).catch(() => undefined);
  return ok(response, updated);
}

const extendSchema = z.object({ dueAt: z.union([z.string().max(40), z.date()]) });

/** "Give more time": pushes the deadline out and stamps extendedAt. */
export async function extendTaskDeadline(request: AuthRequest, response: Response) {
  const parsed = extendSchema.safeParse(request.body);
  if (!parsed.success) return fail(response, 'A new deadline is required', 400);
  const task = await findOwnTask(request, response);
  if (!task) return;
  if (task.status === 'COMPLETED') return fail(response, 'Task is already completed', 400);
  const user = await prisma.user.findUnique({ where: { id: request.userId! }, select: { timezone: true } });
  const timezone = timezoneOf(user?.timezone);
  const startAt = task.startAt ?? task.createdAt;
  const deadline = resolveDeadline(parsed.data.dueAt, startAt, timezone);
  if (!deadline.ok) return fail(response, deadline.error, 400);
  if (task.dueAt && deadline.dueAt.getTime() <= new Date(task.dueAt).getTime()) {
    return fail(response, 'The new deadline must be later than the current one', 400);
  }
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { dueAt: deadline.dueAt, extendedAt: new Date() },
  });
  emitToUser(request.userId!, 'task:updated', updated);
  void generateNotifications(request.userId!).catch(() => undefined);
  return ok(response, updated);
}