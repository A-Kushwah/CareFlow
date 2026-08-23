import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    const conn = await prisma.googleCalendarConnection.findUnique({
      where: { userId_provider: { userId: session.userId, provider: 'google' } },
      select: {
        id: true,
        provider: true,
        providerAccountEmail: true,
        status: true,
        lastSyncAt: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!conn) {
      return NextResponse.json({
        success: true,
        isConnected: false,
        status: 'NOT_CONNECTED',
      });
    }

    return NextResponse.json({
      success: true,
      isConnected: conn.status === 'CONNECTED',
      connection: conn,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch calendar integration status' }, { status: 500 });
  }
}
