const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = 'careflow_salt_2026';
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

async function main() {
  console.log('🌱 Starting database seeding...');

  // Clean existing data
  await prisma.appointmentCalendarEvent.deleteMany();
  await prisma.googleCalendarConnection.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.medicationReminder.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.slotHold.deleteMany();
  await prisma.doctorLeave.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.doctorProfile.deleteMany();
  await prisma.user.deleteMany();

  const adminHash = hashPassword('admin123');
  const patientHash = hashPassword('patient123');
  const doctorHash = hashPassword('doctor123');

  // Create Admin
  const admin = await prisma.user.create({
    data: {
      email: 'admin@careflow.com',
      passwordHash: adminHash,
      name: 'System Admin',
      role: 'ADMIN',
    },
  });

  // Create Patient
  const patient = await prisma.user.create({
    data: {
      email: 'alex.rivera@example.com',
      passwordHash: patientHash,
      name: 'Alex Rivera',
      role: 'PATIENT',
    },
  });

  // Create Doctor 1: Sarah Jenkins
  const doc1User = await prisma.user.create({
    data: {
      email: 'sarah.jenkins@careflow.com',
      passwordHash: doctorHash,
      name: 'Dr. Sarah Jenkins',
      role: 'DOCTOR',
      doctorProfile: {
        create: {
          specialty: 'Cardiology',
          consultFee: 150.0,
          slotDurationMin: 30,
          bufferTimeMin: 10,
        },
      },
    },
    include: { doctorProfile: true },
  });

  // Create Doctor 2: Marcus Vance
  const doc2User = await prisma.user.create({
    data: {
      email: 'marcus.vance@careflow.com',
      passwordHash: doctorHash,
      name: 'Dr. Marcus Vance',
      role: 'DOCTOR',
      doctorProfile: {
        create: {
          specialty: 'Neurology',
          consultFee: 180.0,
          slotDurationMin: 30,
          bufferTimeMin: 10,
        },
      },
    },
    include: { doctorProfile: true },
  });

  const additionalDoctors = [
    {
      email: 'elena.morris@careflow.com',
      name: 'Dr. Elena Morris',
      specialty: 'Dermatology',
      consultFee: 120.0,
    },
    {
      email: 'james.okafor@careflow.com',
      name: 'Dr. James Okafor',
      specialty: 'Pediatrics',
      consultFee: 110.0,
    },
    {
      email: 'maya.patel@careflow.com',
      name: 'Dr. Maya Patel',
      specialty: 'Orthopedics',
      consultFee: 160.0,
    },
  ];

  const additionalDoctorUsers = [];
  for (const doctor of additionalDoctors) {
    additionalDoctorUsers.push(
      await prisma.user.create({
        data: {
          email: doctor.email,
          passwordHash: doctorHash,
          name: doctor.name,
          role: 'DOCTOR',
          doctorProfile: {
            create: {
              specialty: doctor.specialty,
              consultFee: doctor.consultFee,
              slotDurationMin: 30,
              bufferTimeMin: 10,
            },
          },
        },
        include: { doctorProfile: true },
      })
    );
  }

  // Set working hours (Mon to Fri, 09:00 - 17:00, Break 13:00-14:00)
  const doctors = [
    doc1User.doctorProfile,
    doc2User.doctorProfile,
    ...additionalDoctorUsers.map((user) => user.doctorProfile),
  ];
  for (const doc of doctors) {
    if (!doc) continue;
    for (let day = 1; day <= 5; day++) {
      await prisma.workingHours.create({
        data: {
          doctorId: doc.id,
          dayOfWeek: day,
          startTime: '09:00',
          endTime: '17:00',
          breakStartTime: '13:00',
          breakEndTime: '14:00',
        },
      });
    }
  }

  // Seed sample doctor leave for Dr. Sarah Jenkins (Future Leave)
  const leaveStart = new Date();
  leaveStart.setDate(leaveStart.getDate() + 10);
  leaveStart.setHours(0, 0, 0, 0);

  const leaveEnd = new Date(leaveStart);
  leaveEnd.setDate(leaveEnd.getDate() + 2);
  leaveEnd.setHours(23, 59, 59, 999);

  await prisma.doctorLeave.create({
    data: {
      doctorId: doc1User.doctorProfile.id,
      startDate: leaveStart,
      endDate: leaveEnd,
      reason: 'Annual Cardiology Conference & Seminar',
      status: 'APPROVED',
    },
  });

  // Seed sample appointment for Alex Rivera
  const apptStart = new Date();
  apptStart.setDate(apptStart.getDate() + 1);
  apptStart.setHours(10, 0, 0, 0);
  const apptEnd = new Date(apptStart);
  apptEnd.setMinutes(apptStart.getMinutes() + 30);

  await prisma.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: doc1User.doctorProfile.id,
      startTime: apptStart,
      endTime: apptEnd,
      status: 'CONFIRMED',
      symptoms: 'Mild chest tightness and shortness of breath after light exertion.',
      aiPreSummary: 'Patient reports mild chest tightness and shortness of breath. No history of hypertension reported. Recommend ECG and cardiovascular checkup.',
    },
  });

  console.log('✅ Database seeded successfully with PBKDF2 hashed accounts!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
