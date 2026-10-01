import { prisma } from './prisma';
import { emitToUser } from './socket';
import { timezoneOf, todayKey } from './time';

export type NotificationInput = {
  type: string;
  title: string;
  body?: string;
  link?: string;
  dedupeKey: string;
};

/**
 * Creates a notification exactly once per (user, dedupeKey).
 * Returns the created row, or null when this event was already recorded.
 */
export async function notify(userId: string, input: NotificationInput) {
  try {
    const created = await prisma.notification.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        dedupeKey: input.dedupeKey,
      },
    });
    emitToUser(userId, 'notification:created', created);
    return created;
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') return null;
    throw error;
  }
}

/**
 * Generates the standing set of reminders for a user. Every candidate carries a
 * dedupe key, so running this on every event (or every cron tick) never spams.
 * Existing keys are filtered in one lookup and the new rows are inserted in a
 * single batch — no N serial inserts racing unique-constraint failures.
 */
export async function generateNotifications(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const timezone = timezoneOf(user?.timezone);
  const now = new Date();
  const today = todayKey(timezone, now);

  const [tasks, habits, pendingHabits] = await Promise.all([
    prisma.task.findMany({
      where: { userId, deletedAt: null, status: { notIn: ['COMPLETED', 'ARCHIVED'] } },
      select: { id: true, title: true, dueAt: true, scheduledDate: true },
    }),
    prisma.habit.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.habitCompletion.findMany({
      where: { userId, date: { in: [new Date(`${today}T00:00:00.000Z`)] } },
      select: { habitId: true, status: true },
    }),
  ]);
  const settled = new Map(pendingHabits.map((row) => [row.habitId, row.status]));

  const candidates: NotificationInput[] = [];
  for (const task of tasks) {
    const due = task.dueAt ? new Date(task.dueAt) : null;

    if (due && due.getTime() > now.getTime() && due.getTime() - now.getTime() <= 2 * 60 * 60 * 1000) {
      candidates.push({
        type: 'task_due_soon',
        title: 'Due soon',
        body: `"${task.title}" is due at ${due.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
        link: '/tasks',
        dedupeKey: `task:due_soon:${task.id}:${due.getTime()}`,
      });
    }

    if (due && due.getTime() <= now.getTime()) {
      candidates.push({
        type: 'task_overdue',
        title: 'Task overdue',
        body: `"${task.title}" passed its deadline.`,
        link: '/tasks',
        dedupeKey: `task:overdue:${task.id}`,
      });
      continue;
    }

    const taskDay = task.scheduledDate
      ? new Date(task.scheduledDate).toISOString().slice(0, 10)
      : null;
    const dueDay = due ? todayKey(timezone, due) : null;
    if (taskDay === today || dueDay === today) {
      candidates.push({
        type: 'task_due_today',
        title: 'Pending for today',
        body: `"${task.title}" is still on your list for today.`,
        link: '/tasks',
        dedupeKey: `task:today:${task.id}:${today}`,
      });
    }
  }

  for (const habit of habits) {
    const status = settled.get(habit.id);
    if (status === 'COMPLETED' || status === 'SKIPPED') continue;
    candidates.push({
      type: 'commitment_pending',
      title: 'Commitment not checked in',
      body: `"${habit.name}" still needs today's check-in.`,
      link: '/commitments',
      dedupeKey: `habit:pending:${habit.id}:${today}`,
    });
  }

  if (!candidates.length) return;

  const keys = candidates.map((candidate) => candidate.dedupeKey);
  const existing = await prisma.notification.findMany({
    where: { userId, dedupeKey: { in: keys } },
    select: { dedupeKey: true },
  });
  const seen = new Set(existing.map((row) => row.dedupeKey));
  const missing = candidates.filter((candidate) => !seen.has(candidate.dedupeKey));
  if (!missing.length) return;

  try {
    await prisma.notification.createMany({
      data: missing.map((candidate) => ({ userId, ...candidate })),
    });
  } catch (error) {
    // A concurrent run won the race — still fine, we emit whatever exists below.
    if ((error as { code?: string }).code !== 'P2002') throw error;
  }
  const rows = await prisma.notification.findMany({
    where: { userId, dedupeKey: { in: missing.map((candidate) => candidate.dedupeKey) } },
  });
  for (const row of rows) emitToUser(userId, 'notification:created', row);
}
