import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function setupDatabaseEnvironment(): string {
  let envUrl = process.env.DATABASE_URL ? process.env.DATABASE_URL.trim().replace(/^["']|["']$/g, '') : '';

  // 1. If a remote PostgreSQL / Postgres database URL is configured in Vercel environment variables, use it
  if (envUrl.startsWith('postgresql://') || envUrl.startsWith('postgres://')) {
    return envUrl;
  }

  // 2. Resolve local SQLite database file path
  const defaultPath = path.join(process.cwd(), 'prisma', 'dev.db');
  const fallbackPath = path.join(process.cwd(), 'dev.db');

  const sourceDbPath = fs.existsSync(defaultPath)
    ? defaultPath
    : fs.existsSync(fallbackPath)
    ? fallbackPath
    : defaultPath;

  // 3. On Vercel / serverless environment (/var/task is read-only), copy dev.db to /tmp/dev.db
  // where SQLite can acquire write & journal locks without throwing Error Code 14.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const tmpDbPath = '/tmp/dev.db';
    if (fs.existsSync(sourceDbPath) && !fs.existsSync(tmpDbPath)) {
      try {
        fs.copyFileSync(sourceDbPath, tmpDbPath);
      } catch (err) {
        console.error('Failed to copy SQLite dev.db to /tmp on Vercel:', err);
      }
    }
    const finalUrl = fs.existsSync(tmpDbPath) ? `file:${tmpDbPath}` : `file:${sourceDbPath}`;
    process.env.DATABASE_URL = finalUrl;
    return finalUrl;
  }

  const finalUrl = `file:${sourceDbPath}`;
  process.env.DATABASE_URL = finalUrl;
  return finalUrl;
}

function createPrismaClient() {
  const dbUrl = setupDatabaseEnvironment();

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
    // ignore disconnect errors
  }
}

export const prisma = createPrismaClient();
globalForPrisma.prisma = prisma;
