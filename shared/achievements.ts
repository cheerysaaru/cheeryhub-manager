/**
 * ONE shared achievements rulebook — used by BOTH the React frontend and the
 * Cloudflare Worker backend so the two can never disagree.
 *
 * Every achievement has a stable `key` (the id that goes into the points
 * ledger's sourceId) and an `xp` value taken from the shared point constants.
 * The key is what makes an unlock idempotent: the same key can never award XP
 * twice.
 */
import {
  POINTS_ACHIEVEMENT_BRONZE,
  POINTS_ACHIEVEMENT_GOLD,
  POINTS_ACHIEVEMENT_MANUAL,
  POINTS_ACHIEVEMENT_SILVER,
} from "./points";

/** XP tier for a catalog achievement. */
export type AchievementTier = "bronze" | "silver" | "gold";

export interface AchievementDefinition {
  /** Stable identifier — never regenerated, never re-awarded. */
  key: string;
  name: string;
  description: string;
  icon: string;
  /** Points awarded on unlock; always one of the shared constants. */
  xp: number;
}

const TIER_XP: Record<AchievementTier, number> = {
  bronze: POINTS_ACHIEVEMENT_BRONZE,
  silver: POINTS_ACHIEVEMENT_SILVER,
  gold: POINTS_ACHIEVEMENT_GOLD,
};

function definition(
  key: string,
  name: string,
  description: string,
  icon: string,
  tier: AchievementTier,
): AchievementDefinition {
  return { key, name, description, icon, xp: TIER_XP[tier] };
}

/** The catalog both sides render and validate keys against. */
export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  definition(
    "first_task",
    "Getting Started",
    "Complete your first task",
    "🎯",
    "bronze",
  ),
  definition(
    "task_streak_7",
    "Week Warrior",
    "Complete tasks for 7 days in a row",
    "🔥",
    "silver",
  ),
  definition(
    "task_streak_30",
    "Monthly Master",
    "Complete tasks for 30 days in a row",
    "🏆",
    "gold",
  ),
  definition(
    "habit_streak_7",
    "Habit Builder",
    "Maintain a habit for 7 days",
    "🌱",
    "silver",
  ),
  definition(
    "habit_streak_30",
    "Habit Master",
    "Maintain a habit for 30 days",
    "🌳",
    "gold",
  ),
  definition("xp_100", "Rising Star", "Earn 100 XP", "⭐", "bronze"),
  definition("xp_1000", "XP Champion", "Earn 1,000 XP", "💎", "silver"),
  definition("xp_10000", "Legend", "Earn 10,000 XP", "👑", "gold"),
  definition(
    "goals_1",
    "Goal Setter",
    "Create your first goal",
    "🎯",
    "bronze",
  ),
  definition("goals_5", "Goal Achiever", "Complete 5 goals", "🏁", "gold"),
  definition(
    "focus_100",
    "Deep Worker",
    "Complete 100 focus minutes",
    "🧘",
    "silver",
  ),
];

/** XP for achievements the user adds by hand (not in the catalog). */
export const MANUAL_ACHIEVEMENT_XP = POINTS_ACHIEVEMENT_MANUAL;

const KEY_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

export function isValidAchievementKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/**
 * Stable key for an achievement added from the UI: the slug of its title.
 * Two achievements with the same title get a suffix at unlock time (see the
 * unlock route), but the slug itself never changes for a given title.
 */
export function achievementKeyFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "achievement";
}

export function findAchievement(
  key: string,
): AchievementDefinition | undefined {
  return ACHIEVEMENT_DEFINITIONS.find((entry) => entry.key === key);
}
