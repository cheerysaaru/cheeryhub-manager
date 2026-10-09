import type { AppRequest } from "../types/index";
import { Database } from "../db/client";
import { recordAchievement } from "../lib/points";
import {
  ACHIEVEMENT_DEFINITIONS,
  MANUAL_ACHIEVEMENT_XP,
  achievementKeyFromTitle,
  findAchievement,
  isValidAchievementKey,
} from "../../../shared/achievements";
import { dayKeyInPointsZone } from "../../../shared/points";

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

interface UnlockPayload {
  key?: string;
  title?: string;
  description?: string;
  icon?: string;
  /** Date the achievement was achieved (YYYY-MM-DD); defaults to today. */
  date?: string;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function listAchievements(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, 401);
  }

  const db = new Database(req.env.DB);

  // Get user's unlocked achievements
  const unlocked = await db.all<Achievement>(
    'SELECT * FROM "Achievement" WHERE userId = ?1 ORDER BY unlockedAt DESC',
    [req.user.id],
  );

  const unlockedKeys = new Set(unlocked.map((a) => a.key));

  // Catalog first, then any achievement the user added by hand (their keys are
  // not in the catalog but are still real, unlocked achievements).
  const catalog = ACHIEVEMENT_DEFINITIONS.map((def) => ({
    ...def,
    unlocked: unlockedKeys.has(def.key),
    unlockedAt: unlocked.find((a) => a.key === def.key)?.unlockedAt || null,
  }));
  const custom = unlocked
    .filter((a) => !findAchievement(a.key))
    .map((entry) => ({ ...entry, xp: MANUAL_ACHIEVEMENT_XP, unlocked: true }));

  return json({ data: [...catalog, ...custom] }, 200);
}

export async function unlockAchievement(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, 401);
  }

  const body = (req.body ?? {}) as UnlockPayload;
  const title = body.title?.trim();

  // The key is required: the UI either sends a catalog key or one generated
  // from the title. Both are validated before anything is written.
  const key = (
    body.key ?? (title ? achievementKeyFromTitle(title) : "")
  ).trim();
  if (!key) {
    return json(
      { error: "Missing required field: key", code: "VALIDATION_ERROR" },
      400,
    );
  }
  if (!isValidAchievementKey(key)) {
    return json(
      { error: "Invalid achievement key", code: "VALIDATION_ERROR" },
      400,
    );
  }

  const def = findAchievement(key);
  if (!def && !title) {
    return json(
      { error: "Missing required field: title", code: "VALIDATION_ERROR" },
      400,
    );
  }

  const name = def?.name ?? title!;
  const description = def?.description ?? body.description ?? null;
  const icon = def?.icon ?? body.icon ?? "🏅";
  const xp = def?.xp ?? MANUAL_ACHIEVEMENT_XP;

  const db = new Database(req.env.DB);

  // Check if already unlocked
  const existing = await db.first<Achievement>(
    'SELECT * FROM "Achievement" WHERE userId = ?1 AND key = ?2',
    [req.user.id, key],
  );

  if (existing) {
    return json(
      {
        error: "Achievement already unlocked",
        code: "CONFLICT",
      },
      409,
    );
  }

  const achievementId = crypto.randomUUID();
  const now = new Date().toISOString();
  const dayKey =
    body.date && DAY_KEY.test(body.date)
      ? body.date
      : dayKeyInPointsZone(new Date());

  // Save to the database first — XP is only awarded after a successful save.
  await db.run(
    `INSERT INTO "Achievement" (id, userId, key, name, description, icon, unlockedAt, createdAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    [
      achievementId,
      req.user.id,
      key,
      name,
      description,
      icon,
      `${dayKey}T12:00:00.000Z`,
      now,
    ],
  );

  const achievement = await db.first<Achievement>(
    'SELECT * FROM "Achievement" WHERE id = ?1',
    [achievementId],
  );

  // Then the XP: idempotent through the (userId, reason, sourceId, dayKey) key.
  await recordAchievement(db, req.user.id, key, xp, dayKey);

  return json({ data: { ...(achievement ?? {}), xpAwarded: xp } }, 201);
}
