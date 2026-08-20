import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guard';
import { Role } from '@/lib/types';

export async function GET(req: Request) {
  const { errorResponse } = await requireAuth([Role.ADMIN]);
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const where: any = {};
  if (status) where.status = status;

  try {
    const logs = await prisma.notificationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ logs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch notification logs' }, { status: 500 });
  }
}
