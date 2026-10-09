-- Repair: remove orphan user-owned rows whose userId is not in User, in
-- child-first order. Safe no-op when there are none (the diagnose step should
-- be 0 after the FK-safe app layer). Run --local first, then --remote only if
-- the production DB shows orphans.
-- npx wrangler d1 execute cheeryhub-staging-db --local --env staging --file scripts/repair-orphans.sql
BEGIN;
DELETE FROM "HabitCompletion" WHERE userId NOT IN (SELECT id FROM "User");
DELETE FROM "HabitDayEvent" WHERE userId NOT IN (SELECT id FROM "User");
DELETE FROM "TaskCheckIn" WHERE userId NOT IN (SELECT id FROM "User");
DELETE FROM "FocusSession" WHERE userId NOT IN (SELECT id FROM "User");
DELETE FROM "JournalEntry" WHERE userId NOT IN (SELECT id FROM "User");
DELETE FROM "Reminder" WHERE userId NOT IN (SELECT id FROM "User");
DELETE FROM "XPTransaction" WHERE userId NOT IN (SELECT id FROM "User");
DELETE FROM "DailyStats" WHERE userId NOT IN (SELECT id FROM "User");
DELETE FROM "PasswordReset" WHERE userId NOT IN (SELECT id FROM "User");
DELETE FROM "Notification" WHERE userId NOT IN (SELECT id FROM "User");
DELETE FROM "Achievement" WHERE userId NOT IN (SELECT id FROM "User");
DELETE FROM "Transaction" WHERE userId NOT IN (SELECT id FROM "User");
-- Milestones whose parent project/goal is gone (no userId column of their own):
DELETE FROM "BrandMilestone" WHERE brandProjectId NOT IN (SELECT id FROM "BrandProject");
DELETE FROM "GoalMilestone" WHERE goalId NOT IN (SELECT id FROM "Goal");
DELETE FROM "Task" WHERE userId NOT IN (SELECT id FROM "User");
DELETE FROM "Habit" WHERE userId NOT IN (SELECT id FROM "User");
DELETE FROM "Goal" WHERE userId NOT IN (SELECT id FROM "User");
DELETE FROM "Skill" WHERE userId NOT IN (SELECT id FROM "User");
DELETE FROM "BrandProject" WHERE userId NOT IN (SELECT id FROM "User");
DELETE FROM "UserSettings" WHERE userId NOT IN (SELECT id FROM "User");
COMMIT;