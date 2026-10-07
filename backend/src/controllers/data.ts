import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { Response } from 'express';
import type { AuthRequest } from '../utils/auth';
import { prisma } from '../lib/prisma';
import { fail, ok } from '../utils/response';
import { emitToUser } from '../lib/socket';
import { refreshNotificationsInBackground } from '../lib/notifications';
import { POINTS, awardPoints, planAwardPoints } from '../lib/points';
import { planHabitDayPoints } from '../lib/habitPoints';
import { resolveHabitDayKey } from '../lib/habitDay';
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
function queueNotificationRefresh(request: AuthRequest) {
  refreshNotificationsInBackground(
    request.userId!,
    request as AuthRequest & { requestId?: string }
  );
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
  const records = await model.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    ...(key === 'tasks'
      ? { include: { checkIns: { where: { userId: request.userId, date: today } } } }
      : key === 'habits'
        ? { include: { completions: { where: { userId: request.userId } } } }
        : key === 'goals'
          ? { include: { milestones: { orderBy: { createdAt: 'asc' } } } }
          : {}),
  });
  if (key === 'goals') {
    const now = Date.now();
    const overdueGoals = (records as Array<{ id: string; status: string; deadline: Date | null }>).filter(
      (goal) => goal.status === 'ACTIVE' && goal.deadline && new Date(goal.deadline).getTime() < now
    );
    for (const goal of overdueGoals) {
      const applied = await awardPoints(prisma, {
        userId: request.userId!,
        amount: POINTS.GOAL_MISSED,
        reason: 'Goal deadline missed',
        dedupeKey: `goal:missed:${goal.id}`,
      });
      if (applied) emitToUser(request.userId!, 'xp:updated', { reason: 'Goal deadline missed', amount: POINTS.GOAL_MISSED });
    }
  }
  if (key === 'tasks') {
    // One grouped query for the whole page instead of one query per task
    // (the old per-row groupBy made /api/tasks scale with the list size).
    const taskIds = records.map((task: { id: string }) => task.id);
    const historyRows = taskIds.length
      ? await prisma.taskCheckIn.groupBy({
          by: ['taskId', 'checked'],
          where: { taskId: { in: taskIds }, userId: request.userId },
          _count: { _all: true },
        })
      : [];
    const historyByTask = new Map<string, { checked: number; missed: number }>();
    for (const row of historyRows) {
      let entry = historyByTask.get(row.taskId);
      if (!entry) {
        entry = { checked: 0, missed: 0 };
        historyByTask.set(row.taskId, entry);
      }
      if (row.checked) entry.checked = row._count._all;
      else entry.missed = row._count._all;
    }
    return ok(response, records.map((task: { id: string; recurrence: string; completedAt: Date | null; status: string; scheduledDate: Date | null; dueAt: Date | null; startAt: Date | null; extendedAt: Date | null; checkIns: Array<{ checked: boolean }> }) => {
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
      const history = historyByTask.get(task.id) ?? { checked: 0, missed: 0 };
      return { ...normalized, checkedToday: task.checkIns[0]?.checked ?? false, checkedDays: history.checked, missedDays: history.missed, isOverdue: overdueStatus };
    }));
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
  if (key === 'tasks') queueNotificationRefresh(request);
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
  if (key === 'goals') {
    const wasDone = (existing.progress ?? 0) >= 100 || existing.status === 'COMPLETED';
    const isDone = (record.progress ?? 0) >= 100 || record.status === 'COMPLETED';
    if (!wasDone && isDone) {
      const applied = await awardPoints(prisma, {
        userId: request.userId!,
        amount: POINTS.GOAL_DONE,
        reason: 'Goal completed',
        dedupeKey: `goal:done:${record.id}`,
      });
      if (applied) emitToUser(request.userId!, 'xp:updated', { reason: 'Goal completed', amount: POINTS.GOAL_DONE });
    }
  }
  if (key === 'tasks') queueNotificationRefresh(request);
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
  const user = await prisma.user.findUnique({ where: { id: request.userId! }, select: { timezone: true } });
  const day = todayKey(timezoneOf(user?.timezone));
  const now = Date.now();
  const dueAt = task.dueAt ? new Date(task.dueAt).getTime() : null;
  let amount: number = POINTS.TASK_ON_TIME;
  let reason = 'Task completed on time';
  let dedupeKey = `task:ontime:${task.id}:${day}`;
  if (dueAt !== null && now > dueAt) {
    if (task.extendedAt) {
      amount = POINTS.TASK_OVERDUE_EXTENDED;
      reason = 'Overdue task finished within extension';
      dedupeKey = `task:extended:${task.id}:${day}`;
    } else {
      amount = POINTS.TASK_OVERDUE_NO_EXTENSION;
      reason = 'Overdue task completed without extension';
      dedupeKey = `task:overdue:${task.id}:${day}`;
    }
  }
  let xpDelta = 0;
  for (let attempt = 0; ; attempt += 1) {
    const points = await planAwardPoints(prisma, { userId: request.userId!, amount, reason, dedupeKey, taskId: task.id });
    const operations: Prisma.PrismaPromise<unknown>[] = [
      prisma.task.update({ where: { id: task.id }, data: { status: 'COMPLETED', completedAt: new Date() } }),
    ];
    if (points.operation) operations.push(points.operation);
    try {
      await prisma.$transaction(operations);
      xpDelta = points.delta;
      break;
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002' || attempt > 0) throw error;
    }
  }
  const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
  emitEvent(request.userId!, 'tasks', 'updated', updated);
  if (xpDelta) emitToUser(request.userId!, 'xp:updated', { reason, amount: xpDelta });
  return ok(response, updated);
}
async function getUserTodayFor(userId: string): Promise<Date> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return getUserToday(user?.timezone || 'UTC');
}

