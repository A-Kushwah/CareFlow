import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { Role } from '@/lib/types';
import { z } from 'zod';

const UpdateWorkingHoursSchema = z.object({
  workingHours: z.array(
    z.object({
      dayOfWeek: z.number().min(0).max(6),
      startTime: z.string(),
      endTime: z.string(),
      breakStartTime: z.string().optional(),
      breakEndTime: z.string().optional(),
    })
  ),
});

export async function PUT(req: Request, context?: any) {
  try {
    const session = await getSession(req);
    if (!session || session.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Forbidden: Admin authorization required' }, { status: 403 });
    }

    const doctorProfileId = context?.params?.id;
    const body = await req.json();
    const validated = UpdateWorkingHoursSchema.parse(body);

    const profile = await prisma.doctorProfile.findUnique({ where: { id: doctorProfileId } });
    if (!profile) {
      return NextResponse.json({ error: 'Doctor profile not found' }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.workingHours.deleteMany({ where: { doctorId: doctorProfileId } });

      if (validated.workingHours.length > 0) {
        await tx.workingHours.createMany({
          data: validated.workingHours.map((wh) => ({
            doctorId: doctorProfileId,
            dayOfWeek: wh.dayOfWeek,
            startTime: wh.startTime,
            endTime: wh.endTime,
            breakStartTime: wh.breakStartTime || null,
            breakEndTime: wh.breakEndTime || null,
          })),
        });
      }

      return tx.doctorProfile.findUnique({
        where: { id: doctorProfileId },
        include: { workingHours: true },
      });
    });

    return NextResponse.json({ success: true, doctor: updated });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Failed to update working hours' }, { status: 400 });
  }
}
