import type { D1Database } from "@cloudflare/workers-types";

// Idempotent schema bootstrap. The CI "d1 migrations apply --remote" step can
// fail (e.g. a token without D1 access) and historically aborted the deploy, so
// the deployed worker runs against an under-migrated database. This ensures the
// columns/tables the current code needs exist, ignoring "already exists"
// errors, so the worker is correct the moment it ships.
const ADD_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [
  {
    table: "Habit",
    column: "title",
    ddl: 'ALTER TABLE "Habit" ADD COLUMN "title" TEXT',
  },
  {
    table: "Habit",
    column: "targetDays",
    ddl: 'ALTER TABLE "Habit" ADD COLUMN "targetDays" INTEGER NOT NULL DEFAULT 7',
  },
  {
    table: "Goal",
    column: "targetDate",
    ddl: 'ALTER TABLE "Goal" ADD COLUMN "targetDate" DATETIME',
  },
  {
    table: "Goal",
    column: "deadline",
    ddl: 'ALTER TABLE "Goal" ADD COLUMN "deadline" DATETIME',
  },
  {
    table: "Skill",
    column: "level",
    ddl: 'ALTER TABLE "Skill" ADD COLUMN "level" INTEGER NOT NULL DEFAULT 1',
  },
  {
    table: "Skill",
    column: "description",
    ddl: 'ALTER TABLE "Skill" ADD COLUMN "description" TEXT',
  },
];

const CREATE_TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS "JournalEntry" (
     "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "date" DATETIME NOT NULL,
     "accomplishments" TEXT, "lessons" TEXT, "procrastination" TEXT, "improvements" TEXT,
     "gratitude" TEXT, "passionScore" INTEGER, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "JournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "FocusSession" (
     "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "taskId" TEXT, "durationMinutes" INTEGER NOT NULL,
     "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" DATETIME,
     "status" TEXT NOT NULL DEFAULT 'RUNNING', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "FocusSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "BrandProject" (
     "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT,
     "status" TEXT NOT NULL DEFAULT 'IDEA', "progress" INTEGER NOT NULL DEFAULT 0,
     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "BrandProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "BrandMilestone" (
     "id" TEXT NOT NULL PRIMARY KEY, "brandProjectId" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT,
     "completed" BOOLEAN NOT NULL DEFAULT false, "completedAt" DATETIME,
     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "BrandMilestone_brandProjectId_fkey" FOREIGN KEY ("brandProjectId") REFERENCES "BrandProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "TaskCheckIn" (
     "id" TEXT NOT NULL PRIMARY KEY, "taskId" TEXT NOT NULL, "userId" TEXT NOT NULL, "date" DATETIME NOT NULL,
     "checked" BOOLEAN NOT NULL DEFAULT false, "checkedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "TaskCheckIn_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT "TaskCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "Achievement" (
     "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL,
     "description" TEXT, "icon" TEXT, "unlockedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
];

let bootstrapped: Promise<void> | null = null;

export function ensureSchema(db: D1Database): Promise<void> {
  if (!bootstrapped) {
    bootstrapped = (async () => {
      for (const stmt of CREATE_TABLES) {
        try {
          await db.prepare(stmt).run();
        } catch {
          /* exists */
        }
      }
      for (const { ddl } of ADD_COLUMNS) {
        try {
          await db.prepare(ddl).run();
        } catch {
          /* duplicate column */
        }
      }
      // Backfill the mirrored title column for any habits created before it.
      try {
        await db
          .prepare('UPDATE "Habit" SET "title" = "name" WHERE "title" IS NULL')
          .run();
      } catch {
        /* ignore */
      }
    })();
  }
  return bootstrapped;
}
