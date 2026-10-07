// The 3-day edit window for commitment days (today + yesterday + the day
// before). Kept pure so the API controller and the tests share one definition.

import { shiftDayKey } from './time';

/** Users may fix today and the last 2 days — nothing older, nothing future. */
export const BACK_FILL_DAYS = 2;

/** Tooltip shown on locked (too old) days in the UI. */
export const LOCKED_TOOLTIP = `Locked after ${BACK_FILL_DAYS} days`;

export type HabitDayKeyResult = { ok: true; key: string } | { ok: false; error: string };

/**
 * Resolves the raw date a client sent into a 'YYYY-MM-DD' key that is inside
 * the back-fill window. Missing input means today.
 */
export function resolveHabitDayKey(
  raw: unknown,
  today: string,
  startedOn?: string
): HabitDayKeyResult {
  if (raw === undefined || raw === null || raw === '') return { ok: true, key: today };
  const key = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return { ok: false, error: 'Invalid date' };
  if (key > today) return { ok: false, error: 'Cannot update a future day' };
  const earliest = shiftDayKey(today, -BACK_FILL_DAYS);
  if (key < earliest) {
    return { ok: false, error: `Only today and the last ${BACK_FILL_DAYS} days can be updated` };
  }
  if (startedOn && key < startedOn) {
    return { ok: false, error: 'This commitment had not started on that day' };
  }
  return { ok: true, key };
}

/** True while the day may still be edited (inside the window, not future). */
export function isHabitDayEditable(dayKey: string, today: string): boolean {
  if (dayKey > today) return false;
  return dayKey >= shiftDayKey(today, -BACK_FILL_DAYS);
}
