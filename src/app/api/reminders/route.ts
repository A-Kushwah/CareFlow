import { NextResponse } from 'next/server';
import { createMedicationReminder } from '@/lib/reminders/service';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get('patientId');

  if (!patientId) {
    return NextResponse.json({ error: 'patientId is required' }, { status: 400 });
  }

  try {
    const reminders = await prisma.medicationReminder.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ reminders });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch reminders' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { patientId, medication, dosage, frequency, startDate, endDate } = await req.json();

    if (!patientId || !medication || !dosage || !frequency || !startDate || !endDate) {
      return NextResponse.json({ error: 'All reminder fields are required' }, { status: 400 });
    }

    const reminder = await createMedicationReminder(patientId, medication, dosage, frequency, startDate, endDate);
    return NextResponse.json({ message: 'Medication reminder created', reminder }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create reminder' }, { status: 400 });
  }
}
