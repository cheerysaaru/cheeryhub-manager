-- Diagnose orphan rows: any user-owned row whose userId is not present in User.
-- Prisma uses ON DELETE CASCADE for these FKs, so every count should be 0.
-- Run: npx wrangler d1 execute cheeryhub-staging-db --local --env staging --file scripts/diagnose-orphans.sql
SELECT 'Habit' AS table_name, COUNT(*) AS orphans FROM "Habit" WHERE userId NOT IN (SELECT id FROM "User");
SELECT 'Task', COUNT(*) FROM "Task" WHERE userId NOT IN (SELECT id FROM "User");
SELECT 'Goal', COUNT(*) FROM "Goal" WHERE userId NOT IN (SELECT id FROM "User");
SELECT 'HabitCompletion', COUNT(*) FROM "HabitCompletion" WHERE userId NOT IN (SELECT id FROM "User");
SELECT 'Skill', COUNT(*) FROM "Skill" WHERE userId NOT IN (SELECT id FROM "User");
SELECT 'JournalEntry', COUNT(*) FROM "JournalEntry" WHERE userId NOT IN (SELECT id FROM "User");
SELECT 'FocusSession', COUNT(*) FROM "FocusSession" WHERE userId NOT IN (SELECT id FROM "User");
SELECT 'Reminder', COUNT(*) FROM "Reminder" WHERE userId NOT IN (SELECT id FROM "User");
SELECT 'Transaction', COUNT(*) FROM "Transaction" WHERE userId NOT IN (SELECT id FROM "User");
SELECT 'XPTransaction', COUNT(*) FROM "XPTransaction" WHERE userId NOT IN (SELECT id FROM "User");
SELECT 'Notification', COUNT(*) FROM "Notification" WHERE userId NOT IN (SELECT id FROM "User");