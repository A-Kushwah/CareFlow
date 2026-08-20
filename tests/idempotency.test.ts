import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { processOutboxNotifications, LEASE_DURATION_MS } from '../src/lib/notifications/processor';
import { NotificationChannel, NotificationStatus } from '../src/lib/types';

test('Notification Outbox: Idempotency Key Duplicate Prevention', async () => {
  const uniqueKey = `idempotent_test_${Date.now()}`;

  // First insert with idempotency key
  await prisma.notificationLog.create({
    data: {
      idempotencyKey: uniqueKey,
      recipient: 'idempotent.patient@example.com',
      channel: NotificationChannel.EMAIL,
      template: 'TEST_IDEMPOTENT',
      payload: '{}',
      status: NotificationStatus.QUEUED,
    },
  });

  // Attempting second insert with exact same idempotencyKey must throw unique constraint error
  await assert.rejects(
    async () => {
      await prisma.notificationLog.create({
        data: {
          idempotencyKey: uniqueKey,
          recipient: 'idempotent.patient@example.com',
          channel: NotificationChannel.EMAIL,
          template: 'TEST_IDEMPOTENT',
          payload: '{}',
          status: NotificationStatus.QUEUED,
        },
      });
    },
    /Unique constraint failed|UNIQUE constraint failed/,
    'Duplicate idempotencyKey insertion must be rejected at database schema level'
  );
});

test('Notification Outbox: Atomic Job Claiming Race Condition Safety', async () => {
  // Clean queued notifications before test
  await prisma.notificationLog.deleteMany({
    where: { status: { in: [NotificationStatus.QUEUED, NotificationStatus.FAILED] } },
  });

  // Create 5 queued jobs
  const jobIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const job = await prisma.notificationLog.create({
      data: {
        idempotencyKey: `race_job_${Date.now()}_${i}`,
        recipient: `race.user.${i}@example.com`,
        channel: NotificationChannel.EMAIL,
        template: 'RACE_TEST',
        payload: '{}',
        status: NotificationStatus.QUEUED,
        nextRetryAt: new Date(Date.now() - 1000),
      },
    });
    jobIds.push(job.id);
  }

  // Execute 3 concurrent outbox processors simultaneously
  const results = await Promise.all([
    processOutboxNotifications(10),
    processOutboxNotifications(10),
    processOutboxNotifications(10),
  ]);

  const totalProcessedSum = results.reduce((sum, r) => sum + r.processedCount, 0);

  // Each of the 5 jobs should be processed exactly once across all 3 workers
  assert.equal(totalProcessedSum, 5, 'Atomic job claiming must ensure total processed jobs equal exactly 5 with 0 duplicates');
});

test('Notification Outbox: Stale Processing Job Lease Recovery', async () => {
  // Create a job stuck in PROCESSING state with claimedAt past 6 minutes ago (exceeding 5-min lease)
  const staleJob = await prisma.notificationLog.create({
    data: {
      idempotencyKey: `stale_job_${Date.now()}`,
      recipient: 'stale.worker@example.com',
      channel: NotificationChannel.EMAIL,
      template: 'STALE_LEASE_RECOVERY',
      payload: '{}',
      status: NotificationStatus.PROCESSING,
      claimToken: 'crashed-worker-old-token-999',
      claimedAt: new Date(Date.now() - (LEASE_DURATION_MS + 60000)), // 6 minutes ago
      attempts: 1,
    },
  });

  // Worker run should detect and reclaim stale job
  const result = await processOutboxNotifications(10);
  assert.ok(result.successes >= 1, 'Stale job past lease threshold must be reclaimed and processed');

  const updatedJob = await prisma.notificationLog.findUnique({ where: { id: staleJob.id } });
  assert.equal(updatedJob?.status, NotificationStatus.SENT, 'Stale job must transition to SENT');
  assert.notEqual(updatedJob?.claimToken, 'crashed-worker-old-token-999', 'Claim token must be updated by new worker');
});
