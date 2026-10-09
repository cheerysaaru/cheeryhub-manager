import type { D1Database } from "@cloudflare/workers-types";

// AUTO-GENERATED from backend/migrations/*.sql + 0006 additions.
// Idempotent schema bootstrap: run once per isolate on cold start so the
// deployed worker is correct even when the D1 migration step could not run.
export const CREATE_TABLES = [
  'CREATE TABLE IF NOT EXISTS "User" (     "id" TEXT NOT NULL PRIMARY KEY,     "name" TEXT NOT NULL,     "email" TEXT NOT NULL,     "passwordHash" TEXT NOT NULL,     "role" TEXT NOT NULL DEFAULT \'USER\',     "status" TEXT NOT NULL DEFAULT \'ACTIVE\',     "timezone" TEXT NOT NULL DEFAULT \'UTC\',     "emailVerified" BOOLEAN NOT NULL DEFAULT true,     "emailVerificationToken" TEXT,     "emailVerificationExpires" DATETIME,     "lastLoginAt" DATETIME,     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     "updatedAt" DATETIME NOT NULL )',
  'CREATE TABLE IF NOT EXISTS "UserSettings" (     "id" TEXT NOT NULL PRIMARY KEY,     "userId" TEXT NOT NULL,     "wakeUpTime" TEXT NOT NULL DEFAULT \'07:00\',     "sleepTime" TEXT NOT NULL DEFAULT \'22:30\',     "breakfastTime" TEXT NOT NULL DEFAULT \'08:00\',     "lunchTime" TEXT NOT NULL DEFAULT \'12:30\',     "dinnerTime" TEXT NOT NULL DEFAULT \'18:30\',     "defaultFocusDuration" INTEGER NOT NULL DEFAULT 25,     "defaultBreakDuration" INTEGER NOT NULL DEFAULT 5,     "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     "updatedAt" DATETIME NOT NULL,     CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "Task" (     "id" TEXT NOT NULL PRIMARY KEY,     "userId" TEXT NOT NULL,     "title" TEXT NOT NULL,     "description" TEXT,     "category" TEXT,     "priority" TEXT NOT NULL DEFAULT \'MEDIUM\',     "status" TEXT NOT NULL DEFAULT \'TODO\',     "scheduledDate" DATETIME,     "scheduledTime" TEXT,     "deadlineTime" TEXT,     "timerStartedAt" DATETIME,     "recurrence" TEXT NOT NULL DEFAULT \'NONE\',     "isMandatory" BOOLEAN NOT NULL DEFAULT false,     "reminderEnabled" BOOLEAN NOT NULL DEFAULT false,     "estimatedMinutes" INTEGER,     "completedAt" DATETIME,     "deletedAt" DATETIME,     "goalId" TEXT,     "skillId" TEXT,     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     "updatedAt" DATETIME NOT NULL,     CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,     CONSTRAINT "Task_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,     CONSTRAINT "Task_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE SET NULL ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "Habit" (     "id" TEXT NOT NULL PRIMARY KEY,     "userId" TEXT NOT NULL,     "name" TEXT NOT NULL,     "description" TEXT,     "frequency" TEXT NOT NULL,     "active" BOOLEAN NOT NULL DEFAULT true,     "deletedAt" DATETIME,     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     "updatedAt" DATETIME NOT NULL,     CONSTRAINT "Habit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "HabitCompletion" (     "id" TEXT NOT NULL PRIMARY KEY,     "habitId" TEXT NOT NULL,     "userId" TEXT NOT NULL,     "date" DATETIME NOT NULL,     "status" TEXT NOT NULL DEFAULT \'COMPLETED\',     "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     CONSTRAINT "HabitCompletion_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,     CONSTRAINT "HabitCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "Goal" (     "id" TEXT NOT NULL PRIMARY KEY,     "userId" TEXT NOT NULL,     "title" TEXT NOT NULL,     "description" TEXT,     "progress" INTEGER NOT NULL DEFAULT 0,     "deadline" DATETIME,     "status" TEXT NOT NULL DEFAULT \'ACTIVE\',     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     "updatedAt" DATETIME NOT NULL,     CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "GoalMilestone" (     "id" TEXT NOT NULL PRIMARY KEY,     "goalId" TEXT NOT NULL,     "title" TEXT NOT NULL,     "description" TEXT,     "completed" BOOLEAN NOT NULL DEFAULT false,     "completedAt" DATETIME,     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     CONSTRAINT "GoalMilestone_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE CASCADE ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "Skill" (     "id" TEXT NOT NULL PRIMARY KEY,     "userId" TEXT NOT NULL,     "name" TEXT NOT NULL,     "currentLevel" INTEGER NOT NULL DEFAULT 1,     "targetLevel" INTEGER NOT NULL DEFAULT 5,     "progress" INTEGER NOT NULL DEFAULT 0,     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     "updatedAt" DATETIME NOT NULL,     CONSTRAINT "Skill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "FocusSession" (     "id" TEXT NOT NULL PRIMARY KEY,     "userId" TEXT NOT NULL,     "taskId" TEXT,     "durationMinutes" INTEGER NOT NULL,     "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     "completedAt" DATETIME,     "status" TEXT NOT NULL DEFAULT \'RUNNING\',     CONSTRAINT "FocusSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,     CONSTRAINT "FocusSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "JournalEntry" (     "id" TEXT NOT NULL PRIMARY KEY,     "userId" TEXT NOT NULL,     "date" DATETIME NOT NULL,     "accomplishments" TEXT,     "lessons" TEXT,     "procrastination" TEXT,     "improvements" TEXT,     "gratitude" TEXT,     "passionScore" INTEGER,     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     CONSTRAINT "JournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "Reminder" (     "id" TEXT NOT NULL PRIMARY KEY,     "userId" TEXT NOT NULL,     "title" TEXT NOT NULL,     "description" TEXT,     "reminderDate" DATETIME NOT NULL,     "reminderTime" TEXT,     "repeatType" TEXT NOT NULL DEFAULT \'NONE\',     "enabled" BOOLEAN NOT NULL DEFAULT true,     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "XPTransaction" (     "id" TEXT NOT NULL PRIMARY KEY,     "userId" TEXT NOT NULL,     "amount" INTEGER NOT NULL,     "reason" TEXT NOT NULL,     "taskId" TEXT,     "habitId" TEXT,     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     CONSTRAINT "XPTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,     CONSTRAINT "XPTransaction_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,     CONSTRAINT "XPTransaction_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE SET NULL ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "DailyStats" (     "id" TEXT NOT NULL PRIMARY KEY,     "userId" TEXT NOT NULL,     "date" DATETIME NOT NULL,     "productivityPercentage" INTEGER NOT NULL DEFAULT 0,     "tasksCompleted" INTEGER NOT NULL DEFAULT 0,     "tasksTotal" INTEGER NOT NULL DEFAULT 0,     "habitsCompleted" INTEGER NOT NULL DEFAULT 0,     "habitsTotal" INTEGER NOT NULL DEFAULT 0,     "focusMinutes" INTEGER NOT NULL DEFAULT 0,     "xpEarned" INTEGER NOT NULL DEFAULT 0,     CONSTRAINT "DailyStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "BrandProject" (     "id" TEXT NOT NULL PRIMARY KEY,     "userId" TEXT NOT NULL,     "title" TEXT NOT NULL,     "description" TEXT,     "status" TEXT NOT NULL DEFAULT \'IDEA\',     "progress" INTEGER NOT NULL DEFAULT 0,     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     CONSTRAINT "BrandProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "BrandMilestone" (     "id" TEXT NOT NULL PRIMARY KEY,     "brandProjectId" TEXT NOT NULL,     "title" TEXT NOT NULL,     "description" TEXT,     "completed" BOOLEAN NOT NULL DEFAULT false,     "completedAt" DATETIME,     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     CONSTRAINT "BrandMilestone_brandProjectId_fkey" FOREIGN KEY ("brandProjectId") REFERENCES "BrandProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "TaskCheckIn" (     "id" TEXT NOT NULL PRIMARY KEY,     "taskId" TEXT NOT NULL,     "userId" TEXT NOT NULL,     "date" DATETIME NOT NULL,     "checked" BOOLEAN NOT NULL DEFAULT false,     "checkedAt" DATETIME,     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     CONSTRAINT "TaskCheckIn_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,     CONSTRAINT "TaskCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "Transaction" (     "id" TEXT NOT NULL PRIMARY KEY,     "userId" TEXT NOT NULL,     "type" TEXT NOT NULL,     "category" TEXT NOT NULL,     "amount" REAL NOT NULL,     "description" TEXT,     "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     "isRecurring" BOOLEAN NOT NULL DEFAULT false,     "recurrencePattern" TEXT,     "source" TEXT,     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     "updatedAt" DATETIME NOT NULL,     CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "PasswordReset" (     "id" TEXT NOT NULL PRIMARY KEY,     "userId" TEXT NOT NULL,     "tokenHash" TEXT NOT NULL,     "expiresAt" DATETIME NOT NULL,     "usedAt" DATETIME,     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "HabitDayEvent" (     "id" TEXT NOT NULL PRIMARY KEY,     "userId" TEXT NOT NULL,     "habitId" TEXT NOT NULL,     "date" DATETIME NOT NULL,     "fromStatus" TEXT,     "toStatus" TEXT NOT NULL,     "pointsDelta" INTEGER NOT NULL DEFAULT 0,     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     CONSTRAINT "HabitDayEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,     CONSTRAINT "HabitDayEvent_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE CASCADE ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "Notification" (     "id" TEXT NOT NULL PRIMARY KEY,     "userId" TEXT NOT NULL,     "type" TEXT NOT NULL,     "title" TEXT NOT NULL,     "body" TEXT,     "link" TEXT,     "readAt" DATETIME,     "dedupeKey" TEXT NOT NULL,     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE )',
  'CREATE TABLE IF NOT EXISTS "Achievement" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "icon" TEXT, "unlockedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE)',
  // Points ledger (migration 0006_point_events). The unique index is the
  // idempotency guarantee: the same event can never be counted twice.
  'CREATE TABLE IF NOT EXISTS "PointEvent" (     "id" TEXT NOT NULL PRIMARY KEY,     "userId" TEXT NOT NULL,     "type" TEXT NOT NULL,     "amount" INTEGER NOT NULL,     "reason" TEXT NOT NULL,     "sourceId" TEXT NOT NULL,     "dayKey" TEXT NOT NULL,     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     CONSTRAINT "PointEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE )',
  'CREATE UNIQUE INDEX IF NOT EXISTS "PointEvent_userId_reason_sourceId_dayKey_key" ON "PointEvent"("userId", "reason", "sourceId", "dayKey")',
  'CREATE INDEX IF NOT EXISTS "PointEvent_userId_dayKey_idx" ON "PointEvent"("userId", "dayKey")',
];

