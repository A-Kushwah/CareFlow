import test from 'node:test';
import assert from 'node:assert/strict';
import { invokePreVisitLLM, invokePostVisitLLM, checkAiRateLimitPersistent, hashInput } from '../src/lib/ai/adapter';
import { redactPHI, validateAiProviderConfig } from '../src/lib/ai/openaiProvider';
import { prisma } from '../src/lib/prisma';
import { registerUser } from '../src/lib/auth/service';
import { createSessionToken } from '../src/lib/auth/session';
import { Role } from '../src/lib/types';
import { POST as postVisitRouteHandler } from '../src/app/api/ai/post-visit/route';
import { cleanTestFixtures } from './helpers/cleanup';

test.after(async () => {
  await cleanTestFixtures();
});

test('AI Module: Provider Configuration Validation at Startup', async () => {
  const config = validateAiProviderConfig();
  assert.ok(config.valid, 'Provider configuration check must return valid for test/mock setup');
});

test('AI Module: Pre-Visit Intake with Strict Schema Contract Validation (Exactly 3 Questions)', async () => {
  const symptoms = 'Dark skin rashes on left arm with severe itching for 3 days';
  const result = await invokePreVisitLLM(symptoms, { overrideProvider: 'test' });

  assert.ok(result.summary.urgencyLevel, 'Must return validated urgency level');
  assert.ok(result.summary.chiefComplaint, 'Must return chief complaint');
  assert.equal(result.summary.suggestedQuestions.length, 3, 'Must return exactly 3 suggested clinical questions');
  assert.ok(result.summary.disclaimer.includes('not a diagnosis'), 'Must include medical disclaimer');
  assert.equal(result.provider, 'test');
  assert.ok(result.auditId, 'Must create an audit log record');
});

test('AI Module: Audit Record Persistence in AiGenerationLog', async () => {
  const symptoms = 'Persistent migraine and photosensitivity';
  const result = await invokePreVisitLLM(symptoms, { overrideProvider: 'test' });

  const log = await prisma.aiGenerationLog.findUnique({
    where: { id: result.auditId },
  });

  assert.ok(log, 'Audit record must be saved in database');
  assert.equal(log?.action, 'PRE_VISIT');
  assert.equal(log?.status, 'SUCCESS');
  assert.equal(log?.inputHash, hashInput(symptoms));
});

test('AI Module: Post-Visit Summary does not invent non-existent medications', async () => {
  const notes = 'Patient examined for seasonal allergies. Advised bed rest, hydration, and salt water gargle.';
  const result = await invokePostVisitLLM(notes, { overrideProvider: 'test' });

  assert.ok(Array.isArray(result.summary.patientInstructions), 'Must return patient instructions');
  assert.equal(result.summary.medicationSummary.length, 0, 'Must NOT invent medications not explicitly written in doctor notes');
});

test('AI Module: Security Ownership — Doctor cannot generate post-visit for another doctor appointment', async () => {
  const docUser1 = await registerUser(`doc1.ai.${Date.now()}@carepulse.com`, 'pass123', 'Dr. One', Role.DOCTOR);
  const docProfile1 = await prisma.doctorProfile.create({
    data: { userId: docUser1.id, specialty: 'Dermatology', consultFee: 120 },
  });

  const docUser2 = await registerUser(`doc2.ai.${Date.now()}@carepulse.com`, 'pass123', 'Dr. Two', Role.DOCTOR);
  const docProfile2 = await prisma.doctorProfile.create({
    data: { userId: docUser2.id, specialty: 'General', consultFee: 100 },
  });

  const patient = await registerUser(`pat.ai.${Date.now()}@example.com`, 'pass123', 'AI Patient', Role.PATIENT);

  const appt = await prisma.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: docProfile1.id,
      startTime: new Date('2026-11-01T09:00:00Z'),
      endTime: new Date('2026-11-01T09:30:00Z'),
      status: 'CONFIRMED',
      symptoms: 'Eczema flare-up',
    },
  });

  const tokenDoc2 = createSessionToken({
    userId: docUser2.id,
    email: docUser2.email,
    name: docUser2.name,
    role: docUser2.role,
    doctorId: docProfile2.id,
  });

  const req = new Request('http://localhost:3000/api/ai/post-visit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `carepulse_session=${tokenDoc2}`,
    },
    body: JSON.stringify({
      appointmentId: appt.id,
      notes: 'Doctor 2 attempting unauthorized edit',
    }),
  });

  const res = await postVisitRouteHandler(req);
  assert.equal(res.status, 403, 'Doctor attempting post-visit summary for another doctor appointment must be rejected with 403 Forbidden');
});

test('AI Module: Database-Backed Rate Limiting & PHI Redaction Guard', async () => {
  const emailRedacted = redactPHI('Contact patient at alex.rivera@example.com or 555-123-4567');
  assert.ok(emailRedacted.includes('[REDACTED_EMAIL]'), 'Email address must be redacted from logs');
  assert.ok(emailRedacted.includes('[REDACTED_PHONE]'), 'Phone number must be redacted from logs');

  const testKey = `rate-limit-test-${Date.now()}`;
  for (let i = 0; i < 10; i++) {
    const allowed = await checkAiRateLimitPersistent(testKey);
    assert.equal(allowed, true);
  }
  const blocked = await checkAiRateLimitPersistent(testKey);
  assert.equal(blocked, false, '11th request must exceed rate limit');
});
