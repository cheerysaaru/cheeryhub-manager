-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HabitCompletion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "habitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HabitCompletion_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HabitCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_HabitCompletion" ("completedAt", "date", "habitId", "id", "userId") SELECT "completedAt", "date", "habitId", "id", "userId" FROM "HabitCompletion";
DROP TABLE "HabitCompletion";
ALTER TABLE "new_HabitCompletion" RENAME TO "HabitCompletion";
CREATE INDEX "HabitCompletion_userId_date_idx" ON "HabitCompletion"("userId", "date");
CREATE UNIQUE INDEX "HabitCompletion_habitId_date_key" ON "HabitCompletion"("habitId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
