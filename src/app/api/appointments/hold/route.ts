import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSlotHold } from '@/lib/booking/concurrency';
import { prisma } from '@/lib/prisma';
import { Role } from '@/lib/types';
import { z } from 'zod';

const CreateHoldSchema = z.object({
  doctorId: z.string().min(1, 'Doctor ID is required'),
  startTime: z.string().min(1, 'Start time required'),
  endTime: z.string().min(1, 'End time required'),
});

export async function POST(req: Request) {
  try {
    // ROUTE CLASSIFICATION: PATIENT_ONLY / DOCTOR_ONLY / ADMIN_ONLY
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    // Verify session user exists in database
    const sessionUser = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authenticated patient account not found' }, { status: 404 });
    }

    if (session.role !== Role.PATIENT && session.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Forbidden: Only patients can hold appointment slots' }, { status: 403 });
    }

    const body = await req.json();
    const validated = CreateHoldSchema.parse(body);

    // Verify Doctor Profile Exists
    const doctorProfile = await prisma.doctorProfile.findUnique({ where: { id: validated.doctorId } });
    if (!doctorProfile) {
      return NextResponse.json({ error: 'Doctor profile not found' }, { status: 404 });
    }

    const hold = await createSlotHold(
      validated.doctorId,
      session.userId,
      validated.startTime,
      validated.endTime
    );

    return NextResponse.json({
      success: true,
      hold: {
        id: hold.id,
        doctorId: hold.doctorId,
        patientId: hold.patientId,
        startTime: hold.startTime,
        endTime: hold.endTime,
        expiresAt: hold.expiresAt,
      },
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Failed to hold appointment slot' }, { status: 400 });
  }
}
