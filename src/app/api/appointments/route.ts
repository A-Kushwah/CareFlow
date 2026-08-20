import { NextResponse } from 'next/server';
import { confirmAppointmentTransaction } from '@/lib/booking/concurrency';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get('patientId');
  const doctorId = searchParams.get('doctorId');

  const where: any = {};
  if (patientId) where.patientId = patientId;
  if (doctorId) where.doctorId = doctorId;

  try {
    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true, email: true } },
        doctor: { include: { user: { select: { name: true, email: true } } } },
      },
      orderBy: { startTime: 'desc' },
    });

    return NextResponse.json({ appointments });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch appointments' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { patientId, doctorId, startTime, endTime, symptoms, aiPreSummary } = await req.json();

    if (!patientId || !doctorId || !startTime || !endTime) {
      return NextResponse.json({ error: 'patientId, doctorId, startTime, and endTime are required' }, { status: 400 });
    }

    const appointment = await confirmAppointmentTransaction(
      patientId,
      doctorId,
      startTime,
      endTime,
      symptoms,
      aiPreSummary
    );

    return NextResponse.json({
      message: 'Appointment confirmed successfully',
      appointment,
    }, { status: 201 });
  } catch (error: any) {
    const status = error.message?.includes('CONCURRENCY_CONFLICT') ? 409 : 400;
    return NextResponse.json({ error: error.message || 'Booking failed' }, { status });
  }
}
