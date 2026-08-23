import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { registerUser } from '../src/lib/auth/service';
import { getAvailableSlots } from '../src/lib/booking/availability';
import { createSlotHold, confirmAppointmentTransaction } from '../src/lib/booking/concurrency';
import { applyDoctorLeave } from '../src/lib/doctors/service';
import { invokePostVisitLLM } from '../src/lib/ai/adapter';
import { processOutboxNotifications } from '../src/lib/notifications/processor';
import { Role } from '../src/lib/types';
import { cleanTestFixtures } from './helpers/cleanup';

test('E2E Primary Workflow: Full Patient-Doctor-Admin Journey', async (t) => {
  console.log('--- STARTING E2E WORKFLOW TEST ---');

  t.after(async () => {
    await cleanTestFixtures();
  });

  // Step 1: Create Doctor
  const docEmail = `e2e.doctor.${Date.now()}@carepulse.com`;
  const docUser = await registerUser(docEmail, 'doc123', 'Dr. E2E Specialist', Role.DOCTOR, true);
  
  const doctorProfile = await prisma.doctorProfile.create({
    data: {
      userId: docUser.id,
      specialty: 'Dermatology',
      consultFee: 120.0,
      slotDurationMin: 30,
      bufferTimeMin: 10,
      isTestFixture: true,
    },
  });

  // Set Working Hours (Mon-Fri 09:00 - 17:00)
  for (let day = 1; day <= 5; day++) {
    await prisma.workingHours.create({
      data: {
        doctorId: doctorProfile.id,
        dayOfWeek: day,
        startTime: '09:00',
        endTime: '17:00',
      },
    });
  }

  // Step 2: Patient Searches Available Slots for next Monday
  const targetDate = '2026-09-14'; // Mon
  const availability = await getAvailableSlots(doctorProfile.id, targetDate);
  assert.ok(availability.slots.length > 0, 'Doctor must have available slots on working day');

  const selectedSlot = availability.slots[0];
  assert.equal(selectedSlot.isAvailable, true, 'Slot 0 must be available');

  // Step 3: Patient Creates Slot Hold
  const patientEmail = `e2e.patient.${Date.now()}@example.com`;
  const patient = await registerUser(patientEmail, 'pat123', 'E2E Patient', Role.PATIENT, true);

  const hold = await createSlotHold(doctorProfile.id, patient.id, selectedSlot.startTime, selectedSlot.endTime);
  assert.ok(hold.id, 'Slot hold must be created successfully');

  // Step 4: Patient Confirms Booking Transaction
  const appt = await confirmAppointmentTransaction(
    patient.id,
    doctorProfile.id,
    selectedSlot.startTime,
    selectedSlot.endTime,
    'Skin rash on arm'
  );
  assert.ok(appt.id, 'Appointment must be confirmed');
  assert.equal(appt.status, 'CONFIRMED', 'Status must be CONFIRMED');

  // Step 5: Verify Concurrent Attempt on Same Slot Fails
  const patient2 = await registerUser(`e2e.patient2.${Date.now()}@example.com`, 'pat123', 'Patient 2', Role.PATIENT, true);
  await assert.rejects(
    async () => {
      await confirmAppointmentTransaction(patient2.id, doctorProfile.id, selectedSlot.startTime, selectedSlot.endTime);
    },
    /CONCURRENCY_CONFLICT/,
    'Concurrent booking attempt on confirmed slot must throw CONCURRENCY_CONFLICT'
  );

  // Step 6: Doctor Completes Visit & Generates Post-Visit Notes
  const postVisitSummary = await invokePostVisitLLM('Prescribed Hydrocortisone cream 1%. Apply twice daily.');
  await prisma.appointment.update({
    where: { id: appt.id },
    data: {
      consultNotes: 'Prescribed Hydrocortisone cream 1%. Apply twice daily.',
      aiPostSummary: JSON.stringify(postVisitSummary),
      status: 'COMPLETED',
    },
  });

  // Step 7: Doctor Applies Leave on a Future Date Window
  const leaveStart = '2026-09-20';
  const leaveEnd = '2026-09-25';
  const leaveResult = await applyDoctorLeave(doctorProfile.id, leaveStart, leaveEnd, 'Annual Vacation');
  assert.ok(leaveResult.leave.id, 'Doctor leave must be recorded');

  // Step 8: Process Outbox Notifications
  const outboxRun = await processOutboxNotifications(50);
  assert.ok(outboxRun.processedCount >= 1, 'Outbox worker must process queued notifications');

  console.log('--- E2E WORKFLOW COMPLETED SUCCESSFULLY ---');
});
