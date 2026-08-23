import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { registerUser } from '@/lib/auth/service';
import { prisma } from '@/lib/prisma';
import { Role } from '@/lib/types';
import { z } from 'zod';

const CreateDoctorSchema = z.object({
  name: z.string().min(1, 'Doctor name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  specialty: z.string().min(1, 'Specialty is required'),
  consultFee: z.number().min(0, 'Consultation fee must be non-negative'),
  slotDurationMin: z.number().min(10).max(120).default(30),
  bufferTimeMin: z.number().min(0).max(60).default(10),
  isPublished: z.boolean().default(true),
  workingHours: z
    .array(
      z.object({
        dayOfWeek: z.number().min(0).max(6),
        startTime: z.string(),
        endTime: z.string(),
        breakStartTime: z.string().optional(),
        breakEndTime: z.string().optional(),
      })
    )
    .optional(),
});

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    if (!session || session.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Forbidden: Admin authorization required' }, { status: 403 });
    }

    const doctors = await prisma.doctorProfile.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, role: true, isTestFixture: true } },
        workingHours: true,
        leaves: { orderBy: { startDate: 'desc' } },
        _count: { select: { appointments: true } },
      },
      orderBy: { user: { name: 'asc' } },
    });

    return NextResponse.json({ success: true, doctors });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch doctor directory' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    if (!session || session.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Forbidden: Admin authorization required' }, { status: 403 });
    }

    const body = await req.json();
    const validated = CreateDoctorSchema.parse(body);

    const existingUser = await prisma.user.findUnique({ where: { email: validated.email } });
    if (existingUser) {
      return NextResponse.json({ error: 'A user account with this email address already exists' }, { status: 400 });
    }

    // Default working hours: Mon-Fri 09:00 - 17:00 if not specified
    const defaultHours = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: '09:00',
      endTime: '17:00',
      breakStartTime: '13:00',
      breakEndTime: '14:00',
    }));

    const hoursToCreate = validated.workingHours && validated.workingHours.length > 0
      ? validated.workingHours
      : defaultHours;

    // Register User with DOCTOR role
    const user = await registerUser(
      validated.email,
      validated.password,
      validated.name,
      Role.DOCTOR
    );

    const profile = await prisma.doctorProfile.create({
      data: {
        userId: user.id,
        specialty: validated.specialty,
        consultFee: validated.consultFee,
        slotDurationMin: validated.slotDurationMin,
        bufferTimeMin: validated.bufferTimeMin,
        isPublished: validated.isPublished,
        workingHours: {
          create: hoursToCreate.map((wh) => ({
            dayOfWeek: wh.dayOfWeek,
            startTime: wh.startTime,
            endTime: wh.endTime,
            breakStartTime: wh.breakStartTime || null,
            breakEndTime: wh.breakEndTime || null,
          })),
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        workingHours: true,
      },
    });

    return NextResponse.json({ success: true, doctor: profile }, { status: 201 });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Failed to create doctor profile' }, { status: 400 });
  }
}
