import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSlotHold } from '@/lib/booking/concurrency';
import { z } from 'zod';

const HoldRequestSchema = z.object({
  doctorId: z.string().min(1, 'Doctor ID required'),
  startTime: z.string().min(1, 'Start time required'),
  endTime: z.string().min(1, 'End time required'),
});

export async function POST(req: Request) {
  try {
    // ROUTE CLASSIFICATION: PATIENT_ONLY / DOCTOR_ONLY / ADMIN_ONLY
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: Session required to hold a slot' }, { status: 401 });
    }

    const body = await req.json();
    const validated = HoldRequestSchema.parse(body);

    const startTime = new Date(validated.startTime);
    const endTime = new Date(validated.endTime);

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime()) || startTime >= endTime) {
      return NextResponse.json({ error: 'Invalid start or end time range' }, { status: 400 });
    }

    const hold = await createSlotHold(
      validated.doctorId,
      session.userId,
      startTime.toISOString(),
      endTime.toISOString()
    );

    return NextResponse.json({ success: true, hold });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Failed to hold slot' }, { status: 400 });
  }
}
