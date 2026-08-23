import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmAppointmentTransaction } from '../src/lib/booking/concurrency';
import { POST as cancelHandler } from '../src/app/api/appointments/[id]/cancel/route';
import { POST as rescheduleHandler } from '../src/app/api/appointments/[id]/reschedule/route';
import { GET as getPatientHistoryHandler } from '../src/app/api/patients/[id]/history/route';
import { registerUser } from '../src/lib/auth/service';
import { createSessionToken } from '../src/lib/auth/session';
import { Role } from '../src/lib/types';
import { prisma } from '../src/lib/prisma';

test('Booking & Notifications: Dual patient and doctor confirmation emails queued', async () => {
  const patient = await registerUser(`pt.booking.${Date.now()}@carepulse.local`, 'pass123', 'Patient Dual', Role.PATIENT, true);
  const docUser = await registerUser(`doc.booking.${Date.now()}@carepulse.local`, 'pass123', 'Dr. Dual', Role.DOCTOR, true);
  const doctor = await prisma.doctorProfile.create({
    data: { userId: docUser.id, specialty: 'General', consultFee: 100, isTestFixture: true },
  });

  const now = new Date();
  const startTimeISO = new Date(now.getTime() + 86400000).toISOString();
  const endTimeISO = new Date(now.getTime() + 86400000 + 1800000).toISOString();

  const appt = await confirmAppointmentTransaction(patient.id, doctor.id, startTimeISO, endTimeISO, 'Checkup');

  // Verify patient confirmation email
  const patientNotif = await prisma.notificationLog.findUnique({
    where: { idempotencyKey: `appointment_confirmed_patient_${appt.id}` },
  });
  assert.ok(patientNotif, 'Patient confirmation email must be queued');
  assert.equal(patientNotif.recipient, patient.email);

  // Verify doctor confirmation email
  const doctorNotif = await prisma.notificationLog.findUnique({
    where: { idempotencyKey: `appointment_confirmed_doctor_${appt.id}` },
  });
  assert.ok(doctorNotif, 'Doctor confirmation email must be queued');
  assert.equal(doctorNotif.recipient, docUser.email);

  // Verify calendar create event
  const calNotif = await prisma.notificationLog.findUnique({
    where: { idempotencyKey: `appointment_calendar_create_${appt.id}` },
  });
  assert.ok(calNotif, 'Calendar create event must be queued');

  // Clean up
  await prisma.notificationLog.deleteMany({ where: { idempotencyKey: { in: [`appointment_confirmed_patient_${appt.id}`, `appointment_confirmed_doctor_${appt.id}`, `appointment_calendar_create_${appt.id}`] } } });
  await prisma.appointment.delete({ where: { id: appt.id } });
  await prisma.doctorProfile.delete({ where: { id: doctor.id } });
  await prisma.user.deleteMany({ where: { id: { in: [patient.id, docUser.id] } } });
});

