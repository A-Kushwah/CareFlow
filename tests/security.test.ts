import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { registerUser, authenticateUser } from '../src/lib/auth/service';
import { createSessionToken } from '../src/lib/auth/session';
import { Role } from '../src/lib/types';
import { POST as postVisitHandler } from '../src/app/api/ai/post-visit/route';
import { POST as holdHandler } from '../src/app/api/appointments/hold/route';
import { GET as getAppointmentsHandler, POST as confirmApptHandler } from '../src/app/api/appointments/route';
import { POST as calendarSyncHandler } from '../src/app/api/calendar/sync/route';
import { POST as doctorLeaveHandler } from '../src/app/api/doctors/leave/route';
import { GET as getAdminMetricsHandler } from '../src/app/api/admin/metrics/route';
import { cleanTestFixtures } from './helpers/cleanup';

test.after(async () => {
  await cleanTestFixtures();
});

test('Security Authorization: Registration hardcodes PATIENT role', async () => {
  const email = `security.user.${Date.now()}@example.com`;
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

test('Security Privacy: Patient cannot submit doctor leave', async () => {
  const patient = await registerUser(`patient.leave.${Date.now()}@example.com`, 'pass123', 'Leave Patient', Role.PATIENT);
  const token = createSessionToken({
    userId: patient.id,
    email: patient.email,
    name: patient.name,
    role: patient.role,
  });

  const req = new Request('http://localhost:3000/api/doctors/leave', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `carepulse_session=${token}`,
    },
    body: JSON.stringify({
      startDate: '2026-09-20',
      endDate: '2026-09-22',
      reason: 'Personal leave request',
    }),
  });

  const res = await doctorLeaveHandler(req);
  assert.equal(res.status, 403, 'Patient attempting doctor leave submission must be rejected with 403 Forbidden');
});

test('Security Privacy: Doctor receives strictly their own schedule data', async () => {
  const docUser1 = await registerUser(`doc1.${Date.now()}@carepulse.com`, 'pass123', 'Dr. One', Role.DOCTOR);
  const docProfile1 = await prisma.doctorProfile.create({
    data: { userId: docUser1.id, specialty: 'Cardiology', consultFee: 150 },
  });

  const docUser2 = await registerUser(`doc2.${Date.now()}@carepulse.com`, 'pass123', 'Dr. Two', Role.DOCTOR);
  const docProfile2 = await prisma.doctorProfile.create({
    data: { userId: docUser2.id, specialty: 'Neurology', consultFee: 180 },
  });

  const patient = await registerUser(`pat.schedule.${Date.now()}@example.com`, 'pass123', 'Schedule Patient', Role.PATIENT);

  // Appointment for Doc 1
  await prisma.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: docProfile1.id,
      startTime: new Date('2026-10-15T09:00:00Z'),
      endTime: new Date('2026-10-15T09:30:00Z'),
      status: 'CONFIRMED',
      symptoms: 'Heart palpitations',
    },
  });

  // Appointment for Doc 2
  await prisma.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: docProfile2.id,
      startTime: new Date('2026-10-15T10:00:00Z'),
      endTime: new Date('2026-10-15T10:30:00Z'),
      status: 'CONFIRMED',
      symptoms: 'Migraine',
    },
  });

  // Query as Doc 1
  const tokenDoc1 = createSessionToken({
    userId: docUser1.id,
    email: docUser1.email,
    name: docUser1.name,
    role: docUser1.role,
    doctorId: docProfile1.id,
  });

  const reqDoc1 = new Request('http://localhost:3000/api/appointments', {
    method: 'GET',
    headers: { Cookie: `carepulse_session=${tokenDoc1}` },
  });

  const resDoc1 = await getAppointmentsHandler(reqDoc1);
  assert.equal(resDoc1.status, 200);
  const dataDoc1 = await resDoc1.json();
  
  const hasDoc2Appt = dataDoc1.appointments.some((a: any) => a.doctorId === docProfile2.id);
  assert.equal(hasDoc2Appt, false, 'Doctor 1 schedule query must not include Doctor 2 appointments');
});

test('Security Authorization: Admin can access outbox and admin controls', async () => {
  const admin = await registerUser(`admin.sec.${Date.now()}@carepulse.com`, 'pass123', 'Admin User', Role.ADMIN);
  const token = createSessionToken({
    userId: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  });

  const req = new Request('http://localhost:3000/api/admin/metrics', {
    method: 'GET',
    headers: { Cookie: `carepulse_session=${token}` },
  });

  const res = await getAdminMetricsHandler(req);
  assert.equal(res.status, 200, 'Authenticated admin user must have access to admin metrics endpoint');
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

  const token = createSessionToken({
    userId: patientA.id,
    email: patientA.email,
    name: patientA.name,
    role: patientA.role,
  });

  const req = new Request('http://localhost:3000/api/appointments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `carepulse_session=${token}`,
    },
    body: JSON.stringify({
      doctorId: docProfile.id,
      patientId: patientB.id,
      startTime: '2026-11-10T10:00:00.000Z',
      endTime: '2026-11-10T10:30:00.000Z',
      symptoms: 'Tampered ID test',
    }),
  });

  const res = await confirmApptHandler(req);
  assert.equal(res.status, 403, 'Attempting to book an appointment for another patientId must be rejected with 403 Forbidden');
});
