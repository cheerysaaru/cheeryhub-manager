-- One row per (user, achievement key) so an unlock can never be recorded
-- twice — this is what lets achievement XP be awarded exactly once, and it
-- matches the @@unique([userId, key]) Prisma already declares.
-- Nothing is dropped.
CREATE UNIQUE INDEX IF NOT EXISTS "Achievement_userId_key_key" ON "Achievement"("userId", "key");
CREATE INDEX IF NOT EXISTS "Achievement_userId_idx" ON "Achievement"("userId");
