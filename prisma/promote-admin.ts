import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx tsx prisma/promote-admin.ts <email>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email "${email}"`);
    process.exit(1);
  }

  if (user.role === 'ADMIN') {
    console.log(`User "${email}" is already an admin.`);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: 'ADMIN', status: 'ACTIVE' },
  });

  console.log(`Promoted "${email}" to ADMIN.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
