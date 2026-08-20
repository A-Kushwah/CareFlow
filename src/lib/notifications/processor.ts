import crypto from 'crypto';
import { prisma } from '../prisma';
import { NotificationChannel, NotificationStatus } from '../types';
import { sendEmailNotification } from './emailAdapter';
import { syncCalendarEvent } from '../calendar/googleCalendarAdapter';

export const LEASE_DURATION_MS = 5 * 60 * 1000; // 5 minutes processing lease

export function calculateExponentialBackoff(attempt: number): Date {
  const baseMs = 10 * 1000 * Math.pow(2, Math.max(0, attempt - 1));
  const jitterMs = Math.floor(Math.random() * 2000);
  const totalDelayMs = baseMs + jitterMs;
  return new Date(Date.now() + totalDelayMs);
}

export async function processOutboxNotifications(limit: number = 20) {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - LEASE_DURATION_MS);
  
  // 1. Query candidate jobs: QUEUED/FAILED ready for retry OR stale PROCESSING jobs past 5-min lease
  const candidateJobs = await prisma.notificationLog.findMany({
    where: {
      OR: [
        {
          status: { in: [NotificationStatus.QUEUED, NotificationStatus.FAILED] },
          nextRetryAt: { lte: now },
        },
        {
          status: NotificationStatus.PROCESSING,
          claimedAt: { lte: staleThreshold },
        },
      ],
    },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });

  if (candidateJobs.length === 0) {
    return { processedCount: 0, successes: 0, failures: 0, dlqCount: 0, preemptedCount: 0 };
  }

  let successes = 0;
  let failures = 0;
  let dlqCount = 0;
  let preemptedCount = 0;

  for (const candidate of candidateJobs) {
    // 2. ATOMIC CLAIM STEP: Set status=PROCESSING, unique claimToken, and claimedAt=NOW()
    const claimToken = crypto.randomUUID();
    const claimResult = await prisma.notificationLog.updateMany({
      where: {
        id: candidate.id,
        OR: [
          {
            status: { in: [NotificationStatus.QUEUED, NotificationStatus.FAILED] },
            nextRetryAt: { lte: now },
          },
          {
            status: NotificationStatus.PROCESSING,
            claimedAt: { lte: staleThreshold },
          },
        ],
      },
      data: {
        status: NotificationStatus.PROCESSING,
        claimToken,
        claimedAt: now,
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
      const idempotencyKey = job.idempotencyKey || `job_${job.id}`;

      if (job.channel === NotificationChannel.EMAIL) {
        result = await sendEmailNotification(job.recipient, job.template, payloadObj, idempotencyKey);
      } else if (job.channel === NotificationChannel.CALENDAR) {
        result = await syncCalendarEvent(job.template, payloadObj, idempotencyKey);
      } else {
        result = { success: false, error: `Unsupported or unknown notification channel: ${job.channel}` };
      }
    } catch (err: any) {
      result = { success: false, error: err.message || 'Processing exception' };
    }

    // 3. SAFE STATUS UPDATE: Only update status if claimToken still matches (worker was not preempted)
    if (result.success) {
      const updateResult = await prisma.notificationLog.updateMany({
        where: {
          id: job.id,
          claimToken, // Safeguard: Preempted stale workers cannot overwrite reclaimed state
        },
        data: {
          status: NotificationStatus.SENT,
          attempts: job.attempts + 1,
          updatedAt: new Date(),
        },
      });

      if (updateResult.count > 0) {
        successes++;
      } else {
        preemptedCount++;
      }
    } else {
      const newAttempts = job.attempts + 1;
      const isDLQ = newAttempts >= job.maxAttempts;

      if (isDLQ) {
        const updateResult = await prisma.notificationLog.updateMany({
          where: { id: job.id, claimToken },
          data: {
            status: NotificationStatus.DLQ,
            attempts: newAttempts,
            lastError: result.error || 'Max retry attempts exceeded',
            updatedAt: new Date(),
          },
        });
        if (updateResult.count > 0) dlqCount++;
        else preemptedCount++;
      } else {
        const nextRetryAt = calculateExponentialBackoff(newAttempts);
        const updateResult = await prisma.notificationLog.updateMany({
          where: { id: job.id, claimToken },
          data: {
            status: NotificationStatus.FAILED,
            attempts: newAttempts,
            nextRetryAt,
            lastError: result.error || 'Transient processing failure',
            updatedAt: new Date(),
          },
        });
        if (updateResult.count > 0) failures++;
        else preemptedCount++;
      }
    }
  }

  return {
    processedCount: successes + failures + dlqCount,
    successes,
    failures,
    dlqCount,
    preemptedCount,
  };
}