test('Appointment Cancellation: Patient cancels appointment with dual notifications & calendar delete', async () => {
  const patient = await registerUser(`pt.cancel.${Date.now()}@carepulse.local`, 'pass123', 'Patient Cancel', Role.PATIENT, true);
  const docUser = await registerUser(`doc.cancel.${Date.now()}@carepulse.local`, 'pass123', 'Dr. Cancel', Role.DOCTOR, true);
  const doctor = await prisma.doctorProfile.create({
    data: { userId: docUser.id, specialty: 'General', consultFee: 100, isTestFixture: true },
  });

  const startTimeISO = new Date(Date.now() + 172800000).toISOString();
  const endTimeISO = new Date(Date.now() + 172800000 + 1800000).toISOString();
  const appt = await confirmAppointmentTransaction(patient.id, doctor.id, startTimeISO, endTimeISO);

  const patientToken = createSessionToken({ userId: patient.id, email: patient.email, name: patient.name, role: Role.PATIENT });
  const req = new Request(`http://localhost/api/appointments/${appt.id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `carepulse_session=${patientToken}` },
    body: JSON.stringify({ reason: 'Schedule conflict' }),
  });

  const res = await cancelHandler(req, { params: { id: appt.id } });
  assert.equal(res.status, 200);

  const updatedAppt = await prisma.appointment.findUnique({ where: { id: appt.id } });
  assert.equal(updatedAppt?.status, 'CANCELLED');
  assert.equal(updatedAppt?.cancellationReason, 'Schedule conflict');

  // Verify dual email notifications + calendar delete queued
  const pNotif = await prisma.notificationLog.findUnique({ where: { idempotencyKey: `appointment_cancelled_patient_${appt.id}` } });
  const dNotif = await prisma.notificationLog.findUnique({ where: { idempotencyKey: `appointment_cancelled_doctor_${appt.id}` } });
  const cNotif = await prisma.notificationLog.findUnique({ where: { idempotencyKey: `appointment_calendar_delete_${appt.id}` } });

  assert.ok(pNotif, 'Patient cancellation email must be queued');
  assert.ok(dNotif, 'Doctor cancellation email must be queued');
  assert.ok(cNotif, 'Calendar delete notification must be queued');

  // Test Cancellation Idempotency
  const repeatReq = new Request(`http://localhost/api/appointments/${appt.id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `carepulse_session=${patientToken}` },
    body: JSON.stringify({ reason: 'Schedule conflict' }),
  });
  const repeatRes = await cancelHandler(repeatReq, { params: { id: appt.id } });
  assert.equal(repeatRes.status, 200);
  const repeatData = await repeatRes.json();
  assert.equal(repeatData.alreadyCancelled, true);

  // Clean up
  await prisma.notificationLog.deleteMany({ where: { idempotencyKey: { in: [`appointment_confirmed_patient_${appt.id}`, `appointment_confirmed_doctor_${appt.id}`, `appointment_calendar_create_${appt.id}`, `appointment_cancelled_patient_${appt.id}`, `appointment_cancelled_doctor_${appt.id}`, `appointment_calendar_delete_${appt.id}`] } } });
  await prisma.appointment.delete({ where: { id: appt.id } });
  await prisma.doctorProfile.delete({ where: { id: doctor.id } });
  await prisma.user.deleteMany({ where: { id: { in: [patient.id, docUser.id] } } });
});

