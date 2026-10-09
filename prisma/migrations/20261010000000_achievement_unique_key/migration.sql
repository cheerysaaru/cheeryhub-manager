-- Points ledger grows to cover goals and achievements:
--   GOAL_COMPLETED  +50  (goal finished on or before its deadline)
--   GOAL_MISSED     -25  (deadline passed without completion, applied once)
--   ACHIEVEMENT      +XP (achievement unlocked, keyed by the achievement key)
--
-- SQLite stores Prisma enums as TEXT, so PointEvent.reason needs no column
-- change — the new values ride on the existing TEXT column, and idempotency
-- keeps using the unique (userId, reason, sourceId, dayKey) index from
-- 20261009000000_point_events.
--
-- This migration adds the achievement uniqueness guarantee that schema.prisma
-- already declares (@@unique([userId, key])) but that was missing on the
-- SQLite/D1 side: one row per (user, achievement key). Nothing is dropped.
CREATE UNIQUE INDEX IF NOT EXISTS "Achievement_userId_key_key" ON "Achievement"("userId", "key");
CREATE INDEX IF NOT EXISTS "Achievement_userId_idx" ON "Achievement"("userId");
