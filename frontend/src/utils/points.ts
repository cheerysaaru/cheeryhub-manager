/** Points → level math. Points may be negative; level never drops below 1. */

export function levelFor(points: number): number {
  return Math.max(1, Math.floor(points / 100) + 1);
}

/** Progress inside the current level, always 0–99. */
export function pointsIntoLevel(points: number): number {
  return ((points % 100) + 100) % 100;
}

/** Points needed to reach the next level (for display). */
export function pointsToNextLevel(points: number): number {
  return 100 - pointsIntoLevel(points);
}
