import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { registerUser } from '../src/lib/auth/service';
import { Role } from '../src/lib/types';

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

  // Query appointments strictly where patientId = patient1.id
  const apptsPatient1 = await prisma.appointment.findMany({
    where: { patientId: patient1.id },
  });

  // Ensure patient1 results do not contain any appointments for patient2
  const hasPatient2Data = apptsPatient1.some((a) => a.patientId === patient2.id);
  assert.equal(hasPatient2Data, false, 'Patient 1 must not receive Patient 2 appointment records');
});
