import type { AppRequest } from "../types/index";
import { Database } from "../db/client";

interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category?: string;
  status: string;
  priority: string;
  scheduledDate?: string;
  scheduledTime?: string;
  deadlineTime?: string;
  recurrence: string;
  isMandatory: boolean;
  reminderEnabled: boolean;
  estimatedMinutes?: number;
  completedAt?: string;
  goalId?: string;
  skillId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

interface CreateTaskPayload {
  title: string;
  description?: string;
  priority?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  deadlineTime?: string;
  category?: string;
  goalId?: string;
  skillId?: string;
  estimatedMinutes?: number;
}

export async function listTasks(req: AppRequest): Promise<Response> {
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
  const tasks = await db.all<Task>(
    'SELECT * FROM "Task" WHERE userId = ?1 AND deletedAt IS NULL ORDER BY createdAt DESC',
    [req.user.id],
  );

  return new Response(JSON.stringify({ data: tasks }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function getTask(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params as Record<string, string>;

  const db = new Database(req.env.DB!);
  const task = await db.first<Task>(
    'SELECT * FROM "Task" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!task) {
    return new Response(
      JSON.stringify({
        error: "Task not found",
        code: "NOT_FOUND",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ data: task }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function listTrashTasks(req: AppRequest): Promise<Response> {
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
  const tasks = await db.all<Task>(
    'SELECT * FROM "Task" WHERE userId = ?1 AND deletedAt IS NOT NULL ORDER BY deletedAt DESC',
    [req.user.id],
  );

  return new Response(JSON.stringify({ data: tasks }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function createTask(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const {
    title,
    description,
    priority,
    scheduledDate,
    scheduledTime,
    deadlineTime,
    category,
    goalId,
    skillId,
    estimatedMinutes,
  } = req.body as CreateTaskPayload;

  if (!title) {
    return new Response(
      JSON.stringify({
        error: "Missing required field: title",
        code: "VALIDATION_ERROR",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = new Database(req.env.DB!);
  const taskId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO "Task" (id, userId, title, description, category, status, priority, scheduledDate, scheduledTime, deadlineTime, recurrence, isMandatory, reminderEnabled, estimatedMinutes, goalId, skillId, createdAt, updatedAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)`,
    [
      taskId,
      req.user.id,
      title,
      description || null,
      category || null,
      "TODO",
      priority?.toUpperCase() || "MEDIUM",
      scheduledDate || null,
      scheduledTime || null,
      deadlineTime || null,
      "NONE",
      false,
      false,
      estimatedMinutes || null,
      goalId || null,
      skillId || null,
      now,
      now,
    ],
  );

  const task = await db.first<Task>('SELECT * FROM "Task" WHERE id = ?1', [
    taskId,
  ]);

  return new Response(JSON.stringify({ data: task }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

export async function updateTask(req: AppRequest): Promise<Response> {
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
  const task = await db.first<Task>(
    'SELECT * FROM "Task" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!task) {
    return new Response(
      JSON.stringify({
        error: "Task not found",
        code: "NOT_FOUND",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const sets = Object.keys(updates)
    .map((k, i) => `"${k}" = ?${i + 1}`)
    .join(", ");

  if (sets) {
    const values = Object.values(updates);
    values.push(new Date().toISOString()); // updatedAt
    values.push(id);

    await db.run(
      `UPDATE "Task" SET ${sets}, "updatedAt" = ?${values.length - 1} WHERE id = ?${values.length}`,
      values,
    );
  }

  const updated = await db.first<Task>('SELECT * FROM "Task" WHERE id = ?1', [
    id,
  ]);

  return new Response(JSON.stringify({ data: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function deleteTask(req: AppRequest): Promise<Response> {
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
  const task = await db.first<Task>(
    'SELECT * FROM "Task" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!task) {
    return new Response(
      JSON.stringify({
        error: "Task not found",
        code: "NOT_FOUND",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // Soft delete
  await db.run(
    'UPDATE "Task" SET "deletedAt" = ?1, "updatedAt" = ?2 WHERE id = ?3',
    [new Date().toISOString(), new Date().toISOString(), id],
  );

  return new Response(JSON.stringify({ data: { message: "Task deleted" } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
