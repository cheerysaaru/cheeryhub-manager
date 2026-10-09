import type { AppRequest } from "../types/index";
import { Database } from "../db/client";
import { shiftDayKey, todayInCheckinZone } from "../../../shared/checkin";

/** What the dashboard header renders: "Streak 3 🔥". */
export interface StreakSummary {
  /** Consecutive days with a completed task, ending today or yesterday. */
  current: number;
  /** Longest run of consecutive task-completion days ever. */
  best: number;
  /** Whether a task was completed today. */
  todayActive: boolean;
}

interface HabitRow {
  id: string;
  userId: string;
  name: string;
}

interface CheckInPayload {
  date?: string;
}

/**
 * The streak is derived from the points ledger — a day counts when at least
 * one task was completed that day. Nothing is stored, so it can never drift.
 * A missing day breaks the streak; today still counts as unbroken until it
 * ends.
 */
export async function getStreaks(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const db = new Database(req.env.DB!);
    const rows = await db.all<{ dayKey: string }>(
      `SELECT DISTINCT dayKey FROM "PointEvent"
        WHERE userId = ?1 AND reason = 'TASK_COMPLETED'`,
      [req.user.id],
    );

    const activeDays = new Set(rows.map((row) => row.dayKey));
    const today = todayInCheckinZone();
    const todayActive = activeDays.has(today);

    // Current run: start at today when it is active, otherwise the streak is
    // still alive if yesterday was (today simply has not happened yet).
    const start = todayActive ? today : shiftDayKey(today, -1);
    let current = 0;
    if (activeDays.has(start)) {
      let cursor = start;
      while (activeDays.has(cursor)) {
        current += 1;
        cursor = shiftDayKey(cursor, -1);
      }
    }

    // Best run over the whole ledger (longest consecutive sequence).
    const sorted = [...activeDays].sort();
    let best = 0;
    let run = 0;
    let previous: string | null = null;
    for (const dayKey of sorted) {
      run =
        previous !== null && shiftDayKey(previous, 1) === dayKey ? run + 1 : 1;
      previous = dayKey;
      if (run > best) best = run;
    }

    const data: StreakSummary = { current, best, todayActive };

    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error getting streaks:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to get streaks",
        code: "INTERNAL_ERROR",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function checkIn(req: AppRequest): Promise<Response> {
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
  const { date } = req.body as CheckInPayload;

  const db = new Database(req.env.DB!);

  try {
    const habit = await db.first<HabitRow>(
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
      JSON.stringify({ data: { message: "Check-in recorded" } }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error recording check-in:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to record check-in",
        code: "INTERNAL_ERROR",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
