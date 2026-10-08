/**
 * Prisma query timing: runs the app's hot query shapes with query-event
 * durations and reports the slowest operations.
 * Run: DATABASE_URL="file:./perf.db" npx tsx scripts/perf-queries.ts
 */
import { PrismaClient } from "@prisma/client";

type QueryEvent = { query: string; duration: number; params?: string };

const prisma = new PrismaClient({
  log: [{ level: "query", emit: "event" }],
});

const events: QueryEvent[] = [];
prisma.$on("query" as never, (event: unknown) => {
  events.push(event as QueryEvent);
});

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "perf@local.test" },
  });
  if (!user) throw new Error("Run scripts/perf-seed.ts first");
  const userId = user.id;
  const today = new Date();
  const todayMidnight = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  const cases: Array<[string, () => Promise<unknown>]> = [
    [
      "GET /api/tasks (list+checkIns)",
      () =>
        prisma.task.findMany({
          where: { userId, deletedAt: null },
          orderBy: { createdAt: "desc" },
          include: { checkIns: { where: { userId, date: todayMidnight } } },
        }),
    ],
    [
      "GET /api/habits (list+completions)",
      () =>
        prisma.habit.findMany({
          where: { userId, deletedAt: null },
          orderBy: { createdAt: "desc" },
          include: { completions: { where: { userId } } },
        }),
    ],
    [
      "GET /api/goals (list)",
      () =>
        prisma.goal.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
        }),
    ],
    [
      "GET /api/notifications (list)",
      () =>
        prisma.notification.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
    ],
    [
      "GET /api/analytics (4 parallel)",
      () =>
        Promise.all([
          prisma.dailyStats.findMany({
            where: { userId },
            orderBy: { date: "asc" },
          }),
          prisma.xPTransaction.aggregate({
            where: { userId },
            _sum: { amount: true },
          }),
          prisma.task.count({ where: { userId, status: "COMPLETED" } }),
          prisma.habitCompletion.count({ where: { userId } }),
        ]),
    ],
    [
      "GET /api/xp (list+total)",
      () =>
        Promise.all([
          prisma.xPTransaction.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 50,
          }),
          prisma.xPTransaction.aggregate({
            where: { userId },
            _sum: { amount: true },
          }),
        ]),
    ],
    [
      "GET /api/streaks (habit+task scan)",
      () =>
        Promise.all([
          prisma.habitCompletion.findMany({
            where: { userId, status: "COMPLETED" },
            select: { date: true },
          }),
          prisma.task.findMany({
            where: { userId, status: "COMPLETED", completedAt: { not: null } },
            select: { completedAt: true },
          }),
        ]),
    ],
    [
      "GET /api/transactions/report/monthly",
      () =>
        prisma.transaction.findMany({
          where: { userId, date: { gte: monthStart, lt: monthEnd } },
          orderBy: { date: "desc" },
        }),
    ],
    [
      "GET /api/focus/history",
      () =>
        prisma.focusSession.findMany({
          where: { userId },
          orderBy: { startedAt: "desc" },
          take: 50,
        }),
    ],
    [
      "GET /api/journal (list)",
      () =>
        prisma.journalEntry.findMany({
          where: { userId },
          orderBy: { date: "desc" },
          take: 30,
        }),
    ],
    [
      "notifications generate (pending scan)",
      () =>
        Promise.all([
          prisma.task.findMany({
            where: {
              userId,
              deletedAt: null,
              status: { notIn: ["COMPLETED", "ARCHIVED"] },
            },
            select: { id: true, title: true, dueAt: true, scheduledDate: true },
          }),
          prisma.habit.findMany({
            where: { userId, deletedAt: null },
            select: { id: true, name: true },
          }),
          prisma.habitCompletion.findMany({
            where: { userId, date: { in: [todayMidnight] } },
            select: { habitId: true, status: true },
          }),
        ]),
    ],
    [
      "goals overdue sweep",
      () =>
        prisma.goal.findMany({
          where: { userId, status: "ACTIVE", deadline: { lt: new Date() } },
        }),
    ],
    [
      "POST /api/tasks (create)",
      () =>
        prisma.task.create({ data: { userId, title: `probe ${Date.now()}` } }),
    ],
  ];

  const ROUNDS = 10;
  const perCase = new Map<string, number[]>();

  for (const [name, run] of cases) {
    for (let i = 0; i < ROUNDS; i++) {
      events.length = 0;
      const started = performance.now();
      await run();
      const elapsed = performance.now() - started;
      const durations = events.map((e) => e.duration);
      const list = perCase.get(name) ?? [];
      list.push(durations.reduce((sum, d) => sum + d, 0) || elapsed);
      perCase.set(name, list);
      if (i === ROUNDS - 1) {
        // keep SQL text from the last round for reporting
        (perCase as Map<string, number[] & { sql?: string }>).set(name, list);
      }
    }
  }

  console.log(`\nRounds per case: ${ROUNDS}\n`);
  console.log("avgMs  p95Ms  case");
  const rows = [...perCase.entries()].map(([name, durations]) => {
    const sorted = [...durations].sort((a, b) => a - b);
    const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
    const p95 =
      sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
    return { name, avg: +avg.toFixed(2), p95: +p95.toFixed(2) };
  });
  rows.sort((a, b) => b.p95 - a.p95);
  for (const row of rows)
    console.log(
      `${String(row.avg).padStart(6)} ${String(row.p95).padStart(6)}  ${row.name}`,
    );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
