import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function getPrismaClient() {
  const dbUrl = process.env.DATABASE_URL || '';

  // If local environment uses SQLite file: URL while Prisma Client was generated for PostgreSQL,
  // supply a valid fallback URL structure for build-time static page collection.
  const datasourceUrl =
    dbUrl.startsWith('file:')
      ? undefined // Uses default client connection
      : dbUrl;

  return new PrismaClient({
    datasourceUrl,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma || getPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