type HabitDayStatus = 'COMPLETED' | 'FAILED' | 'SKIPPED';

/** Audit rows record the terminal state of a cleared day too. */
const CLEARED_STATUS = 'NONE';

const habitDaySchema = z.object({ date: z.string().max(10).optional() });

type HabitDayResult = { ok: true; date: Date } | { ok: false; error: string };

/**
 * Resolves the day a habit action targets: today when no date is given,
 * otherwise a 'YYYY-MM-DD' key inside the back-fill window (user timezone).
 */
async function resolveHabitDay(userId: string, raw: unknown): Promise<HabitDayResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const today = todayKey(timezoneOf(user?.timezone));
  const resolved = resolveHabitDayKey(raw, today);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  return { ok: true, date: new Date(`${resolved.key}T00:00:00.000Z`) };
}

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

async function setHabitDayStatus(request: AuthRequest, response: Response, status: HabitDayStatus, retry = 0) {
  const habitId = String(request.params.id);
  const habit = await prisma.habit.findFirst({ where: { id: habitId, userId: request.userId!, deletedAt: null } });
  if (!habit) return fail(response, 'Habit not found', 404);
  const parsed = habitDaySchema.safeParse(request.body ?? {});
  if (!parsed.success) return fail(response, 'Invalid date');
  const target = await resolveHabitDay(request.userId!, parsed.data.date);
  if (!target.ok) return fail(response, target.error, 400);
  const date = target.date;
  const todayDate = (await resolveHabitDay(request.userId!, undefined)) as { ok: true; date: Date };
  const previous = await prisma.habitCompletion.findUnique({
    where: { habitId_date: { habitId: habit.id, date } },
    select: { status: true },
  });
  const points = await planHabitDayPoints(prisma, {
    userId: request.userId!,
    habitId: habit.id,
    dayKey: dayKey(date),
    status,
  });
  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.habitCompletion.upsert({
      where: { habitId_date: { habitId: habit.id, date } },
      update: { status, completedAt: new Date() },
      create: { habitId: habit.id, userId: request.userId!, date, status },
    }),
    ...points.operations,
    prisma.habitDayEvent.create({
      data: {
        userId: request.userId!,
        habitId: habit.id,
        date,
        fromStatus: previous?.status ?? null,
        toStatus: status,
        pointsDelta: points.delta,
      },
    }),
  ];
  try {
    await prisma.$transaction(operations);
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002' && retry === 0) {
      return setHabitDayStatus(request, response, status, retry + 1);
    }
    throw error;
  }
  const completion = await prisma.habitCompletion.findUniqueOrThrow({
    where: { habitId_date: { habitId: habit.id, date } },
  });
  const payload = await habitDayPayload(habit, request.userId!, todayDate.date);
  emitEvent(request.userId!, 'habits', 'updated', payload);
  if (points.delta) emitToUser(request.userId!, 'xp:updated', { reason: points.reason, amount: points.delta });
  if (status === 'COMPLETED') {
    return ok(response, { ...payload, ...completion, dayKey: dayKey(date), weekCompletedDays: payload.weekCompletedDays, weekComplete: payload.weekCompletedDays === 7 }, 201);
  }
  return ok(response, { ...payload, ...completion, dayKey: dayKey(date) });
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
  return clearHabitDay(request, response, 0);
}

