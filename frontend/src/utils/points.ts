/** Points + level math, delegating to the shared rulebook so the frontend
 * always agrees with the backend. Points may be negative; the level total is
 * clamped at 0 and level never drops below 1. */
import { levelProgress, reasonLabel } from "../../../shared/points";
import type { PointEvent } from "../types";

export function levelFor(points: number): number {
  return levelProgress(points).level;
}

/** Progress inside the current level (0 … level cost - 1). */
export function pointsIntoLevel(points: number): number {
  return levelProgress(points).pointsIntoLevel;
}

/** Points still missing to reach the next level (cost - progress). */
export function pointsToNextLevel(points: number): number {
  const { pointsIntoLevel, pointsNeededForNextLevel } = levelProgress(points);
  return pointsNeededForNextLevel - pointsIntoLevel;
}

export interface PointsBreakdownEntry {
  label: string;
  amount: number;
  count: number;
}

/** Groups ledger events into reason totals, biggest absolute movement first. */
export function pointsBreakdown(
  events: readonly PointEvent[],
): PointsBreakdownEntry[] {
  const map = new Map<string, PointsBreakdownEntry>();
  for (const event of events) {
    const label = reasonLabel(event.reason);
    const entry = map.get(label) ?? { label, amount: 0, count: 0 };
    entry.amount += event.amount;
    entry.count += 1;
    map.set(label, entry);
  }
  return [...map.values()].sort(
    (a, b) => Math.abs(b.amount) - Math.abs(a.amount),
  );
}
