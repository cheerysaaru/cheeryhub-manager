import { z } from 'zod';
import type { Response } from 'express';
import type { AuthRequest } from '../utils/auth';
import { prisma } from '../lib/prisma';
import { fail, ok } from '../utils/response';

const bodySchema = z.object({ title: z.string().trim().min(1).max(200).optional(), name: z.string().trim().min(1).max(200).optional(), description: z.string().max(5000).optional(), category: z.string().max(100).optional(), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(), status: z.string().max(30).optional(), scheduledDate: z.coerce.date().optional(), scheduledTime: z.string().max(20).optional(), deadlineTime: z.string().max(20).optional(), recurrence: z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']).optional(), isMandatory: z.boolean().optional(), reminderEnabled: z.boolean().optional(), estimatedMinutes: z.number().int().positive().max(1440).optional(), progress: z.number().int().min(0).max(100).optional(), deadline: z.coerce.date().optional(), currentLevel: z.number().int().min(1).max(100).optional(), targetLevel: z.number().int().min(1).max(100).optional(), reminderDate: z.coerce.date().optional(), reminderTime: z.string().max(20).optional(), repeatType: z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']).optional(), enabled: z.boolean().optional() }).passthrough();
const modelMap = { tasks: 'task', habits: 'habit', goals: 'goal', skills: 'skill', reminders: 'reminder', brand: 'brandProject' } as const;
type Resource = keyof typeof modelMap;
function getResource(request: AuthRequest): Resource { const segment = request.baseUrl.split('/').filter(Boolean).pop() ?? 'tasks'; return (segment in modelMap ? segment : 'tasks') as Resource; }

