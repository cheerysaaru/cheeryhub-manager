import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/**
 * Points rules. Points may go negative; level is derived in the client
 * as max(1, floor(points / 100) + 1).
 */
export const POINTS = {
  TASK_ON_TIME: 2,
  TASK_OVERDUE_EXTENDED: 1,
  TASK_OVERDUE_NO_EXTENSION: 0,
  TASK_MISSED: -5,
  COMMITMENT_CHECK_IN: 4,
  COMMITMENT_MISSED: -5,
  COMMITMENT_SKIPPED: 0,
  GOAL_DONE: 5,
  GOAL_MISSED: -3,
  ACHIEVEMENT: 5,
} as const;

export type Db = Prisma.TransactionClient;

interface AwardInput {
  userId: string;
  amount: number;
  reason: string;
  dedupeKey?: string;
  taskId?: string;
  habitId?: string;
}

/**
 * Writes one points transaction. Returns the amount actually applied
 * (0 when the amount is zero or the dedupe key was already recorded).
 */
export async function awardPoints(db: Db, input: AwardInput): Promise<number> {
  if (!input.amount) return 0;
  if (input.dedupeKey) {
    const existing = await db.xPTransaction.findUnique({
      where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
      select: { id: true },
    });
    if (existing) return 0;
  }
  try {
    await db.xPTransaction.create({
      data: {
        userId: input.userId,
        amount: input.amount,
        reason: input.reason,
        dedupeKey: input.dedupeKey ?? null,
        taskId: input.taskId ?? null,
        habitId: input.habitId ?? null,
      },
    });
    return input.amount;
  } catch (error) {
    // Unique race on (userId, dedupeKey): someone else recorded it first.
    if ((error as { code?: string }).code === 'P2002') return 0;
    throw error;
  }
}

/** Removes a previous award (e.g. undoing a check-in). Returns points removed. */
export async function revokePoints(db: Db, userId: string, dedupeKey: string): Promise<number> {
  const existing = await db.xPTransaction.findUnique({
    where: { userId_dedupeKey: { userId, dedupeKey } },
    select: { amount: true },
  });
  if (!existing) return 0;
  await db.xPTransaction.deleteMany({ where: { userId, dedupeKey } });
  return -existing.amount;
}
