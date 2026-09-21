-- CreateTable
CREATE TABLE "TaskCheckIn" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskCheckIn_userId_date_idx" ON "TaskCheckIn"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCheckIn_taskId_date_key" ON "TaskCheckIn"("taskId", "date");

-- AddForeignKey
ALTER TABLE "TaskCheckIn" ADD CONSTRAINT "TaskCheckIn_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCheckIn" ADD CONSTRAINT "TaskCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
