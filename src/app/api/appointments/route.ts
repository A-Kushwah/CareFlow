import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { confirmAppointmentTransaction } from '@/lib/booking/concurrency';
import { prisma } from '@/lib/prisma';
import { Role } from '@/lib/types';
import { z } from 'zod';

const ConfirmAppointmentSchema = z.object({
  holdId: z.string().optional(),
  patientId: z.string().optional(),
  doctorId: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  symptoms: z.string().optional(),
  medicalHistory: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const patientIdParam = searchParams.get('patientId');
    const doctorIdParam = searchParams.get('doctorId');

    // SECURITY ENFORCEMENT: Role-based filtering & ownership verification
    if (session.role === Role.PATIENT) {
      const patientAppts = await prisma.appointment.findMany({
        where: { patientId: session.userId },
        include: {
          doctor: {
            select: {
              id: true,
              specialty: true,
              consultFee: true,
              user: { select: { id: true, name: true } },
            },
          },
          prescriptions: true,
        },
        orderBy: { startTime: 'asc' },
      });
      return NextResponse.json({ success: true, appointments: patientAppts });
    }

    if (session.role === Role.DOCTOR) {
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
          prescriptions: true,
        },
        orderBy: { startTime: 'asc' },
      });
      return NextResponse.json({ success: true, appointments: doctorAppts });
    }

    if (session.role === Role.ADMIN) {
      const whereClause: any = {};
      if (patientIdParam) whereClause.patientId = patientIdParam;
      if (doctorIdParam) whereClause.doctorId = doctorIdParam;

      const allAppts = await prisma.appointment.findMany({
        where: whereClause,
        include: {
          patient: { select: { id: true, name: true, email: true } },
          doctor: { select: { id: true, specialty: true, consultFee: true } },
          prescriptions: true,
        },
        orderBy: { startTime: 'asc' },
      });
      return NextResponse.json({ success: true, appointments: allAppts });
    }

    return NextResponse.json({ error: 'Forbidden role' }, { status: 403 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch appointments' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    // Explicit Role Rejection: Doctors cannot book appointments as patients
    if (session.role !== Role.PATIENT && session.role !== Role.ADMIN) {
      return NextResponse.json(
        { error: 'Only patients can book appointments' },
        { status: 403 }
      );
    }

    // Verify session user exists in database
    const sessionUser = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authenticated patient account not found' }, { status: 404 });
    }

    const body = await req.json();
    const validated = ConfirmAppointmentSchema.parse(body);

    if (session.role === Role.PATIENT && validated.patientId && validated.patientId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden: Cannot book appointments for another user' }, { status: 403 });
    }

    const targetPatientId = session.role === Role.PATIENT ? session.userId : (validated.patientId || session.userId);

    // If holdId is provided, validate hold status, ownership, and pass exact holdId to transaction
    if (validated.holdId) {
      const hold = await prisma.slotHold.findUnique({ where: { id: validated.holdId } });
      if (!hold) {
        return NextResponse.json({ error: 'Appointment hold expired' }, { status: 400 });
      }

      if (hold.expiresAt <= new Date()) {
        return NextResponse.json({ error: 'Appointment hold expired' }, { status: 400 });
      }

      if (hold.patientId !== targetPatientId) {
        return NextResponse.json({ error: 'Appointment hold belongs to another patient' }, { status: 403 });
      }

      const doctorProfile = await prisma.doctorProfile.findUnique({ where: { id: hold.doctorId } });
      if (!doctorProfile) {
        return NextResponse.json({ error: 'Doctor profile not found' }, { status: 404 });
      }

      const appt = await confirmAppointmentTransaction(
        targetPatientId,
        hold.doctorId,
        hold.startTime.toISOString(),
        hold.endTime.toISOString(),
        validated.symptoms,
        undefined,
        hold.id
      );
      return NextResponse.json({ success: true, appointment: appt });
    }

    // Direct booking parameters check
    if (!validated.doctorId || !validated.startTime || !validated.endTime) {
      return NextResponse.json({ error: 'Missing appointment slot parameters' }, { status: 400 });
    }

    const doctorProfile = await prisma.doctorProfile.findUnique({ where: { id: validated.doctorId } });
    if (!doctorProfile) {
      return NextResponse.json({ error: 'Doctor profile not found' }, { status: 404 });
    }

    const appt = await confirmAppointmentTransaction(
      targetPatientId,
      validated.doctorId,
      validated.startTime,
      validated.endTime,
      validated.symptoms
    );

    return NextResponse.json({ success: true, appointment: appt });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    const rawMsg = err.message || '';
    if (rawMsg.includes('Patient or Doctor profile not found')) {
      return NextResponse.json({ error: 'Authenticated patient account not found' }, { status: 404 });
    }
    return NextResponse.json({ error: rawMsg || 'Failed to confirm appointment' }, { status: 400 });
  }
}
