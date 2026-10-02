import { POINTS, awardPoints, revokePoints, type Db } from './points';

export type HabitPointsStatus = 'COMPLETED' | 'FAILED' | 'SKIPPED';

export interface HabitDayPointsInput {
  userId: string;
  habitId: string;
  /** Local 'YYYY-MM-DD' key of the day being changed. */
  dayKey: string;
  status: HabitPointsStatus;
}

export interface HabitDayPointsResult {
  /** Net points applied by this change (0 when nothing changed). */
  delta: number;
  reason: string;
}

/**
 * Undo/clear: no new award, and any active check-in or miss is reversed by
 * appended reversal rows. The commitment and its other days stay untouched.
 */
export async function revokeHabitDayPoints(
  db: Db,
  input: Omit<HabitDayPointsInput, 'status'>
): Promise<HabitDayPointsResult> {
  const checkKey = `habit:checkin:${input.habitId}:${input.dayKey}`;
  const missKey = `habit:missed:${input.habitId}:${input.dayKey}`;
  const delta =
    (await revokePoints(db, input.userId, checkKey)) +
    (await revokePoints(db, input.userId, missKey));
  return { delta, reason: delta ? 'Commitment status cleared' : '' };
}

/**
 * Keeps the append-only points ledger in step with a commitment day's status:
 *
 *   COMPLETED -> +4 while active, never doubled
 *   FAILED    -> -5 while active
 *   SKIPPED   -> 0, and any active check-in/miss is reversed
 *
 * Undo/redo cycles only ever APPEND reversal rows and fresh awards; no existing
 * row is edited or deleted, so the ledger stays a complete audit trail.
 */
export async function applyHabitDayPoints(
  db: Db,
  input: HabitDayPointsInput
): Promise<HabitDayPointsResult> {
  const checkKey = `habit:checkin:${input.habitId}:${input.dayKey}`;
  const missKey = `habit:missed:${input.habitId}:${input.dayKey}`;

  if (input.status === 'COMPLETED') {
    const reversed = await revokePoints(db, input.userId, missKey);
    const awarded = await awardPoints(db, {
      userId: input.userId,
      amount: POINTS.COMMITMENT_CHECK_IN,
      reason: 'Daily commitment checked in',
      dedupeKey: checkKey,
      habitId: input.habitId,
    });
    const delta = reversed + awarded;
    return { delta, reason: delta ? 'Daily commitment checked in' : '' };
  }

  if (input.status === 'FAILED') {
    const reversed = await revokePoints(db, input.userId, checkKey);
    const awarded = await awardPoints(db, {
      userId: input.userId,
      amount: POINTS.COMMITMENT_MISSED,
      reason: 'Daily commitment missed',
      dedupeKey: missKey,
      habitId: input.habitId,
    });
    const delta = reversed + awarded;
    return { delta, reason: delta ? 'Daily commitment missed' : '' };
  }

  // SKIPPED / leave: 0 points, and both sides must end up inactive.
  return revokeHabitDayPoints(db, input);
}
