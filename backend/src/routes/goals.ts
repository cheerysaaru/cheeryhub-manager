import type { AppRequest } from "../types/index";
import { Database } from "../db/client";
import { resolveSessionUser } from "../middleware/session";
import { evaluateGoals } from "../lib/points";

interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  targetDate?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateGoalPayload {
  title: string;
  description?: string;
  targetDate?: string;
  deadline?: string;
}

export async function listGoals(req: AppRequest): Promise<Response> {
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
  const goals = await db.all<Goal>(
    'SELECT id, userId, title, description, deadline as targetDate, progress, status, createdAt, updatedAt FROM "Goal" WHERE userId = ?1 ORDER BY createdAt DESC',
    [req.user.id],
  );

  return new Response(JSON.stringify({ data: goals }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function createGoal(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { title, description, targetDate, deadline } =
    req.body as CreateGoalPayload;

  if (!title) {
    return new Response(
      JSON.stringify({
        error: "Missing required field: title",
        code: "VALIDATION_ERROR",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const due = targetDate ?? deadline ?? null;
  const session = await resolveSessionUser(req);
  if (!session.ok) return session.response;
  const db = new Database(req.env.DB);
  const goalId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO "Goal" (id, userId, title, description, targetDate, deadline, status, createdAt, updatedAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    [
      goalId,
      session.userId,
      title,
      description ?? null,
      due,
      due,
      "active",
      now,
      now,
    ],
  );

  const goal = await db.first<Goal>(
    'SELECT id, userId, title, description, deadline as targetDate, progress, status, createdAt, updatedAt FROM "Goal" WHERE id = ?1',
    [goalId],
  );

  // Award/withdraw goal points (completion, on-time, or past-deadline miss).
  await evaluateGoals(db, session.userId);

  return new Response(JSON.stringify({ data: goal }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

export async function updateGoal(req: AppRequest): Promise<Response> {
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
  const updates = req.body as Record<string, unknown>;

  const db = new Database(req.env.DB!);
  const goal = await db.first<Goal>(
    'SELECT id, userId, title, description, deadline as targetDate, progress, status, createdAt, updatedAt FROM "Goal" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!goal) {
    return new Response(
      JSON.stringify({
        error: "Goal not found",
        code: "NOT_FOUND",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const updatable = Object.entries(updates).filter(
    ([, value]) => value !== undefined,
  );

  if (updatable.length > 0) {
    const values: unknown[] = [];
    let idx = 1;
    const sqlSets = updatable
      .map(([key, value]) => {
        if (key === "deadline" || key === "targetDate") {
          values.push(value ?? null, value ?? null);
          return `"targetDate" = ?${idx++}, "deadline" = ?${idx++}`;
        }
        values.push(value ?? null);
        return `"${key}" = ?${idx++}`;
      })
      .join(", ");
    values.push(new Date().toISOString()); // updatedAt
    values.push(id);
    await db.run(
      `UPDATE "Goal" SET ${sqlSets}, "updatedAt" = ?${idx} WHERE id = ?${idx + 1}`,
      values,
    );
  }

  const updated = await db.first<Goal>(
    'SELECT id, userId, title, description, deadline as targetDate, progress, status, createdAt, updatedAt FROM "Goal" WHERE id = ?1',
    [id],
  );

  // Re-evaluate this user's goals against the ledger after the change.
  await evaluateGoals(db, req.user.id);

  return new Response(JSON.stringify({ data: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function deleteGoal(req: AppRequest): Promise<Response> {
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
  const goal = await db.first<Goal>(
    'SELECT id, userId, title, description, deadline as targetDate, progress, status, createdAt, updatedAt FROM "Goal" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!goal) {
    return new Response(
      JSON.stringify({
        error: "Goal not found",
        code: "NOT_FOUND",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  await db.run('DELETE FROM "Goal" WHERE id = ?1', [id]);

  return new Response(JSON.stringify({ data: { message: "Goal deleted" } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
