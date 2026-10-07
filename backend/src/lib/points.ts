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

export interface PointMutationPlan {
  operation: Prisma.PrismaPromise<unknown> | null;
  delta: number;
}

/**
 * Append-only ledger.
 *
 * Rows are NEVER edited or deleted. One "logical award" is a chain of rows
 * sharing a base dedupe key:
 *   - the first award uses the plain key            e.g. `habit:checkin:h1:2026-10-01`
 *   - a re-award after a reversal uses `<key>#g2`, `<key>#g3`, ...
 *   - every reversal appends   `<key>#rev1`, `<key>#rev2`, ... with the negated amount
 *
 * An award is "active" while #awards > #reversals, so undo/redo cycles stay
 * correct and idempotent without ever touching a historical row. The `#`
 * separator can never occur inside a caller-provided key, so `startsWith`
 * chains stay isolated from each other.
 */
async function chainState(
  db: Db,
  userId: string,
  key: string
): Promise<{ awards: number; reversals: number }> {
  const [awards, reversals] = await Promise.all([
    db.xPTransaction.count({
      where: {
        userId,
        OR: [{ dedupeKey: key }, { dedupeKey: { startsWith: `${key}#g` } }],
      },
    }),
    db.xPTransaction.count({
      where: { userId, dedupeKey: { startsWith: `${key}#rev` } },
    }),
  ]);
  return { awards, reversals };
}

function nthAwardKey(key: string, index: number): string {
  return index <= 1 ? key : `${key}#g${index}`;
}

export async function planAwardPoints(db: Db, input: AwardInput): Promise<PointMutationPlan> {
  if (!input.amount) return { operation: null, delta: 0 };
  let dedupeKey: string | null = null;
  if (input.dedupeKey) {
    const { awards, reversals } = await chainState(db, input.userId, input.dedupeKey);
    if (awards > reversals) return { operation: null, delta: 0 };
    dedupeKey = nthAwardKey(input.dedupeKey, awards + 1);
  }

  return {
    operation: db.xPTransaction.create({
      data: {
        userId: input.userId,
        amount: input.amount,
        reason: input.reason,
        dedupeKey,
        taskId: input.taskId ?? null,
        habitId: input.habitId ?? null,
      },
    }),
    delta: input.amount,
  };
}

/**
 * Writes one points transaction. Returns the amount actually applied
 * (0 when the amount is zero or the award is already active for this key).
 */
export async function awardPoints(db: Db, input: AwardInput): Promise<number> {
  const plan = await planAwardPoints(db, input);
  if (!plan.operation) return 0;
  try {
    await plan.operation;
    return plan.delta;
  } catch (error) {
    // Unique race on (userId, dedupeKey): someone else recorded it first.
    if ((error as { code?: string }).code === 'P2002') return 0;
    throw error;
  }
}

/**
 * Reverses the currently active award for `dedupeKey` by APPENDING a row with
 * the negated amount. Nothing is ever deleted, so the ledger keeps a full
 * audit trail of every undo. Returns the points removed (0 when the award is
 * not active).
 */
export async function revokePoints(db: Db, userId: string, dedupeKey: string): Promise<number> {
  const plan = await planRevokePoints(db, userId, dedupeKey);
  if (!plan.operation) return 0;
  try {
    await plan.operation;
    return plan.delta;
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') return 0;
    throw error;
  }
}

export async function planRevokePoints(
  db: Db,
  userId: string,
  dedupeKey: string
): Promise<PointMutationPlan> {
  const { awards, reversals } = await chainState(db, userId, dedupeKey);
  if (awards <= reversals) return { operation: null, delta: 0 };
  const active = await db.xPTransaction.findUnique({
    where: { userId_dedupeKey: { userId, dedupeKey: nthAwardKey(dedupeKey, awards) } },
  });
  if (!active) return { operation: null, delta: 0 };
  return {
    operation: db.xPTransaction.create({
      data: {
        userId,
        amount: -active.amount,
        reason: `Reversed: ${active.reason}`,
        dedupeKey: `${dedupeKey}#rev${reversals + 1}`,
        taskId: active.taskId ?? null,
        habitId: active.habitId ?? null,
      },
    }),
    delta: -active.amount,
  };
}