async function clearHabitDay(request: AuthRequest, response: Response, retry: number) {
  const habitId = String(request.params.id); const habit = await prisma.habit.findFirst({ where: { id: habitId, userId: request.userId!, deletedAt: null } }); if (!habit) return fail(response, 'Habit not found', 404);
  const parsed = habitDaySchema.safeParse(request.body ?? {});
  if (!parsed.success) return fail(response, 'Invalid date');
  const target = await resolveHabitDay(request.userId!, parsed.data.date);
  if (!target.ok) return fail(response, target.error, 400);
  const todayDate = (await resolveHabitDay(request.userId!, undefined)) as { ok: true; date: Date };
  const targetKey = dayKey(target.date);
  const previous = await prisma.habitCompletion.findUnique({
    where: { habitId_date: { habitId, date: target.date } },
    select: { status: true },
  });
  const points = await planHabitDayPoints(prisma, {
    userId: request.userId!,
    habitId,
    dayKey: targetKey,
    status: 'SKIPPED',
  });
  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.habitCompletion.deleteMany({ where: { habitId, userId: request.userId!, date: target.date } }),
    ...points.operations,
    prisma.habitDayEvent.create({
      data: {
        userId: request.userId!,
        habitId,
        date: target.date,
        fromStatus: previous?.status ?? null,
        toStatus: CLEARED_STATUS,
        pointsDelta: points.delta,
      },
    }),
  ];
  try {
    await prisma.$transaction(operations);
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002' && retry === 0) {
      return clearHabitDay(request, response, retry + 1);
    }
    throw error;
  }
  const payload = await habitDayPayload(habit, request.userId!, todayDate.date);
  emitEvent(request.userId!, 'habits', 'updated', payload);
  if (points.delta) emitToUser(request.userId!, 'xp:updated', { reason: 'Commitment status cleared', amount: points.delta });
  return ok(response, { cleared: true, dayKey: targetKey });
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
  queueNotificationRefresh(request);
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
  let xpDelta = 0;
  for (let attempt = 0; ; attempt += 1) {
    const points = await planAwardPoints(prisma, {
        userId: request.userId!,
        amount: POINTS.TASK_MISSED,
        reason: 'Task marked as not completed',
        dedupeKey: `task:missed:${task.id}`,
        taskId: task.id,
      });
    const operations: Prisma.PrismaPromise<unknown>[] = [
      prisma.task.update({
        where: { id: task.id },
        data: { status: 'NOT_COMPLETED', completedAt: null, deletedAt: new Date() },
      }),
    ];
    if (points.operation) operations.push(points.operation);
    try {
      await prisma.$transaction(operations);
      xpDelta = points.delta;
      break;
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002' || attempt > 0) throw error;
    }
  }
  const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
  emitToUser(request.userId!, 'task:deleted', { id: task.id });
  if (xpDelta) emitToUser(request.userId!, 'xp:updated', { reason: 'Task marked as not completed', amount: xpDelta });
  queueNotificationRefresh(request);
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
  queueNotificationRefresh(request);
  return ok(response, updated);
}