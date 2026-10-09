-- Keep the D1 schema in sync with prisma/migrations/20261009000000_point_events.
-- Points ledger: one row per (userId, reason, sourceId, dayKey) — the unique
-- index is what makes every award/penalty idempotent. amount is signed
-- (+10 earn / -5 penalty), dayKey is YYYY-MM-DD in Asia/Colombo.
CREATE TABLE IF NOT EXISTS "PointEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PointEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PointEvent_userId_reason_sourceId_dayKey_key" ON "PointEvent"("userId", "reason", "sourceId", "dayKey");
CREATE INDEX IF NOT EXISTS "PointEvent_userId_dayKey_idx" ON "PointEvent"("userId", "dayKey");
