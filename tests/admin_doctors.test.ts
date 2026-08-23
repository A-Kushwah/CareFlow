import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as createDoctorHandler } from '../src/app/api/admin/doctors/route';
import { PUT as updateWorkingHoursHandler } from '../src/app/api/admin/doctors/[id]/working-hours/route';
import { registerUser } from '../src/lib/auth/service';
import { createSessionToken } from '../src/lib/auth/session';
import { Role } from '../src/lib/types';
import { prisma } from '../src/lib/prisma';

test('Admin Doctor Management: Admin creates doctor profile successfully', async () => {
  const adminUser = await registerUser(`admin.${Date.now()}@carepulse.local`, 'admin123', 'System Admin', Role.ADMIN, true);
  const adminToken = createSessionToken({ userId: adminUser.id, email: adminUser.email, name: adminUser.name, role: Role.ADMIN });

  const req = new Request('http://localhost/api/admin/doctors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `carepulse_session=${adminToken}`,
    },
    body: JSON.stringify({
      name: 'Dr. Test Admin Created',
      email: `admin.created.doc.${Date.now()}@carepulse.local`,
      password: 'doctorPassword123',
      specialty: 'Dermatology',
      consultFee: 150,
      slotDurationMin: 30,
      bufferTimeMin: 10,
    }),
  });

  const res = await createDoctorHandler(req);
  assert.equal(res.status, 201, 'Admin must be able to create doctor profile with 201 Created');

  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.doctor.specialty, 'Dermatology');
  assert.equal(data.doctor.user.role, 'DOCTOR');
  assert.ok(data.doctor.workingHours.length > 0, 'Default working hours must be created');

  // Clean up
  await prisma.workingHours.deleteMany({ where: { doctorId: data.doctor.id } });
  await prisma.doctorProfile.delete({ where: { id: data.doctor.id } });
  await prisma.user.deleteMany({ where: { id: { in: [data.doctor.userId, adminUser.id] } } });
});

test('Admin Doctor Management: Non-admin cannot create doctor profile (403 Forbidden)', async () => {
  const patientUser = await registerUser(`patient.unauth.${Date.now()}@carepulse.local`, 'pass123', 'Unauthorized Patient', Role.PATIENT, true);
  const patientToken = createSessionToken({ userId: patientUser.id, email: patientUser.email, name: patientUser.name, role: Role.PATIENT });

  const req = new Request('http://localhost/api/admin/doctors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `carepulse_session=${patientToken}`,
    },
    body: JSON.stringify({
      name: 'Dr. Hacker',
      email: `hacker.doc.${Date.now()}@carepulse.local`,
      password: 'password123',
      specialty: 'Cardiology',
      consultFee: 100,
    }),
  });

  const res = await createDoctorHandler(req);
  assert.equal(res.status, 403, 'Non-admin session must return 403 Forbidden');

  // Clean up
  await prisma.user.delete({ where: { id: patientUser.id } });
});

test('Admin Doctor Management: Admin updates doctor working hours', async () => {
  const adminUser = await registerUser(`admin.wh.${Date.now()}@carepulse.local`, 'admin123', 'System Admin', Role.ADMIN, true);
  const adminToken = createSessionToken({ userId: adminUser.id, email: adminUser.email, name: adminUser.name, role: Role.ADMIN });

  const docUser = await registerUser(`doc.wh.${Date.now()}@carepulse.local`, 'pass123', 'Dr. WH Test', Role.DOCTOR, true);
  const docProfile = await prisma.doctorProfile.create({
    data: {
      userId: docUser.id,
      specialty: 'Pediatrics',
      consultFee: 110,
      isTestFixture: true,
    },
  });

  const req = new Request(`http://localhost/api/admin/doctors/${docProfile.id}/working-hours`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `carepulse_session=${adminToken}`,
    },
    body: JSON.stringify({
      workingHours: [
        { dayOfWeek: 1, startTime: '08:00', endTime: '16:00' },
        { dayOfWeek: 2, startTime: '08:00', endTime: '16:00' },
      ],
    }),
  });

  const res = await updateWorkingHoursHandler(req, { params: { id: docProfile.id } });
  assert.equal(res.status, 200, 'Admin updating working hours must return 200 OK');

  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.doctor.workingHours.length, 2);

  // Clean up
  await prisma.workingHours.deleteMany({ where: { doctorId: docProfile.id } });
  await prisma.doctorProfile.delete({ where: { id: docProfile.id } });
  await prisma.user.deleteMany({ where: { id: { in: [docUser.id, adminUser.id] } } });
});

test('Admin Doctor Management: Patient cannot update doctor schedule (403 Forbidden)', async () => {
  const patientUser = await registerUser(`patient.wh.${Date.now()}@carepulse.local`, 'pass123', 'Patient', Role.PATIENT, true);
  const patientToken = createSessionToken({ userId: patientUser.id, email: patientUser.email, name: patientUser.name, role: Role.PATIENT });

  const req = new Request('http://localhost/api/admin/doctors/fake-doc-id/working-hours', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `carepulse_session=${patientToken}`,
    },
    body: JSON.stringify({
      workingHours: [{ dayOfWeek: 1, startTime: '08:00', endTime: '16:00' }],
    }),
  });

  const res = await updateWorkingHoursHandler(req, { params: { id: 'fake-doc-id' } });
  assert.equal(res.status, 403, 'Patient modifying working hours must return 403 Forbidden');

  // Clean up
  await prisma.user.delete({ where: { id: patientUser.id } });
});
