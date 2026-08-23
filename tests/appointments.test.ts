import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { confirmAppointmentTransaction, createSlotHold } from '../src/lib/booking/concurrency';
import { registerUser, authenticateUser } from '../src/lib/auth/service';
import { createSessionToken } from '../src/lib/auth/session';
import { Role } from '../src/lib/types';
import { POST as postHoldHandler } from '../src/app/api/appointments/hold/route';
import { POST as confirmApptHandler } from '../src/app/api/appointments/route';
import { cleanTestFixtures } from './helpers/cleanup';

test.after(async () => {
  await cleanTestFixtures();
});

test('1. Double-Booking Concurrency Prevention', async () => {
  const doctor = await prisma.doctorProfile.findFirst({ include: { user: true } });
  const patient1 = await prisma.user.findFirst({ where: { role: 'PATIENT' } });

  assert.ok(doctor, 'Doctor must exist');
  assert.ok(patient1, 'Patient 1 must exist');

  const patient2 = await prisma.user.create({
    data: {
      email: `patient.test.${Date.now()}@example.com`,
      passwordHash: 'hash',
      name: 'Test Patient 2',
      role: 'PATIENT',
      isTestFixture: true,
    },
  });

  const uniqueDayOffset = 30 + Math.floor(Math.random() * 50);
  const startTime = new Date(Date.now() + 86400000 * uniqueDayOffset);
  startTime.setHours(11, 0, 0, 0);
  const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

  await prisma.appointment.deleteMany({
    where: { doctorId: doctor.id, startTime, endTime },
  });

  const results = await Promise.allSettled([
    confirmAppointmentTransaction(patient1.id, doctor.id, startTime.toISOString(), endTime.toISOString(), 'Headache'),
    confirmAppointmentTransaction(patient2.id, doctor.id, startTime.toISOString(), endTime.toISOString(), 'Fever'),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  assert.equal(fulfilled.length, 1, 'Exactly 1 concurrent booking request must succeed');
  assert.equal(rejected.length, 1, 'Exactly 1 concurrent booking request must be rejected');
});

test('2. Slot Hold Expiry Behavior', async () => {
  const doctor = await prisma.doctorProfile.findFirst();
  const patient = await prisma.user.findFirst({ where: { role: 'PATIENT' } });

  assert.ok(doctor, 'Doctor must exist');
  assert.ok(patient, 'Patient must exist');

  const startTime = new Date(Date.now() + 86400000 * 6);
  startTime.setHours(14, 0, 0, 0);
  const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

  await prisma.slotHold.create({
    data: {
      doctorId: doctor.id,
      patientId: patient.id,
      startTime,
      endTime,
      expiresAt: new Date(Date.now() - 60000),
    },
  });

  const newHold = await createSlotHold(doctor.id, patient.id, startTime.toISOString(), endTime.toISOString());
  assert.ok(newHold.id, 'New slot hold must succeed over an expired hold');
});

test('3. Doctor Leave Conflict Exclusion', async () => {
  const doctor = await prisma.doctorProfile.findFirst();
  const patient = await prisma.user.findFirst({ where: { role: 'PATIENT' } });

  assert.ok(doctor, 'Doctor must exist');
  assert.ok(patient, 'Patient must exist');

  const leaveStart = new Date(Date.now() + 86400000 * 20);
  leaveStart.setHours(0, 0, 0, 0);
  const leaveEnd = new Date(leaveStart.getTime() + 86400000 * 2);
  leaveEnd.setHours(23, 59, 59, 999);

  await prisma.doctorLeave.create({
    data: {
      doctorId: doctor.id,
      startDate: leaveStart,
      endDate: leaveEnd,
      reason: 'Medical Seminar',
      status: 'APPROVED',
    },
  });

  const apptStart = new Date(leaveStart.getTime() + 3600000 * 10);
  const apptEnd = new Date(apptStart.getTime() + 1800000);

  await assert.rejects(
    async () => {
      await confirmAppointmentTransaction(patient.id, doctor.id, apptStart.toISOString(), apptEnd.toISOString());
    },
    (err: any) => err.message.includes('on approved leave'),
    'Booking during doctor leave must be rejected with leave error'
  );
});

test('4. Doctor Session Role Rejection on Booking Endpoint', async () => {
  const docUser = await registerUser(`doctor.book.${Date.now()}@carepulse.com`, 'pass123', 'Dr. Book', Role.DOCTOR, true);
  const token = createSessionToken({
    userId: docUser.id,
    email: docUser.email,
    name: docUser.name,
    role: docUser.role,
  });

  const req = new Request('http://localhost:3000/api/appointments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `carepulse_session=${token}`,
    },
    body: JSON.stringify({
      doctorId: 'doc-1',
      startTime: new Date(Date.now() + 86400000 * 110).toISOString(),
      endTime: new Date(Date.now() + 86400000 * 110 + 1800000).toISOString(),
    }),
  });

  const res = await confirmApptHandler(req);
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.error, 'Only patients can book appointments');
});

test('5. Exact HoldId Atomic Consumption', async () => {
  const doctor = await prisma.doctorProfile.findFirst();
  const patient = await registerUser(`atomic.patient.${Date.now()}@example.com`, 'pass123', 'Atomic Patient', Role.PATIENT, true);
  assert.ok(doctor, 'Doctor must exist');

  const startTime = new Date(Date.now() + 86400000 * 150);
  const endTime = new Date(startTime.getTime() + 1800000);

  await prisma.appointment.deleteMany({
    where: { doctorId: doctor.id, startTime, endTime },
  });

  const hold = await prisma.slotHold.create({
    data: {
      doctorId: doctor.id,
      patientId: patient.id,
      startTime,
      endTime,
      expiresAt: new Date(Date.now() + 300000),
    },
  });

  await confirmAppointmentTransaction(
    patient.id,
    doctor.id,
    startTime.toISOString(),
    endTime.toISOString(),
    'Symptoms test',
    undefined,
    hold.id
  );

  const remainingHold = await prisma.slotHold.findUnique({ where: { id: hold.id } });
  assert.equal(remainingHold, null, 'Exact holdId record must be deleted upon confirmation');
});
