import type { AppRequest } from "../types/index";
import { Database } from "../db/client";

// The Habit contract is defined by the Prisma model + the frontend `Habit`
// type: the canonical field is `name`. The `title` column (added in migration
// 0006) is kept mirrored for any consumer that still reads it, but the API
// speaks `name` so the shared field name always matches on both sides.
interface Habit {
  id: string;
  userId: string;
  name: string;
  description?: string;
  frequency: string;
  targetDays: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface HabitCompletion {
  id: string;
  habitId: string;
  date: string;
  status: string;
  completedAt: string;
}

interface HabitPayload {
  name?: string;
  title?: string; // tolerated alias for `name`
  description?: string;
  frequency?: string;
  targetDays?: number;
}

interface CompleteHabitPayload {
  date?: string;
}

const HABIT_COLUMNS =
  "id, userId, name, description, frequency, targetDays, active, createdAt, updatedAt";

function unauthorized(): Response {
  return new Response(
    JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}

export async function listHabits(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const db = new Database(req.env.DB);
  const habits = await db.all<Habit>(
    `SELECT ${HABIT_COLUMNS} FROM "Habit" WHERE userId = ?1 AND deletedAt IS NULL ORDER BY createdAt DESC`,
    [req.user.id],
  );
  return new Response(JSON.stringify({ data: habits }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function getHabit(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { id } = req.params as Record<string, string>;
  const db = new Database(req.env.DB);
  const habit = await db.first<Habit>(
    `SELECT ${HABIT_COLUMNS} FROM "Habit" WHERE id = ?1 AND userId = ?2`,
    [id, req.user.id],
  );
  if (!habit) {
    return new Response(
      JSON.stringify({ error: "Habit not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  return new Response(JSON.stringify({ data: habit }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function createHabit(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { name, title, description, frequency, targetDays } =
    req.body as HabitPayload;
  const habitName = (name ?? title ?? "").toString().trim();
  if (!habitName || !frequency) {
    return new Response(
      JSON.stringify({
        error: "Missing required fields: name, frequency",
        code: "VALIDATION_ERROR",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const db = new Database(req.env.DB);
  const habitId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO "Habit" (id, userId, name, title, description, frequency, targetDays, active, createdAt, updatedAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    [
      habitId,
      req.user.id,
      habitName,
      habitName,
      description ?? null,
      frequency,
      targetDays || 7,
      true,
      now,
      now,
    ],
  );
  const habit = await db.first<Habit>(
    `SELECT ${HABIT_COLUMNS} FROM "Habit" WHERE id = ?1`,
    [habitId],
  );
  return new Response(JSON.stringify({ data: habit }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

export async function completeHabit(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { id } = req.params;
  const { date } = req.body as CompleteHabitPayload;
  const db = new Database(req.env.DB);
  const habit = await db.first<Habit>(
    `SELECT ${HABIT_COLUMNS} FROM "Habit" WHERE id = ?1 AND userId = ?2`,
    [id, req.user.id],
  );
  if (!habit) {
    return new Response(
      JSON.stringify({ error: "Habit not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  const completionDate = date || new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();
  const existing = await db.first(
    'SELECT id FROM "HabitCompletion" WHERE habitId = ?1 AND date = ?2',
    [id, completionDate],
  );
  if (!existing) {
    // Exactly one check-in per habit per day (HabitCompletion is unique on
    // habitId+date), so a repeat check-in can never create a second row.
    await db.run(
      `INSERT INTO "HabitCompletion" (id, habitId, userId, date, status, completedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      [crypto.randomUUID(), id, req.user.id, completionDate, "completed", now],
    );
  }

  const completions = await db.all<HabitCompletion>(
    'SELECT id, habitId, date, status, completedAt FROM "HabitCompletion" WHERE habitId = ?1 ORDER BY date DESC LIMIT 365',
    [id],
  );
  const completedDates = new Set(completions.map((c) => c.date));
  let currentStreak = 0;
  const cursor = new Date(`${completionDate}T00:00:00Z`);
  for (let i = 0; i < 365; i++) {
    const key = cursor.toISOString().split("T")[0];
    if (!completedDates.has(key)) break;
    currentStreak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return new Response(
    JSON.stringify({
      data: {
        habitId: id,
        date: completionDate,
        alreadyCheckedIn: Boolean(existing),
        currentStreak,
        totalCompletions: completions.length,
        message: existing
          ? `Already checked in for ${completionDate}`
          : `Checked in for ${completionDate}`,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export async function getHabitStreak(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { id } = req.params;
  const db = new Database(req.env.DB);
  const habit = await db.first<Habit>(
    `SELECT ${HABIT_COLUMNS} FROM "Habit" WHERE id = ?1 AND userId = ?2`,
    [id, req.user.id],
  );
  if (!habit) {
    return new Response(
      JSON.stringify({ error: "Habit not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  const completions = await db.all<HabitCompletion>(
    'SELECT id, habitId, date, status, completedAt FROM "HabitCompletion" WHERE habitId = ?1 ORDER BY date DESC LIMIT 30',
    [id],
  );
  let currentStreak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const completedDates = new Set(completions.map((c) => c.date));
  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = checkDate.toISOString().split("T")[0];
    if (completedDates.has(dateStr)) {
      currentStreak++;
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
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export async function deleteHabit(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { id } = req.params;
  const db = new Database(req.env.DB);
  const habit = await db.first<Habit>(
    `SELECT ${HABIT_COLUMNS} FROM "Habit" WHERE id = ?1 AND userId = ?2`,
    [id, req.user.id],
  );
  if (!habit) {
    return new Response(
      JSON.stringify({ error: "Habit not found", code: "NOT_FOUND" }),
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
  if (!req.user) return unauthorized();
  const { id } = req.params;
  const { name, title, description, frequency, targetDays } =
    req.body as HabitPayload;
  const habitName = name ?? title;
  const db = new Database(req.env.DB);
  const habit = await db.first<Habit>(
    `SELECT ${HABIT_COLUMNS} FROM "Habit" WHERE id = ?1 AND userId = ?2`,
    [id, req.user.id],
  );
  if (!habit) {
    return new Response(
      JSON.stringify({ error: "Habit not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  const updates: string[] = [];
  const values: unknown[] = [];
  let updateIdx = 1;
  if (habitName !== undefined) {
    updates.push(`name = ?${updateIdx}`);
    updates.push(`title = ?${updateIdx + 1}`);
    values.push(habitName);
    values.push(habitName);
    updateIdx += 2;
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
  const updated = await db.first<Habit>(
    `SELECT ${HABIT_COLUMNS} FROM "Habit" WHERE id = ?1`,
    [id],
  );
  return new Response(JSON.stringify({ data: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
