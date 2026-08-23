import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { Role } from '@/lib/types';
import { z } from 'zod';

const UpdateDoctorSchema = z.object({
  name: z.string().optional(),
  specialty: z.string().optional(),
  consultFee: z.number().min(0).optional(),
  slotDurationMin: z.number().min(10).max(120).optional(),
  bufferTimeMin: z.number().min(0).max(60).optional(),
  isPublished: z.boolean().optional(),
});

export async function PATCH(req: Request, context?: any) {
  try {
    const session = await getSession(req);
    if (!session || session.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Forbidden: Admin authorization required' }, { status: 403 });
    }

    const doctorProfileId = context?.params?.id;
    const body = await req.json();
    const validated = UpdateDoctorSchema.parse(body);

    const existingProfile = await prisma.doctorProfile.findUnique({
      where: { id: doctorProfileId },
      include: { user: true },
    });

    if (!existingProfile) {
      return NextResponse.json({ error: 'Doctor profile not found' }, { status: 404 });
    }

    const updatedProfile = await prisma.$transaction(async (tx) => {
      if (validated.name && validated.name !== existingProfile.user.name) {
        await tx.user.update({
          where: { id: existingProfile.userId },
          data: { name: validated.name },
        });
      }

      const profileData: any = {};
      if (validated.specialty !== undefined) profileData.specialty = validated.specialty;
      if (validated.consultFee !== undefined) profileData.consultFee = validated.consultFee;
      if (validated.slotDurationMin !== undefined) profileData.slotDurationMin = validated.slotDurationMin;
      if (validated.bufferTimeMin !== undefined) profileData.bufferTimeMin = validated.bufferTimeMin;
      if (validated.isPublished !== undefined) profileData.isPublished = validated.isPublished;

      const profile = await tx.doctorProfile.update({
        where: { id: doctorProfileId },
        data: profileData,
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          workingHours: true,
        },
      });

      return profile;
    });

    return NextResponse.json({ success: true, doctor: updatedProfile });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Failed to update doctor profile' }, { status: 400 });
  }
}

export async function DELETE(req: Request, context?: any) {
  try {
    const session = await getSession(req);
    if (!session || session.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Forbidden: Admin authorization required' }, { status: 403 });
    }

    const doctorProfileId = context?.params?.id;
    const profile = await prisma.doctorProfile.findUnique({
      where: { id: doctorProfileId },
      include: { _count: { select: { appointments: true } } },
    });

    if (!profile) {
      return NextResponse.json({ error: 'Doctor profile not found' }, { status: 404 });
    }

    if (profile._count.appointments > 0) {
      const archived = await prisma.doctorProfile.update({
        where: { id: doctorProfileId },
        data: { isPublished: false },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      return NextResponse.json({
        success: true,
        archived: true,
        message: 'Doctor profile has historical appointments. Profile unpublished/archived safely.',
        doctor: archived,
      });
    }

    await prisma.$transaction([
      prisma.doctorProfile.delete({ where: { id: doctorProfileId } }),
      prisma.user.delete({ where: { id: profile.userId } }),
    ]);

    return NextResponse.json({ success: true, message: 'Doctor profile and account deleted' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to process doctor deletion' }, { status: 500 });
  }
}
