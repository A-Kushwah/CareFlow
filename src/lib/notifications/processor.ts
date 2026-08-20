import crypto from 'crypto';
import { prisma } from '../prisma';
import { NotificationChannel, NotificationStatus } from '../types';
import { sendEmailNotification } from './emailAdapter';
import { syncCalendarEvent } from '../calendar/googleCalendarAdapter';

export function calculateExponentialBackoff(attempt: number): Date {
  // Base delay: 10 seconds. Formula: 10 * (2 ^ attempt) + random jitter (0-2000ms)
  const baseMs = 10 * 1000 * Math.pow(2, Math.max(0, attempt - 1));
  const jitterMs = Math.floor(Math.random() * 2000);
  const totalDelayMs = baseMs + jitterMs;
  return new Date(Date.now() + totalDelayMs);
}

export async function processOutboxNotifications(limit: number = 20) {
  const now = new Date();
  
  // 1. Fetch pending queued or failed notification jobs ready for retry
  const pendingJobs = await prisma.notificationLog.findMany({
    where: {
      status: { in: [NotificationStatus.QUEUED, NotificationStatus.FAILED] },
      nextRetryAt: { lte: now },
    },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });

  if (pendingJobs.length === 0) {
    return { processedCount: 0, successes: 0, failures: 0, dlqCount: 0 };
  }

  let successes = 0;
  let failures = 0;
  let dlqCount = 0;

  for (const candidate of pendingJobs) {
    // ATOMIC CLAIM STEP: Unique claim token ensures only 1 worker instance can process this row
    const claimToken = crypto.randomUUID();
    const claimResult = await prisma.notificationLog.updateMany({
      where: {
        id: candidate.id,
        status: { in: [NotificationStatus.QUEUED, NotificationStatus.FAILED] },
      },
      data: {
        status: NotificationStatus.PROCESSING,
        claimToken,
        claimedAt: new Date(),
      },
    });

    // If another worker claimed this job in parallel, skip execution
    if (claimResult.count === 0) {
      continue;
    }

    const job = candidate;
    let result: { success: boolean; error?: string } = { success: false };

    try {
      const payloadObj = JSON.parse(job.payload || '{}');

      if (job.channel === NotificationChannel.EMAIL) {
        result = await sendEmailNotification(job.recipient, job.template, payloadObj);
      } else if (job.channel === NotificationChannel.CALENDAR) {
        result = await syncCalendarEvent(job.template, payloadObj);
      } else {
        result = { success: false, error: `Unsupported or unknown notification channel: ${job.channel}` };
      }
    } catch (err: any) {
      result = { success: false, error: err.message || 'Processing exception' };
    }

    if (result.success) {
      // Mark as SENT
      await prisma.notificationLog.update({
        where: { id: job.id },
        data: {
          status: NotificationStatus.SENT,
          attempts: job.attempts + 1,
          updatedAt: new Date(),
        },
      });
      successes++;
    } else {
      const newAttempts = job.attempts + 1;
      const isDLQ = newAttempts >= job.maxAttempts;

      if (isDLQ) {
        // Transition to Dead Letter Queue (DLQ)
        await prisma.notificationLog.update({
          where: { id: job.id },
          data: {
            status: NotificationStatus.DLQ,
            attempts: newAttempts,
            lastError: result.error || 'Max retry attempts exceeded',
            updatedAt: new Date(),
          },
        });
        dlqCount++;
      } else {
        // Calculate exponential backoff for next retry
        const nextRetryAt = calculateExponentialBackoff(newAttempts);
        await prisma.notificationLog.update({
          where: { id: job.id },
          data: {
            status: NotificationStatus.FAILED,
            attempts: newAttempts,
            nextRetryAt,
            lastError: result.error || 'Transient processing failure',
            updatedAt: new Date(),
          },
        });
        failures++;
      }
    }
  }

  return {
    processedCount: successes + failures + dlqCount,
    successes,
    failures,
    dlqCount,
  };
}
