import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { Database } from "../db/client";
import { ADD_COLUMNS, CREATE_TABLES } from "../db/bootstrap";
import type { AppEnv, AppRequest } from "../types/index";
import { shiftDayKey, todayInCheckinZone } from "../../../shared/checkin";
import {
  POINTS_ACHIEVEMENT_BRONZE,
  POINTS_ACHIEVEMENT_MANUAL,
  POINTS_GOAL_COMPLETED,
  POINTS_GOAL_MISSED,
  levelProgress,
} from "../../../shared/points";
import { achievementKeyFromTitle } from "../../../shared/achievements";
import { calculatePoints, evaluateDay, taskDueDay } from "./points";
import { getPoints } from "../routes/points";
import { completeTask, markNotCompletedTask } from "../routes/tasks";
import { clearHabitToday, completeHabit } from "../routes/habits";
import { unlockAchievement } from "../routes/achievements";
import { getStreaks } from "../routes/streaks";

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

async function seedGoal(
  harness: Harness,
  fields: {
    title?: string;
    deadline?: string | null;
    progress?: number;
    status?: string;
    updatedAt?: string;
  } = {},
): Promise<string> {
  const id = nextId("goal");
  const now = fields.updatedAt ?? new Date().toISOString();
  await harness.db.run(
    `INSERT INTO "Goal" (id, userId, title, description, progress, deadline, status, createdAt, updatedAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    [
      id,
      harness.userId,
      fields.title ?? "Test goal",
      null,
      fields.progress ?? 0,
      fields.deadline ?? null,
      fields.status ?? "ACTIVE",
      now,
      now,
    ],
  );
  return id;
}

async function reasonEvents(
  harness: Harness,
  reason: string,
): Promise<Array<{ amount: number; dayKey: string }>> {
  return harness.db.all<{ amount: number; dayKey: string }>(
    `SELECT amount, dayKey FROM "PointEvent"
      WHERE userId = ?1 AND reason = ?2 ORDER BY dayKey`,
    [harness.userId, reason],
  );
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

describe("goal points (spec 7)", () => {
  it("awards +50 once for a goal completed on or before its deadline", async () => {
    const today = todayInCheckinZone();
    await seedGoal(harness, {
      deadline: `${shiftDayKey(today, 3)}T23:59:00.000Z`,
      progress: 100,
      status: "COMPLETED",
      updatedAt: `${today}T08:00:00.000Z`,
    });

    await getPoints(request(harness.d1, harness.userId));
    await getPoints(request(harness.d1, harness.userId));

    const earned = await reasonEvents(harness, "GOAL_COMPLETED");
    expect(earned).toHaveLength(1);
    expect(earned[0].amount).toBe(POINTS_GOAL_COMPLETED);
    const summary = await calculatePoints(harness.db, harness.userId);
    expect(summary.totalEarned).toBe(POINTS_GOAL_COMPLETED);
    expect(summary.currentTotal).toBe(POINTS_GOAL_COMPLETED);
  });

  it("creates no points for an open goal, with or without a deadline", async () => {
    const today = todayInCheckinZone();
    await seedGoal(harness, {
      deadline: `${shiftDayKey(today, 3)}T23:59:00.000Z`,
    });
    await seedGoal(harness, { title: "Goal without a deadline" });

    await getPoints(request(harness.d1, harness.userId));
    expect(await pointCount(harness)).toBe(0);
  });

  it("applies -25 exactly once for a goal past its deadline without completion", async () => {
    const yesterday = shiftDayKey(todayInCheckinZone(), -1);
    await seedGoal(harness, { deadline: `${yesterday}T12:00:00.000Z` });

    await getPoints(request(harness.d1, harness.userId));
    await getPoints(request(harness.d1, harness.userId));

    const missed = await reasonEvents(harness, "GOAL_MISSED");
    expect(missed).toHaveLength(1);
    expect(missed[0].amount).toBe(POINTS_GOAL_MISSED);
    expect(missed[0].dayKey).toBe(yesterday);
    const summary = await calculatePoints(harness.db, harness.userId);
    expect(summary.totalLost).toBe(Math.abs(POINTS_GOAL_MISSED));
  });

  it("never awards +50 for a goal completed after its deadline", async () => {
    const today = todayInCheckinZone();
    const yesterday = shiftDayKey(today, -1);
    await seedGoal(harness, {
      deadline: `${yesterday}T12:00:00.000Z`,
      progress: 100,
      status: "COMPLETED",
      updatedAt: `${today}T08:00:00.000Z`,
    });

    await getPoints(request(harness.d1, harness.userId));
    expect(await reasonEvents(harness, "GOAL_COMPLETED")).toHaveLength(0);
    // A completed goal never keeps its miss either.
    expect(await reasonEvents(harness, "GOAL_MISSED")).toHaveLength(0);
    expect(await pointCount(harness)).toBe(0);
  });
});

describe("achievement XP (spec 8)", () => {
  it("awards a catalog achievement's XP exactly once", async () => {
    const first = await unlockAchievement(
      request(harness.d1, harness.userId, {
        method: "POST",
        body: { key: "first_task" },
      }),
    );
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as {
      data: { key: string; xpAwarded: number };
    };
    expect(firstBody.data.key).toBe("first_task");
    expect(firstBody.data.xpAwarded).toBe(POINTS_ACHIEVEMENT_BRONZE);

    const repeat = await unlockAchievement(
      request(harness.d1, harness.userId, {
        method: "POST",
        body: { key: "first_task" },
      }),
    );
    expect(repeat.status).toBe(409);

    const awards = await reasonEvents(harness, "ACHIEVEMENT");
    expect(awards).toHaveLength(1);
    expect(awards[0].amount).toBe(POINTS_ACHIEVEMENT_BRONZE);
    const summary = await calculatePoints(harness.db, harness.userId);
    expect(summary.totalEarned).toBe(POINTS_ACHIEVEMENT_BRONZE);
  });

  it("accepts the key the UI generates for a hand-added achievement", async () => {
    const key = achievementKeyFromTitle("Ran a marathon");
    expect(key).toBe("ran-a-marathon");

    const response = await unlockAchievement(
      request(harness.d1, harness.userId, {
        method: "POST",
        body: {
          key,
          title: "Ran a marathon",
          description: "First half marathon",
          date: todayInCheckinZone(),
        },
      }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { xpAwarded: number } };
    expect(body.data.xpAwarded).toBe(POINTS_ACHIEVEMENT_MANUAL);
    expect(await pointCount(harness)).toBe(1);
  });

  it("rejects an unlock without a key instead of silently skipping XP", async () => {
    const response = await unlockAchievement(
      request(harness.d1, harness.userId, { method: "POST", body: {} }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("Missing required field: key");
    expect(await pointCount(harness)).toBe(0);
  });
});

describe("streak from the ledger (spec 9)", () => {
  async function streak(): Promise<{
    current: number;
    best: number;
    todayActive: boolean;
  }> {
    const response = await getStreaks(request(harness.d1, harness.userId));
    expect(response.status).toBe(200);
    return (
      (await response.json()) as {
        data: { current: number; best: number; todayActive: boolean };
      }
    ).data;
  }

  async function seedCompletedDay(dayKey: string): Promise<void> {
    await harness.db.run(
      `INSERT INTO "PointEvent" (id, userId, type, amount, reason, sourceId, dayKey, createdAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      [
        nextId("event"),
        harness.userId,
        "EARN",
        10,
        "TASK_COMPLETED",
        nextId("task"),
        dayKey,
        new Date().toISOString(),
      ],
    );
  }

  it("counts a day only when a task was completed", async () => {
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

    const afterCheckin = await streak();
    expect(afterCheckin.current).toBe(0);
    expect(afterCheckin.todayActive).toBe(false);

    const taskId = await seedTask(harness, { scheduledDate: today });
    await completeTask(
      request(harness.d1, harness.userId, {
        method: "PATCH",
        params: { id: taskId },
      }),
    );

    const afterTask = await streak();
    expect(afterTask.current).toBe(1);
    expect(afterTask.best).toBe(1);
    expect(afterTask.todayActive).toBe(true);
  });

  it("runs through consecutive days, holds across an empty today, resets on a gap", async () => {
    const today = todayInCheckinZone();
    // An older, isolated completion sits outside the current run.
    await seedCompletedDay(shiftDayKey(today, -5));
    await seedCompletedDay(today);
    await seedCompletedDay(shiftDayKey(today, -1));
    await seedCompletedDay(shiftDayKey(today, -2));

    const threeDays = await streak();
    expect(threeDays.current).toBe(3);
    expect(threeDays.best).toBe(3);
    expect(threeDays.todayActive).toBe(true);

    // Today still empty: the streak is alive through yesterday, not broken.
    await harness.db.run(`DELETE FROM "PointEvent" WHERE dayKey = ?1`, [today]);
    const yesterdayOnly = await streak();
    expect(yesterdayOnly.current).toBe(2);
    expect(yesterdayOnly.todayActive).toBe(false);
    expect(yesterdayOnly.best).toBe(2);

    // Miss yesterday too: the run is gone, only the isolated day remains.
    await harness.db.run(`DELETE FROM "PointEvent" WHERE dayKey = ?1`, [
      shiftDayKey(today, -1),
    ]);
    const afterGap = await streak();
    expect(afterGap.current).toBe(0);
    expect(afterGap.best).toBe(1);
  });
});
