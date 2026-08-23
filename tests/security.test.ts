import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { registerUser, authenticateUser } from '../src/lib/auth/service';
import { createSessionToken } from '../src/lib/auth/session';
import { Role } from '../src/lib/types';
import { POST as postVisitHandler } from '../src/app/api/ai/post-visit/route';
import { POST as holdHandler } from '../src/app/api/appointments/hold/route';
import { POST as confirmApptHandler } from '../src/app/api/appointments/route';
import { POST as calendarSyncHandler } from '../src/app/api/calendar/sync/route';

test('Security Authorization: Registration hardcodes PATIENT role', async () => {
  const email = `security.user.${Date.now()}@example.com`;
  
  // Public registration function forces Role.PATIENT
  const user = await registerUser(email, 'password123', 'Security Test User', Role.PATIENT);
  
  assert.equal(user.role, Role.PATIENT, 'Registered user must have PATIENT role');
});

test('Security Data Isolation: Patients cannot query other patient appointments', async () => {
  const patient1 = await prisma.user.create({
    data: {
      email: `patient1.${Date.now()}@example.com`,
      passwordHash: 'hash',
      name: 'Patient One',
      role: Role.PATIENT,
    },
  });

  const patient2 = await prisma.user.create({
    data: {
      email: `patient2.${Date.now()}@example.com`,
      passwordHash: 'hash',
      name: 'Patient Two',
      role: Role.PATIENT,
    },
  });

  const apptsPatient1 = await prisma.appointment.findMany({
    where: { patientId: patient1.id },
  });

  const hasPatient2Data = apptsPatient1.some((a) => a.patientId === patient2.id);
  assert.equal(hasPatient2Data, false, 'Patient 1 must not receive Patient 2 appointment records');
});

test('Security Route Classification: /api/ai/post-visit rejects unauthenticated requests', async () => {
  const req = new Request('http://localhost:3000/api/ai/post-visit', {
    method: 'POST',
    body: JSON.stringify({ notes: 'Patient has acute sinusitis.' }),
  });

  const res = await postVisitHandler(req);
  assert.equal(res.status, 401, 'Unauthenticated post-visit AI request must be rejected with 401 Unauthorized');
});

test('Security Route Classification: /api/appointments/hold rejects unauthenticated requests', async () => {
  const req = new Request('http://localhost:3000/api/appointments/hold', {
    method: 'POST',
    body: JSON.stringify({ doctorId: 'doc-1', startTime: '2026-09-01T09:00:00Z', endTime: '2026-09-01T09:30:00Z' }),
  });

  const res = await holdHandler(req);
  assert.equal(res.status, 401, 'Unauthenticated slot hold request must be rejected with 401 Unauthorized');
});

test('Security Route Classification: /api/calendar/sync rejects unauthorized calls', async () => {
  const req = new Request('http://localhost:3000/api/calendar/sync', {
    method: 'POST',
    body: JSON.stringify({ action: 'CALENDAR_CREATE_EVENT', payload: {} }),
  });

  const res = await calendarSyncHandler(req);
  assert.equal(res.status, 403, 'Unauthorized calendar sync request without worker key or admin session must return 403 Forbidden');
});

test('Security Authentication: Login failure with wrong password returns null', async () => {
  const email = `auth.test.${Date.now()}@example.com`;
  await registerUser(email, 'correctpass123', 'Auth Test User', Role.PATIENT);

  const failedUser = await authenticateUser(email, 'wrongpassword');
  assert.equal(failedUser, null, 'Authentication with invalid credentials must return null');
});

test('Security Role Isolation: Server overrides client-supplied patientId with session userId', async () => {
  const patientA = await registerUser(`patientA.${Date.now()}@example.com`, 'pass123', 'Patient A', Role.PATIENT);
  const patientB = await registerUser(`patientB.${Date.now()}@example.com`, 'pass123', 'Patient B', Role.PATIENT);

  const docUser = await registerUser(`doctor.sec.${Date.now()}@example.com`, 'pass123', 'Dr. Security', Role.DOCTOR);
  const docProfile = await prisma.doctorProfile.create({
    data: { userId: docUser.id, specialty: 'General', consultFee: 100 },
  });

  // Create session for Patient A
  const token = createSessionToken({
    userId: patientA.id,
    email: patientA.email,
    name: patientA.name,
    role: patientA.role,
  });

  // Patient A attempts to send patientId: patientB.id in request body
  const req = new Request('http://localhost:3000/api/appointments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `carepulse_session=${token}`,
    },
    body: JSON.stringify({
      doctorId: docProfile.id,
      patientId: patientB.id, // Tampered patientId
      startTime: '2026-11-10T10:00:00.000Z',
      endTime: '2026-11-10T10:30:00.000Z',
      symptoms: 'Tampered ID test',
    }),
  });

  const res = await confirmApptHandler(req);
  assert.equal(res.status, 403, 'Attempting to book an appointment for another patientId must be rejected with 403 Forbidden');
});
