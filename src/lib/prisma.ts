import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  let dbUrl = process.env.DATABASE_URL ? process.env.DATABASE_URL.trim().replace(/^["']|["']$/g, '') : '';

  if (!dbUrl || !dbUrl.startsWith('file:')) {
    dbUrl = 'file:./dev.db';
  }

  return new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

// Invalidate and disconnect any stale cached global Prisma instance from memory
if (globalForPrisma.prisma) {
  try {
    globalForPrisma.prisma.$disconnect();
  } catch (_) {
    // ignore disconnect errors on stale instances
  }
}

export const prisma = createPrismaClient();
globalForPrisma.prisma = prisma;
