import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { confirmAppointmentTransaction, createSlotHold } from '../src/lib/booking/concurrency';
import { registerUser, authenticateUser } from '../src/lib/auth/service';
import { createSessionToken } from '../src/lib/auth/session';
import { Role } from '../src/lib/types';
import { POST as postHoldHandler } from '../src/app/api/appointments/hold/route';
import { POST as confirmApptHandler } from '../src/app/api/appointments/route';

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

test('4. Booking Verification: Missing Patient vs Missing Doctor vs Expired Hold', async () => {
  const doctor = await prisma.doctorProfile.findFirst();
  assert.ok(doctor, 'Doctor profile must exist');

  const futureStart = new Date(Date.now() + 86400000 * 90);
  const futureEnd = new Date(futureStart.getTime() + 1800000);

  // A. Missing Patient User
  await assert.rejects(
    async () => {
      await confirmAppointmentTransaction(
        'non-existent-patient-id',
        doctor.id,
        futureStart.toISOString(),
        futureEnd.toISOString()
      );
    },
    (err: any) => err.message === 'Authenticated patient account not found',
    'Must return distinct patient account not found error'
  );

  // B. Missing Doctor Profile
  const patient = await prisma.user.findFirst({ where: { role: 'PATIENT' } });
  assert.ok(patient, 'Patient user must exist');

  await assert.rejects(
    async () => {
      await confirmAppointmentTransaction(
        patient.id,
        'non-existent-doctor-id',
        futureStart.toISOString(),
        futureEnd.toISOString()
      );
    },
    (err: any) => err.message === 'Doctor profile not found',
    'Must return distinct doctor profile not found error'
  );
});

test('5. Booking Verification: Expired Hold & Hold Belonging to Another Patient', async () => {
  const doctor = await prisma.doctorProfile.findFirst();
  const patientA = await registerUser(`patA.hold.${Date.now()}@example.com`, 'pass123', 'Patient A', Role.PATIENT);
  const patientB = await registerUser(`patB.hold.${Date.now()}@example.com`, 'pass123', 'Patient B', Role.PATIENT);

  assert.ok(doctor, 'Doctor profile must exist');

  const startTime = new Date(Date.now() + 86400000 * 95);
  const endTime = new Date(startTime.getTime() + 1800000);

  // Create an expired hold for Patient A
  const expiredHold = await prisma.slotHold.create({
    data: {
      doctorId: doctor.id,
      patientId: patientA.id,
      startTime,
      endTime,
      expiresAt: new Date(Date.now() - 5000),
    },
  });

  const tokenA = createSessionToken({
    userId: patientA.id,
    email: patientA.email,
    name: patientA.name,
    role: patientA.role,
  });

  // Attempt booking with expired hold
  const reqExpired = new Request('http://localhost:3000/api/appointments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `carepulse_session=${tokenA}`,
    },
    body: JSON.stringify({ holdId: expiredHold.id }),
  });

  const resExpired = await confirmApptHandler(reqExpired);
  assert.equal(resExpired.status, 400);
  const dataExpired = await resExpired.json();
  assert.equal(dataExpired.error, 'Appointment hold expired');

  // Create an active hold for Patient A
  const activeHold = await prisma.slotHold.create({
    data: {
      doctorId: doctor.id,
      patientId: patientA.id,
      startTime: new Date(Date.now() + 86400000 * 96),
      endTime: new Date(Date.now() + 86400000 * 96 + 1800000),
      expiresAt: new Date(Date.now() + 300000),
    },
  });

  // Patient B attempts to use Patient A's active hold
  const tokenB = createSessionToken({
    userId: patientB.id,
    email: patientB.email,
    name: patientB.name,
    role: patientB.role,
  });

  const reqTampered = new Request('http://localhost:3000/api/appointments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `carepulse_session=${tokenB}`,
    },
    body: JSON.stringify({ holdId: activeHold.id }),
  });

  const resTampered = await confirmApptHandler(reqTampered);
  assert.equal(resTampered.status, 403);
  const dataTampered = await resTampered.json();
  assert.equal(dataTampered.error, 'Appointment hold belongs to another patient');
});

test('6. Successful Booking Journey After Fresh Login', async () => {
  const doctor = await prisma.doctorProfile.findFirst();
  assert.ok(doctor, 'Doctor must exist');

  const email = `fresh.login.${Date.now()}@example.com`;
  const password = 'password123';
  await registerUser(email, password, 'Fresh User', Role.PATIENT);

  const loggedInUser = await authenticateUser(email, password);
  assert.ok(loggedInUser, 'Fresh login must succeed');

  const token = createSessionToken({
    userId: loggedInUser.id,
    email: loggedInUser.email,
    name: loggedInUser.name,
    role: loggedInUser.role,
  });

  const startTime = new Date(Date.now() + 86400000 * 100);
  const endTime = new Date(startTime.getTime() + 1800000);

  const reqHold = new Request('http://localhost:3000/api/appointments/hold', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `carepulse_session=${token}`,
    },
    body: JSON.stringify({
      doctorId: doctor.id,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    }),
  });

  const resHold = await postHoldHandler(reqHold);
  assert.equal(resHold.status, 200);
  const dataHold = await resHold.json();
  assert.ok(dataHold.hold.id, 'Hold ID must be returned');

  const reqConfirm = new Request('http://localhost:3000/api/appointments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `carepulse_session=${token}`,
    },
    body: JSON.stringify({
      holdId: dataHold.hold.id,
      symptoms: 'Mild fever and sore throat',
    }),
  });

  const resConfirm = await confirmApptHandler(reqConfirm);
  assert.equal(resConfirm.status, 200);
  const dataConfirm = await resConfirm.json();
  assert.equal(dataConfirm.appointment.status, 'CONFIRMED');
});
