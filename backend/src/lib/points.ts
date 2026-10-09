/**
 * Points & levels for the Cloudflare Worker.
 *
 * The ledger is a `PointEvent` table. EARN events are written by the
 * completion/check-in handlers (idempotent through the unique constraint on
 * userId+reason+sourceId+dayKey); PENALTY events are derived per day by
 * `evaluateDay`, which only ever touches editable days (today, yesterday and
 * the day before — the same window as the check-in calendar).
 *
 * All rules live in shared/points.ts so the frontend cannot disagree.
 */
import { Database } from "../db/client";
import {
  EDIT_WINDOW_DAYS,
  isCheckInEditable,
  shiftDayKey,
  todayInCheckinZone,
} from "../../../shared/checkin";
import {
  POINTS_COMMITMENT_CHECKIN,
  POINTS_COMMITMENT_MISSED,
  POINTS_TASK_COMPLETED,
  POINTS_TASK_MISSED,
  dayKeyInPointsZone,
  levelProgress,
  type PointEventReason,
  type PointEventType,
} from "../../../shared/points";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const JSON_HEADERS = { "Content-Type": "application/json" };

export interface PointEventRecord {
  id: string;
  userId: string;
  type: PointEventType;
  amount: number;
  reason: PointEventReason;
  sourceId: string;
  dayKey: string;
  createdAt: string;
}

export interface PointsSummary {
  totalEarned: number;
  totalLost: number;
  net: number;
  currentTotal: number;
  level: number;
  pointsIntoLevel: number;
  pointsNeededForNextLevel: number;
  events: PointEventRecord[];
}

