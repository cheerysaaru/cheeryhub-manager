-- CreateEnum
CREATE TYPE "TaskRecurrence" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "isMandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurrence" "TaskRecurrence" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "reminderEnabled" BOOLEAN NOT NULL DEFAULT false;
