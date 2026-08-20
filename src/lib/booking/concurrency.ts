import { prisma } from '../prisma';
import { AppointmentStatus, LeaveStatus, NotificationChannel, NotificationStatus } from '../types';

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
  aiPreSummary?: string
) {
  const startTime = new Date(startTimeISO);
  const endTime = new Date(endTimeISO);

  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    throw new Error('Invalid appointment timing');
  }

  // Execute interactive transaction to guarantee isolation
  return await prisma.$transaction(async (tx) => {
    // 1. Re-check doctor leave status
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

    // 2. Lock & re-check overlapping confirmed/held appointments
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

    // 3. Get Patient & Doctor User Details
    const patient = await tx.user.findUnique({ where: { id: patientId } });
    const doctor = await tx.doctorProfile.findUnique({
      where: { id: doctorId },
      include: { user: true },
    });

    if (!patient || !doctor) {
      throw new Error('Patient or Doctor profile not found');
    }

    // 4. Create Confirmed Appointment
    const appointment = await tx.appointment.create({
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

    // 5. Delete any temporary hold for this patient/slot
    await tx.slotHold.deleteMany({
      where: {
        doctorId,
        startTime,
        endTime,
      },
    });

    // 6. Transactionally enqueue Email Notification with Idempotency Key
    const emailPayload = JSON.stringify({
      appointmentId: appointment.id,
      patientName: patient.name,
      patientEmail: patient.email,
      doctorName: doctor.user.name,
      startTime: appointment.startTime.toISOString(),
      symptoms: symptoms || 'N/A',
    });

    await tx.notificationLog.create({
      data: {
        idempotencyKey: `appt_email_confirmed_${appointment.id}`,
        recipient: patient.email,
        channel: NotificationChannel.EMAIL,
        template: 'APPOINTMENT_CONFIRMED',
        payload: emailPayload,
        status: NotificationStatus.QUEUED,
        attempts: 0,
        nextRetryAt: new Date(),
      },
    });

    // 7. Transactionally enqueue Google Calendar Sync Outbox with Idempotency Key
    const calendarPayload = JSON.stringify({
      appointmentId: appointment.id,
      patientName: patient.name,
      patientEmail: patient.email,
      doctorName: doctor.user.name,
      doctorEmail: doctor.user.email,
      startTime: appointment.startTime.toISOString(),
      endTime: appointment.endTime.toISOString(),
      summary: `Medical Consultation: ${patient.name} with ${doctor.user.name}`,
    });

    await tx.notificationLog.create({
      data: {
        idempotencyKey: `appt_calendar_create_${appointment.id}`,
        recipient: doctor.user.email,
        channel: NotificationChannel.CALENDAR,
        template: 'CALENDAR_CREATE_EVENT',
        payload: calendarPayload,
        status: NotificationStatus.QUEUED,
        attempts: 0,
        nextRetryAt: new Date(),
      },
    });

    return appointment;
  });
}
