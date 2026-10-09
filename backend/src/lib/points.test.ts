import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { Database } from "../db/client";
import { ADD_COLUMNS, CREATE_TABLES } from "../db/bootstrap";
import type { AppEnv, AppRequest } from "../types/index";
import { shiftDayKey, todayInCheckinZone } from "../../../shared/checkin";
import { levelProgress } from "../../../shared/points";
import { calculatePoints, evaluateDay, taskDueDay } from "./points";
import { getPoints } from "../routes/points";
import { completeTask, markNotCompletedTask } from "../routes/tasks";
import { clearHabitToday, completeHabit } from "../routes/habits";

/**
 * In-memory SQLite behind a D1-compatible shim, so the real handler code runs
 * against the real schema (bootstrap DDL) with no Cloudflare runtime.
 */
function createD1Stub(sqlite: DatabaseSync): D1Database {
  const prepare = (sql: string) => {
    const stmt = sqlite.prepare(sql);
    const withParams = (params: unknown[]) => ({
      all: <T>() =>
        Promise.resolve({ results: stmt.all(...(params as never[])) as T[] }),
      first: <T>() =>
        Promise.resolve(
          (stmt.get(...(params as never[])) as T | undefined) ?? null,
        ),
      run: () => {
        stmt.run(...(params as never[]));
        return Promise.resolve({ success: true });
      },
    });
    return {
      bind: (...params: unknown[]) => withParams(params),
      ...withParams([]),
    };
  };
  const db = {
    prepare,
    batch: async (statements: Array<{ run: () => Promise<unknown> }>) => {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
    exec: (sql: string) => {
      sqlite.exec(sql);
      return Promise.resolve({ count: 0, duration: 0 });
    },
  };
  return db as unknown as D1Database;
}

interface Harness {
  db: Database;
  d1: D1Database;
  userId: string;
}

let harness: Harness;
let seq = 0;

function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

function request(
  d1: D1Database,
  userId: string,
  overrides: Partial<AppRequest> = {},
): AppRequest {
  return {
    method: "GET",
    url: "http://localhost/api/test",
    pathname: "/api/test",
    searchParams: new URLSearchParams(),
    headers: new Headers(),
    env: { DB: d1, JWT_SECRET: "test-secret" } satisfies AppEnv,
    params: {},
    user: { id: userId, email: "test@example.com" },
    ...overrides,
  };
}

async function seedTask(
  harness: Harness,
  fields: {
    scheduledDate?: string;
    dueAt?: string;
    status?: string;
    createdAt?: string;
    title?: string;
  } = {},
): Promise<string> {
  const id = nextId("task");
  const now = new Date().toISOString();
  await harness.db.run(
    `INSERT INTO "Task" (id, userId, title, status, scheduledDate, dueAt, createdAt, updatedAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    [
      id,
      harness.userId,
      fields.title ?? "Test task",
      fields.status ?? "TODO",
      fields.scheduledDate ?? null,
      fields.dueAt ?? null,
      fields.createdAt ?? now,
      now,
    ],
  );
  return id;
}

async function seedHabit(harness: Harness, createdAt: Date): Promise<string> {
  const id = nextId("habit");
  const now = new Date().toISOString();
  await harness.db.run(
    `INSERT INTO "Habit" (id, userId, name, frequency, active, createdAt, updatedAt)
     VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6)`,
    [
      id,
      harness.userId,
      "Test commitment",
      "daily",
      createdAt.toISOString(),
      now,
    ],
  );
  return id;
}

async function pointCount(harness: Harness): Promise<number> {
  const row = await harness.db.first<{ count: number }>(
    `SELECT COUNT(*) AS count FROM "PointEvent" WHERE userId = ?1`,
    [harness.userId],
  );
  return Number(row?.count ?? 0);
}

async function eventsFor(
  harness: Harness,
  dayKey: string,
): Promise<Array<{ reason: string; amount: number }>> {
  return harness.db.all<{ reason: string; amount: number }>(
    `SELECT reason, amount FROM "PointEvent"
      WHERE userId = ?1 AND dayKey = ?2 ORDER BY reason`,
    [harness.userId, dayKey],
  );
}

beforeEach(() => {
  const sqlite = new DatabaseSync(":memory:");
  const allDdl = [...CREATE_TABLES, ...ADD_COLUMNS.map((column) => column.ddl)];
  // Same tolerance as ensureSchema's per-statement retry: an ALTER that is
  // already covered by CREATE_TABLES (e.g. duplicate column) is skipped.
  for (const ddl of allDdl) {
    try {
      sqlite.exec(ddl);
    } catch {
      /* already applied */
    }
  }
  const d1 = createD1Stub(sqlite);
  const db = new Database(d1);
  harness = { db, d1, userId: nextId("user") };
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO "User" (id, name, email, passwordHash, timezone, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
    .run(
      harness.userId,
      "Test User",
      `${harness.userId}@example.com`,
      "x",
      "Asia/Colombo",
      now,
      now,
    );
});

describe("levelProgress (shared rule)", () => {
  it("starts at level 1 with 0/100", () => {
    expect(levelProgress(0)).toEqual({
      level: 1,
      pointsIntoLevel: 0,
      pointsNeededForNextLevel: 100,
    });
  });

  it("levels up at 100 and carries the extra into the 200-cost level", () => {
    expect(levelProgress(100)).toEqual({
      level: 2,
      pointsIntoLevel: 0,
      pointsNeededForNextLevel: 200,
    });
    expect(levelProgress(110)).toEqual({
      level: 2,
      pointsIntoLevel: 10,
      pointsNeededForNextLevel: 200,
    });
  });

  it("follows the N x 100 cost ladder", () => {
    expect(levelProgress(300)).toEqual({
      level: 3,
      pointsIntoLevel: 0,
      pointsNeededForNextLevel: 300,
    });
    expect(levelProgress(599)).toEqual({
      level: 3,
      pointsIntoLevel: 299,
      pointsNeededForNextLevel: 300,
    });
    expect(levelProgress(600)).toEqual({
      level: 4,
      pointsIntoLevel: 0,
      pointsNeededForNextLevel: 400,
    });
  });

  it("clamps negative totals to level 1", () => {
    expect(levelProgress(-50)).toEqual({
      level: 1,
      pointsIntoLevel: 0,
      pointsNeededForNextLevel: 100,
    });
  });
});

describe("taskDueDay", () => {
  it("prefers the explicit deadline over the scheduled day", () => {
    const today = todayInCheckinZone();
    expect(
      taskDueDay({
        dueAt: `${today}T18:00:00.000Z`,
        scheduledDate: "2020-01-01",
      }),
    ).toBe(today);
    expect(taskDueDay({ scheduledDate: "2020-01-01" })).toBe("2020-01-01");
    expect(taskDueDay({})).toBeNull();
  });
});

describe("complete / un-complete a task (spec 1)", () => {
  it("awards +10 on completion and withdraws it on mark-not-completed", async () => {
    const today = todayInCheckinZone();
    const taskId = await seedTask(harness, { scheduledDate: today });

    const done = await completeTask(
      request(harness.d1, harness.userId, {
        method: "PATCH",
        params: { id: taskId },
      }),
    );
    expect(done.status).toBe(200);
    const body = (await done.json()) as {
      data: { status: string };
      points: Record<string, number>;
    };
    expect(body.data.status).toBe("COMPLETED");
    expect(body.points.totalEarned).toBe(10);
    expect(body.points.totalLost).toBe(0);
    expect(body.points.net).toBe(10);
    expect(body.points.currentTotal).toBe(10);
    expect(body.points.level).toBe(1);
    expect(body.points.pointsIntoLevel).toBe(10);
    expect(body.points.pointsNeededForNextLevel).toBe(100);

    const undone = await markNotCompletedTask(
      request(harness.d1, harness.userId, {
        method: "PATCH",
        params: { id: taskId },
      }),
    );
    expect(undone.status).toBe(200);
    const undoneBody = (await undone.json()) as {
      points: Record<string, number>;
    };
    expect(undoneBody.points.totalEarned).toBe(0);
    expect(undoneBody.points.net).toBe(0);
    expect(await pointCount(harness)).toBe(0);
  });
});

describe("missed task derivation (spec 2)", () => {
  it("penalises a task that was not completed by the end of its day, once", async () => {
    const yesterday = shiftDayKey(todayInCheckinZone(), -1);
    const twoDaysAgo = shiftDayKey(todayInCheckinZone(), -2);
    await seedTask(harness, {
      scheduledDate: yesterday,
      createdAt: `${twoDaysAgo}T08:00:00.000Z`,
      status: "TODO",
    });

    const first = await getPoints(request(harness.d1, harness.userId));
    expect(first.status).toBe(200);
    const summary = ((await first.json()) as { data: Record<string, number> })
      .data;
    expect(summary.totalLost).toBe(5);
    expect(summary.net).toBe(-5);

    const yesterdayEvents = await eventsFor(harness, yesterday);
    expect(yesterdayEvents).toEqual([{ reason: "TASK_MISSED", amount: -5 }]);

    // Refreshing never double-counts.
    await getPoints(request(harness.d1, harness.userId));
    const again = await calculatePoints(harness.db, harness.userId);
    expect(again.totalLost).toBe(5);
    expect(again.events).toHaveLength(1);
  });

  it("does not penalise a task for today before the day ends, nor for the future", async () => {
    const today = todayInCheckinZone();
    const tomorrow = shiftDayKey(today, 1);
    await seedTask(harness, { scheduledDate: today, status: "TODO" });
    await seedTask(harness, { scheduledDate: tomorrow, status: "TODO" });

    await getPoints(request(harness.d1, harness.userId));
    expect(await pointCount(harness)).toBe(0);
  });

  it("never recalculates days older than the edit window", async () => {
    const old = shiftDayKey(todayInCheckinZone(), -10);
    await seedTask(harness, {
      scheduledDate: old,
      createdAt: `${old}T08:00:00.000Z`,
      status: "TODO",
    });
    await evaluateDay(harness.db, harness.userId, old);
    expect(await pointCount(harness)).toBe(0);
  });
});

describe("commitment check-in (spec 3)", () => {
  it("late check-in removes the day's -5 and awards +10; undo restores the miss", async () => {
    const yesterday = shiftDayKey(todayInCheckinZone(), -1);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const habitId = await seedHabit(harness, threeDaysAgo);

    await getPoints(request(harness.d1, harness.userId));
    const missed = await eventsFor(harness, yesterday);
    expect(missed).toEqual([{ reason: "COMMITMENT_MISSED", amount: -5 }]);

    const checkin = await completeHabit(
      request(harness.d1, harness.userId, {
        method: "POST",
        params: { id: habitId },
        body: { date: yesterday },
      }),
    );
    expect(checkin.status).toBe(200);
    const checkinBody = (await checkin.json()) as {
      data: Record<string, unknown>;
      points: Record<string, number>;
    };
    expect(checkinBody.points.totalEarned).toBeGreaterThanOrEqual(10);

    const afterCheckin = await eventsFor(harness, yesterday);
    expect(afterCheckin).toEqual([
      { reason: "COMMITMENT_CHECKIN", amount: 10 },
    ]);

    // Undo (clear that day): the +10 leaves and the miss comes back.
    const undo = await clearHabitToday(
      request(harness.d1, harness.userId, {
        method: "POST",
        params: { id: habitId },
        body: { date: yesterday },
      }),
    );
    expect(undo.status).toBe(200);
    const afterUndo = await eventsFor(harness, yesterday);
    expect(afterUndo).toEqual([{ reason: "COMMITMENT_MISSED", amount: -5 }]);
  });

  it("a checked-in day carries no penalty for that day", async () => {
    const today = todayInCheckinZone();
    const habitId = await seedHabit(
      harness,
      new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    );
    await completeHabit(
      request(harness.d1, harness.userId, {
        method: "POST",
        params: { id: habitId },
        body: { date: today },
      }),
    );
    const events = await eventsFor(harness, today);
    expect(events).toEqual([{ reason: "COMMITMENT_CHECKIN", amount: 10 }]);
  });
});

describe("totals clamp at zero (spec 4)", () => {
  it("shows net -5 as 0 current points while keeping earned/lost honest", async () => {
    const yesterday = shiftDayKey(todayInCheckinZone(), -1);
    await seedTask(harness, {
      scheduledDate: yesterday,
      createdAt: `${shiftDayKey(yesterday, -1)}T08:00:00.000Z`,
    });

    const response = await getPoints(request(harness.d1, harness.userId));
    const summary = (
      (await response.json()) as {
        data: Record<string, number>;
      }
    ).data;
    expect(summary.totalEarned).toBe(0);
    expect(summary.totalLost).toBe(5);
    expect(summary.net).toBe(-5);
    expect(summary.currentTotal).toBe(0);
    expect(summary.level).toBe(1);
    expect(summary.pointsIntoLevel).toBe(0);
    expect(summary.pointsNeededForNextLevel).toBe(100);
  });
});

describe("levels from the summary (spec 5)", () => {
  it("reaches level 2 at 100 points with the 200-point next cost", async () => {
    const today = todayInCheckinZone();
    for (let i = 0; i < 11; i++) {
      const taskId = await seedTask(harness, { scheduledDate: today });
      await completeTask(
        request(harness.d1, harness.userId, {
          method: "PATCH",
          params: { id: taskId },
        }),
      );
    }
    const response = await getPoints(request(harness.d1, harness.userId));
    const summary = (
      (await response.json()) as {
        data: Record<string, number>;
      }
    ).data;
    expect(summary.currentTotal).toBe(110);
    expect(summary.level).toBe(2);
    expect(summary.pointsIntoLevel).toBe(10);
    expect(summary.pointsNeededForNextLevel).toBe(200);
  });
});

describe("idempotency (spec 6)", () => {
  it("re-completing the same task keeps a single +10 event", async () => {
    const today = todayInCheckinZone();
    const taskId = await seedTask(harness, { scheduledDate: today });

    for (let i = 0; i < 3; i++) {
      await completeTask(
        request(harness.d1, harness.userId, {
          method: "PATCH",
          params: { id: taskId },
        }),
      );
    }

    const summary = await calculatePoints(harness.db, harness.userId);
    expect(summary.totalEarned).toBe(10);
    expect(summary.events).toHaveLength(1);
    expect(await pointCount(harness)).toBe(1);
  });

  it("repeated refreshes leave totals and event counts untouched", async () => {
    const yesterday = shiftDayKey(todayInCheckinZone(), -1);
    await seedTask(harness, {
      scheduledDate: yesterday,
      createdAt: `${shiftDayKey(yesterday, -1)}T08:00:00.000Z`,
    });

    await getPoints(request(harness.d1, harness.userId));
    const before = await calculatePoints(harness.db, harness.userId);
    await getPoints(request(harness.d1, harness.userId));
    await getPoints(request(harness.d1, harness.userId));
    const after = await calculatePoints(harness.db, harness.userId);

    expect(after.totalEarned).toBe(before.totalEarned);
    expect(after.totalLost).toBe(before.totalLost);
    expect(after.events.length).toBe(before.events.length);
  });
});
