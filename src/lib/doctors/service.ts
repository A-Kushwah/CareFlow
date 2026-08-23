import { prisma } from '../prisma';
import { AppointmentStatus, LeaveStatus, NotificationChannel, NotificationStatus } from '../types';

export async function getDoctorCatalog() {
  const doctors = await prisma.doctorProfile.findMany({
    where: {
      isPublished: true,
      isTestFixture: false,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      workingHours: true,
      leaves: {
        where: {
          endDate: { gte: new Date() },
          status: LeaveStatus.APPROVED,
        },
      },
    },
  });

  return doctors.map((doc) => ({
    id: doc.id,
    userId: doc.userId,
    name: doc.user.name,
    email: doc.user.email,
    specialty: doc.specialty,
    consultFee: doc.consultFee,
    slotDurationMin: doc.slotDurationMin,
    bufferTimeMin: doc.bufferTimeMin,
    workingHours: doc.workingHours,
    activeLeaves: doc.leaves,
  }));
}

export async function getDoctorById(doctorId: string) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: doctorId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      workingHours: true,
      leaves: true,
    },
  });

  if (!doctor) return null;

  return {
    id: doctor.id,
    userId: doctor.userId,
    name: doctor.user.name,
    email: doctor.user.email,
    specialty: doctor.specialty,
    consultFee: doctor.consultFee,
    slotDurationMin: doctor.slotDurationMin,
    bufferTimeMin: doctor.bufferTimeMin,
    workingHours: doctor.workingHours,
    leaves: doctor.leaves,
  };
}

export async function applyDoctorLeave(
  doctorId: string,
  startDateISO: string,
  endDateISO: string,
  reason: string
) {
  const startDate = new Date(startDateISO);
  const endDate = new Date(endDateISO);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error('Invalid leave start or end date');
  }

  if (startDate >= endDate) {
    throw new Error('Leave start date must be before end date');
  }

  // 1. Create Doctor Leave record
  const leave = await prisma.doctorLeave.create({
    data: {
      doctorId,
      startDate,
      endDate,
      reason,
      status: LeaveStatus.APPROVED,
    },
  });

  // 2. Query all future CONFIRMED or HELD appointments for this doctor falling within the leave range
  const conflictingAppointments = await prisma.appointment.findMany({
    where: {
      doctorId,
      status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.HELD] },
      startTime: { lte: endDate },
      endTime: { gte: startDate },
    },
    include: {
      patient: true,
      doctor: { include: { user: true } },
    },
  });

  const cancelledAppointmentIds: string[] = [];
  const queuedNotifications: any[] = [];

  for (const appt of conflictingAppointments) {
    await prisma.appointment.update({
      where: { id: appt.id },
      data: {
        status: AppointmentStatus.CANCELLED,
        cancellationReason: `Cancelled due to doctor leave: ${reason}`,
      },
    });
    cancelledAppointmentIds.push(appt.id);

    const doctorName = appt.doctor.user.name;
    const patientName = appt.patient.name;
    const startTimeIso = appt.startTime.toISOString();

    // 1. Enqueue Patient Cancellation Email
    const patientNotif = await prisma.notificationLog.create({
      data: {
        idempotencyKey: `appointment_cancelled_patient_${appt.id}`,
        recipient: appt.patient.email,
        channel: NotificationChannel.EMAIL,
        template: 'APPOINTMENT_CANCELLED_PATIENT',
        payload: JSON.stringify({
          appointmentId: appt.id,
          patientName,
          doctorName,
          startTime: startTimeIso,
          reason: `Doctor is on leave: ${reason}`,
        }),
        status: NotificationStatus.QUEUED,
        attempts: 0,
        nextRetryAt: new Date(),
      },
    });

    // 2. Enqueue Doctor Cancellation Email
    const doctorNotif = await prisma.notificationLog.create({
      data: {
        idempotencyKey: `appointment_cancelled_doctor_${appt.id}`,
        recipient: appt.doctor.user.email,
        channel: NotificationChannel.EMAIL,
        template: 'APPOINTMENT_CANCELLED_DOCTOR',
        payload: JSON.stringify({
          appointmentId: appt.id,
          patientName,
          doctorName,
          startTime: startTimeIso,
          reason: `Leave submitted: ${reason}`,
        }),
        status: NotificationStatus.QUEUED,
        attempts: 0,
        nextRetryAt: new Date(),
      },
    });

    // 3. Enqueue Calendar Delete Event
    const calNotif = await prisma.notificationLog.create({
      data: {
        idempotencyKey: `appointment_calendar_delete_${appt.id}`,
        recipient: appt.doctor.user.email,
        channel: NotificationChannel.CALENDAR,
        template: 'CALENDAR_DELETE_EVENT',
        payload: JSON.stringify({
          appointmentId: appt.id,
          calendarEventId: appt.calendarEventId || undefined,
        }),
        status: NotificationStatus.QUEUED,
        attempts: 0,
        nextRetryAt: new Date(),
      },
    });

    queuedNotifications.push(patientNotif.id, doctorNotif.id, calNotif.id);
  }

  return {
    leave,
    conflictingCount: conflictingAppointments.length,
    cancelledAppointmentIds,
    queuedNotificationCount: queuedNotifications.length,
  };
}