function getUserToday(timezone: string): Date {
  const now = new Date();
  const tz = timezone || 'UTC';
  const localDate = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  localDate.setHours(0, 0, 0, 0);
  return localDate;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function list(request: AuthRequest, response: Response) {
  const key = getResource(request); const model = prisma[modelMap[key]] as any;
  const user = await prisma.user.findUnique({ where: { id: request.userId }, select: { timezone: true } });
  const today = getUserToday(user?.timezone || 'UTC');
  const where = { userId: request.userId, ...(key === 'tasks' || key === 'habits' ? { deletedAt: null } : {}) };
  const records = await model.findMany({ where, orderBy: { createdAt: 'desc' }, ...(key === 'tasks' ? { include: { checkIns: { where: { userId: request.userId, date: today } } } } : key === 'habits' ? { include: { completions: true } } : {}) });
  if (key === 'tasks') {
    return ok(response, await Promise.all(records.map(async (task: { id: string; recurrence: string; completedAt: Date | null; status: string; scheduledDate: Date | null; checkIns: Array<{ checked: boolean }> }) => {
      let normalized = task;
      if (task.recurrence !== 'NONE' && task.completedAt) {
        const completed = new Date(task.completedAt); completed.setHours(0, 0, 0, 0);
        const elapsedDays = Math.floor((today.getTime() - completed.getTime()) / 86400000);
        const dueAgain = task.recurrence === 'DAILY' ? elapsedDays >= 1 : task.recurrence === 'WEEKLY' ? elapsedDays >= 7 : elapsedDays >= 28;
        normalized = dueAgain ? { ...task, status: 'TODO', completedAt: null } : task;
      }
      let overdueStatus = false;
      if (task.scheduledDate && task.status !== 'COMPLETED' && task.status !== 'ARCHIVED' && task.status !== 'IN_PROGRESS') {
        const scheduled = new Date(task.scheduledDate);
        scheduled.setHours(23, 59, 59, 999);
        if (today > scheduled) overdueStatus = true;
      }
      const history = await prisma.taskCheckIn.groupBy({ by: ['checked'], where: { taskId: task.id, userId: request.userId }, _count: { _all: true } });
      return { ...normalized, checkedToday: task.checkIns[0]?.checked ?? false, checkedDays: history.find((item) => item.checked)?._count._all ?? 0, missedDays: history.find((item) => !item.checked)?._count._all ?? 0, isOverdue: overdueStatus };
    })));
  }
  if (key === 'habits') {
    const weekStart = getWeekStart(today);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
    return ok(response, records.map((habit: { id: string; completions: Array<{ date: Date }> }) => { const weekCompletions = habit.completions.filter((completion) => { const date = new Date(completion.date); return date >= weekStart && date < weekEnd; }); return { ...habit, completedToday: habit.completions.some((completion) => new Date(completion.date).getTime() === today.getTime()), completedDays: habit.completions.length, weekCompletedDays: weekCompletions.length, weekStart: weekStart.toISOString().slice(0, 10), weekDates: Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setDate(weekStart.getDate() + index); return date.toISOString().slice(0, 10); }), completedDates: habit.completions.map((completion) => new Date(completion.date).toISOString().slice(0, 10)) }; }));
  }
  return ok(response, records);
}
export async function create(request: AuthRequest, response: Response) {
  const key = getResource(request); const parsed = bodySchema.safeParse(request.body); if (!parsed.success) return fail(response, 'Invalid request data');
  const model = prisma[modelMap[key]] as any; return ok(response, await model.create({ data: { ...parsed.data, userId: request.userId } }), 201);
}
export async function update(request: AuthRequest, response: Response) {
  const key = getResource(request); const parsed = bodySchema.safeParse(request.body); if (!parsed.success) return fail(response, 'Invalid request data');
  const model = prisma[modelMap[key]] as any; const existing = await model.findFirst({ where: { id: request.params.id, userId: request.userId } });
  if (!existing) return fail(response, 'Record not found', 404); return ok(response, await model.update({ where: { id: existing.id }, data: parsed.data }));
}
export async function remove(request: AuthRequest, response: Response) {
  const key = getResource(request); const model = prisma[modelMap[key]] as any; const existing = await model.findFirst({ where: { id: request.params.id, userId: request.userId } });
  if (!existing) return fail(response, 'Record not found', 404); if (key === 'tasks' || key === 'habits') await model.update({ where: { id: existing.id }, data: { deletedAt: new Date() } }); else await model.delete({ where: { id: existing.id } }); return ok(response, { deleted: true });
}
export async function completeTask(request: AuthRequest, response: Response) {
  const taskId = String(request.params.id); const task = await prisma.task.findFirst({ where: { id: taskId, userId: request.userId!, deletedAt: null } }); if (!task) return fail(response, 'Task not found', 404);
  const updated = await prisma.$transaction(async (tx) => { const result = await tx.task.update({ where: { id: task.id }, data: { status: 'COMPLETED', completedAt: new Date() } }); await tx.xPTransaction.create({ data: { userId: request.userId!, taskId: task.id, amount: 10, reason: 'Task completed' } }); return result; }); return ok(response, updated);
}
export async function completeHabit(request: AuthRequest, response: Response) {
  const habitId = String(request.params.id); const habit = await prisma.habit.findFirst({ where: { id: habitId, userId: request.userId!, deletedAt: null } }); if (!habit) return fail(response, 'Habit not found', 404);
  const date = new Date(); date.setUTCHours(0, 0, 0, 0); const existing = await prisma.habitCompletion.findUnique({ where: { habitId_date: { habitId: habit.id, date } } }); const completion = existing ?? await prisma.habitCompletion.create({ data: { habitId: habit.id, userId: request.userId!, date } }); if (!existing) await prisma.xPTransaction.create({ data: { userId: request.userId!, habitId: habit.id, amount: 5, reason: 'Daily commitment completed' } }); const weekStart = new Date(date); weekStart.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekStart.getUTCDate() + 7); const weekCompletedDays = await prisma.habitCompletion.count({ where: { habitId: habit.id, userId: request.userId!, date: { gte: weekStart, lt: weekEnd } } }); return ok(response, { ...completion, weekCompletedDays, weekComplete: weekCompletedDays === 7 }, 201);
}
export async function getOne(request: AuthRequest, response: Response) {
  const key = getResource(request); const model = prisma[modelMap[key]] as any; const record = await model.findFirst({ where: { id: request.params.id, userId: request.userId } });
  return record ? ok(response, record) : fail(response, 'Record not found', 404);
}
export async function checkInTask(request: AuthRequest, response: Response) {
  const taskId = String(request.params.id); const task = await prisma.task.findFirst({ where: { id: taskId, userId: request.userId!, deletedAt: null } }); if (!task) return fail(response, 'Task not found', 404);
  const parsed = z.object({ checked: z.boolean() }).safeParse(request.body); if (!parsed.success) return fail(response, 'Check-in state is required');
  const date = new Date(); date.setUTCHours(0, 0, 0, 0); const checkIn = await prisma.taskCheckIn.upsert({ where: { taskId_date: { taskId, date } }, update: { checked: parsed.data.checked, checkedAt: parsed.data.checked ? new Date() : null }, create: { taskId, userId: request.userId!, date, checked: parsed.data.checked, checkedAt: parsed.data.checked ? new Date() : null } });
  const [checkedDays, missedDays] = await Promise.all([prisma.taskCheckIn.count({ where: { taskId, userId: request.userId!, checked: true } }), prisma.taskCheckIn.count({ where: { taskId, userId: request.userId!, checked: false } })]); return ok(response, { ...checkIn, checkedDays, missedDays });
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
  const date = new Date(); date.setUTCHours(0, 0, 0, 0); await prisma.habitCompletion.deleteMany({ where: { habitId, userId: request.userId!, date } }); return ok(response, { cleared: true });
}