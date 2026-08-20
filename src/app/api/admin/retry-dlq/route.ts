import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guard';
import { NotificationStatus, Role } from '@/lib/types';

export async function POST(req: Request) {
  const { errorResponse } = await requireAuth([Role.ADMIN]);
  if (errorResponse) return errorResponse;

  try {
    const { logId } = await req.json();

    if (logId) {
      // Re-queue single job
      const updated = await prisma.notificationLog.update({
        where: { id: logId },
        data: {
          status: NotificationStatus.QUEUED,
          attempts: 0,
          nextRetryAt: new Date(),
          lastError: null,
        },
      });

      return NextResponse.json({ message: 'DLQ item re-queued successfully', updated });
    }

    // Re-queue ALL DLQ items
    const updatedCount = await prisma.notificationLog.updateMany({
      where: { status: NotificationStatus.DLQ },
      data: {
        status: NotificationStatus.QUEUED,
        attempts: 0,
        nextRetryAt: new Date(),
        lastError: null,
      },
    });

    return NextResponse.json({ message: `Re-queued ${updatedCount.count} DLQ items successfully`, count: updatedCount.count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to retry DLQ items' }, { status: 500 });
  }
}
