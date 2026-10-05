-- Keep the D1 schema in sync with prisma/migrations/20261001000000_points_dedupe_key.
ALTER TABLE "XPTransaction" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "XPTransaction_userId_dedupeKey_key" ON "XPTransaction"("userId", "dedupeKey");
