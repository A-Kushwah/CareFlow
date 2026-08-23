import { prisma } from '../../src/lib/prisma';

export async function cleanTestFixtures() {
  try {
    const seedEmails = [
      'admin@carepulse.com',
      'alex.rivera@example.com',
      'sarah.jenkins@carepulse.com',
      'marcus.vance@carepulse.com',
      'elena.morris@carepulse.com',
      'james.okafor@carepulse.com',
      'maya.patel@carepulse.com',
    ];

    // Delete test appointments
    await prisma.appointment.deleteMany({
      where: {
        patient: {
          email: { notIn: seedEmails },
        },
      },
    });

    // Find non-seed doctor profiles
    const nonSeedDoctors = await prisma.doctorProfile.findMany({
      where: {
        user: {
          email: { notIn: seedEmails },
        },
      },
    });

    const nonSeedDoctorIds = nonSeedDoctors.map((d) => d.id);
    if (nonSeedDoctorIds.length > 0) {
      await prisma.workingHours.deleteMany({ where: { doctorId: { in: nonSeedDoctorIds } } });
      await prisma.doctorLeave.deleteMany({ where: { doctorId: { in: nonSeedDoctorIds } } });
      await prisma.doctorProfile.deleteMany({ where: { id: { in: nonSeedDoctorIds } } });
    }

    // Delete non-seed users
    await prisma.user.deleteMany({
      where: {
        email: { notIn: seedEmails },
      },
    });
  } catch (err: any) {
    console.warn('[TEST CLEANUP WARNING]', err?.message);
  }
}
