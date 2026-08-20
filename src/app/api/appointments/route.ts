import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createAppointmentFromHold } from '@/lib/booking/concurrency';
import { prisma } from '@/lib/prisma';
import { Role } from '@/lib/types';
import { z } from 'zod';

const ConfirmAppointmentSchema = z.object({
  holdId: z.string().min(1, 'Hold ID is required'),
  patientId: z.string().min(1, 'Patient ID is required'),
  symptoms: z.string().min(3, 'Symptoms must be at least 3 characters').max(2000, 'Symptoms max 2000 characters'),
  medicalHistory: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const patientIdParam = searchParams.get('patientId');
    const doctorIdParam = searchParams.get('doctorId');

    // SECURITY ENFORCEMENT: Role-based filtering & ownership verification
    if (session.role === Role.PATIENT) {
      // Patients are restricted to retrieving exclusively their own appointments
      const patientAppts = await prisma.appointment.findMany({
        where: { patientId: session.userId },
        include: {
          doctor: { select: { id: true, name: true, specialization: true } },
        },
        orderBy: { startTime: 'asc' },
      });
      return NextResponse.json({ success: true, appointments: patientAppts });
    }

    if (session.role === Role.DOCTOR) {
      // Doctors are restricted to retrieving appointments associated with their doctor profile
      const doctorProfile = await prisma.doctorProfile.findUnique({
        where: { userId: session.userId },
      });

      if (!doctorProfile) {
        return NextResponse.json({ error: 'Doctor profile not found' }, { status: 404 });
      }

      const doctorAppts = await prisma.appointment.findMany({
        where: { doctorId: doctorProfile.id },
        include: {
          patient: { select: { id: true, name: true, email: true } },
        },
        orderBy: { startTime: 'asc' },
      });
      return NextResponse.json({ success: true, appointments: doctorAppts });
    }

    if (session.role === Role.ADMIN) {
      // Admins can query filtered lists or all appointments
      const whereClause: any = {};
      if (patientIdParam) whereClause.patientId = patientIdParam;
      if (doctorIdParam) whereClause.doctorId = doctorIdParam;

      const allAppts = await prisma.appointment.findMany({
        where: whereClause,
        include: {
          patient: { select: { id: true, name: true, email: true } },
          doctor: { select: { id: true, name: true, specialization: true } },
        },
        orderBy: { startTime: 'asc' },
      });
      return NextResponse.json({ success: true, appointments: allAppts });
    }

    return NextResponse.json({ error: 'Forbidden access' }, { status: 403 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch appointments' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    const body = await req.json();
    const validated = ConfirmAppointmentSchema.parse(body);

    // SECURITY ENFORCEMENT: Override patientId with authenticated session identity
    if (session.role === Role.PATIENT && validated.patientId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden: Cannot book appointments for another user' }, { status: 403 });
    }

    const result = await createAppointmentFromHold(
      validated.holdId,
      session.role === Role.PATIENT ? session.userId : validated.patientId,
      validated.symptoms,
      validated.medicalHistory
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({ success: true, appointment: result.appointment });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Failed to confirm appointment' }, { status: 400 });
  }
}
