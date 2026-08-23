import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { applyDoctorLeave } from '@/lib/doctors/service';
import { prisma } from '@/lib/prisma';
import { Role } from '@/lib/types';
import { z } from 'zod';

const ApplyLeaveSchema = z.object({
  doctorId: z.string().optional(),
  startDate: z.string().min(10, 'Start date required (YYYY-MM-DD)'),
  endDate: z.string().min(10, 'End date required (YYYY-MM-DD)'),
  reason: z.string().min(3, 'Reason required'),
});

export async function POST(req: Request) {
  try {
    // ROUTE CLASSIFICATION: DOCTOR_ONLY / ADMIN_ONLY
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    if (session.role !== Role.DOCTOR && session.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Forbidden: Only doctors or admins can submit leave' }, { status: 403 });
    }

    const body = await req.json();
    const validated = ApplyLeaveSchema.parse(body);

    let targetDoctorId = validated.doctorId;

    if (session.role === Role.DOCTOR) {
      const doctorProfile = await prisma.doctorProfile.findUnique({
        where: { userId: session.userId },
      });

      if (!doctorProfile) {
        return NextResponse.json({ error: 'Doctor profile not found' }, { status: 404 });
      }

      // Enforce doctor can only submit leave for themselves
      targetDoctorId = doctorProfile.id;
    }

    if (!targetDoctorId) {
      return NextResponse.json({ error: 'Doctor ID is required' }, { status: 400 });
    }

    const start = new Date(validated.startDate);
    const end = new Date(validated.endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      return NextResponse.json({ error: 'Invalid start or end date range' }, { status: 400 });
    }

    const result = await applyDoctorLeave(targetDoctorId, validated.startDate, validated.endDate, validated.reason);

    return NextResponse.json({
      success: true,
      leave: result.leave,
      cancelledAppointmentsCount: result.conflictingCount || 0,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Failed to submit leave' }, { status: 400 });
  }
}
