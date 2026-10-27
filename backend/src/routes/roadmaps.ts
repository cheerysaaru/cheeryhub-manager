import type { AppRequest } from "../types/index";
import { Database } from "../db/client";
import { resolveSessionUser } from "../middleware/session";
import { dayKeyInPointsZone } from "../../../shared/points";
import { recordAchievement } from "../lib/points";

const POINTS_ROADMAP_DAY_COMPLETED = 10;
const POINTS_ROADMAP_COMPLETED_BONUS = 50;
const POINTS_SKILL_LEVEL_UP = 50;

async function pointsInsert(
  db: Database,
  userId: string,
  type: string,
  amount: number,
  reason: string,
  sourceId: string,
  dayKey: string
) {
  return db.run(
    `INSERT OR IGNORE INTO "PointEvent" (id, userId, type, amount, reason, sourceId, dayKey, createdAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    [crypto.randomUUID(), userId, type, amount, reason, sourceId, dayKey, new Date().toISOString()]
  );
}

function generateDayContent(totalDays: number, title: string, dayIndex: number): { learnTopic: string; buildTask: string } {
  const progress = (dayIndex + 1) / totalDays;
  const topicLower = title.toLowerCase();

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

interface RoadmapRow {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  totalDays: number;
  skillId: string | null;
  goalId: string | null;
  completed: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  days?: RoadmapDayRow[];
}

interface RoadmapDayRow {
  id: string;
  roadmapId: string;
  dayNumber: number;
  learnTopic: string;
  buildTask: string;
  whatILearned: string | null;
  completed: number;
  completedAt: string | null;
  updatedAt: string;
}

export async function listRoadmaps(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const db = new Database(req.env.DB!);
  const roadmaps = await db.all<RoadmapRow>(
    `SELECT r.*, (SELECT COUNT(*) FROM "RoadmapDay" rd WHERE rd.roadmapId = r.id AND rd.completed = 1) as completedDays FROM "Roadmap" r WHERE r.userId = ?1 ORDER BY r.createdAt DESC`,
    [req.user.id]
  );
  for (const r of roadmaps) {
    r.days = await db.all<RoadmapDayRow>('SELECT * FROM "RoadmapDay" WHERE roadmapId = ?1 ORDER BY dayNumber ASC', [r.id]);
  }
  return new Response(JSON.stringify({ data: roadmaps }), { status: 200, headers: { "Content-Type": "application/json" } });
}

export async function getRoadmap(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const { id } = req.params;
  const db = new Database(req.env.DB!);
  const roadmap = await db.first<RoadmapRow>('SELECT * FROM "Roadmap" WHERE id = ?1 AND userId = ?2', [id, req.user.id]);
  if (!roadmap) {
    return new Response(JSON.stringify({ error: "Not found", code: "NOT_FOUND" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }
  const days = await db.all<RoadmapDayRow>('SELECT * FROM "RoadmapDay" WHERE roadmapId = ?1 ORDER BY dayNumber ASC', [id]);
  return new Response(JSON.stringify({ data: { ...roadmap, days } }), { status: 200, headers: { "Content-Type": "application/json" } });
}

export async function createRoadmap(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const session = await resolveSessionUser(req);
  if (!session.ok) return session.response;
  const body = req.body as any;
  const title = body?.title?.trim();
  const totalDays = Number(body?.totalDays);
  const skillId = body?.skillId || null;
  const goalId = body?.goalId || null;
  const daysInput = body?.days;
  if (!title || title.length < 2 || title.length > 80) {
    return new Response(JSON.stringify({ error: "Title must be 2-80 characters", code: "VALIDATION_ERROR" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  if (!Number.isInteger(totalDays) || totalDays < 1 || totalDays > 90) {
    return new Response(JSON.stringify({ error: "Days must be an integer between 1 and 90", code: "VALIDATION_ERROR" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  const db = new Database(req.env.DB!);
  const roadmapId = crypto.randomUUID();
  const now = new Date().toISOString();
  const batch: Array<{ sql: string; params: unknown[] }> = [];
  batch.push({
    sql: `INSERT INTO "Roadmap" (id, userId, title, totalDays, skillId, goalId, completed, createdAt, updatedAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8)`,
    params: [roadmapId, session.userId, title, totalDays, skillId, goalId, now, now],
  });
  if (Array.isArray(daysInput) && daysInput.length > 0) {
    for (let i = 0; i < daysInput.length; i++) {
      const d = daysInput[i];
      batch.push({
        sql: `INSERT INTO "RoadmapDay" (id, roadmapId, dayNumber, learnTopic, buildTask, whatILearned, completed, createdAt, updatedAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8)`,
        params: [crypto.randomUUID(), roadmapId, i + 1, d.learnTopic, d.buildTask, null, now, now],
      });
    }
  } else {
    for (let i = 1; i <= totalDays; i++) {
      const content = generateDayContent(totalDays, title, i - 1);
      batch.push({
        sql: `INSERT INTO "RoadmapDay" (id, roadmapId, dayNumber, learnTopic, buildTask, whatILearned, completed, createdAt, updatedAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8)`,
        params: [crypto.randomUUID(), roadmapId, i, content.learnTopic, content.buildTask, null, now, now],
      });
    }
  }
  await db.batch(batch);
  const roadmap = await db.first<RoadmapRow>('SELECT * FROM "Roadmap" WHERE id = ?1', [roadmapId]);
  const roadmapDays = await db.all<RoadmapDayRow>('SELECT * FROM "RoadmapDay" WHERE roadmapId = ?1 ORDER BY dayNumber ASC', [roadmapId]);
  return new Response(JSON.stringify({ data: { ...(roadmap as any), days: roadmapDays } }), { status: 201, headers: { "Content-Type": "application/json" } });
}

export async function updateRoadmap(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const { id } = req.params;
  const body = req.body as any;
  const title = body?.title?.trim();
  const skillId = body?.skillId ?? null;
  const goalId = body?.goalId ?? null;
  const db = new Database(req.env.DB!);
  const roadmap = await db.first<RoadmapRow>('SELECT * FROM "Roadmap" WHERE id = ?1 AND userId = ?2', [id, req.user.id]);
  if (!roadmap) {
    return new Response(JSON.stringify({ error: "Not found", code: "NOT_FOUND" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }
  if (title !== undefined && (title.length < 2 || title.length > 80)) {
    return new Response(JSON.stringify({ error: "Title must be 2-80 characters", code: "VALIDATION_ERROR" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  const now = new Date().toISOString();
  const updates: string[] = [];
  const params: unknown[] = [];
  if (title !== undefined) { updates.push("title = ?"); params.push(title); }
  if (skillId !== undefined) { updates.push("skillId = ?"); params.push(skillId); }
  if (goalId !== undefined) { updates.push("goalId = ?"); params.push(goalId); }
  if (updates.length > 0) {
    updates.push("updatedAt = ?");
    params.push(now);
    params.push(id);
    await db.run(`UPDATE "Roadmap" SET ${updates.join(", ")} WHERE id = ?${params.length}`, params);
  }
  const updated = await db.first<RoadmapRow>('SELECT * FROM "Roadmap" WHERE id = ?1', [id]);
  const days = await db.all<RoadmapDayRow>('SELECT * FROM "RoadmapDay" WHERE roadmapId = ?1 ORDER BY dayNumber ASC', [id]);
  return new Response(JSON.stringify({ data: { ...(updated as any), days } }), { status: 200, headers: { "Content-Type": "application/json" } });
}

export async function deleteRoadmap(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const { id } = req.params;
  const db = new Database(req.env.DB!);
  const roadmap = await db.first<{ id: string; userId: string; title: string }>('SELECT id, userId, title FROM "Roadmap" WHERE id = ?1', [id]);
  if (!roadmap) {
    return new Response(JSON.stringify({ error: "Not found", code: "NOT_FOUND" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }
  if (roadmap.userId !== req.user.id) {
    return new Response(JSON.stringify({ error: "Not found", code: "NOT_FOUND" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }
  await db.batch([
    { sql: `DELETE FROM "RoadmapDay" WHERE "roadmapId" = ?1`, params: [id] },
    { sql: `DELETE FROM "Roadmap" WHERE id = ?1`, params: [id] },
  ]);
  return new Response(JSON.stringify({ data: { deleted: true, title: roadmap.title } }), { status: 200, headers: { "Content-Type": "application/json" } });
}

export async function completeRoadmapDay(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const { id, dayId } = req.params as any;
  const { completed, whatILearned } = req.body as { completed?: boolean; whatILearned?: string };
  const db = new Database(req.env.DB!);
  const roadmap = await db.first<RoadmapRow>('SELECT * FROM "Roadmap" WHERE id = ?1 AND userId = ?2', [id, req.user.id]);
  if (!roadmap) {
    return new Response(JSON.stringify({ error: "Not found", code: "NOT_FOUND" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }
  const day = await db.first<RoadmapDayRow>('SELECT * FROM "RoadmapDay" WHERE id = ?1 AND roadmapId = ?2', [dayId, id]);
  if (!day) {
    return new Response(JSON.stringify({ error: "Day not found", code: "NOT_FOUND" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }
  const now = new Date().toISOString();
  const dayKey = dayKeyInPointsZone(now);
  const wasCompleted = day.completed === 1;
  const isNowCompleted = completed === true;
  if (isNowCompleted && !wasCompleted) {
    await db.run('UPDATE "RoadmapDay" SET completed = 1, completedAt = ?1, whatILearned = COALESCE(?2, whatILearned), updatedAt = ?3 WHERE id = ?4', [now, whatILearned || null, now, dayId]);
    await pointsInsert(db, req.user.id, "EARN", POINTS_ROADMAP_DAY_COMPLETED, "ROADMAP_DAY_COMPLETED", dayId, dayKey);
  } else if (!isNowCompleted && wasCompleted) {
    await db.run('UPDATE "RoadmapDay" SET completed = 0, completedAt = NULL, whatILearned = COALESCE(?1, whatILearned), updatedAt = ?2 WHERE id = ?3', [whatILearned || null, now, dayId]);
    await pointsInsert(db, req.user.id, "PENALTY", -POINTS_ROADMAP_DAY_COMPLETED, "ROADMAP_DAY_UNCOMPLETED", dayId, dayKey);
  } else if (isNowCompleted && wasCompleted) {
    await db.run('UPDATE "RoadmapDay" SET whatILearned = COALESCE(?1, whatILearned), updatedAt = ?2 WHERE id = ?3', [whatILearned || null, now, dayId]);
  }
  const total = await db.first<{ c: number }>('SELECT COUNT(*) as c FROM "RoadmapDay" WHERE roadmapId = ?1', [id]);
  const done = await db.first<{ c: number }>('SELECT COUNT(*) as c FROM "RoadmapDay" WHERE roadmapId = ?1 AND completed = 1', [id]);
  const totalCount = (total as any)?.c ?? 0;
  const doneCount = (done as any)?.c ?? 0;
  if (totalCount > 0 && doneCount >= totalCount && !roadmap.completed) {
    await db.run('UPDATE "Roadmap" SET completed = 1, completedAt = ?1, updatedAt = ?2 WHERE id = ?3', [now, now, id]);
    await pointsInsert(db, req.user.id, "EARN", POINTS_ROADMAP_COMPLETED_BONUS, "ROADMAP_COMPLETED", id, dayKey);
    if ((roadmap as any).skillId) {
      const skill = await db.first<any>('SELECT * FROM "Skill" WHERE id = ?1 AND userId = ?2', [(roadmap as any).skillId, req.user.id]);
      if (skill) {
        const newLevel = (skill.currentLevel || skill.level || 1) + 1;
        await db.run('UPDATE "Skill" SET currentLevel = ?1, level = ?1, progress = 0, updatedAt = ?2 WHERE id = ?3', [newLevel, now, skill.id]);
        await pointsInsert(db, req.user.id, "EARN", POINTS_SKILL_LEVEL_UP, "SKILL_LEVEL_UP", skill.id, dayKey);
      }
    }
    await recordAchievement(db, req.user.id, `roadmap_${id}`, POINTS_ROADMAP_COMPLETED_BONUS, dayKey);
  } else if (roadmap.completed && doneCount < totalCount) {
    await db.run('UPDATE "Roadmap" SET completed = 0, completedAt = NULL, updatedAt = ?1 WHERE id = ?2', [now, id]);
  }
  const updated = await db.first<RoadmapRow>('SELECT * FROM "Roadmap" WHERE id = ?1', [id]);
  const updatedDays = await db.all<RoadmapDayRow>('SELECT * FROM "RoadmapDay" WHERE roadmapId = ?1 ORDER BY dayNumber ASC', [id]);
  return new Response(JSON.stringify({ data: { ...(updated as any), days: updatedDays } }), { status: 200, headers: { "Content-Type": "application/json" } });
}