interface TaskDueRow {
  id: string;
  status: string;
  scheduledDate: string | null;
  dueAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

interface HabitDueRow {
  id: string;
  active: number | boolean;
  deletedAt: string | null;
  createdAt: string;
}

interface CompletionRow {
  habitId: string;
  status: string;
}

/**
 * The calendar day a task is due on (Asia/Colombo): the explicit deadline
 * wins, otherwise the scheduled day. Null when the task has no day at all.
 */
export function taskDueDay(task: {
  dueAt?: string | null;
  scheduledDate?: string | null;
}): string | null {
  if (task.dueAt) return dayKeyInPointsZone(task.dueAt);
  if (task.scheduledDate) return dayKeyInPointsZone(task.scheduledDate);
  return null;
}

interface EventFilter {
  userId: string;
  reason?: PointEventReason;
  sourceId?: string;
  dayKey?: string;
}

async function deleteEvents(db: Database, filter: EventFilter): Promise<void> {
  const clauses = ["userId = ?1"];
  const params: unknown[] = [filter.userId];
  if (filter.reason) {
    params.push(filter.reason);
    clauses.push(`reason = ?${params.length}`);
  }
  if (filter.sourceId) {
    params.push(filter.sourceId);
    clauses.push(`sourceId = ?${params.length}`);
  }
  if (filter.dayKey) {
    params.push(filter.dayKey);
    clauses.push(`dayKey = ?${params.length}`);
  }
  await db.run(
    `DELETE FROM "PointEvent" WHERE ${clauses.join(" AND ")}`,
    params,
  );
}

/**
 * Idempotent award: the unique (userId, reason, sourceId, dayKey) constraint
 * means a second identical insert is silently ignored, so the same event can
 * never be counted twice.
 */
async function insertEvent(
  db: Database,
  userId: string,
  type: PointEventType,
  amount: number,
  reason: PointEventReason,
  sourceId: string,
  dayKey: string,
): Promise<void> {
  await db.run(
    `INSERT OR IGNORE INTO "PointEvent" (id, userId, type, amount, reason, sourceId, dayKey, createdAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    [
      crypto.randomUUID(),
      userId,
      type,
      amount,
      reason,
      sourceId,
      dayKey,
      new Date().toISOString(),
    ],
  );
}

/** Task completed → +10 on the completion day; a completed task is never penalised. */
export async function recordTaskCompleted(
  db: Database,
  userId: string,
  taskId: string,
  completedAt: Date = new Date(),
): Promise<void> {
  await insertEvent(
    db,
    userId,
    "EARN",
    POINTS_TASK_COMPLETED,
    "TASK_COMPLETED",
    taskId,
    dayKeyInPointsZone(completedAt),
  );
  await deleteEvents(db, {
    userId,
    reason: "TASK_MISSED",
    sourceId: taskId,
  });
}

/** Task un-completed → the +10 event is removed. */
export async function removeTaskCompletedEvents(
  db: Database,
  userId: string,
  taskId: string,
): Promise<void> {
  await deleteEvents(db, {
    userId,
    reason: "TASK_COMPLETED",
    sourceId: taskId,
  });
}

/** Commitment checked in for `dayKey` → +10 for that day (once). */
export async function recordCheckin(
  db: Database,
  userId: string,
  habitId: string,
  dayKey: string,
): Promise<void> {
  await insertEvent(
    db,
    userId,
    "EARN",
    POINTS_COMMITMENT_CHECKIN,
    "COMMITMENT_CHECKIN",
    habitId,
    dayKey,
  );
}

/** Check-in removed for `dayKey` → its +10 event is removed. */
export async function removeCheckinEvents(
  db: Database,
  userId: string,
  habitId: string,
  dayKey: string,
): Promise<void> {
  await deleteEvents(db, {
    userId,
    reason: "COMMITMENT_CHECKIN",
    sourceId: habitId,
    dayKey,
  });
}

/**
 * Derives the missed penalties for one day: inserts PENALTY events for items
 * that were not completed / not checked in, and deletes them when the item is
 * later completed for that day.
 *
 * Only editable days are ever recalculated (rule: days older than the
 * check-in edit window are frozen). Task penalties apply once the day has
 * ended ("not completed by the end of that day"); commitment penalties apply
 * for past days and today.
 */
export async function evaluateDay(
  db: Database,
  userId: string,
  dayKey: string,
): Promise<void> {
  if (!DAY_KEY.test(dayKey) || !isCheckInEditable(dayKey)) return;
  const today = todayInCheckinZone();

  // --- Tasks due on this day ---
  const tasks = await db.all<TaskDueRow>(
    `SELECT id, status, scheduledDate, dueAt, deletedAt, createdAt
       FROM "Task" WHERE userId = ?1`,
    [userId],
  );
  const dueTaskIds = new Set<string>();
  for (const task of tasks) {
    if (taskDueDay(task) !== dayKey) continue;
    if (task.createdAt && dayKeyInPointsZone(task.createdAt) > dayKey) continue;
    if (task.status === "ARCHIVED") continue;
    // Soft-deleted tasks left the active list — except ones explicitly marked
    // not completed, which are a miss by definition.
    if (task.deletedAt && task.status !== "NOT_COMPLETED") continue;
    dueTaskIds.add(task.id);
    if (task.status === "COMPLETED") {
      await deleteEvents(db, {
        userId,
        reason: "TASK_MISSED",
        sourceId: task.id,
        dayKey,
      });
    } else if (dayKey < today) {
      await insertEvent(
        db,
        userId,
        "PENALTY",
        POINTS_TASK_MISSED,
        "TASK_MISSED",
        task.id,
        dayKey,
      );
    }
  }
  const staleTaskPenalties = await db.all<{ id: string; sourceId: string }>(
    `SELECT id, sourceId FROM "PointEvent"
      WHERE userId = ?1 AND reason = ?2 AND dayKey = ?3`,
    [userId, "TASK_MISSED", dayKey],
  );
  for (const row of staleTaskPenalties) {
    if (!dueTaskIds.has(row.sourceId)) {
      await db.run(`DELETE FROM "PointEvent" WHERE id = ?1`, [row.id]);
    }
  }

  // --- Commitments for this day ---
  const habits = await db.all<HabitDueRow>(
    `SELECT id, active, deletedAt, createdAt FROM "Habit" WHERE userId = ?1`,
    [userId],
  );
  const completions = await db.all<CompletionRow>(
    `SELECT habitId, status FROM "HabitCompletion"
      WHERE userId = ?1 AND date = ?2`,
    [userId, dayKey],
  );
  const statusByHabit = new Map(
    completions.map((row) => [row.habitId, (row.status ?? "").toLowerCase()]),
  );
  const activeHabitIds = new Set<string>();
  for (const habit of habits) {
    if (!habit.active || habit.deletedAt) continue;
    if (habit.createdAt && dayKeyInPointsZone(habit.createdAt) > dayKey) {
      continue; // did not exist on that day
    }
    activeHabitIds.add(habit.id);
    if (statusByHabit.get(habit.id) === "completed") {
      await deleteEvents(db, {
        userId,
        reason: "COMMITMENT_MISSED",
        sourceId: habit.id,
        dayKey,
      });
    } else if (dayKey <= today) {
      await insertEvent(
        db,
        userId,
        "PENALTY",
        POINTS_COMMITMENT_MISSED,
        "COMMITMENT_MISSED",
        habit.id,
        dayKey,
      );
    }
  }
  const staleHabitPenalties = await db.all<{ id: string; sourceId: string }>(
    `SELECT id, sourceId FROM "PointEvent"
      WHERE userId = ?1 AND reason = ?2 AND dayKey = ?3`,
    [userId, "COMMITMENT_MISSED", dayKey],
  );
  for (const row of staleHabitPenalties) {
    if (!activeHabitIds.has(row.sourceId)) {
      await db.run(`DELETE FROM "PointEvent" WHERE id = ?1`, [row.id]);
    }
  }
}

/** Evaluates the given days (duplicates / non-editable days are skipped). */
export async function evaluateDays(
  db: Database,
  userId: string,
  dayKeys: Array<string | null | undefined>,
): Promise<void> {
  const seen = new Set<string>();
  for (const dayKey of dayKeys) {
    if (!dayKey || seen.has(dayKey)) continue;
    seen.add(dayKey);
    await evaluateDay(db, userId, dayKey);
  }
}

/** Dashboard load: recalculate every editable day (today and the 2 before). */
export async function evaluateEditableDays(
  db: Database,
  userId: string,
): Promise<void> {
  const today = todayInCheckinZone();
  for (let i = 0; i <= EDIT_WINDOW_DAYS; i++) {
    await evaluateDay(db, userId, shiftDayKey(today, -i));
  }
}

/**
 * The single points summary: totals straight from the ledger, level from the
 * shared level rule, and the most recent events (newest first).
 * `currentTotal` is clamped at 0 while `net` and `totalLost` keep the truth.
 */
export async function calculatePoints(
  db: Database,
  userId: string,
): Promise<PointsSummary> {
  const totals = await db.first<{ earned: number; lost: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS earned,
       COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) AS lost
     FROM "PointEvent" WHERE userId = ?1`,
    [userId],
  );
  const events = await db.all<PointEventRecord>(
    `SELECT id, userId, type, amount, reason, sourceId, dayKey, createdAt
       FROM "PointEvent" WHERE userId = ?1
      ORDER BY createdAt DESC, rowid DESC
      LIMIT 50`,
    [userId],
  );

  const totalEarned = Number(totals?.earned ?? 0);
  const totalLost = Number(totals?.lost ?? 0);
  const net = totalEarned - totalLost;
  const currentTotal = Math.max(0, net);
  const { level, pointsIntoLevel, pointsNeededForNextLevel } =
    levelProgress(currentTotal);

  return {
    totalEarned,
    totalLost,
    net,
    currentTotal,
    level,
    pointsIntoLevel,
    pointsNeededForNextLevel,
    events,
  };
}

/** Evaluates the given days, then returns the fresh summary — used by the
 * completion/check-in write handlers so their response carries the points. */
export async function refreshPoints(
  db: Database,
  userId: string,
  dayKeys: Array<string | null | undefined>,
): Promise<PointsSummary> {
  await evaluateDays(db, userId, dayKeys);
  return calculatePoints(db, userId);
}

/** JSON response helper used by the points route. */
export function pointsJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
