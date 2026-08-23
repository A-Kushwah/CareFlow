import test from 'node:test';
import assert from 'node:assert/strict';
import { GET as getDoctorsHandler } from '../src/app/api/doctors/route';
import { cleanTestFixtures } from './helpers/cleanup';
import { prisma } from '../src/lib/prisma';
import { registerUser } from '../src/lib/auth/service';
import { Role } from '../src/lib/types';

test('Data Isolation: Real user-created doctors are NEVER deleted by cleanup', async () => {
  // Create a real user-created doctor (isTestFixture = false)
  const realDocEmail = `real.doctor.${Date.now()}@clinic.org`;
  const realUser = await registerUser(realDocEmail, 'pass123', 'Dr. Real Doctor', Role.DOCTOR, false);
  
  const realDocProfile = await prisma.doctorProfile.create({
    data: {
      userId: realUser.id,
      specialty: 'Neurology',
      consultFee: 200,
      isPublished: true,
      isTestFixture: false,
    },
  });

  // Run cleanup
  await cleanTestFixtures();

  // Verify real doctor profile still exists in database
  const checkRealDoc = await prisma.doctorProfile.findUnique({
    where: { id: realDocProfile.id },
  });
  assert.ok(checkRealDoc, 'Real user-created doctor without isTestFixture must NEVER be deleted by cleanup helper');

  // Clean up manual test entry cleanly for idempotency
  await prisma.doctorProfile.delete({ where: { id: realDocProfile.id } });
  await prisma.user.delete({ where: { id: realUser.id } });
});

test('Data Isolation: Test fixtures clean up and never leak into public catalog', async () => {
  // Create a test fixture doctor
  const testDocUser = await registerUser(`fixture.doc.${Date.now()}@carepulse.local`, 'pass123', 'Dr. Test Fixture', Role.DOCTOR, true);
  const testDocProfile = await prisma.doctorProfile.create({
    data: {
      userId: testDocUser.id,
      specialty: 'Internal Medicine',
      consultFee: 100,
      isPublished: true,
      isTestFixture: true,
    },
  });

  // 1. Fetch public doctor catalog via GET /api/doctors
  const res = await getDoctorsHandler();
  assert.equal(res.status, 200, 'GET /api/doctors must return 200 OK');

  const data = await res.json();
  assert.ok(Array.isArray(data.doctors), 'Must return doctors array');

  // 2. Verify test doctor fixture is filtered out of public catalog
  const foundFixtureInCatalog = data.doctors.some((d: any) => d.id === testDocProfile.id || d.name === 'Dr. Test Fixture');
  assert.equal(foundFixtureInCatalog, false, 'Doctor profile marked with isTestFixture: true must NOT appear in public catalog');

  // Run cleanup
  await cleanTestFixtures();

  // Verify fixture deleted
  const checkFixtureDoc = await prisma.doctorProfile.findUnique({
    where: { id: testDocProfile.id },
  });
  assert.equal(checkFixtureDoc, null, 'Doctor profile marked with isTestFixture: true must be deleted by cleanTestFixtures');

  // 3. Verify all 5 production seed doctors exist in catalog with non-empty working hours
  const expectedSeedDoctors = [
    'Dr. Sarah Jenkins',
    'Dr. Marcus Vance',
    'Dr. Elena Morris',
    'Dr. James Okafor',
    'Dr. Maya Patel',
  ];

  for (const name of expectedSeedDoctors) {
    const doc = data.doctors.find((d: any) => d.name === name);
    assert.ok(doc, `Production seed doctor "${name}" must exist in catalog`);
    assert.ok(Array.isArray(doc.workingHours), `Doctor "${name}" must have working hours array`);
    assert.ok(doc.workingHours.length > 0, `Doctor "${name}" must have non-empty working hours populated`);
  }
});
