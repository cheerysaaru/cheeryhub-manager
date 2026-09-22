import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const tables = await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type='table'`;
  console.log(tables);
  await prisma.$disconnect();
}
main();