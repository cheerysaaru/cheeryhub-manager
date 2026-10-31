/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AppRequest } from "../types/index";
import { Database } from "../db/client";
import { resolveSessionUser } from "../middleware/session";
import { shiftDayKey } from "../../../shared/checkin";
import {
  POINTS_ACHIEVEMENT_MANUAL,
  POINTS_ROADMAP_COMPLETED,
  POINTS_ROADMAP_DAY_COMPLETED,
  POINTS_ROADMAP_DAY_MISSED,
  dayKeyInPointsZone,
} from "../../../shared/points";
import { refreshPoints } from "../lib/points";

const JSON_HEADERS = { "Content-Type": "application/json" };
const DAY_MS = 24 * 60 * 60 * 1000;

interface RoadmapRow {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  totalDays: number;
  skillId: string | null;
  goalId: string | null;
  mode: string | null;
  startDate: string | null;
  reminderEnabled: number | boolean | null;
  completed: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RoadmapDayRow {
  id: string;
  roadmapId: string;
  dayNumber: number;
  learnTopic: string;
  buildTask: string;
  heading: string | null;
  description: string | null;
  whatILearned: string | null;
  status: string | null;
  dueAt: string | null;
  completed: number;
  completedAt: string | null;
  updatedAt: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function unauthorized(): Response {
  return json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, 401);
}

/** A day's due date: start day + (dayNumber - 1) calendar days, 00:00 UTC. */
function dueForKey(startKey: string, dayNumber: number): string {
  return `${shiftDayKey(startKey, dayNumber - 1)}T00:00:00.000Z`;
}

function roadmapStartKey(roadmap: RoadmapRow): string {
  const raw = roadmap.startDate || roadmap.createdAt || new Date().toISOString();
  return dayKeyInPointsZone(raw);
}

function isMissed(day: RoadmapDayRow, now: number): boolean {
  if (day.completed) return false;
  if (!day.dueAt) return false;
  const due = new Date(day.dueAt).getTime();
  return Number.isFinite(due) && now >= due + DAY_MS;
}

function daysFinished(roadmap: RoadmapRow, now: Date): number {
  const start = new Date(roadmap.startDate || roadmap.createdAt || now.toISOString()).getTime();
  if (!Number.isFinite(start)) return roadmap.totalDays;
  return Math.max(1, Math.min(roadmap.totalDays, Math.ceil((now.getTime() - start) / DAY_MS)));
}

function manualSummary(days: RoadmapDayRow[]): string {
  const parts = days
    .map((day) => day.heading || day.learnTopic || "")
    .filter(Boolean)
    .slice(0, 5);
  if (parts.length === 0) return "Completed every day of the plan.";
  return parts.join(" â€¢ ");
}

async function pointEvent(
  db: Database,
  userId: string,
  type: "EARN" | "PENALTY",
  amount: number,
  reason: string,
  sourceId: string,
  dayKey: string,
): Promise<void> {
  await db.run(
    `INSERT OR IGNORE INTO "PointEvent" (id, userId, type, amount, reason, sourceId, dayKey, createdAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    [crypto.randomUUID(), userId, type, amount, reason, sourceId, dayKey, new Date().toISOString()],
  );
}

async function deletePointEvents(
  db: Database,
  userId: string,
  filter: { reason?: string; sourceId?: string; dayKey?: string },
): Promise<void> {
  const clauses = ["userId = ?1"];
  const params: unknown[] = [userId];
  if (filter.reason) {
    params.push(filter.reason);
    clauses.push(`reason = ?${params.length}`);
  }
  if (filter.sourceId) {
    params.push(filter.sourceId);
    clauses.push(`sourceId = ?${params.length}`);
  }
  if (filter.dayKey) {
    params.push(filter.dayKey);
    clauses.push(`dayKey = ?${params.length}`);
  }
  await db.run(`DELETE FROM "PointEvent" WHERE ${clauses.join(" AND ")}`, params);
}

async function getDays(db: Database, roadmapId: string): Promise<RoadmapDayRow[]> {
  return db.all<RoadmapDayRow>(
    'SELECT * FROM "RoadmapDay" WHERE roadmapId = ?1 ORDER BY dayNumber ASC',
    [roadmapId],
  );
}

/**
 * Keeps each day's due date and derived status current:
 * - a day that is not done 24h after its due day becomes MISSED (and -5 once);
 * - a day that is done never carries a penalty;
 * - a recovered day clears its penalty.
 */
async function syncRoadmap(
  db: Database,
  roadmap: RoadmapRow,
  userId: string,
): Promise<RoadmapDayRow[]> {
  const days = await getDays(db, roadmap.id);
  const startKey = roadmapStartKey(roadmap);
  const now = Date.now();
  for (const day of days) {
    const dueAt = day.dueAt || dueForKey(startKey, day.dayNumber);
    if (day.completed) {
      if (day.status !== "DONE" || day.dueAt !== dueAt) {
        await db.run(
          'UPDATE "RoadmapDay" SET status = ?1, dueAt = ?2, heading = COALESCE(heading, learnTopic), description = COALESCE(description, buildTask) WHERE id = ?3',
          ["DONE", dueAt, day.id],
        );
      }
      await deletePointEvents(db, userId, { reason: "ROADMAP_DAY_MISSED", sourceId: day.id });
      continue;
    }
    const missed = isMissed({ ...day, dueAt }, now);
    const nextStatus = missed ? "MISSED" : "PENDING";
    if (day.status !== nextStatus || day.dueAt !== dueAt) {
      await db.run(
        'UPDATE "RoadmapDay" SET status = ?1, dueAt = ?2, heading = COALESCE(heading, learnTopic), description = COALESCE(description, buildTask) WHERE id = ?3',
        [nextStatus, dueAt, day.id],
      );
    }
    if (missed) {
      await pointEvent(
        db,
        userId,
        "PENALTY",
        POINTS_ROADMAP_DAY_MISSED,
        "ROADMAP_DAY_MISSED",
        day.id,
        dayKeyInPointsZone(dueAt),
      );
    } else {
      await deletePointEvents(db, userId, { reason: "ROADMAP_DAY_MISSED", sourceId: day.id });
    }
  }
  return getDays(db, roadmap.id);
}

async function addCompletionAchievement(
  db: Database,
  userId: string,
  roadmap: RoadmapRow,
  days: RoadmapDayRow[],
  now: Date,
): Promise<void> {
  const key = `roadmap_${roadmap.id}`;
  const existing = await db.first<{ id: string }>(
    'SELECT id FROM "Achievement" WHERE userId = ?1 AND key = ?2',
    [userId, key],
  );
  const finished = daysFinished(roadmap, now);
  const description = `Finished in ${finished} ${finished === 1 ? "day" : "days"} · ${manualSummary(days)}`;
  if (existing) {
    await db.run(
      'UPDATE "Achievement" SET name = ?1, description = ?2, icon = ?3 WHERE id = ?4',
      [roadmap.title, description, "ðŸ—ºï¸", existing.id],
    );
    return;
  }
  await db.run(
    `INSERT INTO "Achievement" (id, userId, key, name, description, icon, unlockedAt, createdAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    [
      crypto.randomUUID(),
      userId,
      key,
      roadmap.title,
      description,
      "ðŸ—ºï¸",
      now.toISOString(),
      now.toISOString(),
    ],
  );
  await pointEvent(
    db,
    userId,
    "EARN",
    POINTS_ACHIEVEMENT_MANUAL,
    "ACHIEVEMENT",
    key,
    dayKeyInPointsZone(now),
  );
}

async function maybeCompleteRoadmap(
  db: Database,
  userId: string,
  roadmap: RoadmapRow,
  days: RoadmapDayRow[],
): Promise<RoadmapRow> {
  const now = new Date();
  const allDone = days.length > 0 && days.every((day) => day.completed === 1);
  if (allDone && !roadmap.completed) {
    await db.run(
      'UPDATE "Roadmap" SET completed = 1, completedAt = ?1, updatedAt = ?2 WHERE id = ?3',
      [now.toISOString(), now.toISOString(), roadmap.id],
    );
    await pointEvent(
      db,
      userId,
      "EARN",
      POINTS_ROADMAP_COMPLETED,
      "ROADMAP_COMPLETED",
      roadmap.id,
      dayKeyInPointsZone(now),
    );
    await addCompletionAchievement(db, userId, roadmap, days, now);
    return { ...roadmap, completed: 1, completedAt: now.toISOString() };
  }
  if (!allDone && roadmap.completed) {
    await db.run(
      'UPDATE "Roadmap" SET completed = 0, completedAt = NULL, updatedAt = ?1 WHERE id = ?2',
      [now.toISOString(), roadmap.id],
    );
    await deletePointEvents(db, userId, { reason: "ROADMAP_COMPLETED", sourceId: roadmap.id });
    await db.run('DELETE FROM "Achievement" WHERE userId = ?1 AND key = ?2', [
      userId,
      `roadmap_${roadmap.id}`,
    ]);
    await deletePointEvents(db, userId, {
      reason: "ACHIEVEMENT",
      sourceId: `roadmap_${roadmap.id}`,
    });
    return { ...roadmap, completed: 0, completedAt: null };
  }
  return roadmap;
}

/**
 * Creates today's in-app reminder exactly once. The same logic runs from the
 * daily cron trigger, so the notification exists even if the app is not open.
 */
async function ensureTodayReminder(
  db: Database,
  userId: string,
  roadmap: RoadmapRow,
  days: RoadmapDayRow[],
): Promise<void> {
  const enabled = roadmap.reminderEnabled === 1 || roadmap.reminderEnabled === true;
  if (!enabled || roadmap.completed) return;
  const today = dayKeyInPointsZone(new Date());
  const startKey = roadmapStartKey(roadmap);
  const todayDay = days.find(
    (day) => day.dayNumber === 1 + Math.round((new Date(`${today}T00:00:00.000Z`).getTime() - new Date(`${startKey}T00:00:00.000Z`).getTime()) / DAY_MS),
  );
  if (!todayDay || todayDay.completed) return;
  const dedupeKey = `roadmap:${roadmap.id}:${today}`;
  const existing = await db.first<{ id: string }>(
    'SELECT id FROM "Notification" WHERE userId = ?1 AND dedupeKey = ?2',
    [userId, dedupeKey],
  );
  if (existing) return;
  await db.run(
    `INSERT INTO "Notification" (id, userId, type, title, body, link, readAt, dedupeKey, createdAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8)`,
    [
      crypto.randomUUID(),
      userId,
      "roadmap_reminder",
      `Roadmap: ${roadmap.title}`,
      todayDay.heading || todayDay.learnTopic || `Day ${todayDay.dayNumber} is waiting for you.`,
      "/roadmaps",
      dedupeKey,
      new Date().toISOString(),
    ],
  );
}

/** Cron entry point: one in-app reminder for every active roadmap, per day. */
export async function createDailyRoadmapReminders(env: { DB: any }): Promise<void> {
  const db = new Database(env.DB);
  const roadmaps = await db.all<RoadmapRow>(
    'SELECT * FROM "Roadmap" WHERE completed = 0 AND reminderEnabled = 1',
  );
  for (const roadmap of roadmaps) {
    const days = await getDays(db, roadmap.id);
    await ensureTodayReminder(db, roadmap.userId, roadmap, days);
  }
}

export async function listRoadmaps(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const db = new Database(req.env.DB);
  const roadmaps = await db.all<RoadmapRow>(
    `SELECT r.*, (SELECT COUNT(*) FROM "RoadmapDay" rd WHERE rd.roadmapId = r.id AND rd.completed = 1) as completedDays
       FROM "Roadmap" r WHERE r.userId = ?1 ORDER BY r.createdAt DESC`,
    [req.user.id],
  );
  for (const roadmap of roadmaps) {
    const days = await syncRoadmap(db, roadmap, req.user.id);
    await maybeCompleteRoadmap(db, req.user.id, roadmap, days);
    await ensureTodayReminder(db, req.user.id, roadmap, days);
    (roadmap as any).days = days;
    (roadmap as any).completedDays = days.filter((day) => day.completed === 1).length;
  }
  return json({ data: roadmaps });
}

export async function getRoadmap(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { id } = req.params;
  const db = new Database(req.env.DB);
  const roadmap = await db.first<RoadmapRow>(
    'SELECT * FROM "Roadmap" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );
  if (!roadmap) return json({ error: "Not found", code: "NOT_FOUND" }, 404);
  const days = await syncRoadmap(db, roadmap, req.user.id);
  const updated = await maybeCompleteRoadmap(db, req.user.id, roadmap, days);
  return json({ data: { ...updated, days } });
}

function generateDayContent(totalDays: number, title: string, dayIndex: number): { learnTopic: string; buildTask: string } {
  const progress = (dayIndex + 1) / totalDays;
  if (progress <= 0.2) {
    return {
      learnTopic: `Foundations of ${title}: core concepts and terminology`,
      buildTask: `Set up your ${title} workspace and create a learning plan`,
    };
  }
  if (progress <= 0.4) {
    return {
      learnTopic: `Core ${title} concepts: data structures and patterns`,
      buildTask: `Implement a small ${title} exercise applying core patterns`,
    };
  }
  if (progress <= 0.6) {
    return {
      learnTopic: `Intermediate ${title}: advanced techniques and best practices`,
      buildTask: `Build a ${title} mini-project demonstrating key techniques`,
    };
  }
  if (progress <= 0.8) {
    return {
      learnTopic: `Advanced ${title}: optimization and real-world scenarios`,
      buildTask: `Refine your mini-project with error handling and edge cases`,
    };
  }
  return {
    learnTopic: `${title} review: synthesize knowledge and share findings`,
    buildTask: `Document your ${title} journey and prepare a demo/presentation`,
  };
}

/** Free AI plan generator: Workers AI when bound, deterministic plan otherwise. */
export async function generateAiPlan(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const body = (req.body ?? {}) as { title?: string; totalDays?: number };
  const title = body.title?.trim();
  const totalDays = Number(body.totalDays);
  if (!title || title.length < 2 || title.length > 80) {
    return json({ error: "Title must be 2-80 characters", code: "VALIDATION_ERROR" }, 400);
  }
  if (!Number.isInteger(totalDays) || totalDays < 1 || totalDays > 90) {
    return json({ error: "Days must be an integer between 1 and 90", code: "VALIDATION_ERROR" }, 400);
  }

  const fallback = Array.from({ length: totalDays }, (_, index) => {
    const content = generateDayContent(totalDays, title, index);
    return { dayNumber: index + 1, heading: content.learnTopic, description: content.buildTask };
  });

  const ai = (req.env as any).AI;
  if (!ai?.run) return json({ data: { days: fallback, source: "template" } });

  try {
    const prompt = [
      `Create a practical ${totalDays}-day learning plan for "${title}".`,
      'Reply with ONLY a JSON array, no markdown. Each item: {"dayNumber":1,"heading":"short topic","description":"one line practical task"}.',
      `Return exactly ${totalDays} items.`,
    ].join(" ");
    const result = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: "You are a concise curriculum planner. Output valid JSON only." },
        { role: "user", content: prompt },
      ],
      max_tokens: Math.min(2500, totalDays * 90),
    });
    const text: string = result?.response ?? "";
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(text.slice(start, end + 1)) as Array<Record<string, unknown>>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const days = Array.from({ length: totalDays }, (_, index) => {
          const item = parsed[index] as any;
          return {
            dayNumber: index + 1,
            heading: String(item?.heading || item?.learnTopic || fallback[index].heading).slice(0, 120),
            description: String(item?.description || item?.buildTask || fallback[index].description).slice(0, 240),
          };
        });
        return json({ data: { days, source: "ai" } });
      }
    }
  } catch (error) {
    console.error("[roadmaps] AI plan failed, using template", error);
  }
  return json({ data: { days: fallback, source: "template" } });
}

