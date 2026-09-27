import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL!;
console.log('DATABASE_URL =', url);

const prisma = new PrismaClient();

async function main() {
  // Convert one createdAt to integer epoch ms to mimic D1 data
  await prisma.$executeRawUnsafe(
    `UPDATE User SET createdAt = CAST(strftime('%s','2026-09-23 10:39:16') AS INTEGER) * 1000 WHERE email = 'User'`
  );
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT email, createdAt, typeof(createdAt) AS typ FROM User`
  );
  console.log(rows);
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    console.log('OK', users);
  } catch (error) {
    console.log('FAILED:', (error as Error).message);
  }
}

main().finally(() => prisma.$disconnect());
