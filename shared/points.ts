/**
 * ONE shared points/level rulebook — used by BOTH the React frontend and the
 * Cloudflare Worker backend so the two can never disagree.
 *
 * Every tunable number of the points system lives here. Day boundaries use
 * the same Asia/Colombo timezone as the check-in calendar.
 */
import { CHECKIN_TIMEZONE } from "./checkin";

/** All point day boundaries are computed in this timezone. */
export const POINTS_TIMEZONE = CHECKIN_TIMEZONE;

/** Completing a task. */
export const POINTS_TASK_COMPLETED = 10;

/** Checking in a commitment for one day. */
export const POINTS_COMMITMENT_CHECKIN = 10;

/** Task due on a day and not completed by the end of that day (signed). */
export const POINTS_TASK_MISSED = -5;

/** Commitment not checked in for a day, for past or today (signed). */
export const POINTS_COMMITMENT_MISSED = -5;

/** Goal completed on or before its deadline. */
export const POINTS_GOAL_COMPLETED = 50;

/** Goal past its deadline without completion (signed, applied once). */
export const POINTS_GOAL_MISSED = -25;

/**
 * Achievement XP. Every value is a constant here so the frontend toast and the
 * backend ledger can never disagree: `xp` on a shared achievement definition is
 * always one of these numbers.
 */
export const POINTS_ACHIEVEMENT_BRONZE = 25;
export const POINTS_ACHIEVEMENT_SILVER = 50;
export const POINTS_ACHIEVEMENT_GOLD = 100;
/** XP for an achievement the user adds by hand from the Achievements page. */
export const POINTS_ACHIEVEMENT_MANUAL = 25;

/**
 * Level N → N+1 costs POINTS_LEVEL_BASE × N points:
 * 1→2 = 100, 2→3 = 200, 3→4 = 300. Extra points carry over.
 */
export const POINTS_LEVEL_BASE = 100;

export type PointEventType = "EARN" | "PENALTY";

export type PointEventReason =
  | "TASK_COMPLETED"
  | "COMMITMENT_CHECKIN"
  | "TASK_MISSED"
  | "COMMITMENT_MISSED"
  | "GOAL_COMPLETED"
  | "GOAL_MISSED"
  | "ACHIEVEMENT";

export interface LevelProgress {
  level: number;
  pointsIntoLevel: number;
  pointsNeededForNextLevel: number;
}

/**
 * Splits a (clamped, non-negative) point total into level + progress.
 * Level 1 starts at 0; reaching 100 → level 2 with 0 into level 2 toward 200.
 */
export function levelProgress(total: number): LevelProgress {
  let level = 1;
  let remaining = Math.max(0, Math.floor(total));
  let needed = POINTS_LEVEL_BASE * level;
  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = POINTS_LEVEL_BASE * level;
  }
  return {
    level,
    pointsIntoLevel: remaining,
    pointsNeededForNextLevel: needed,
  };
}

/** The 'YYYY-MM-DD' calendar day for a date in the points timezone. */
export function dayKeyInPointsZone(date: Date | string = new Date()): string {
  const value = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: POINTS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Human label for one ledger event reason (unknown reasons pass through). */
export function reasonLabel(reason: string): string {
  switch (reason) {
    case "TASK_COMPLETED":
      return "Completed task";
    case "COMMITMENT_CHECKIN":
      return "Checked in commitment";
    case "TASK_MISSED":
      return "Missed task";
    case "COMMITMENT_MISSED":
      return "Missed commitment";
    case "GOAL_COMPLETED":
      return "Goal completed";
    case "GOAL_MISSED":
      return "Missed goal";
    case "ACHIEVEMENT":
      return "Achievement unlocked";
    default:
      return reason;
  }
}
