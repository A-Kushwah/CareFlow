import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateProductionEnvironment } from '@/lib/config/productionGuard';

export async function GET() {
  try {
    const startTime = Date.now();
    let dbStatus = 'HEALTHY';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'UNHEALTHY';
    }
    const latencyMs = Date.now() - startTime;

    const guardResult = validateProductionEnvironment();

    const isHealthy = dbStatus === 'HEALTHY' && guardResult.isValid;

    return NextResponse.json(
      {
        status: isHealthy ? 'OK' : 'DEGRADED',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        database: {
          status: dbStatus,
          latencyMs,
        },
        environment: {
          nodeEnv: process.env.NODE_ENV || 'development',
          isProductionGuardValid: guardResult.isValid,
          configurationErrors: guardResult.errors.length > 0 ? guardResult.errors : undefined,
        },
      },
      { status: isHealthy ? 200 : 503 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'ERROR',
        error: err.message || 'Health check exception',
      },
      { status: 500 }
    );
  }
}
