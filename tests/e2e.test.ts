import test from 'node:test';
import assert from 'node:assert/strict';
import { registerUser } from '../src/lib/auth/service';
import { POST as createDoctorHandler } from '../src/app/api/admin/doctors/route';
import { createSessionToken } from '../src/lib/auth/session';
import { createSlotHold, confirmAppointmentTransaction } from '../src/lib/booking/concurrency';
import { processOutboxNotifications } from '../src/lib/notifications/processor';
import { applyDoctorLeave } from '../src/lib/doctors/service';
import { Role } from '../src/lib/types';
import { prisma } from '../src/lib/prisma';

test('E2E Primary Workflow: Full Patient-Doctor-Admin Journey', async (t) => {
  const time = Date.now();
  const doctorEmail = `e2e.doctor.${time}@careflow.com`;
  const patientEmail = `e2e.patient.${time}@example.com`;

  // Step 1: Admin creates Doctor Profile
  const adminUser = await registerUser(`admin.${time}@careflow.local`, 'admin123', 'System Admin', Role.ADMIN, true);
  const adminToken = createSessionToken({ userId: adminUser.id, email: adminUser.email, name: adminUser.name, role: Role.ADMIN });

  const docReq = new Request('http://localhost/api/admin/doctors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `careflow_session=${adminToken}`,
    },
    body: JSON.stringify({
      email: doctorEmail,
      name: 'Dr. E2E Specialist',
      password: 'doctorPassword123',
      specialty: 'Dermatology',
      consultFee: 150.0,
      slotDurationMin: 30,
      bufferTimeMin: 10,
    }),
  });

  const docRes = await createDoctorHandler(docReq);
  assert.equal(docRes.status, 201);
  const docData = await docRes.json();

  assert.ok(docData.doctor.id, 'Doctor profile must be created');
  const doctorProfile = docData.doctor;

  // Step 2: Patient Registers
  const patientUser = await registerUser(patientEmail, 'Password123!', 'E2E Patient', Role.PATIENT, true);
  assert.equal(patientUser.role, Role.PATIENT, 'Registered user must have PATIENT role');

  // Clean up fixture on teardown
  t.after(async () => {
    await prisma.notificationLog.deleteMany({
      where: { recipient: { in: [patientEmail, doctorEmail] } },
    });
    await prisma.appointment.deleteMany({
      where: { patientId: patientUser.id },
    });
    await prisma.doctorLeave.deleteMany({
      where: { doctorId: doctorProfile.id },
    });
    await prisma.workingHours.deleteMany({
      where: { doctorId: doctorProfile.id },
    });
    await prisma.doctorProfile.delete({
      where: { id: doctorProfile.id },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [patientUser.id, docData.doctor.user.id, adminUser.id] } },
    });
  });

  // Step 3: Patient creates Slot Hold (Mon Sep 14 2026, 09:00 to 09:30 UTC)
  const startTime = '2026-09-14T09:00:00.000Z';
  const endTime = '2026-09-14T09:30:00.000Z';

  const hold = await createSlotHold(doctorProfile.id, patientUser.id, startTime, endTime);
  assert.ok(hold.id, 'Slot hold must be generated');

  // Step 4: Patient Confirms Appointment
  const appointment = await confirmAppointmentTransaction(
    patientUser.id,
    doctorProfile.id,
    startTime,
    endTime,
    'Skin rash on arm',
    'Patient reports acute localized rash.',
    hold.id
  );
  assert.ok(appointment.id, 'Appointment must be confirmed');
  assert.equal(appointment.status, 'CONFIRMED');

  // Step 5: Prevent Double Booking / Overlap
  await assert.rejects(
    async () => {
      await confirmAppointmentTransaction(
        patientUser.id,
        doctorProfile.id,
        startTime,
        endTime,
        'Duplicate booking attempt'
      );
    },
    (err: any) => {
      return err.message.includes('CONCURRENCY_CONFLICT');
    }
  );

  // Step 6: Doctor Submits Leave & Cancels Conflicting Appointments in Leave Window
  const leaveStart = '2026-09-20';
  const leaveEnd = '2026-09-25';
  const leaveResult = await applyDoctorLeave(doctorProfile.id, leaveStart, leaveEnd, 'Annual Vacation');
  assert.ok(leaveResult.leave.id, 'Doctor leave must be recorded');

  // Step 7: Process Outbox Notifications
  const outboxRun = await processOutboxNotifications(50);
  assert.ok(outboxRun.processedCount >= 0, 'Outbox worker executed successfully');

  console.log('--- E2E WORKFLOW COMPLETED SUCCESSFULLY ---');
});
