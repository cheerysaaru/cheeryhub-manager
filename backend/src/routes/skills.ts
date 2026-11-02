import type { AppRequest } from "../types/index";
import { Database } from "../db/client";

interface Skill {
  id: string;
  userId: string;
  name: string;
  currentLevel: number;
  targetLevel: number;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

interface SkillPayload {
  name?: string;
  currentLevel?: number;
  targetLevel?: number;
  progress?: number;
}

const SKILL_COLUMNS =
  'id, userId, name, currentLevel, targetLevel, progress, createdAt, updatedAt';

export async function listSkills(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = new Database(req.env.DB!);
  const skills = await db.all<Skill>(
    `SELECT ${SKILL_COLUMNS} FROM "Skill" WHERE userId = ?1 ORDER BY createdAt DESC`,
    [req.user.id],
  );

  return new Response(JSON.stringify({ data: skills }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function createSkill(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { name, currentLevel, targetLevel, progress } =
    req.body as SkillPayload;

  if (!name) {
    return new Response(
      JSON.stringify({
        error: "Missing required field: name",
        code: "VALIDATION_ERROR",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = new Database(req.env.DB!);
  const skillId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO "Skill" (id, userId, name, currentLevel, targetLevel, progress, createdAt, updatedAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    [
      skillId,
      req.user.id,
      name,
      currentLevel ?? 1,
      targetLevel ?? 5,
      progress ?? 0,
      now,
      now,
    ],
  );

  const skill = await db.first<Skill>(
    `SELECT ${SKILL_COLUMNS} FROM "Skill" WHERE id = ?1`,
    [skillId],
  );

  return new Response(JSON.stringify({ data: skill }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

export async function deleteSkill(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params;

  const db = new Database(req.env.DB!);
  const skill = await db.first<Skill>(
    `SELECT ${SKILL_COLUMNS} FROM "Skill" WHERE id = ?1 AND userId = ?2`,
    [id, req.user.id],
  );

  if (!skill) {
    return new Response(
      JSON.stringify({
        error: "Skill not found",
        code: "NOT_FOUND",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  await db.run('DELETE FROM "Skill" WHERE id = ?1', [id]);

  return new Response(JSON.stringify({ data: { message: "Skill deleted" } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function updateSkill(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params;
  const { name, currentLevel, targetLevel, progress } =
    req.body as SkillPayload;

  const db = new Database(req.env.DB!);
  const skill = await db.first<Skill>(
    `SELECT ${SKILL_COLUMNS} FROM "Skill" WHERE id = ?1 AND userId = ?2`,
    [id, req.user.id],
  );

  if (!skill) {
    return new Response(
      JSON.stringify({
        error: "Skill not found",
        code: "NOT_FOUND",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const updates = [];
  const values = [];
  let updateIdx = 1;

  if (name !== undefined) {
    updates.push(`name = ?${updateIdx}`);
    values.push(name);
    updateIdx++;
  }
  if (currentLevel !== undefined) {
    updates.push(`currentLevel = ?${updateIdx}`);
    values.push(currentLevel);
    updateIdx++;
  }
  if (targetLevel !== undefined) {
    updates.push(`targetLevel = ?${updateIdx}`);
    values.push(targetLevel);
    updateIdx++;
  }
  if (progress !== undefined) {
    updates.push(`progress = ?${updateIdx}`);
    values.push(progress);
    updateIdx++;
  }

  if (updates.length === 0) {
    return new Response(
      JSON.stringify({
        error: "No fields to update",
        code: "VALIDATION_ERROR",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const now = new Date().toISOString();
  updates.push(`updatedAt = ?${updateIdx}`);
  values.push(now);
  updateIdx++;

  values.push(id);
  await db.run(
    `UPDATE "Skill" SET ${updates.join(", ")} WHERE id = ?${updateIdx}`,
    values,
  );

  const updated = await db.first<Skill>(
    `SELECT ${SKILL_COLUMNS} FROM "Skill" WHERE id = ?1`,
    [id],
  );

  return new Response(JSON.stringify({ data: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