export const ADD_COLUMNS = [
  {
    table: "User",
    column: "passwordChangedAt",
    ddl: 'ALTER TABLE "User" ADD COLUMN "passwordChangedAt" DATETIME',
  },
  {
    table: "Task",
    column: "dueAt",
    ddl: 'ALTER TABLE "Task" ADD COLUMN "dueAt" DATETIME',
  },
  {
    table: "Task",
    column: "extendedAt",
    ddl: 'ALTER TABLE "Task" ADD COLUMN "extendedAt" DATETIME',
  },
  {
    table: "Task",
    column: "startAt",
    ddl: 'ALTER TABLE "Task" ADD COLUMN "startAt" DATETIME',
  },
  {
    table: "XPTransaction",
    column: "dedupeKey",
    ddl: 'ALTER TABLE "XPTransaction" ADD COLUMN "dedupeKey" TEXT',
  },
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

let bootstrapped: Promise<void> | null = null;

export function ensureSchema(db: D1Database): Promise<void> {
  if (!bootstrapped) {
    bootstrapped = (async () => {
      const allDdl = [
        "PRAGMA foreign_keys = OFF",
        ...CREATE_TABLES,
        ...ADD_COLUMNS.map(({ ddl }) => ddl),
      ];
      try {
        // Single atomic batch: FK enforcement off during creation lets child
        // tables be created before their parents in one pass.
        await db.batch([
          ...allDdl.map((ddl) => db.prepare(ddl)),
          db.prepare(
            'UPDATE "Habit" SET "title" = "name" WHERE "title" IS NULL',
          ),
          db.prepare("PRAGMA foreign_keys = ON"),
        ]);
      } catch (batchError) {
        console.error(
          "[bootstrap] batch failed; retrying per-statement",
          batchError,
        );
        for (const ddl of allDdl) {
          try {
            await db.prepare(ddl).run();
          } catch (error) {
            console.error(
              "[bootstrap] statement failed",
              ddl.slice(0, 48),
              error,
            );
          }
        }
        try {
          await db
            .prepare(
              'UPDATE "Habit" SET "title" = "name" WHERE "title" IS NULL',
            )
            .run();
        } catch {
          /* ignore */
        }
      }
    })();
  }
  return bootstrapped;
}
