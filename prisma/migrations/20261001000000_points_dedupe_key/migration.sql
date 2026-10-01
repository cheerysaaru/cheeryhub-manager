-- AlterTable
ALTER TABLE "XPTransaction" ADD COLUMN "dedupeKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "XPTransaction_userId_dedupeKey_key" ON "XPTransaction"("userId", "dedupeKey");