test('Appointment Rescheduling: Reschedule slot with working hours, leave, overlap checks & idempotency', async () => {
  const patient = await registerUser(`pt.resched.${Date.now()}@carepulse.local`, 'pass123', 'Patient Resched', Role.PATIENT, true);
  const docUser = await registerUser(`doc.resched.${Date.now()}@carepulse.local`, 'pass123', 'Dr. Resched', Role.DOCTOR, true);
  const doctor = await prisma.doctorProfile.create({
    data: {
      userId: docUser.id,
      specialty: 'General',
      consultFee: 100,
      isTestFixture: true,
      workingHours: {
        create: [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }],
      },
    },
  });

  // Start with a valid Monday slot
  const nextMonday = new Date();
  nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
  nextMonday.setHours(10, 0, 0, 0);

  const startISO = nextMonday.toISOString();
  const endISO = new Date(nextMonday.getTime() + 1800000).toISOString();

  const appt = await confirmAppointmentTransaction(patient.id, doctor.id, startISO, endISO);

  // Target new slot: Monday 14:00
  const newStart = new Date(nextMonday);
  newStart.setHours(14, 0, 0, 0);
  const newStartISO = newStart.toISOString();
  const newEndISO = new Date(newStart.getTime() + 1800000).toISOString();

  const patientToken = createSessionToken({ userId: patient.id, email: patient.email, name: patient.name, role: Role.PATIENT });
  const req = new Request(`http://localhost/api/appointments/${appt.id}/reschedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `carepulse_session=${patientToken}` },
    body: JSON.stringify({ newStartTime: newStartISO, newEndTime: newEndISO, reason: 'Better time slot' }),
  });

  const res = await rescheduleHandler(req, { params: { id: appt.id } });
  assert.equal(res.status, 200);

  const updatedAppt = await prisma.appointment.findUnique({ where: { id: appt.id } });
  assert.equal(updatedAppt?.startTime.toISOString(), newStartISO);

  // Verify calendar update notification queued
  const calUpdateNotif = await prisma.notificationLog.findFirst({
    where: { idempotencyKey: { startsWith: `appointment_calendar_update_${appt.id}` } },
  });
  assert.ok(calUpdateNotif, 'Calendar update notification must be queued');

  // Test Reschedule Idempotency
  const repeatReq = new Request(`http://localhost/api/appointments/${appt.id}/reschedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `carepulse_session=${patientToken}` },
    body: JSON.stringify({ newStartTime: newStartISO, newEndTime: newEndISO }),
  });
  const repeatRes = await rescheduleHandler(repeatReq, { params: { id: appt.id } });
  assert.equal(repeatRes.status, 200);
  const repeatData = await repeatRes.json();
  assert.equal(repeatData.alreadyRescheduled, true);

  // Clean up
  await prisma.notificationLog.deleteMany({ where: { recipient: patient.email } });
  await prisma.notificationLog.deleteMany({ where: { recipient: docUser.email } });
  await prisma.workingHours.deleteMany({ where: { doctorId: doctor.id } });
  await prisma.appointment.delete({ where: { id: appt.id } });
  await prisma.doctorProfile.delete({ where: { id: doctor.id } });
  await prisma.user.deleteMany({ where: { id: { in: [patient.id, docUser.id] } } });
});

test('Role Authorization: Doctor cannot access another doctor patient history (403 Forbidden)', async () => {
  const docUser1 = await registerUser(`doc1.${Date.now()}@carepulse.local`, 'pass123', 'Dr. One', Role.DOCTOR, true);
  const docProfile1 = await prisma.doctorProfile.create({
    data: { userId: docUser1.id, specialty: 'General', consultFee: 100, isTestFixture: true },
  });

  const docUser2 = await registerUser(`doc2.${Date.now()}@carepulse.local`, 'pass123', 'Dr. Two', Role.DOCTOR, true);
  const docProfile2 = await prisma.doctorProfile.create({
    data: { userId: docUser2.id, specialty: 'General', consultFee: 100, isTestFixture: true },
  });

  const patient = await registerUser(`patient.private.${Date.now()}@carepulse.local`, 'pass123', 'Private Patient', Role.PATIENT, true);

  // Appointment only with Doctor 2
  const startISO = new Date(Date.now() + 86400000).toISOString();
  const endISO = new Date(Date.now() + 86400000 + 1800000).toISOString();
  const appt = await confirmAppointmentTransaction(patient.id, docProfile2.id, startISO, endISO);

  // Doctor 1 attempts to access patient history of patient who has no appointments with Doctor 1
  const doc1Token = createSessionToken({ userId: docUser1.id, email: docUser1.email, name: docUser1.name, role: Role.DOCTOR, doctorId: docProfile1.id });
  const req = new Request(`http://localhost/api/patients/${patient.id}/history`, {
    method: 'GET',
    headers: { Cookie: `carepulse_session=${doc1Token}` },
  });

  const res = await getPatientHistoryHandler(req, { params: { id: patient.id } });
  assert.equal(res.status, 403, 'Doctor without active appointment relationship must be denied access (403 Forbidden)');

  // Clean up
  await prisma.notificationLog.deleteMany({ where: { recipient: patient.email } });
  await prisma.notificationLog.deleteMany({ where: { recipient: docUser2.email } });
  await prisma.appointment.delete({ where: { id: appt.id } });
  await prisma.doctorProfile.deleteMany({ where: { id: { in: [docProfile1.id, docProfile2.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [docUser1.id, docUser2.id, patient.id] } } });
});
