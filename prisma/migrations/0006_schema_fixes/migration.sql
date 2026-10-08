-- Migration: Add missing columns and fix schema mismatches
-- Generated to align database schema with application code expectations

-- 1. Habit: add title column (alias for name) and targetDays
-- We keep 'name' as the primary column, add 'title' as computed/view or duplicate for API compatibility
-- Since name is NOT NULL, we'll add title with default = name for existing rows
ALTER TABLE "Habit" ADD COLUMN "title" TEXT;
UPDATE "Habit" SET "title" = "name" WHERE "title" IS NULL;
-- Note: title will be kept in sync with name via application logic or trigger

ALTER TABLE "Habit" ADD COLUMN "targetDays" INTEGER NOT NULL DEFAULT 7;

-- 2. Goal: add targetDate as alias for deadline
ALTER TABLE "Goal" ADD COLUMN "targetDate" DATETIME;
UPDATE "Goal" SET "targetDate" = "deadline" WHERE "targetDate" IS NULL;

-- 3. Skill: add level and description columns
-- Map: level -> currentLevel, description -> new column
ALTER TABLE "Skill" ADD COLUMN "level" INTEGER NOT NULL DEFAULT 1;
UPDATE "Skill" SET "level" = "currentLevel" WHERE "level" IS NULL;

ALTER TABLE "Skill" ADD COLUMN "description" TEXT;

-- 4. HabitCompletion: userId is already NOT NULL in schema but code doesn't insert it
-- This is a code fix, not schema. But ensure default/userId handling works.

-- 5. Transaction: table already exists (model Transaction) - code just needs to use it

-- 6. Add missing models as tables: Achievement, JournalEntry, FocusSession, BrandProject, BrandMilestone, TaskCheckIn
-- These already exist in Prisma schema but may not have migrations applied
-- Check if tables exist, create if not

-- JournalEntry
CREATE TABLE IF NOT EXISTS "JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "accomplishments" TEXT,
    "lessons" TEXT,
    "procrastination" TEXT,
    "improvements" TEXT,
    "gratitude" TEXT,
    "passionScore" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_userId_date_key" ON "JournalEntry"("userId", "date");
CREATE INDEX IF NOT EXISTS "JournalEntry_userId_date_idx" ON "JournalEntry"("userId", "date");

-- FocusSession
CREATE TABLE IF NOT EXISTS "FocusSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FocusSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FocusSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "FocusSession_userId_startedAt_idx" ON "FocusSession"("userId", "startedAt");

-- BrandProject
CREATE TABLE IF NOT EXISTS "BrandProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IDEA',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrandProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "BrandProject_userId_idx" ON "BrandProject"("userId");

-- BrandMilestone
CREATE TABLE IF NOT EXISTS "BrandMilestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandProjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrandMilestone_brandProjectId_fkey" FOREIGN KEY ("brandProjectId") REFERENCES "BrandProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- TaskCheckIn
CREATE TABLE IF NOT EXISTS "TaskCheckIn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskCheckIn_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TaskCheckIn_taskId_date_key" ON "TaskCheckIn"("taskId", "date");
CREATE INDEX IF NOT EXISTS "TaskCheckIn_userId_date_idx" ON "TaskCheckIn"("userId", "date");

-- Achievement (new model not in Prisma yet - add it)
CREATE TABLE IF NOT EXISTS "Achievement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "unlockedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Achievement_userId_key_key" ON "Achievement"("userId", "key");
CREATE INDEX IF NOT EXISTS "Achievement_userId_idx" ON "Achievement"("userId");

-- Notification table already exists (from migration 0004) - verify
-- PasswordReset already exists (migration 0002)