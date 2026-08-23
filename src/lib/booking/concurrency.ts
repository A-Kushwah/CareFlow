import { prisma } from '../prisma';
import { AppointmentStatus, LeaveStatus, NotificationChannel, NotificationStatus } from '../types';
import { processOutboxNotifications } from '../notifications/processor';

export async function createSlotHold(doctorId: string, patientId: string, startTimeISO: string, endTimeISO: string) {
  const startTime = new Date(startTimeISO);
  const endTime = new Date(endTimeISO);

  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    throw new Error('Invalid start or end time');
  }

  // Clean expired holds first
  await prisma.slotHold.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });

  // Verify doctor exists before creating hold
  const doctor = await prisma.doctorProfile.findUnique({ where: { id: doctorId } });
  if (!doctor) {
    throw new Error('Doctor profile not found');
  }

  // Verify patient exists before creating hold
  const patient = await prisma.user.findUnique({ where: { id: patientId } });
  if (!patient) {
    throw new Error('Authenticated patient account not found');
  }

  // Check collision with confirmed appointments or existing active holds
  const apptCollision = await prisma.appointment.findFirst({
    where: {
      doctorId,
      status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.HELD] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });

  if (apptCollision) {
    throw new Error('Slot is already booked or reserved by another patient');
  }

  const holdCollision = await prisma.slotHold.findFirst({
    where: {
      doctorId,
      expiresAt: { gt: new Date() },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });

  if (holdCollision && holdCollision.patientId !== patientId) {
    throw new Error('Slot is currently held by another patient during checkout');
  }

  // 5 minute hold duration
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  const hold = await prisma.slotHold.create({
    data: {
      doctorId,
      patientId,
      startTime,
      endTime,
      expiresAt,
    },
  });

  return hold;
}

export async function confirmAppointmentTransaction(
  patientId: string,
  doctorId: string,
  startTimeISO: string,
  endTimeISO: string,
  symptoms?: string,
  aiPreSummary?: string,
  holdId?: string
) {
  const startTime = new Date(startTimeISO);
  const endTime = new Date(endTimeISO);

  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    throw new Error('Invalid appointment timing');
  }

  const appointment = await prisma.$transaction(async (tx) => {
    // 1. If holdId is provided, re-verify hold existence and validity INSIDE transaction
    if (holdId) {
      const activeHold = await tx.slotHold.findUnique({ where: { id: holdId } });
      if (!activeHold || activeHold.expiresAt <= new Date()) {
        throw new Error('Appointment hold expired');
      }
      if (activeHold.patientId !== patientId) {
        throw new Error('Appointment hold belongs to another patient');
      }
    }

    // 2. Re-check doctor leave status
    const leaveConflict = await tx.doctorLeave.findFirst({
      where: {
        doctorId,
        status: LeaveStatus.APPROVED,
        startDate: { lte: endTime },
        endDate: { gte: startTime },
      },
    });

    if (leaveConflict) {
      throw new Error(`Cannot book: Doctor is on approved leave (${leaveConflict.reason})`);
    }

    // 3. Lock & re-check overlapping confirmed/held appointments
    const apptConflict = await tx.appointment.findFirst({
      where: {
        doctorId,
        status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.HELD] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (apptConflict) {
      throw new Error('CONCURRENCY_CONFLICT: Slot was booked by another patient simultaneously.');
    }

    // 4. Verify Patient Existence & Role
    const patient = await tx.user.findUnique({ where: { id: patientId } });
    if (!patient) {
      throw new Error('Authenticated patient account not found');
    }

    // 5. Verify Doctor Existence
    const doctor = await tx.doctorProfile.findUnique({
      where: { id: doctorId },
      include: { user: true },
    });

    if (!doctor) {
      throw new Error('Doctor profile not found');
    }

    // 6. Create Confirmed Appointment
    const appt = await tx.appointment.create({
      data: {
        patientId,
        doctorId,
        startTime,
        endTime,
        status: AppointmentStatus.CONFIRMED,
        symptoms: symptoms || null,
        aiPreSummary: aiPreSummary || null,
      },
    });

    // 7. Atomically delete the exact confirmed hold (or all matching slot holds)
    if (holdId) {
      await tx.slotHold.deleteMany({
        where: { id: holdId },
      });
    } else {
      await tx.slotHold.deleteMany({
        where: {
          doctorId,
          startTime,
          endTime,
        },
      });
    }

    // 8a. Enqueue Patient Confirmation Email
    const patientEmailPayload = JSON.stringify({
      appointmentId: appt.id,
      patientName: patient.name,
      patientEmail: patient.email,
      doctorName: doctor.user.name,
      startTime: appt.startTime.toISOString(),
      symptoms: symptoms || 'N/A',
    });

    await tx.notificationLog.create({
      data: {
        idempotencyKey: `appointment_confirmed_patient_${appt.id}`,
        recipient: patient.email,
        channel: NotificationChannel.EMAIL,
        template: 'APPOINTMENT_CONFIRMED_PATIENT',
        payload: patientEmailPayload,
        status: NotificationStatus.QUEUED,
        attempts: 0,
        nextRetryAt: new Date(),
      },
    });

    // 8b. Enqueue Doctor Confirmation Email
    const doctorEmailPayload = JSON.stringify({
      appointmentId: appt.id,
      patientName: patient.name,
      patientEmail: patient.email,
      doctorName: doctor.user.name,
      doctorEmail: doctor.user.email,
      startTime: appt.startTime.toISOString(),
      symptoms: symptoms || 'N/A',
    });

    await tx.notificationLog.create({
      data: {
        idempotencyKey: `appointment_confirmed_doctor_${appt.id}`,
        recipient: doctor.user.email,
        channel: NotificationChannel.EMAIL,
        template: 'APPOINTMENT_CONFIRMED_DOCTOR',
        payload: doctorEmailPayload,
        status: NotificationStatus.QUEUED,
        attempts: 0,
        nextRetryAt: new Date(),
      },
    });

    // 9. Enqueue Legacy Outbox Notification
    const calendarPayload = JSON.stringify({
      appointmentId: appt.id,
      patientName: patient.name,
      patientEmail: patient.email,
      doctorName: doctor.user.name,
      doctorEmail: doctor.user.email,
      startTime: appt.startTime.toISOString(),
      endTime: appt.endTime.toISOString(),
      summary: `Medical Consultation: ${patient.name} with ${doctor.user.name}`,
    });

    await tx.notificationLog.create({
      data: {
        idempotencyKey: `appointment_calendar_create_${appt.id}`,
        recipient: doctor.user.email,
        channel: NotificationChannel.CALENDAR,
        template: 'CALENDAR_CREATE_EVENT',
        payload: calendarPayload,
        status: NotificationStatus.QUEUED,
        attempts: 0,
        nextRetryAt: new Date(),
      },
    });

    // 10. Enqueue Durable Per-User Google Calendar Sync Outbox Job
    await tx.notificationLog.create({
      data: {
        idempotencyKey: `appointment_calendar_per_user_create_${appt.id}`,
        recipient: appt.id,
        channel: NotificationChannel.CALENDAR,
        template: 'CALENDAR_PER_USER_CREATE',
        payload: JSON.stringify({ appointmentId: appt.id }),
        status: NotificationStatus.QUEUED,
        attempts: 0,
        nextRetryAt: new Date(),
      },
    });

    return appt;
  });

  // Trigger outbox processing worker
  processOutboxNotifications().catch(() => {});

  return appointment;
}
