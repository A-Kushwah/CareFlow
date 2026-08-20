import { prisma } from '../prisma';
import { NotificationChannel, NotificationStatus } from '../types';

export async function createMedicationReminder(
  patientId: string,
  medication: string,
  dosage: string,
  frequency: string,
  startDateISO: string,
  endDateISO: string
) {
  const startDate = new Date(startDateISO);
  const endDate = new Date(endDateISO);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error('Invalid medication reminder start or end date');
  }

  const reminder = await prisma.medicationReminder.create({
    data: {
      patientId,
      medication,
      dosage,
      frequency,
      startDate,
      endDate,
      status: 'ACTIVE',
    },
  });

  return reminder;
}

export async function processMedicationReminders() {
  const now = new Date();

  // Query active reminders within current date range
  const activeReminders = await prisma.medicationReminder.findMany({
    where: {
      status: 'ACTIVE',
      startDate: { lte: now },
      endDate: { gte: now },
    },
  });

  let dispatchedCount = 0;
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  for (const reminder of activeReminders) {
    // Deduplication guard: Check if lastSentAt was within past 24h
    if (reminder.lastSentAt && reminder.lastSentAt > twentyFourHoursAgo) {
      continue;
    }

    const patient = await prisma.user.findUnique({ where: { id: reminder.patientId } });
    if (!patient) continue;

    const payload = JSON.stringify({
      reminderId: reminder.id,
      patientName: patient.name,
      medication: reminder.medication,
      dosage: reminder.dosage,
      frequency: reminder.frequency,
    });

    // Enqueue Outbox notification
    await prisma.notificationLog.create({
      data: {
        recipient: patient.email,
        channel: NotificationChannel.EMAIL,
        template: 'MEDICATION_REMINDER',
        payload,
        status: NotificationStatus.QUEUED,
        attempts: 0,
        nextRetryAt: now,
      },
    });

    // Update lastSentAt timestamp
    await prisma.medicationReminder.update({
      where: { id: reminder.id },
      data: { lastSentAt: now },
    });

    dispatchedCount++;
  }

  return { dispatchedCount, totalActive: activeReminders.length };
}
