import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { Role } from '@/lib/types';
import { syncPerUserCalendarEvents } from '@/lib/calendar/perUserCalendarService';
import { z } from 'zod';

const CancelAppointmentSchema = z.object({
  reason: z.string().optional().default('Cancelled by user'),
});

export async function POST(req: Request, context?: any) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    const appointmentId = context?.params?.id;
    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const validated = CancelAppointmentSchema.parse(body);

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        doctor: { include: { user: true } },
      },
    });

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment record not found' }, { status: 404 });
    }

    if (appointment.status === 'COMPLETED') {
      return NextResponse.json({ error: 'Cannot cancel a completed consultation' }, { status: 400 });
    }

    if (appointment.status === 'CANCELLED') {
      return NextResponse.json({
        success: true,
        alreadyCancelled: true,
        message: 'Appointment is already cancelled',
        appointment,
      });
    }

    let isAuthorized = false;
    if (session.role === Role.ADMIN) {
      isAuthorized = true;
    } else if (session.role === Role.PATIENT && appointment.patientId === session.userId) {
      isAuthorized = true;
    } else if (session.role === Role.DOCTOR && appointment.doctorId === session.doctorId) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden: You do not have permission to cancel this appointment' }, { status: 403 });
    }

    const updatedAppointment = await prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: 'CANCELLED',
          cancellationReason: validated.reason,
        },
      });

      const doctorName = appointment.doctor.user.name;
      const patientName = appointment.patient.name;
      const startTimeIso = appointment.startTime.toISOString();

      await tx.notificationLog.create({
        data: {
          idempotencyKey: `appointment_cancelled_patient_${appointmentId}`,
          recipient: appointment.patient.email,
          channel: 'EMAIL',
          template: 'APPOINTMENT_CANCELLED_PATIENT',
          payload: JSON.stringify({
            appointmentId,
            patientName,
            doctorName,
            startTime: startTimeIso,
            reason: validated.reason,
          }),
          status: 'QUEUED',
        },
      });

      await tx.notificationLog.create({
        data: {
          idempotencyKey: `appointment_cancelled_doctor_${appointmentId}`,
          recipient: appointment.doctor.user.email,
          channel: 'EMAIL',
          template: 'APPOINTMENT_CANCELLED_DOCTOR',
          payload: JSON.stringify({
            appointmentId,
            patientName,
            doctorName,
            startTime: startTimeIso,
            reason: validated.reason,
          }),
          status: 'QUEUED',
        },
      });

      await tx.notificationLog.create({
        data: {
          idempotencyKey: `appointment_calendar_delete_${appointmentId}`,
          recipient: appointment.doctor.user.email,
          channel: 'CALENDAR',
          template: 'CALENDAR_DELETE_EVENT',
          payload: JSON.stringify({
            appointmentId,
            calendarEventId: appointment.calendarEventId || undefined,
          }),
          status: 'QUEUED',
        },
      });

      return appt;
    });

    // Trigger Per-User Google Calendar Deletion asynchronously
    syncPerUserCalendarEvents('DELETE', appointmentId).catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Appointment cancelled successfully. Notifications queued.',
      appointment: updatedAppointment,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Failed to cancel appointment' }, { status: 400 });
  }
}
