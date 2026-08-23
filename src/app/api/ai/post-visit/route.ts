import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { invokePostVisitLLM } from '@/lib/ai/adapter';
import { prisma } from '@/lib/prisma';
import { Role } from '@/lib/types';
import { z } from 'zod';

const PostVisitRequestSchema = z.object({
  appointmentId: z.string().min(1, 'Appointment ID is required'),
  notes: z.string().min(1, 'Doctor consultation notes are required'),
});

export async function POST(req: Request) {
  try {
    // ROUTE CLASSIFICATION: DOCTOR_ONLY / ADMIN_ONLY
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    if (session.role !== Role.DOCTOR && session.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Forbidden: Only doctors or admins can generate post-visit summaries' }, { status: 403 });
    }

    const body = await req.json();
    const validated = PostVisitRequestSchema.parse(body);

    // Verify appointment exists
    const appointment = await prisma.appointment.findUnique({
      where: { id: validated.appointmentId },
      include: { doctor: true },
    });

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment record not found' }, { status: 404 });
    }

    // SERVER-SIDE OWNERSHIP ENFORCEMENT:
    // Doctors can strictly only generate summaries for appointments assigned to their doctor profile
    if (session.role === Role.DOCTOR && appointment.doctorId !== session.doctorId) {
      return NextResponse.json({ error: 'Forbidden: You do not own this appointment record' }, { status: 403 });
    }

    const result = await invokePostVisitLLM(validated.notes, {
      appointmentId: appointment.id,
      doctorId: appointment.doctorId,
      patientId: appointment.patientId,
    });

    // Update appointment record with consult notes & AI summary
    const updatedAppointment = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        consultNotes: validated.notes,
        aiPostSummary: JSON.stringify(result.summary),
        status: 'COMPLETED',
      },
    });

    // Automatically schedule medication reminders if explicitly listed in medicationSummary
    if (result.summary.medicationSummary && result.summary.medicationSummary.length > 0) {
      for (const med of result.summary.medicationSummary) {
        if (med.medication) {
          const now = new Date();
          const endDate = new Date();
          endDate.setDate(now.getDate() + 7); // Default 7-day reminder duration

          await prisma.medicationReminder.create({
            data: {
              patientId: appointment.patientId,
              medication: med.medication,
              dosage: med.dosage || 'As directed',
              frequency: med.frequency || 'Daily',
              startDate: now,
              endDate,
              status: 'ACTIVE',
            },
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      appointment: updatedAppointment,
      summary: result.summary,
      provider: result.provider,
      model: result.model,
      auditId: result.auditId,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Post-visit generation failed' }, { status: 400 });
  }
}
