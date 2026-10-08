import type { AppRequest } from "../types/index";
import { Database } from "../db/client";

interface Achievement {
  id: string;
  userId: string;
  key: string;
  name: string;
  description?: string;
  icon?: string;
  unlockedAt?: string;
  createdAt: string;
}

const ACHIEVEMENT_DEFINITIONS: Array<{
  key: string;
  name: string;
  description: string;
  icon: string;
}> = [
  {
    key: "first_task",
    name: "Getting Started",
    description: "Complete your first task",
    icon: "🎯",
  },
  {
    key: "task_streak_7",
    name: "Week Warrior",
    description: "Complete tasks for 7 days in a row",
    icon: "🔥",
  },
  {
    key: "task_streak_30",
    name: "Monthly Master",
    description: "Complete tasks for 30 days in a row",
    icon: "🏆",
  },
  {
    key: "habit_streak_7",
    name: "Habit Builder",
    description: "Maintain a habit for 7 days",
    icon: "🌱",
  },
  {
    key: "habit_streak_30",
    name: "Habit Master",
    description: "Maintain a habit for 30 days",
    icon: "🌳",
  },
  {
    key: "xp_100",
    name: "Rising Star",
    description: "Earn 100 XP",
    icon: "⭐",
  },
  {
    key: "xp_1000",
    name: "XP Champion",
    description: "Earn 1,000 XP",
    icon: "💎",
  },
  {
    key: "xp_10000",
    name: "Legend",
    description: "Earn 10,000 XP",
    icon: "👑",
  },
  {
    key: "goals_1",
    name: "Goal Setter",
    description: "Create your first goal",
    icon: "🎯",
  },
  {
    key: "goals_5",
    name: "Goal Achiever",
    description: "Complete 5 goals",
    icon: "🏁",
  },
  {
    key: "focus_100",
    name: "Deep Worker",
    description: "Complete 100 focus minutes",
    icon: "🧘",
  },
];

export async function listAchievements(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = new Database(req.env.DB);

  // Get user's unlocked achievements
  const unlocked = await db.all<Achievement>(
    'SELECT * FROM "Achievement" WHERE userId = ?1 ORDER BY unlockedAt DESC',
    [req.user.id],
  );

  const unlockedKeys = new Set(unlocked.map((a) => a.key));

  // Merge with definitions
  const achievements = ACHIEVEMENT_DEFINITIONS.map((def) => ({
    ...def,
    unlocked: unlockedKeys.has(def.key),
    unlockedAt: unlocked.find((a) => a.key === def.key)?.unlockedAt || null,
  }));

  return new Response(JSON.stringify({ data: achievements }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function unlockAchievement(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { key } = req.body as { key: string };

  if (!key) {
    return new Response(
      JSON.stringify({
        error: "Missing required field: key",
        code: "VALIDATION_ERROR",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const def = ACHIEVEMENT_DEFINITIONS.find((a) => a.key === key);
  if (!def) {
    return new Response(
      JSON.stringify({ error: "Invalid achievement key", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = new Database(req.env.DB);

  // Check if already unlocked
  const existing = await db.first<Achievement>(
    'SELECT * FROM "Achievement" WHERE userId = ?1 AND key = ?2',
    [req.user.id, key],
  );

  if (existing) {
    return new Response(
      JSON.stringify({
        error: "Achievement already unlocked",
        code: "CONFLICT",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  const achievementId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO "Achievement" (id, userId, key, name, description, icon, unlockedAt, createdAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    [
      achievementId,
      req.user.id,
      key,
      def.name,
      def.description,
      def.icon,
      now,
      now,
    ],
  );

  const achievement = await db.first<Achievement>(
    'SELECT * FROM "Achievement" WHERE id = ?1',
    [achievementId],
  );

  return new Response(JSON.stringify({ data: achievement }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}
