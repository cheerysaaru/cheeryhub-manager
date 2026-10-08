import type { AppRequest } from "../types/index";
import { Database } from "../db/client";

interface FocusSession {
  id: string;
  userId: string;
  taskId?: string;
  durationMinutes: number;
  startedAt: string;
  completedAt?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface FocusPayload {
  taskId?: string;
  durationMinutes: number;
  status?: string;
}

export async function listFocusSessions(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = new Database(req.env.DB);
  const sessions = await db.all<FocusSession>(
    'SELECT * FROM "FocusSession" WHERE userId = ?1 ORDER BY startedAt DESC',
    [req.user.id],
  );

  return new Response(JSON.stringify({ data: sessions }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function getFocusSession(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params;
  const db = new Database(req.env.DB);
  const session = await db.first<FocusSession>(
    'SELECT * FROM "FocusSession" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!session) {
    return new Response(
      JSON.stringify({ error: "Focus session not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ data: session }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function createFocusSession(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { taskId, durationMinutes, status } = req.body as FocusPayload;

  if (!durationMinutes) {
    return new Response(
      JSON.stringify({
        error: "Missing required field: durationMinutes",
        code: "VALIDATION_ERROR",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = new Database(req.env.DB);
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO "FocusSession" (id, userId, taskId, durationMinutes, startedAt, status, createdAt, updatedAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    [
      sessionId,
      req.user.id,
      taskId,
      durationMinutes,
      now,
      status || "RUNNING",
      now,
      now,
    ],
  );

  const session = await db.first<FocusSession>(
    'SELECT * FROM "FocusSession" WHERE id = ?1',
    [sessionId],
  );

  return new Response(JSON.stringify({ data: session }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

export async function updateFocusSession(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params;
  const { taskId, durationMinutes, status } = req.body as FocusPayload;

  const db = new Database(req.env.DB);
  const session = await db.first<FocusSession>(
    'SELECT * FROM "FocusSession" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!session) {
    return new Response(
      JSON.stringify({ error: "Focus session not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const updates = [];
  const values = [];
  let updateIdx = 1;

  if (taskId !== undefined) {
    updates.push(`taskId = ?${updateIdx}`);
    values.push(taskId);
    updateIdx++;
  }
  if (durationMinutes !== undefined) {
    updates.push(`durationMinutes = ?${updateIdx}`);
    values.push(durationMinutes);
    updateIdx++;
  }
  if (status !== undefined) {
    updates.push(`status = ?${updateIdx}`);
    values.push(status);
    updateIdx++;
    if (status === "COMPLETED" && !session.completedAt) {
      updates.push(`completedAt = ?${updateIdx}`);
      values.push(new Date().toISOString());
      updateIdx++;
    }
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
    `UPDATE "FocusSession" SET ${updates.join(", ")} WHERE id = ?${updateIdx}`,
    values,
  );

  const updated = await db.first<FocusSession>(
    'SELECT * FROM "FocusSession" WHERE id = ?1',
    [id],
  );

  return new Response(JSON.stringify({ data: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function completeFocusSession(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params;
  const db = new Database(req.env.DB);
  const session = await db.first<FocusSession>(
    'SELECT * FROM "FocusSession" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!session) {
    return new Response(
      JSON.stringify({ error: "Focus session not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const now = new Date().toISOString();
  await db.run(
    `UPDATE "FocusSession" SET status = "COMPLETED", completedAt = ?1, updatedAt = ?2 WHERE id = ?3`,
    [now, now, id],
  );

  const updated = await db.first<FocusSession>(
    'SELECT * FROM "FocusSession" WHERE id = ?1',
    [id],
  );

  return new Response(JSON.stringify({ data: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
