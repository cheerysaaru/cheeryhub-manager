import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

let client: PrismaClient | undefined;

function createLocalClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });
}

function ensureClient(): PrismaClient {
  if (!client) {
    client = globalForPrisma.prisma ?? createLocalClient();
    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.prisma = client;
    }
  }
  return client;
}

export function configurePrisma(db: D1Database) {
  client = new PrismaClient({
    adapter: new PrismaD1(db),
    log: ['error'],
  });
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const active = ensureClient();
    const value = Reflect.get(active as object, property, receiver);
    return typeof value === 'function' ? value.bind(active) : value;
  },
});

export function getPrisma(): PrismaClient {
  return ensureClient();
}
