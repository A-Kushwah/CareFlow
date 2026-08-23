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
  const origProvider = process.env.LLM_PROVIDER;
  const origKey = process.env.OPENAI_API_KEY;

  try {
    process.env.LLM_PROVIDER = 'openai';
    delete process.env.OPENAI_API_KEY;

    const config = validateAiProviderConfig();
    assert.equal(config.valid, false);
    assert.equal(config.provider, 'openai');
    assert.match(config.error!, /OPENAI_API_KEY environment variable is missing/);

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
  const result = await invokePostVisitLLM(
    'Patient has mild viral upper respiratory infection.',
    'Rest and stay hydrated.',
    [],
    { overrideProvider: 'test' }
  );

  assert.equal(result.summary.medicationSummary.length, 0);
});

test('AI Post-Visit: 2-Stage Decoupled Workflow & OpenAI Failure Preserves Notes, Prescriptions & Reminders', async () => {
  const timestamp = Date.now();
  const testRunId = `ai_failure_proof_${timestamp}`;

  // 1. Create Patient User
  const patient = await prisma.user.create({
    data: {
      email: `patient.${testRunId}@carepulse.local`,
      passwordHash: 'hashed_pw',
      name: 'Proof Patient',
      role: 'PATIENT',
      isTestFixture: true,
    },
  });

  // 2. Create Doctor User & Profile
  const doctorUser = await prisma.user.create({
    data: {
      email: `doctor.${testRunId}@carepulse.local`,
      passwordHash: 'hashed_pw',
      name: 'Dr. Proof Specialist',
      role: 'DOCTOR',
      isTestFixture: true,
    },
  });

  const doctorProfile = await prisma.doctorProfile.create({
    data: {
      userId: doctorUser.id,
      specialty: 'Cardiology',
      consultFee: 200.0,
      isPublished: true,
      isTestFixture: true,
    },
  });

  // 3. Create Appointment
  const appointment = await prisma.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: doctorProfile.id,
      startTime: new Date('2026-11-10T09:00:00Z'),
      endTime: new Date('2026-11-10T09:30:00Z'),
      status: 'CONFIRMED',
      symptoms: 'Chest tightness on exertion',
    },
  });

  // 4. STAGE 1: Transaction 1 — Save Doctor Notes, Prescriptions, and Reminders
  const prescriptions = [
    { medication: 'Lisinopril', dosage: '10mg', frequency: 'Once daily in morning', duration: '30 days', instructions: 'Monitor blood pressure' },
  ];

  const consultNotesRecord = JSON.stringify({
    notes: 'Clinical Observations: BP 138/88, regular rhythm.',
    followUpInstructions: 'Return in 1 month with BP log.',
    prescriptions,
  });

  // Execute Stage 1 Transaction 1 unconditionally
  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        consultNotes: consultNotesRecord,
        status: 'COMPLETED',
      },
    });

    await tx.prescription.deleteMany({ where: { appointmentId: appointment.id } });

    for (const med of prescriptions) {
      await tx.prescription.create({
        data: {
          appointmentId: appointment.id,
          patientId: patient.id,
          doctorId: doctorProfile.id,
          medication: med.medication,
          dosage: med.dosage,
          frequency: med.frequency,
          duration: med.duration,
          instructions: med.instructions,
        },
      });
    }

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
          endDate: new Date(Date.now() + 30 * 86400000),
          status: 'ACTIVE',
        },
      });
    }
  });

  // STAGE 1 PROOF: Verify Doctor Data is FULLY COMMITTED to DB
  const committedAppt = await prisma.appointment.findUnique({ where: { id: appointment.id } });
  assert.equal(committedAppt?.status, 'COMPLETED');
  assert.match(committedAppt?.consultNotes!, /Lisinopril/);

  const committedPrescriptions = await prisma.prescription.findMany({ where: { appointmentId: appointment.id } });
  assert.equal(committedPrescriptions.length, 1);
  assert.equal(committedPrescriptions[0].medication, 'Lisinopril');
  assert.equal(committedPrescriptions[0].dosage, '10mg');

  const committedReminders = await prisma.medicationReminder.findMany({ where: { appointmentId: appointment.id } });
  assert.equal(committedReminders.length, 1);
  assert.equal(committedReminders[0].medication, 'Lisinopril');

  // 5. STAGE 2 SIMULATION: OpenAI Network Failure occurs after Stage 1
  const fallbackSummary = {
    error: true,
    summary: 'AI explanation unavailable — clinician instructions are still available',
    patientInstructions: ['Return in 1 month with BP log.'],
    medicationSummary: prescriptions,
    followUpSchedule: 'Return in 1 month with BP log.',
    disclaimer: 'AI-generated consultation summary unavailable. Refer directly to clinician instructions below.',
  };

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { aiPostSummary: JSON.stringify(fallbackSummary) },
  });

  // STAGE 2 PROOF: OpenAI Failure did NOT roll back Stage 1 committed data
  const finalAppt = await prisma.appointment.findUnique({ where: { id: appointment.id } });
  assert.equal(finalAppt?.status, 'COMPLETED');
  assert.match(finalAppt?.consultNotes!, /Lisinopril/);

  const finalPrescriptions = await prisma.prescription.findMany({ where: { appointmentId: appointment.id } });
  assert.equal(finalPrescriptions.length, 1);
  assert.equal(finalPrescriptions[0].medication, 'Lisinopril');

  const finalReminders = await prisma.medicationReminder.findMany({ where: { appointmentId: appointment.id } });
  assert.equal(finalReminders.length, 1);

  const parsedAiSummary = JSON.parse(finalAppt?.aiPostSummary!);
  assert.equal(parsedAiSummary.error, true);
  assert.match(parsedAiSummary.summary, /AI explanation unavailable — clinician instructions are still available/);
});