export async function createRoadmap(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const session = await resolveSessionUser(req);
  if (!session.ok) return session.response;
  const body = (req.body ?? {}) as any;
  const title = body?.title?.trim();
  const totalDays = Number(body?.totalDays);
  const skillId = body?.skillId || null;
  const goalId = body?.goalId || null;
  const mode = body?.mode === "MANUAL" ? "MANUAL" : "AI";
  const reminderEnabled = body?.reminderEnabled === false ? 0 : 1;
  const daysInput: any[] = Array.isArray(body?.days) ? body.days : [];
  if (!title || title.length < 2 || title.length > 80) {
    return json({ error: "Title must be 2-80 characters", code: "VALIDATION_ERROR" }, 400);
  }
  if (!Number.isInteger(totalDays) || totalDays < 1 || totalDays > 90) {
    return json({ error: "Days must be an integer between 1 and 90", code: "VALIDATION_ERROR" }, 400);
  }
  if (mode === "MANUAL") {
    if (daysInput.length !== totalDays) {
      return json({ error: "Every day needs its own heading and description", code: "VALIDATION_ERROR" }, 400);
    }
    for (const day of daysInput) {
      if (!String(day?.heading ?? "").trim() || !String(day?.description ?? "").trim()) {
        return json({ error: "Every day needs a heading and a one-line description", code: "VALIDATION_ERROR" }, 400);
      }
    }
  }
  const db = new Database(req.env.DB);
  const roadmapId = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();
  const startDate = body?.startDate
    ? `${shiftDayKey(dayKeyInPointsZone(body.startDate), 0)}T00:00:00.000Z`
    : `${dayKeyInPointsZone(now)}T00:00:00.000Z`;
  const startKey = dayKeyInPointsZone(startDate);
  await db.run(
    `INSERT INTO "Roadmap" (id, userId, title, totalDays, skillId, goalId, mode, startDate, reminderEnabled, completed, createdAt, updatedAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, ?11)`,
    [roadmapId, session.userId, title, totalDays, skillId, goalId, mode, startDate, reminderEnabled, nowIso, nowIso],
  );
  const batch: Array<{ sql: string; params: unknown[] }> = [];
  for (let i = 0; i < totalDays; i++) {
    const source = daysInput[i];
    const fallback = generateDayContent(totalDays, title, i);
    const content =
      source && (source.heading || source.learnTopic || source.buildTask || source.description)
        ? {
            heading: String(source.heading ?? source.learnTopic ?? "").trim(),
            description: String(source.description ?? source.buildTask ?? "").trim(),
          }
        : { heading: fallback.learnTopic, description: fallback.buildTask };
    batch.push({
      sql: `INSERT INTO "RoadmapDay" (id, roadmapId, dayNumber, learnTopic, buildTask, heading, description, whatILearned, status, dueAt, completed, updatedAt)
            VALUES (?1, ?2, ?3, ?4, ?5, ?4, ?5, NULL, 'PENDING', ?6, 0, ?7)`,
      params: [
        crypto.randomUUID(),
        roadmapId,
        i + 1,
        content.heading,
        content.description,
        dueForKey(startKey, i + 1),
        nowIso,
      ],
    });
  }
  await db.batch(batch);
  const roadmap = await db.first<RoadmapRow>('SELECT * FROM "Roadmap" WHERE id = ?1', [roadmapId]);
  const days = await getDays(db, roadmapId);
  return json({ data: { ...(roadmap as RoadmapRow), days } }, 201);
}

