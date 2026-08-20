import { prisma } from '../prisma';
import { AppointmentStatus, AvailableSlot, LeaveStatus } from '../types';

export async function getAvailableSlots(doctorId: string, dateString: string): Promise<{ date: string; slots: AvailableSlot[]; message?: string }> {
  const targetDate = new Date(dateString);
  if (isNaN(targetDate.getTime())) {
    throw new Error('Invalid date format. Use YYYY-MM-DD');
  }

  const dayOfWeek = targetDate.getDay(); // 0 = Sun, 1 = Mon ...

  // 1. Check if doctor is on approved leave on this date
  const leave = await prisma.doctorLeave.findFirst({
    where: {
      doctorId,
      status: LeaveStatus.APPROVED,
      startDate: { lte: new Date(`${dateString}T23:59:59.999Z`) },
      endDate: { gte: new Date(`${dateString}T00:00:00.000Z`) },
    },
  });

  if (leave) {
    return {
      date: dateString,
      slots: [],
      message: `Doctor is on approved leave: ${leave.reason}`,
    };
  }

  // 2. Fetch Doctor Profile & Working Hours
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: doctorId },
    include: {
      workingHours: {
        where: { dayOfWeek },
      },
    },
  });

  if (!doctor || doctor.workingHours.length === 0) {
    return {
      date: dateString,
      slots: [],
      message: 'Doctor does not have scheduled working hours for this day.',
    };
  }

  const workingHour = doctor.workingHours[0];
  const { startTime, endTime, breakStartTime, breakEndTime } = workingHour;
  const slotDuration = doctor.slotDurationMin;
  const bufferTime = doctor.bufferTimeMin;

  // 3. Fetch existing CONFIRMED & HELD appointments for this day
  const dayStart = new Date(`${dateString}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateString}T23:59:59.999Z`);

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      doctorId,
      status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.HELD] },
      startTime: { lte: dayEnd },
      endTime: { gte: dayStart },
    },
  });

  // 4. Fetch active unexpired slot holds
  const activeHolds = await prisma.slotHold.findMany({
    where: {
      doctorId,
      expiresAt: { gt: new Date() },
      startTime: { lte: dayEnd },
      endTime: { gte: dayStart },
    },
  });

  // 5. Generate Candidate Slots
  const candidateSlots: AvailableSlot[] = [];
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  let cursor = new Date(targetDate);
  cursor.setHours(startHour, startMin, 0, 0);

  const workEnd = new Date(targetDate);
  workEnd.setHours(endHour, endMin, 0, 0);

  while (cursor < workEnd) {
    const slotStart = new Date(cursor);
    const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);

    if (slotEnd > workEnd) break;

    // Check if slot falls inside Break Time
    let isBreak = false;
    if (breakStartTime && breakEndTime) {
      const [bStartH, bStartM] = breakStartTime.split(':').map(Number);
      const [bEndH, bEndM] = breakEndTime.split(':').map(Number);
      const bStart = new Date(targetDate);
      bStart.setHours(bStartH, bStartM, 0, 0);
      const bEnd = new Date(targetDate);
      bEnd.setHours(bEndH, bEndM, 0, 0);

      if (slotStart < bEnd && slotEnd > bStart) {
        isBreak = true;
      }
    }

    if (!isBreak) {
      // Check collision with appointments
      const hasApptCollision = existingAppointments.some(
        (appt) => appt.startTime < slotEnd && appt.endTime > slotStart
      );

      // Check collision with holds
      const hasHoldCollision = activeHolds.some(
        (hold) => hold.startTime < slotEnd && hold.endTime > slotStart
      );

      const isAvailable = !hasApptCollision && !hasHoldCollision;

      candidateSlots.push({
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        doctorId,
        isAvailable,
        reason: isAvailable
          ? undefined
          : hasApptCollision
          ? 'Booked'
          : 'Hold in progress',
      });
    }

    // Move cursor forward by slot duration + buffer
    cursor = new Date(slotEnd.getTime() + bufferTime * 60 * 1000);
  }

  return {
    date: dateString,
    slots: candidateSlots,
  };
}
