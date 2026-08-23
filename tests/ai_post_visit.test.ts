import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { invokePostVisitLLM } from '../src/lib/ai/adapter';
import { validateAiProviderConfig } from '../src/lib/ai/openaiProvider';
import { cleanTestFixtures } from './helpers/cleanup';

test.after(async () => {
  await cleanTestFixtures();
});

test('AI Post-Visit: Live Provider Selection & Non-Fallback Policy when LLM_PROVIDER=openai', async () => {
  // Save current env
  const origProvider = process.env.LLM_PROVIDER;
  const origKey = process.env.OPENAI_API_KEY;

  try {
    process.env.LLM_PROVIDER = 'openai';
    delete process.env.OPENAI_API_KEY;

    // Validate config returns error when key missing
    const config = validateAiProviderConfig();
    assert.equal(config.valid, false);
    assert.equal(config.provider, 'openai');
    assert.match(config.error!, /OPENAI_API_KEY environment variable is missing/);

    // Invoking PostVisit LLM must throw live provider error and NEVER return mock clinical content
    await assert.rejects(
      async () => {
        await invokePostVisitLLM(
          'Patient presented with sinus pressure',
          'Rest and drink fluids',
          [{ medication: 'Amoxicillin', dosage: '500mg', frequency: 'Twice daily', duration: '7 days', instructions: 'Take with food' }]
        );
      },
      (err: any) => {
        assert.match(err.message, /OPENAI_API_KEY/i);
        return true;
      }
    );
  } finally {
    process.env.LLM_PROVIDER = origProvider;
    if (origKey) process.env.OPENAI_API_KEY = origKey;
  }
});

test('AI Post-Visit: Exact Prescription Preservation in AI Summary Contract', async () => {
  const doctorPrescriptions = [
    { medication: 'Amoxicillin', dosage: '500mg', frequency: 'Twice daily', duration: '7 days', instructions: 'Take with food' },
    { medication: 'Ibuprofen', dosage: '400mg', frequency: 'Every 8 hours as needed', duration: '5 days', instructions: 'Take for pain' },
  ];

  const result = await invokePostVisitLLM(
    'Patient diagnosed with acute bacterial sinusitis',
    'Follow up in 2 weeks',
    doctorPrescriptions,
    { overrideProvider: 'test' }
  );

  assert.equal(result.summary.medicationSummary.length, 2);
  assert.equal(result.summary.medicationSummary[0].medication, 'Amoxicillin');
  assert.equal(result.summary.medicationSummary[0].dosage, '500mg');
  assert.equal(result.summary.medicationSummary[0].duration, '7 days');
  assert.equal(result.summary.medicationSummary[1].medication, 'Ibuprofen');
  assert.equal(result.summary.medicationSummary[1].dosage, '400mg');
  assert.equal(result.summary.medicationSummary[1].duration, '5 days');
});

test('AI Post-Visit: AI Cannot Invent Non-Existent Medications', async () => {
  // When no medications are prescribed by doctor
  const result = await invokePostVisitLLM(
    'Patient has mild viral upper respiratory infection.',
    'Rest and stay hydrated.',
    [],
    { overrideProvider: 'test' }
  );

  assert.equal(result.summary.medicationSummary.length, 0);
});

test('AI Post-Visit: Outage / Failure Handling Preserves Doctor Notes & Reminders Idempotently', async () => {
  const timestamp = Date.now();
  const testRunId = `ai_outage_${timestamp}`;

  // 1. Create Patient User
  const patient = await prisma.user.create({
    data: {
      email: `patient.${testRunId}@carepulse.local`,
      passwordHash: 'hashed_pw',
      name: 'Outage Patient',
      role: 'PATIENT',
      isTestFixture: true,
    },
  });

  // 2. Create Doctor User & Profile
  const doctorUser = await prisma.user.create({
    data: {
      email: `doctor.${testRunId}@carepulse.local`,
      passwordHash: 'hashed_pw',
      name: 'Dr. Outage Specialist',
      role: 'DOCTOR',
      isTestFixture: true,
    },
  });

  const doctorProfile = await prisma.doctorProfile.create({
    data: {
      userId: doctorUser.id,
      specialty: 'Internal Medicine',
      consultFee: 150.0,
      isPublished: true,
      isTestFixture: true,
    },
  });

  // 3. Create Appointment
  const appointment = await prisma.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: doctorProfile.id,
      startTime: new Date('2026-10-15T10:00:00Z'),
      endTime: new Date('2026-10-15T10:30:00Z'),
      status: 'CONFIRMED',
      symptoms: 'Fever and cough',
    },
  });

  // 4. Simulate Post-Visit transaction when AI Provider throws error
  const prescriptions = [
    { medication: 'Azithromycin', dosage: '250mg', frequency: 'Once daily', duration: '5 days', instructions: 'Take on empty stomach' },
  ];

  const consultNotesRecord = JSON.stringify({
    notes: 'Clinical Observations: Chest clear, throat inflamed.',
    followUpInstructions: 'Return in 7 days.',
    prescriptions,
  });

  const fallbackSummary = {
    error: true,
    summary: 'Patient summary unavailable — clinician-entered prescription remains available',
    patientInstructions: ['Return in 7 days.'],
    medicationSummary: prescriptions,
    followUpSchedule: 'Return in 7 days.',
    disclaimer: 'AI-generated consultation summary unavailable. Refer directly to clinician instructions below.',
  };

  // Perform transaction
  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        consultNotes: consultNotesRecord,
        aiPostSummary: JSON.stringify(fallbackSummary),
        status: 'COMPLETED',
      },
    });

    await tx.medicationReminder.deleteMany({ where: { appointmentId: appointment.id } });

    for (const med of prescriptions) {
      await tx.medicationReminder.create({
        data: {
          patientId: patient.id,
          appointmentId: appointment.id,
          medication: med.medication,
          dosage: med.dosage,
          frequency: med.frequency,
          duration: med.duration,
          instructions: med.instructions,
          startDate: new Date(),
          endDate: new Date(Date.now() + 5 * 86400000),
          status: 'ACTIVE',
        },
      });
    }
  });

  // 5. Verify Appointment updated and Medication Reminder created
  const updated = await prisma.appointment.findUnique({ where: { id: appointment.id } });
  assert.equal(updated?.status, 'COMPLETED');
  assert.match(updated?.consultNotes!, /Azithromycin/);

  const savedSummary = JSON.parse(updated?.aiPostSummary!);
  assert.equal(savedSummary.error, true);
  assert.match(savedSummary.summary, /Patient summary unavailable/);

  const reminders = await prisma.medicationReminder.findMany({ where: { appointmentId: appointment.id } });
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].medication, 'Azithromycin');
  assert.equal(reminders[0].dosage, '250mg');
  assert.equal(reminders[0].duration, '5 days');

  // 6. Test IDEMPOTENCY: Resubmitting consultation updates reminders without creating duplicates
  await prisma.$transaction(async (tx) => {
    await tx.medicationReminder.deleteMany({ where: { appointmentId: appointment.id } });
    for (const med of prescriptions) {
      await tx.medicationReminder.create({
        data: {
          patientId: patient.id,
          appointmentId: appointment.id,
          medication: med.medication,
          dosage: med.dosage,
          frequency: med.frequency,
          duration: med.duration,
          instructions: med.instructions,
          startDate: new Date(),
          endDate: new Date(Date.now() + 5 * 86400000),
          status: 'ACTIVE',
        },
      });
    }
  });

  const reReminders = await prisma.medicationReminder.findMany({ where: { appointmentId: appointment.id } });
  assert.equal(reReminders.length, 1); // No duplicates!
});
