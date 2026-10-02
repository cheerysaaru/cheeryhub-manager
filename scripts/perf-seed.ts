/**
 * Perf baseline seeder: fills whatever DATABASE_URL points at with realistic
 * volumes so latency measurements are not taken on an empty database.
 * Run: DATABASE_URL="file:./perf.db" npx tsx scripts/perf-seed.ts
 */
import { PrismaClient, TaskStatus, Priority, TransactionType, TransactionCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const EMAIL = 'perf@local.test';
const PASSWORD = 'PerfPass123!';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const day = (offset: number) => new Date(now - offset * DAY);
const utcMidnight = (offset: number) => {
  const d = new Date(now - offset * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: {
      name: 'Perf Tester',
      email: EMAIL,
      passwordHash,
      timezone: 'UTC',
      emailVerified: true,
      settings: { create: {} },
    },
  });

  // Idempotent: drop this user's data before reseeding.
  await prisma.$transaction([
    prisma.taskCheckIn.deleteMany({ where: { userId: user.id } }),
    prisma.task.deleteMany({ where: { userId: user.id } }),
    prisma.habit.deleteMany({ where: { userId: user.id } }),
    prisma.goal.deleteMany({ where: { userId: user.id } }),
    prisma.skill.deleteMany({ where: { userId: user.id } }),
    prisma.focusSession.deleteMany({ where: { userId: user.id } }),
    prisma.journalEntry.deleteMany({ where: { userId: user.id } }),
    prisma.reminder.deleteMany({ where: { userId: user.id } }),
    prisma.xPTransaction.deleteMany({ where: { userId: user.id } }),
    prisma.dailyStats.deleteMany({ where: { userId: user.id } }),
    prisma.brandProject.deleteMany({ where: { userId: user.id } }),
    prisma.notification.deleteMany({ where: { userId: user.id } }),
    prisma.transaction.deleteMany({ where: { userId: user.id } }),
  ]);

  // --- Tasks: 1000 (mixed status, some trashed, spread over 180 days) ---
  const taskStatuses = [TaskStatus.TODO, TaskStatus.TODO, TaskStatus.TODO, TaskStatus.COMPLETED, TaskStatus.IN_PROGRESS];
  const priorities = [Priority.LOW, Priority.MEDIUM, Priority.HIGH, Priority.URGENT];
  const tasks = Array.from({ length: 1000 }, (_, i) => {
    const createdAt = day(i % 180);
    const status = pick(taskStatuses, i);
    const completed = status === TaskStatus.COMPLETED;
    return {
      userId: user.id,
      title: `Perf task ${i}`,
      priority: pick(priorities, i),
      status,
      createdAt,
      updatedAt: createdAt,
      completedAt: completed ? new Date(createdAt.getTime() + 3600_000) : null,
      deletedAt: i % 25 === 0 ? day(i % 60) : null,
      dueAt: new Date(createdAt.getTime() + DAY),
      startAt: createdAt,
      scheduledDate: i % 3 === 0 ? utcMidnight(i % 30) : null,
    };
  });
  await prisma.task.createMany({ data: tasks });

  // --- Habits: 30 x 60 days of completions = 1800 rows ---
  const habits = Array.from({ length: 30 }, (_, i) => ({
    userId: user.id,
    name: `Perf habit ${i}`,
    frequency: 'daily',
    createdAt: day(90),
    updatedAt: day(0),
  }));
  await prisma.habit.createMany({ data: habits });
  const habitRows = await prisma.habit.findMany({ where: { userId: user.id }, select: { id: true } });
  const statuses = ['COMPLETED', 'COMPLETED', 'COMPLETED', 'FAILED', 'SKIPPED'];
  const completions = [];
  for (const habit of habitRows) {
    for (let d = 1; d <= 60; d++) {
      completions.push({
        habitId: habit.id,
        userId: user.id,
        date: utcMidnight(d),
        status: pick(statuses, d),
      });
    }
  }
  await prisma.habitCompletion.createMany({ data: completions });

  // --- Goals: 40 (some overdue ACTIVE to exercise the sweep) ---
  await prisma.goal.createMany({
    data: Array.from({ length: 40 }, (_, i) => ({
      userId: user.id,
      title: `Perf goal ${i}`,
      progress: i % 4 === 0 ? 100 : (i * 7) % 90,
      status: i % 4 === 0 ? 'COMPLETED' : 'ACTIVE',
      deadline: i % 5 === 0 ? day((i % 7) + 1) : null,
      createdAt: day(i % 120),
      updatedAt: day(0),
    })),
  });

  await prisma.skill.createMany({
    data: Array.from({ length: 10 }, (_, i) => ({
      userId: user.id,
      name: `Skill ${i}`,
      progress: (i * 13) % 100,
      createdAt: day(60),
      updatedAt: day(1),
    })),
  });

  await prisma.focusSession.createMany({
    data: Array.from({ length: 100 }, (_, i) => ({
      userId: user.id,
      durationMinutes: 15 + (i % 5) * 10,
      startedAt: day(i % 60),
      completedAt: day(i % 60),
      status: 'COMPLETED',
    })),
  });

  await prisma.journalEntry.createMany({
    data: Array.from({ length: 30 }, (_, i) => ({
      userId: user.id,
      date: utcMidnight(i),
      accomplishments: `Did things ${i}`,
      passionScore: (i % 5) + 1,
      createdAt: utcMidnight(i),
      updatedAt: utcMidnight(i),
    })),
  });

  await prisma.reminder.createMany({
    data: Array.from({ length: 30 }, (_, i) => ({
      userId: user.id,
      title: `Reminder ${i}`,
      reminderDate: day(i % 21),
      reminderTime: '09:00',
      createdAt: day(30),
      updatedAt: day(1),
    })),
  });

  const xpReasons = ['task:ontime', 'habit:checkin', 'goal:done', 'task:missed', 'focus:done'];
  await prisma.xPTransaction.createMany({
    data: Array.from({ length: 400 }, (_, i) => ({
      userId: user.id,
      amount: i % 7 === 0 ? -5 : 2,
      reason: `${pick(xpReasons, i)}:perf:${i}`,
      dedupeKey: `perf:${i}`,
      createdAt: day(i % 150),
    })),
  });

  await prisma.dailyStats.createMany({
    data: Array.from({ length: 120 }, (_, i) => ({
      userId: user.id,
      date: utcMidnight(i),
      productivityPercentage: 40 + ((i * 11) % 60),
      tasksCompleted: i % 8,
      tasksTotal: 8 + (i % 5),
      habitsCompleted: i % 4,
      habitsTotal: 6,
      focusMinutes: (i % 6) * 25,
      xpEarned: i % 10,
    })),
  });

  await prisma.notification.createMany({
    data: Array.from({ length: 150 }, (_, i) => ({
      userId: user.id,
      type: 'task_overdue',
      title: `Notification ${i}`,
      body: `Body ${i}`,
      link: '/tasks',
      dedupeKey: `perf-notif:${i}`,
      readAt: i % 3 === 0 ? day(i % 30) : null,
      createdAt: day(i % 45),
    })),
  });

  const txTypes = [TransactionType.EXPENSE, TransactionType.EXPENSE, TransactionType.INCOME];
  const txCats: Record<string, TransactionCategory[]> = {
    EXPENSE: [TransactionCategory.FOOD, TransactionCategory.HOUSING, TransactionCategory.TRANSPORTATION, TransactionCategory.SHOPPING],
    INCOME: [TransactionCategory.SALARY, TransactionCategory.FREELANCE, TransactionCategory.INVESTMENTS],
  };
  await prisma.transaction.createMany({
    data: Array.from({ length: 300 }, (_, i) => {
      const type = pick(txTypes, i);
      return {
        userId: user.id,
        type,
        category: pick(txCats[type], i),
        amount: 5 + ((i * 13) % 200),
        description: `Perf tx ${i}`,
        date: day(i % 120),
        createdAt: day(i % 120),
        updatedAt: day(i % 120),
      };
    }),
  });

  const counts = {
    tasks: await prisma.task.count({ where: { userId: user.id } }),
    habitCompletions: await prisma.habitCompletion.count({ where: { userId: user.id } }),
    goals: await prisma.goal.count({ where: { userId: user.id } }),
    xp: await prisma.xPTransaction.count({ where: { userId: user.id } }),
    notifications: await prisma.notification.count({ where: { userId: user.id } }),
    transactions: await prisma.transaction.count({ where: { userId: user.id } }),
    dailyStats: await prisma.dailyStats.count({ where: { userId: user.id } }),
  };
  console.log('Seeded perf data for', EMAIL, JSON.stringify(counts));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
