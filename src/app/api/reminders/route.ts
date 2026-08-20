import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createMedicationReminder } from '@/lib/reminders/service';
import { prisma } from '@/lib/prisma';
import { Role } from '@/lib/types';
import { z } from 'zod';

const CreateReminderSchema = z.object({
  patientId: z.string().optional(),
  appointmentId: z.string().optional(),
  medication: z.string().min(2, 'Medication name required'),
  dosage: z.string().min(1, 'Dosage required'),
  frequency: z.string().min(1, 'Frequency required'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    // ROUTE CLASSIFICATION: PATIENT_ONLY / DOCTOR_ONLY / ADMIN_ONLY
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedPatientId = searchParams.get('patientId') || session.userId;

    if (session.role === Role.PATIENT && requestedPatientId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden: Cannot view another patient reminders' }, { status: 403 });
    }

    const reminders = await prisma.medicationReminder.findMany({
      where: { patientId: requestedPatientId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, reminders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch reminders' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    // ROUTE CLASSIFICATION: PATIENT_ONLY / DOCTOR_ONLY / ADMIN_ONLY
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    const body = await req.json();
    const validated = CreateReminderSchema.parse(body);

    const targetPatientId = session.role === Role.PATIENT ? session.userId : (validated.patientId || session.userId);

    const now = new Date();
    const defaultEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const startDateISO = validated.startDate ? new Date(validated.startDate).toISOString() : now.toISOString();
    const endDateISO = validated.endDate ? new Date(validated.endDate).toISOString() : defaultEnd.toISOString();

    const reminder = await createMedicationReminder(
      targetPatientId,
      validated.medication,
      validated.dosage,
      validated.frequency,
      startDateISO,
      endDateISO
    );

    return NextResponse.json({ success: true, reminder });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Failed to create reminder' }, { status: 400 });
  }
}
