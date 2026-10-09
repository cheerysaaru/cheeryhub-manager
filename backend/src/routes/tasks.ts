import type { AppRequest } from "../types/index";
import { Database } from "../db/client";
import { resolveSessionUser } from "../middleware/session";
import { todayInCheckinZone } from "../../../shared/checkin";
import {
  evaluateDays,
  recordTaskCompleted,
  refreshPoints,
  removeTaskCompletedEvents,
  taskDueDay,
} from "../lib/points";

interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category?: string;
  status: string;
  priority: string;
  scheduledDate?: string;
  dueAt?: string;
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
  const session = await resolveSessionUser(req);
  if (!session.ok) return session.response;

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

  const db = new Database(req.env.DB);
  // Referenced goal/skill must belong to the same user (FK safety, clear 400).
  if (goalId) {
    const goal = await db.first<{ id: string }>(
      'SELECT id FROM "Goal" WHERE id = ?1 AND userId = ?2',
      [goalId, session.userId],
    );
    if (!goal) {
      return new Response(
        JSON.stringify({
          error: {
            code: "VALIDATION_ERROR",
            message: "That goal does not belong to you.",
          },
          code: "VALIDATION_ERROR",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }
  if (skillId) {
    const skill = await db.first<{ id: string }>(
      'SELECT id FROM "Skill" WHERE id = ?1 AND userId = ?2',
      [skillId, session.userId],
    );
    if (!skill) {
      return new Response(
        JSON.stringify({
          error: {
            code: "VALIDATION_ERROR",
            message: "That skill does not belong to you.",
          },
          code: "VALIDATION_ERROR",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }
  const taskId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO "Task" (id, userId, title, description, category, status, priority, scheduledDate, scheduledTime, deadlineTime, recurrence, isMandatory, reminderEnabled, estimatedMinutes, goalId, skillId, createdAt, updatedAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)`,
    [
      taskId,
      session.userId,
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

  const oldStatus = task.status;
  const oldDueDay = taskDueDay(task);

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

  // Points: a status change or a due-day change rewrites the ledger for the
  // affected day(s). Only completion status transitions matter here.
  const newStatus = updated?.status ?? oldStatus;
  const newDueDay = taskDueDay(updated ?? task);
  const statusChanged = newStatus !== oldStatus;
  const dueDayChanged = newDueDay !== oldDueDay;
  if (statusChanged || dueDayChanged) {
    if (newStatus === "COMPLETED") {
      const rawCompletedAt =
        (updates.completedAt as string | null | undefined) ??
        updated?.completedAt;
      await recordTaskCompleted(
        db,
        req.user.id,
        id,
        rawCompletedAt ? new Date(rawCompletedAt) : new Date(),
      );
    } else if (oldStatus === "COMPLETED") {
      await removeTaskCompletedEvents(db, req.user.id, id);
    }
    const points = await refreshPoints(db, req.user.id, [
      todayInCheckinZone(),
      oldDueDay,
      newDueDay,
    ]);
    return new Response(JSON.stringify({ data: updated, points }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

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

  const db = new Database(req.env.DB);
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

export async function completeTask(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params;
  const db = new Database(req.env.DB);

  const task = await db.first<Task>(
    'SELECT * FROM "Task" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!task) {
    return new Response(
      JSON.stringify({ error: "Task not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const now = new Date().toISOString();
  await db.run(
    `UPDATE "Task" SET status = 'COMPLETED', completedAt = ?1, updatedAt = ?2 WHERE id = ?3`,
    [now, now, id],
  );

  // Points: +10 on the completion day first, then recalculate both the
  // completion day and the due day (a completed task is never penalised).
  await recordTaskCompleted(db, req.user.id, id, new Date(now));
  const points = await refreshPoints(db, req.user.id, [
    todayInCheckinZone(),
    taskDueDay(task),
  ]);

  const updated = await db.first<Task>('SELECT * FROM "Task" WHERE id = ?1', [
    id,
  ]);
  return new Response(JSON.stringify({ data: updated, points }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function checkInTask(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params;
  const db = new Database(req.env.DB);

  const task = await db.first<Task>(
    'SELECT * FROM "Task" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!task) {
    return new Response(
      JSON.stringify({ error: "Task not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const now = new Date().toISOString();
  const wasCompleted = task.status === "COMPLETED";
  await db.run(
    `UPDATE "Task" SET status = 'IN_PROGRESS', updatedAt = ?1 WHERE id = ?2`,
    [now, id],
  );

  const updated = await db.first<Task>('SELECT * FROM "Task" WHERE id = ?1', [
    id,
  ]);
  if (wasCompleted) {
    // Re-opened: its +10 is withdrawn and its due day recalculated.
    await removeTaskCompletedEvents(db, req.user.id, id);
    const points = await refreshPoints(db, req.user.id, [
      todayInCheckinZone(),
      taskDueDay(task),
    ]);
    return new Response(JSON.stringify({ data: updated, points }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ data: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function extendTask(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params;
  const { extendedAt, dueAt } = req.body as {
    extendedAt?: string;
    dueAt?: string;
  };

  const db = new Database(req.env.DB);
  const task = await db.first<Task>(
    'SELECT * FROM "Task" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!task) {
    return new Response(
      JSON.stringify({ error: "Task not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const oldDueDay = taskDueDay(task);
  const newExtendedAt = extendedAt || dueAt || new Date().toISOString();
  await db.run(
    'UPDATE "Task" SET extendedAt = ?1, dueAt = ?2, updatedAt = ?3 WHERE id = ?4',
    [newExtendedAt, newExtendedAt, new Date().toISOString(), id],
  );
  // The deadline moved: recalculate both the old and the new due day
  // (only editable days are ever touched — see evaluateDay).
  await evaluateDays(db, req.user.id, [
    oldDueDay,
    taskDueDay({ dueAt: newExtendedAt }),
  ]);

  const updated = await db.first<Task>('SELECT * FROM "Task" WHERE id = ?1', [
    id,
  ]);
  return new Response(JSON.stringify({ data: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function startTaskTimer(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params;
  const db = new Database(req.env.DB);

  const task = await db.first<Task>(
    'SELECT * FROM "Task" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!task) {
    return new Response(
      JSON.stringify({ error: "Task not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const now = new Date().toISOString();
  const wasCompleted = task.status === "COMPLETED";
  await db.run(
    `UPDATE "Task" SET timerStartedAt = ?1, status = 'IN_PROGRESS', updatedAt = ?2 WHERE id = ?3`,
    [now, now, id],
  );

  const updated = await db.first<Task>('SELECT * FROM "Task" WHERE id = ?1', [
    id,
  ]);
  if (wasCompleted) {
    // Starting a timer re-opens a completed task: withdraw its +10.
    await removeTaskCompletedEvents(db, req.user.id, id);
    const points = await refreshPoints(db, req.user.id, [
      todayInCheckinZone(),
      taskDueDay(task),
    ]);
    return new Response(JSON.stringify({ data: updated, points }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ data: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function restoreTask(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params;
  const db = new Database(req.env.DB);

  const task = await db.first<Task>(
    'SELECT * FROM "Task" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!task) {
    return new Response(
      JSON.stringify({ error: "Task not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const now = new Date().toISOString();
  await db.run(
    'UPDATE "Task" SET deletedAt = NULL, updatedAt = ?1 WHERE id = ?2',
    [now, id],
  );

  const updated = await db.first<Task>('SELECT * FROM "Task" WHERE id = ?1', [
    id,
  ]);
  return new Response(JSON.stringify({ data: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function permanentDeleteTask(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params;
  const db = new Database(req.env.DB);

  const task = await db.first<Task>(
    'SELECT * FROM "Task" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!task) {
    return new Response(
      JSON.stringify({ error: "Task not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  await db.run('DELETE FROM "Task" WHERE id = ?1', [id]);

  return new Response(
    JSON.stringify({ data: { message: "Task permanently deleted" } }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function taskUnauthorized(): Response {
  return new Response(
    JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}

/** Marks a task as "not completed": it leaves the active list and lands in trash. */
export async function markNotCompletedTask(req: AppRequest): Promise<Response> {
  if (!req.user) return taskUnauthorized();
  const { id } = req.params;
  const db = new Database(req.env.DB);
  const task = await db.first<Task>(
    'SELECT * FROM "Task" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );
  if (!task) {
    return new Response(
      JSON.stringify({ error: "Task not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  const now = new Date().toISOString();
  await db.run(
    `UPDATE "Task" SET status = 'NOT_COMPLETED', completedAt = NULL, deletedAt = ?1, updatedAt = ?2 WHERE id = ?3`,
    [now, now, id],
  );
  // Points: the +10 is withdrawn; the due day is recalculated (a
  // NOT_COMPLETED task counts as a miss once the day has ended).
  await removeTaskCompletedEvents(db, req.user.id, id);
  const points = await refreshPoints(db, req.user.id, [
    todayInCheckinZone(),
    taskDueDay(task),
  ]);
  const updated = await db.first<Task>('SELECT * FROM "Task" WHERE id = ?1', [
    id,
  ]);
  return new Response(JSON.stringify({ data: updated, points }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function stopTaskTimer(req: AppRequest): Promise<Response> {
  if (!req.user) return taskUnauthorized();
  const { id } = req.params;
  const db = new Database(req.env.DB);
  const task = await db.first<Task>(
    'SELECT * FROM "Task" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );
  if (!task) {
    return new Response(
      JSON.stringify({ error: "Task not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  const now = new Date().toISOString();
  await db.run(
    'UPDATE "Task" SET timerStartedAt = NULL, updatedAt = ?1 WHERE id = ?2',
    [now, id],
  );
  const updated = await db.first<Task>('SELECT * FROM "Task" WHERE id = ?1', [
    id,
  ]);
  return new Response(JSON.stringify({ data: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
