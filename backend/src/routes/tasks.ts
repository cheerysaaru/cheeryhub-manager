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

interface TaskCheckinStats {
  checkedToday: boolean;
  checkedDays: number;
  missedDays: number;
}

/**
 * Per-task daily-tick stats, batched for a set of tasks: whether today
 * (Asia/Colombo) carries a TaskCheckIn row, how many days were ever checked,
 * and how many TASK_MISSED penalties the ledger holds for the task.
 */
async function taskCheckinStats(
  db: Database,
  userId: string,
  taskIds: string[],
): Promise<Map<string, TaskCheckinStats>> {
  const stats = new Map<string, TaskCheckinStats>();
  for (const id of taskIds) {
    stats.set(id, { checkedToday: false, checkedDays: 0, missedDays: 0 });
  }
  if (taskIds.length === 0) return stats;

  const today = todayInCheckinZone();
  // ?1 = userId; ?2 = date here, so the IN list starts at ?3.
  const inFrom3 = taskIds.map((_, i) => `?${i + 3}`).join(", ");
  // Queries without the date param start their IN list at ?2.
  const inFrom2 = taskIds.map((_, i) => `?${i + 2}`).join(", ");

  const todays = await db.all<{ taskId: string }>(
    `SELECT taskId FROM "TaskCheckIn"
      WHERE userId = ?1 AND date = ?2 AND taskId IN (${inFrom3})`,
    [userId, today, ...taskIds],
  );
  for (const row of todays) {
    const entry = stats.get(row.taskId);
    if (entry) entry.checkedToday = true;
  }

  const counts = await db.all<{ taskId: string; count: number }>(
    `SELECT taskId, COUNT(*) as count FROM "TaskCheckIn"
      WHERE userId = ?1 AND taskId IN (${inFrom2})
      GROUP BY taskId`,
    [userId, ...taskIds],
  );
  for (const row of counts) {
    const entry = stats.get(row.taskId);
    if (entry) entry.checkedDays = Number(row.count) || 0;
  }

  const missed = await db.all<{ sourceId: string; count: number }>(
    `SELECT sourceId, COUNT(*) as count FROM "PointEvent"
      WHERE userId = ?1 AND reason = ?2 AND sourceId IN (${inFrom3})
      GROUP BY sourceId`,
    [userId, "TASK_MISSED", ...taskIds],
  );
  for (const row of missed) {
    const entry = stats.get(row.sourceId);
    if (entry) entry.missedDays = Number(row.count) || 0;
  }
  return stats;
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
  const stats = await taskCheckinStats(
    db,
    req.user.id,
    tasks.map((task) => task.id),
  );

  return new Response(
    JSON.stringify({
      data: tasks.map((task) => ({ ...task, ...stats.get(task.id) })),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
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

  const stats = await taskCheckinStats(db, req.user.id, [task.id]);
  return new Response(
    JSON.stringify({ data: { ...task, ...stats.get(task.id) } }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
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
  // The frontend sends a picked deadline as `dueAt`; older clients use `deadlineTime`.
  const { dueAt: pickedDueAt } = req.body as { dueAt?: string };

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
  // Default deadline: exactly 24h from creation (add Mon 12:00 → due Tue 12:00).
  const dueAt =
    pickedDueAt ||
    deadlineTime ||
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await db.run(
    `INSERT INTO "Task" (id, userId, title, description, category, status, priority, scheduledDate, scheduledTime, deadlineTime, dueAt, recurrence, isMandatory, reminderEnabled, estimatedMinutes, goalId, skillId, createdAt, updatedAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`,
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
      dueAt,
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
  // Completing also ticks today, so the circle stays filled after a refresh.
  const today = todayInCheckinZone();
  const checkedToday = await db.first<{ id: string }>(
    'SELECT id FROM "TaskCheckIn" WHERE taskId = ?1 AND date = ?2',
    [id, today],
  );
  if (!checkedToday) {
    await db.run(
      `INSERT INTO "TaskCheckIn" (id, taskId, userId, date, checked, checkedAt, createdAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      [crypto.randomUUID(), id, req.user.id, today, 1, now, now],
    );
  }

  // Points: +10 on the completion day first, then recalculate both the
  // completion day and the due day (a completed task is never penalised).
  await recordTaskCompleted(db, req.user.id, id, new Date(now));
  const points = await refreshPoints(db, req.user.id, [
    today,
    taskDueDay(task),
  ]);

  // --- NEW: Update linked goal progress & skill level ---
  if (task.goalId) {
    // Recalculate goal progress from milestones
    const milestones = await db.all<{
      id: string;
      completed: boolean;
    }>(
      `SELECT id, completed FROM "GoalMilestone" WHERE goalId = ?1`,
      [task.goalId],
    );
    const completedCount = milestones.filter((m) => m.completed).length;
    const total = milestones.length;
    const newProgress =
      total > 0 ? Math.round((completedCount / total) * 100) : 0;

    await db.run(
      `UPDATE "Goal" SET progress = ?1, updatedAt = ?2 WHERE id = ?3`,
      [newProgress, now, task.goalId],
    );

    // If goal just reached 100%, auto-complete & award achievements/skills
    if (newProgress === 100) {
      // Fetch goal details
      const goal = await db.first<{
        id: string;
        title: string;
        description: string | null;
        deadline: string | null;
        status: string;
      }>(
        `SELECT id, title, description, deadline, status FROM "Goal" WHERE id = ?1`,
        [task.goalId],
      );

      // Award goal completion points (on-time if deadline not passed)
      const onTime =
        !goal?.deadline ||
        goal.deadline.slice(0, 10) >= now.slice(0, 10);
      if (onTime) {
        await recordTaskCompleted(db, req.user.id, id, new Date(now)); // reuse
      }

      // --- Skill leveling: if goal has a skillId, level up that skill ---
      if (task.skillId) {
        const skill = await db.first<{
          id: string;
          name: string;
          currentLevel: number;
          targetLevel: number;
          progress: number;
        }>(
          `SELECT id, name, currentLevel, targetLevel, progress FROM "Skill" WHERE id = ?1 AND userId = ?2`,
          [task.skillId, req.user.id],
        );
        if (skill) {
          const newLevel = skill.currentLevel + 1;
          const newProgress = skill.progress; // reset carries over conceptually
          await db.run(
            `UPDATE "Skill" SET currentLevel = ?1, progress = ?2, updatedAt = ?3 WHERE id = ?4`,
            [newLevel, 0, now, task.skillId],
          );
          // Award XP for leveling up
          await db.run(
            `INSERT INTO "PointEvent" (id, userId, type, amount, reason, sourceId, dayKey, createdAt)
             VALUES (?1, ?2, 'skill_level_up', ?3, ?4, ?5, ?6, ?7)`,
            [crypto.randomUUID(), req.user.id, 50, "Skill level up", task.skillId, now.slice(0, 10), now],
          );
        }
      }

      // --- Achievement: Goal completed ---
      const achievementKey = `goals_1`; // could be dynamic based on goal count
      await db.run(
        `INSERT INTO "Achievement" (id, userId, key, name, description, icon, unlockedAt, createdAt)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
        [crypto.randomUUID(), req.user.id, achievementKey, "Goal Completed",
          `Completed goal: ${goal?.title || ""}`, "/icons/star.svg", now, now],
      ).catch(() => {
        // Idempotent: may already exist; ignore unique-constraint error.
      });
    }
  }

  const updated = await db.first<Task>('SELECT * FROM "Task" WHERE id = ?1', [
    id,
  ]);
  const stats = await taskCheckinStats(db, req.user.id, [id]);
  return new Response(
    JSON.stringify({ data: { ...(updated ?? task), ...stats.get(id) }, points }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export async function checkInTask(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params;
  const { checked = true } = (req.body ?? {}) as { checked?: boolean };
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
  const date = todayInCheckinZone();
  const existing = await db.first<{ id: string }>(
    'SELECT id FROM "TaskCheckIn" WHERE taskId = ?1 AND date = ?2',
    [id, date],
  );

  if (checked && !existing) {
    // Exactly one check-in per task per day (unique on taskId+date).
    await db.run(
      `INSERT INTO "TaskCheckIn" (id, taskId, userId, date, checked, checkedAt, createdAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      [crypto.randomUUID(), id, req.user.id, date, 1, now, now],
    );
    if (task.status === "TODO") {
      await db.run(
        `UPDATE "Task" SET status = 'IN_PROGRESS', updatedAt = ?1 WHERE id = ?2`,
        [now, id],
      );
    }
  } else if (!checked && existing) {
    await db.run(
      'DELETE FROM "TaskCheckIn" WHERE taskId = ?1 AND date = ?2',
      [id, date],
    );
  }

  const updated = await db.first<Task>(
    'SELECT * FROM "Task" WHERE id = ?1',
    [id],
  );
  const stats = await taskCheckinStats(db, req.user.id, [id]);
  return new Response(
    JSON.stringify({ data: { ...(updated ?? task), ...stats.get(id) } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
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
