import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guard';
import { Role } from '@/lib/types';

export async function GET() {
  const { errorResponse } = await requireAuth([Role.ADMIN]);
  if (errorResponse) return errorResponse;

  try {
    const totalUsers = await prisma.user.count();
    const totalDoctors = await prisma.doctorProfile.count();
    const totalAppointments = await prisma.appointment.count();

    const queuedCount = await prisma.notificationLog.count({ where: { status: 'QUEUED' } });
    const processingCount = await prisma.notificationLog.count({ where: { status: 'PROCESSING' } });
    const sentCount = await prisma.notificationLog.count({ where: { status: 'SENT' } });
    const failedCount = await prisma.notificationLog.count({ where: { status: 'FAILED' } });
    const dlqCount = await prisma.notificationLog.count({ where: { status: 'DLQ' } });

    const recentLogs = await prisma.notificationLog.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    const dlqLogs = await prisma.notificationLog.findMany({
      where: { status: 'DLQ' },
      take: 20,
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({
      metrics: {
        totalUsers,
        totalDoctors,
        totalAppointments,
        outbox: {
          queued: queuedCount,
          processing: processingCount,
          sent: sentCount,
          failed: failedCount,
          dlq: dlqCount,
        },
      },
      recentLogs,
      dlqLogs,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch admin metrics' }, { status: 500 });
  }
}
