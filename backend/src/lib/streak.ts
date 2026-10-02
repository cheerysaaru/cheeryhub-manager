// Daily login streak. A day only counts when the user was logged in AND added
// at least one task that day — adding a task requires an authenticated
// session, so "a task was created that day" is exactly the evidence we keep
// for a login. Pure functions so the endpoint stays a thin wrapper.

import { shiftDayKey } from './time';

/** Consecutive runs over a set of 'YYYY-MM-DD' day keys. */
export function streakFromDays(days: Iterable<string>, today: string): {
  current: number;
  best: number;
  todayActive: boolean;
} {
  const activeDays = new Set(days);
  const todayActive = activeDays.has(today);

  const sorted = [...activeDays].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    run = previous && shiftDayKey(previous, 1) === day ? run + 1 : 1;
    if (run > best) best = run;
    previous = day;
  }

  // The streak survives until the end of today: if today has no task yet,
  // the run may still be alive from yesterday.
  let cursor = todayActive ? today : shiftDayKey(today, -1);
  let current = 0;
  while (activeDays.has(cursor)) {
    current += 1;
    cursor = shiftDayKey(cursor, -1);
  }

  return { current, best, todayActive };
}
