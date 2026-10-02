/**
 * Prints row counts for every user-data table so migrations / upgrades can be
 * verified as data-preserving: run it before and after and diff the output.
 *
 *   npx tsx scripts/row-counts.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MODELS = [
  'user',
  'notification',
  'passwordReset',
  'userSettings',
  'task',
  'habit',
  'habitCompletion',
  'goal',
  'goalMilestone',
  'skill',
  'focusSession',
  'journalEntry',
  'reminder',
  'xPTransaction',
  'dailyStats',
  'brandProject',
  'brandMilestone',
  'taskCheckIn',
  'transaction',
] as const;

async function main() {
  const counts: Record<string, number> = {};
  for (const model of MODELS) {
    counts[model] = await (prisma[model] as { count(): Promise<number> }).count();
  }
  process.stdout.write(`${JSON.stringify(counts, null, 2)}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