export async function updateRoadmap(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { id } = req.params;
  const body = (req.body ?? {}) as any;
  const db = new Database(req.env.DB);
  const roadmap = await db.first<RoadmapRow>(
    'SELECT * FROM "Roadmap" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );
  if (!roadmap) return json({ error: "Not found", code: "NOT_FOUND" }, 404);
  const title = body?.title?.trim();
  if (title !== undefined && (title.length < 2 || title.length > 80)) {
    return json({ error: "Title must be 2-80 characters", code: "VALIDATION_ERROR" }, 400);
  }
  const updates: string[] = [];
  const params: unknown[] = [];
  const push = (sql: string, value: unknown) => {
    params.push(value);
    updates.push(sql.replace("?", `?${params.length}`));
  };
  if (title !== undefined) push("title = ?", title);
  if (body?.skillId !== undefined) push("skillId = ?", body.skillId || null);
  if (body?.goalId !== undefined) push("goalId = ?", body.goalId || null);
  if (body?.reminderEnabled !== undefined) push("reminderEnabled = ?", body.reminderEnabled ? 1 : 0);
  if (updates.length > 0) {
    params.push(new Date().toISOString());
    updates.push(`updatedAt = ?${params.length}`);
    params.push(id);
    await db.run(`UPDATE "Roadmap" SET ${updates.join(", ")} WHERE id = ?${params.length}`, params);
  }
  const updated = await db.first<RoadmapRow>('SELECT * FROM "Roadmap" WHERE id = ?1', [id]);
  const days = await getDays(db, id);
  return json({ data: { ...(updated as RoadmapRow), days } });
}

export async function deleteRoadmap(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { id } = req.params;
  const db = new Database(req.env.DB);
  const roadmap = await db.first<RoadmapRow>(
    'SELECT * FROM "Roadmap" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );
  if (!roadmap) return json({ error: "Not found", code: "NOT_FOUND" }, 404);
  const days = await getDays(db, id);
  for (const day of days) {
    await deletePointEvents(db, req.user.id, { sourceId: day.id });
  }
  await deletePointEvents(db, req.user.id, { reason: "ROADMAP_COMPLETED", sourceId: id });
  await deletePointEvents(db, req.user.id, { reason: "ACHIEVEMENT", sourceId: `roadmap_${id}` });
  await db.run('DELETE FROM "Achievement" WHERE userId = ?1 AND key = ?2', [req.user.id, `roadmap_${id}`]);
  await db.run('DELETE FROM "Notification" WHERE userId = ?1 AND dedupeKey LIKE ?2', [
    req.user.id,
    `roadmap:${id}:%`,
  ]);
  await db.batch([
    { sql: 'DELETE FROM "RoadmapDay" WHERE "roadmapId" = ?1', params: [id] },
    { sql: 'DELETE FROM "Roadmap" WHERE id = ?1', params: [id] },
  ]);
  return json({ data: { deleted: true, title: roadmap.title } });
}

export async function completeRoadmapDay(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { id, dayId } = req.params as Record<string, string>;
  const body = (req.body ?? {}) as {
    completed?: boolean;
    whatILearned?: string;
    heading?: string;
    description?: string;
  };
  const db = new Database(req.env.DB);
  const roadmap = await db.first<RoadmapRow>(
    'SELECT * FROM "Roadmap" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );
  if (!roadmap) return json({ error: "Not found", code: "NOT_FOUND" }, 404);
  const day = await db.first<RoadmapDayRow>(
    'SELECT * FROM "RoadmapDay" WHERE id = ?1 AND roadmapId = ?2',
    [dayId, id],
  );
  if (!day) return json({ error: "Day not found", code: "NOT_FOUND" }, 404);

  const now = new Date();
  const nowIso = now.toISOString();
  const startKey = roadmapStartKey(roadmap);
  const dueAt = day.dueAt || dueForKey(startKey, day.dayNumber);
  const heading = String(body.heading ?? day.heading ?? day.learnTopic ?? "").trim();
  const description = String(body.description ?? day.description ?? day.buildTask ?? "").trim();
  const wasCompleted = day.completed === 1;
  const wantsComplete = body.completed === true;

  if (wantsComplete && !wasCompleted) {
    if (roadmap.mode === "MANUAL" && (!heading || !description)) {
      return json(
        {
          error: "Add this day's heading and one-line description before marking it done",
          code: "VALIDATION_ERROR",
        },
        400,
      );
    }
    await db.run(
      `UPDATE "RoadmapDay"
          SET completed = 1, completedAt = ?1, whatILearned = COALESCE(?2, whatILearned),
              heading = ?3, description = ?4, learnTopic = ?3, buildTask = ?4,
              status = 'DONE', dueAt = ?5, updatedAt = ?6
        WHERE id = ?7`,
      [nowIso, body.whatILearned || null, heading, description, dueAt, nowIso, dayId],
    );
    await deletePointEvents(db, req.user.id, { reason: "ROADMAP_DAY_MISSED", sourceId: dayId });
    await pointEvent(
      db,
      req.user.id,
      "EARN",
      POINTS_ROADMAP_DAY_COMPLETED,
      "ROADMAP_DAY_COMPLETED",
      dayId,
      dayKeyInPointsZone(now),
    );
  } else if (!wantsComplete && wasCompleted) {
    const missed = isMissed({ ...day, dueAt, completed: 0 }, now.getTime());
    await db.run(
      `UPDATE "RoadmapDay"
          SET completed = 0, completedAt = NULL, whatILearned = COALESCE(?1, whatILearned),
              heading = COALESCE(?2, heading), description = COALESCE(?3, description),
              status = ?4, dueAt = ?5, updatedAt = ?6
        WHERE id = ?7`,
      [body.whatILearned || null, body.heading || null, body.description || null, missed ? "MISSED" : "PENDING", dueAt, nowIso, dayId],
    );
    await deletePointEvents(db, req.user.id, {
      reason: "ROADMAP_DAY_COMPLETED",
      sourceId: dayId,
    });
    if (missed) {
      await pointEvent(
        db,
        req.user.id,
        "PENALTY",
        POINTS_ROADMAP_DAY_MISSED,
        "ROADMAP_DAY_MISSED",
        dayId,
        dayKeyInPointsZone(dueAt),
      );
    }
  } else {
    // Save details / notes without changing the completion state.
    await db.run(
      `UPDATE "RoadmapDay"
          SET whatILearned = COALESCE(?1, whatILearned),
              heading = COALESCE(?2, heading), description = COALESCE(?3, description),
              updatedAt = ?4
        WHERE id = ?5`,
      [body.whatILearned || null, body.heading || null, body.description || null, nowIso, dayId],
    );
  }

  const days = await syncRoadmap(db, roadmap, req.user.id);
  const updated = await maybeCompleteRoadmap(db, req.user.id, roadmap, days);
  const points = await refreshPoints(db, req.user.id, [dayKeyInPointsZone(now)]);
  return json({ data: { ...updated, days }, points });
}
