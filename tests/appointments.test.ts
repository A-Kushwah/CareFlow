import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { confirmAppointmentTransaction, createSlotHold } from '../src/lib/booking/concurrency';

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

  // Ensure slot is clean before concurrent test
  await prisma.appointment.deleteMany({
    where: { doctorId: doctor.id, startTime, endTime },
  });

  // Run simultaneous booking attempts
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

  // Create an expired hold manually (expiresAt in past)
  await prisma.slotHold.create({
    data: {
      doctorId: doctor.id,
      patientId: patient.id,
      startTime,
      endTime,
      expiresAt: new Date(Date.now() - 60000), // 1 minute ago
    },
  });

  // Creating a new hold on expired slot should succeed
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

  // Create leave
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