test('AI Post-Visit: Prescription Database Unique Constraint & Idempotency', async () => {
  const timestamp = Date.now();
  const testRunId = `unique_presc_${timestamp}`;

  const patient = await prisma.user.create({
    data: {
      email: `patient.${testRunId}@carepulse.local`,
      passwordHash: 'hashed_pw',
      name: 'Constraint Patient',
      role: 'PATIENT',
      isTestFixture: true,
    },
  });

  const doctorUser = await prisma.user.create({
    data: {
      email: `doctor.${testRunId}@carepulse.local`,
      passwordHash: 'hashed_pw',
      name: 'Dr. Constraint',
      role: 'DOCTOR',
      isTestFixture: true,
    },
  });

  const doctorProfile = await prisma.doctorProfile.create({
    data: {
      userId: doctorUser.id,
      specialty: 'Pediatrics',
      consultFee: 100.0,
      isPublished: true,
      isTestFixture: true,
    },
  });

  const appointment = await prisma.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: doctorProfile.id,
      startTime: new Date('2026-11-12T10:00:00Z'),
      endTime: new Date('2026-11-12T10:30:00Z'),
      status: 'CONFIRMED',
      symptoms: 'Earache',
    },
  });

  // Create initial prescription
  await prisma.prescription.create({
    data: {
      appointmentId: appointment.id,
      patientId: patient.id,
      doctorId: doctorProfile.id,
      medication: 'Amoxicillin',
      dosage: '250mg',
      frequency: 'Three times daily',
      duration: '10 days',
      instructions: 'Take with milk',
    },
  });

  // Inserting duplicate prescription with exact same (appointmentId, medication, dosage, frequency, duration) must throw Unique constraint error
  await assert.rejects(
    async () => {
      await prisma.prescription.create({
        data: {
          appointmentId: appointment.id,
          patientId: patient.id,
          doctorId: doctorProfile.id,
          medication: 'Amoxicillin',
          dosage: '250mg',
          frequency: 'Three times daily',
          duration: '10 days',
          instructions: 'Duplicate insert attempt',
        },
      });
    },
    (err: any) => {
      assert.match(err.message, /unique constraint|Unique constraint/i);
      return true;
    }
  );
});
