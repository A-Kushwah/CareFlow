import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function getDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL?.trim().replace(/^["']|["']$/g, '') || '';

  // If a remote PostgreSQL database URL is configured (e.g. in Vercel env vars), return it directly
  if (envUrl.startsWith('postgresql://') || envUrl.startsWith('postgres://')) {
    return envUrl;
  }

  // Resolve local SQLite database file path
  const defaultPath = path.join(process.cwd(), 'prisma', 'dev.db');
  const fallbackPath = path.join(process.cwd(), 'dev.db');

  const sourceDbPath = fs.existsSync(defaultPath)
    ? defaultPath
    : fs.existsSync(fallbackPath)
    ? fallbackPath
    : defaultPath;

  // On Vercel serverless environment (/var/task is read-only), copy dev.db to /tmp/dev.db
  // where SQLite can acquire write & journal locks without throwing Error Code 14.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const tmpDbPath = '/tmp/dev.db';
    if (fs.existsSync(sourceDbPath)) {
      try {
        fs.copyFileSync(sourceDbPath, tmpDbPath);
      } catch (err) {
        console.error('Failed to copy SQLite dev.db to /tmp on Vercel:', err);
      }
    }
    if (fs.existsSync(tmpDbPath)) {
      return `file:${tmpDbPath}`;
    }
  }

  return `file:${sourceDbPath}`;
}

function createPrismaClient() {
  const dbUrl = getDatabaseUrl();

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
