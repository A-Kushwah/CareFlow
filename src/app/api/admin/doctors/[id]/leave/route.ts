import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { Role } from '@/lib/types';
import { z } from 'zod';

const AdminDoctorLeaveSchema = z.object({
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  reason: z.string().min(1, 'Reason is required'),
});

export async function POST(req: Request, context?: any) {
  try {
    const session = await getSession(req);
    if (!session || session.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Forbidden: Admin authorization required' }, { status: 403 });
    }

    const doctorProfileId = context?.params?.id;
    const body = await req.json();
    const validated = AdminDoctorLeaveSchema.parse(body);

    const profile = await prisma.doctorProfile.findUnique({
      where: { id: doctorProfileId },
      include: { user: true },
    });

    if (!profile) {
      return NextResponse.json({ error: 'Doctor profile not found' }, { status: 404 });
    }

    const leaveStart = new Date(validated.startDate);
    const leaveEnd = new Date(validated.endDate);
    leaveEnd.setHours(23, 59, 59, 999);

    if (isNaN(leaveStart.getTime()) || isNaN(leaveEnd.getTime())) {
      return NextResponse.json({ error: 'Invalid start or end date' }, { status: 400 });
    }

    if (leaveEnd < leaveStart) {
      return NextResponse.json({ error: 'End date cannot be before start date' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const leaveRecord = await tx.doctorLeave.create({
        data: {
          doctorId: doctorProfileId,
          startDate: leaveStart,
          endDate: leaveEnd,
          reason: validated.reason,
          status: 'APPROVED',
        },
      });

      const conflictingAppts = await tx.appointment.findMany({
        where: {
          doctorId: doctorProfileId,
          status: 'CONFIRMED',
          startTime: { lte: leaveEnd },
          endTime: { gte: leaveStart },
        },
        include: {
          patient: true,
          doctor: { include: { user: true } },
        },
      });

      let cancelledCount = 0;
      for (const appt of conflictingAppts) {
        await tx.appointment.update({
          where: { id: appt.id },
          data: {
            status: 'CANCELLED',
            cancellationReason: `Cancelled due to doctor leave: ${validated.reason}`,
          },
        });
        cancelledCount++;

        const doctorName = appt.doctor.user.name;
        const patientName = appt.patient.name;
        const startTimeIso = appt.startTime.toISOString();

        await tx.notificationLog.create({
          data: {
            idempotencyKey: `appointment_cancelled_patient_${appt.id}`,
            recipient: appt.patient.email,
            channel: 'EMAIL',
            template: 'APPOINTMENT_CANCELLED_PATIENT',
            payload: JSON.stringify({
              appointmentId: appt.id,
              patientName,
              doctorName,
              startTime: startTimeIso,
              reason: `Doctor is on approved leave (${validated.reason})`,
            }),
            status: 'QUEUED',
          },
        });

        await tx.notificationLog.create({
          data: {
            idempotencyKey: `appointment_cancelled_doctor_${appt.id}`,
            recipient: appt.doctor.user.email,
            channel: 'EMAIL',
            template: 'APPOINTMENT_CANCELLED_DOCTOR',
            payload: JSON.stringify({
              appointmentId: appt.id,
              patientName,
              doctorName,
              startTime: startTimeIso,
              reason: `Leave submitted (${validated.reason})`,
            }),
            status: 'QUEUED',
          },
        });

        await tx.notificationLog.create({
          data: {
            idempotencyKey: `appointment_calendar_delete_${appt.id}`,
            recipient: appt.doctor.user.email,
            channel: 'CALENDAR',
            template: 'CALENDAR_DELETE_EVENT',
            payload: JSON.stringify({
              appointmentId: appt.id,
              calendarEventId: appt.calendarEventId || undefined,
            }),
            status: 'QUEUED',
          },
        });
      }

      return { leaveRecord, cancelledCount };
    });

    return NextResponse.json({
      success: true,
      leave: result.leaveRecord,
      cancelledAppointmentsCount: result.cancelledCount,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Failed to submit leave' }, { status: 400 });
  }
}
