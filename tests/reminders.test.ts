import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { createMedicationReminder, processMedicationReminders } from '../src/lib/reminders/service';

test('Medication Reminders: Creation & Deduplicated Processing', async () => {
  const patient = await prisma.user.findFirst({ where: { role: 'PATIENT' } });
  assert.ok(patient, 'Patient must exist');

  const startDate = new Date(Date.now() - 86400000); // 1 day ago
  const endDate = new Date(Date.now() + 86400000 * 7); // 7 days future

  const reminder = await createMedicationReminder(
    patient.id,
    'Amoxicillin',
    '500mg',
    'Once daily',
    startDate.toISOString(),
    endDate.toISOString()
  );

  assert.ok(reminder.id, 'Reminder must be created');

  // First processing run should dispatch notification
  const run1 = await processMedicationReminders();
  assert.ok(run1.dispatchedCount >= 1, 'At least 1 reminder must be dispatched');

  // Immediate second processing run should be suppressed by deduplication guard
  const run2 = await processMedicationReminders();
  assert.equal(run2.dispatchedCount, 0, 'Second run within 24h window must be deduplicated (0 dispatched)');
});
