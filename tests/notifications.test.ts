import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { calculateExponentialBackoff, processOutboxNotifications } from '../src/lib/notifications/processor';
import { NotificationChannel, NotificationStatus } from '../src/lib/types';

test('Notification Outbox: Exponential Backoff Formula', () => {
  const backoff1 = calculateExponentialBackoff(1);
  const backoff2 = calculateExponentialBackoff(2);
  const backoff3 = calculateExponentialBackoff(3);

  assert.ok(backoff1.getTime() > Date.now(), 'Backoff 1 must be in future');
  assert.ok(backoff2.getTime() > backoff1.getTime(), 'Attempt 2 delay must exceed attempt 1');
  assert.ok(backoff3.getTime() > backoff2.getTime(), 'Attempt 3 delay must exceed attempt 2');
});

test('Notification Outbox: Process Queued Jobs', async () => {
  const job = await prisma.notificationLog.create({
    data: {
      recipient: 'test.patient@example.com',
      channel: NotificationChannel.EMAIL,
      template: 'TEST_APPOINTMENT_CONFIRMED',
      payload: JSON.stringify({ patientName: 'Test Patient' }),
      status: NotificationStatus.QUEUED,
      attempts: 0,
      nextRetryAt: new Date(Date.now() - 1000), // Ready to process
    },
  });

  const result = await processOutboxNotifications(10);
  assert.ok(result.processedCount >= 1, 'At least 1 job must be processed');

  const updatedJob = await prisma.notificationLog.findUnique({ where: { id: job.id } });
  assert.equal(updatedJob?.status, NotificationStatus.SENT, 'Job must transition to SENT on success');
  assert.equal(updatedJob?.attempts, 1, 'Attempt count must increment to 1');
});

test('Notification Outbox: DLQ Transition on Max Retry Exceeded', async () => {
  const maxJob = await prisma.notificationLog.create({
    data: {
      recipient: 'invalid-email-address',
      channel: 'INVALID_CHANNEL', // Force failure
      template: 'TEST_FAIL',
      payload: '{}',
      status: NotificationStatus.FAILED,
      attempts: 4, // Max is 5, so next failure hits DLQ
      maxAttempts: 5,
      nextRetryAt: new Date(Date.now() - 1000),
    },
  });

  const result = await processOutboxNotifications(10);
  const updatedMaxJob = await prisma.notificationLog.findUnique({ where: { id: maxJob.id } });
  
  assert.equal(updatedMaxJob?.status, NotificationStatus.DLQ, 'Job reaching maxAttempts must transition to DLQ');
});
