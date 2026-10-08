import type { XPTransaction } from "../types";

export interface XpBreakdownEntry {
  label: string;
  amount: number;
  count: number;
}

/**
 * Groups a raw XP reason into a human category. Reversal rows keep the
 * category of the thing they reversed so undo never lands in "Other".
 */
export function xpCategoryLabel(reason: string): string {
  const text = reason.replace(/^Reversed:\s*/i, "").toLowerCase();
  if (text.includes("task")) return "Tasks";
  if (
    text.includes("commitment") ||
    text.includes("habit") ||
    text.includes("check-in") ||
    text.includes("checked in")
  ) {
    return "Commitments";
  }
  if (text.includes("goal")) return "Goals";
  if (text.includes("achievement")) return "Achievements";
  if (text.includes("focus")) return "Focus";
  return "Other";
}

/** Groups XP history into category totals, biggest absolute movement first. */
export function xpBreakdown(
  history: readonly XPTransaction[],
): XpBreakdownEntry[] {
  const map = new Map<string, XpBreakdownEntry>();
  for (const item of history) {
    const label = xpCategoryLabel(item.reason);
    const entry = map.get(label) ?? { label, amount: 0, count: 0 };
    entry.amount += item.amount;
    entry.count += 1;
    map.set(label, entry);
  }
  return [...map.values()].sort(
    (a, b) => Math.abs(b.amount) - Math.abs(a.amount),
  );
}

/** Sum of positive movements and sum of negative movements (negative number). */
export function xpEarnedSpent(history: readonly XPTransaction[]): {
  earned: number;
  spent: number;
} {
  let earned = 0;
  let spent = 0;
  for (const item of history) {
    if (item.amount > 0) earned += item.amount;
    else spent += item.amount;
  }
  return { earned, spent };
}
