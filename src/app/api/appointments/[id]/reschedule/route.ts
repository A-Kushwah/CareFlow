import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { Role } from '@/lib/types';
import { processOutboxNotifications } from '@/lib/notifications/processor';
import { z } from 'zod';

const RescheduleAppointmentSchema = z.object({
  newStartTime: z.string().min(1, 'New start time is required'),
  newEndTime: z.string().min(1, 'New end time is required'),
  reason: z.string().optional().default('Rescheduled by user'),
});

export async function POST(req: Request, context?: any) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    const appointmentId = context?.params?.id;
    const body = await req.json();
    const validated = RescheduleAppointmentSchema.parse(body);

    const newStart = new Date(validated.newStartTime);
    const newEnd = new Date(validated.newEndTime);

    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newStart >= newEnd) {
      return NextResponse.json({ error: 'Invalid new start or end time range' }, { status: 400 });
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        doctor: { include: { user: true, workingHours: true } },
      },
    });

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment record not found' }, { status: 404 });
    }

    if (appointment.status === 'COMPLETED') {
      return NextResponse.json({ error: 'Cannot reschedule a completed consultation' }, { status: 400 });
    }

    if (appointment.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Cannot reschedule a cancelled appointment' }, { status: 400 });
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
      return NextResponse.json({ error: 'Forbidden: You do not have permission to reschedule this appointment' }, { status: 403 });
    }

    if (appointment.startTime.getTime() === newStart.getTime() && appointment.endTime.getTime() === newEnd.getTime()) {
      return NextResponse.json({
        success: true,
        alreadyRescheduled: true,
        message: 'Appointment is already scheduled for this slot',
        appointment,
      });
    }

    const leaveConflict = await prisma.doctorLeave.findFirst({
      where: {
        doctorId: appointment.doctorId,
        status: 'APPROVED',
        startDate: { lte: newEnd },
        endDate: { gte: newStart },
      },
    });

    if (leaveConflict) {
      return NextResponse.json({ error: `Cannot reschedule: Doctor is on leave (${leaveConflict.reason})` }, { status: 400 });
    }

    const dayOfWeek = newStart.getDay();
    const matchingHours = appointment.doctor.workingHours.find((wh) => wh.dayOfWeek === dayOfWeek);

    if (matchingHours) {
      const formatHHMM = (d: Date) => {
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
      };

      const slotStartHHMM = formatHHMM(newStart);
      const slotEndHHMM = formatHHMM(newEnd);

      if (slotStartHHMM < matchingHours.startTime || slotEndHHMM > matchingHours.endTime) {
        return NextResponse.json({
          error: `Reschedule time (${slotStartHHMM}–${slotEndHHMM}) is outside doctor working hours (${matchingHours.startTime}–${matchingHours.endTime})`,
        }, { status: 400 });
      }
    }

    const apptOverlap = await prisma.appointment.findFirst({
      where: {
        doctorId: appointment.doctorId,
        id: { not: appointmentId },
        status: { in: ['CONFIRMED', 'HELD'] },
        startTime: { lt: newEnd },
        endTime: { gt: newStart },
      },
    });

    if (apptOverlap) {
      return NextResponse.json({ error: 'Target slot is already booked by another patient' }, { status: 400 });
    }

    const updatedAppointment = await prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          startTime: newStart,
          endTime: newEnd,
          status: 'CONFIRMED',
        },
      });

      const timestampKey = newStart.getTime();
      const doctorName = appointment.doctor.user.name;
      const patientName = appointment.patient.name;

      await tx.notificationLog.create({
        data: {
          idempotencyKey: `appointment_rescheduled_patient_${appointmentId}_${timestampKey}`,
          recipient: appointment.patient.email,
          channel: 'EMAIL',
          template: 'APPOINTMENT_RESCHEDULED_PATIENT',
          payload: JSON.stringify({
            appointmentId,
            patientName,
            doctorName,
            newStartTime: newStart.toISOString(),
            newEndTime: newEnd.toISOString(),
            reason: validated.reason,
          }),
          status: 'QUEUED',
        },
      });

      await tx.notificationLog.create({
        data: {
          idempotencyKey: `appointment_rescheduled_doctor_${appointmentId}_${timestampKey}`,
          recipient: appointment.doctor.user.email,
          channel: 'EMAIL',
          template: 'APPOINTMENT_RESCHEDULED_DOCTOR',
          payload: JSON.stringify({
            appointmentId,
            patientName,
            doctorName,
            newStartTime: newStart.toISOString(),
            newEndTime: newEnd.toISOString(),
            reason: validated.reason,
          }),
          status: 'QUEUED',
        },
      });

      await tx.notificationLog.create({
        data: {
          idempotencyKey: `appointment_calendar_update_${appointmentId}_${timestampKey}`,
          recipient: appointment.doctor.user.email,
          channel: 'CALENDAR',
          template: 'CALENDAR_UPDATE_EVENT',
          payload: JSON.stringify({
            appointmentId,
            calendarEventId: appointment.calendarEventId || undefined,
            newStartTime: newStart.toISOString(),
            newEndTime: newEnd.toISOString(),
            summary: `Rescheduled Consultation: ${patientName} with ${doctorName}`,
          }),
          status: 'QUEUED',
        },
      });

      // Enqueue Durable Per-User Google Calendar Update Outbox Job
      await tx.notificationLog.create({
        data: {
          idempotencyKey: `appointment_calendar_per_user_update_${appointmentId}_${timestampKey}`,
          recipient: appointmentId,
          channel: 'CALENDAR',
          template: 'CALENDAR_PER_USER_UPDATE',
          payload: JSON.stringify({ appointmentId }),
          status: 'QUEUED',
        },
      });

      return appt;
    });

    // Trigger Outbox Processor
    processOutboxNotifications().catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Appointment rescheduled successfully. Notifications queued.',
      appointment: updatedAppointment,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Failed to reschedule appointment' }, { status: 400 });
  }
}
