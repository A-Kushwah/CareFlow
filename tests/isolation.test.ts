import test from 'node:test';
import assert from 'node:assert/strict';
import { GET as getDoctorsHandler } from '../src/app/api/doctors/route';
import { cleanTestFixtures } from './helpers/cleanup';
import { prisma } from '../src/lib/prisma';

test('Data Isolation: Test fixtures clean up and never leak into production catalog', async () => {
  // Ensure cleanup runs first
  await cleanTestFixtures();

  // 1. Fetch public doctor catalog
  const req = new Request('http://localhost:3000/api/doctors');
  const res = await getDoctorsHandler();
  assert.equal(res.status, 200, 'GET /api/doctors must return 200 OK');

  const data = await res.json();
  assert.ok(Array.isArray(data.doctors), 'Must return doctors array');

  // 2. Verify test doctor fixtures are completely absent
  const testDoctorNames = ['Dr. One', 'Dr. Two', 'Dr. Security', 'Dr. E2E Specialist', 'Dr. Book'];
  for (const name of testDoctorNames) {
    const found = data.doctors.some((d: any) => d.name === name);
    assert.equal(found, false, `Test doctor fixture "${name}" must NOT leak into doctor catalog`);
  }

  // 3. Verify all 5 production seed doctors exist and have working hours populated
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
