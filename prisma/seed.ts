import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'user';
  const password = 'Abi14';
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: {
      name: 'user',
      passwordHash,
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    },
    create: {
      name: 'user',
      email,
      passwordHash,
      timezone: 'UTC',
      emailVerified: true,
      settings: { create: {} },
    },
  });

  console.log(`Seeded user "${email}"`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
