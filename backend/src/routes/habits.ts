import type { AppRequest } from "../types/index";
import { Database } from "../db/client";

interface Habit {
  id: string;
  userId: string;
  title: string;
  description?: string;
  frequency: string;
  targetDays: number;
  createdAt: string;
  updatedAt: string;
}

interface HabitCompletion {
  id: string;
  habitId: string;
  date: string;
  status: string;
  createdAt: string;
}

export async function listHabits(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = new Database(req.env?.DB!);
  const habits = await db.all<Habit>(
    'SELECT * FROM "Habit" WHERE userId = ?1 ORDER BY createdAt DESC',
    [req.user.id],
  );

  return new Response(JSON.stringify({ data: habits }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function getHabit(req: AppRequest): Promise<Response> {
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

  const db = new Database(req.env?.DB!);
  const habit = await db.first<Habit>(
    'SELECT * FROM "Habit" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!habit) {
    return new Response(
      JSON.stringify({
        error: "Habit not found",
        code: "NOT_FOUND",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ data: habit }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function createHabit(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { title, description, frequency, targetDays } = req.body as any;

  if (!title || !frequency) {
    return new Response(
      JSON.stringify({
        error: "Missing required fields: title, frequency",
        code: "VALIDATION_ERROR",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = new Database(req.env?.DB!);
  const habitId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO "Habit" (id, userId, title, description, frequency, targetDays, createdAt, updatedAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    [
      habitId,
      req.user.id,
      title,
      description,
      frequency,
      targetDays || 7,
      now,
      now,
    ],
  );

  const habit = await db.first<Habit>('SELECT * FROM "Habit" WHERE id = ?1', [
    habitId,
  ]);

  return new Response(JSON.stringify({ data: habit }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

export async function completeHabit(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params as any;
  const { date } = req.body as any;

  const db = new Database(req.env?.DB!);
  const habit = await db.first<Habit>(
    'SELECT * FROM "Habit" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!habit) {
    return new Response(
      JSON.stringify({
        error: "Habit not found",
        code: "NOT_FOUND",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const completionDate = date || new Date().toISOString().split("T")[0];
  const completionId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Check if already completed
  const existing = await db.first(
    'SELECT * FROM "HabitCompletion" WHERE habitId = ?1 AND date = ?2',
    [id, completionDate],
  );

  if (!existing) {
    await db.run(
      `INSERT INTO "HabitCompletion" (id, habitId, date, status, createdAt)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
      [completionId, id, completionDate, "completed", now],
    );
  }

  return new Response(
    JSON.stringify({ data: { message: "Habit completed" } }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export async function getHabitStreak(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params as any;

  const db = new Database(req.env?.DB!);
  const habit = await db.first<Habit>(
    'SELECT * FROM "Habit" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!habit) {
    return new Response(
      JSON.stringify({
        error: "Habit not found",
        code: "NOT_FOUND",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const completions = await db.all<HabitCompletion>(
    'SELECT * FROM "HabitCompletion" WHERE habitId = ?1 ORDER BY date DESC LIMIT 30',
    [id],
  );

  // Calculate current streak
  let currentStreak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = checkDate.toISOString().split("T")[0];

    const completed = completions.some((c) => c.date === dateStr);
    if (completed) {
      currentStreak++;
    } else if (i === 0 && !completed) {
      break;
    } else {
      break;
    }
  }

  return new Response(
    JSON.stringify({
      data: {
        habitId: id,
        currentStreak,
        totalCompletions: completions.length,
        recentCompletions: completions.slice(0, 7),
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export async function deleteHabit(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params as any;

  const db = new Database(req.env?.DB!);
  const habit = await db.first<Habit>(
    'SELECT * FROM "Habit" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!habit) {
    return new Response(
      JSON.stringify({
        error: "Habit not found",
        code: "NOT_FOUND",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  await db.run('DELETE FROM "HabitCompletion" WHERE habitId = ?1', [id]);
  await db.run('DELETE FROM "Habit" WHERE id = ?1', [id]);

  return new Response(JSON.stringify({ data: { message: "Habit deleted" } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function updateHabit(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params as any;
  const { title, description, frequency, targetDays } = req.body as any;

  const db = new Database(req.env?.DB!);
  const habit = await db.first<Habit>(
    'SELECT * FROM "Habit" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!habit) {
    return new Response(
      JSON.stringify({
        error: "Habit not found",
        code: "NOT_FOUND",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const updates = [];
  const values = [];
  let updateIdx = 1;

  if (title !== undefined) {
    updates.push(`title = ?${updateIdx}`);
    values.push(title);
    updateIdx++;
  }
  if (description !== undefined) {
    updates.push(`description = ?${updateIdx}`);
    values.push(description);
    updateIdx++;
  }
  if (frequency !== undefined) {
    updates.push(`frequency = ?${updateIdx}`);
    values.push(frequency);
    updateIdx++;
  }
  if (targetDays !== undefined) {
    updates.push(`targetDays = ?${updateIdx}`);
    values.push(targetDays);
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
    `UPDATE "Habit" SET ${updates.join(", ")} WHERE id = ?${updateIdx}`,
    values,
  );

  const updated = await db.first<Habit>('SELECT * FROM "Habit" WHERE id = ?1', [
    id,
  ]);

  return new Response(JSON.stringify({ data: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
