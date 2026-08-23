import { prisma } from '../../src/lib/prisma';

export async function cleanTestFixtures() {
  try {
    // 1. Delete appointments associated with test fixture users or doctors
    await prisma.appointment.deleteMany({
      where: {
        OR: [
          { patient: { isTestFixture: true } },
          { doctor: { isTestFixture: true } },
        ],
      },
    });

    // 2. Find test fixture doctor profiles
    const testDoctors = await prisma.doctorProfile.findMany({
      where: { isTestFixture: true },
    });

    const testDoctorIds = testDoctors.map((d) => d.id);
    if (testDoctorIds.length > 0) {
      await prisma.workingHours.deleteMany({ where: { doctorId: { in: testDoctorIds } } });
      await prisma.doctorLeave.deleteMany({ where: { doctorId: { in: testDoctorIds } } });
      await prisma.doctorProfile.deleteMany({ where: { id: { in: testDoctorIds } } });
    }

    // 3. Delete users explicitly marked as test fixtures
    await prisma.user.deleteMany({
      where: { isTestFixture: true },
    });
  } catch (err: any) {
    console.warn('[TEST CLEANUP WARNING]', err?.message);
  }
}
