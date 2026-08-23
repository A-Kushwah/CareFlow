import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { invokePostVisitLLM } from '@/lib/ai/adapter';
import { prisma } from '@/lib/prisma';
import { Role } from '@/lib/types';
import { z } from 'zod';

const DoctorPrescriptionSchema = z.object({
  medication: z.string().min(1, 'Medication name is required'),
  dosage: z.string().min(1, 'Dosage is required'),
  frequency: z.string().min(1, 'Frequency is required'),
  duration: z.string().min(1, 'Duration is required'),
  instructions: z.string().optional().default('Take as directed by physician'),
});

const PostVisitRequestSchema = z.object({
  appointmentId: z.string().min(1, 'Appointment ID is required'),
  notes: z.string().min(1, 'Doctor consultation notes are required'),
  followUpInstructions: z.string().optional().default(''),
  prescriptions: z.array(DoctorPrescriptionSchema).default([]),
});

export async function POST(req: Request) {
  try {
    // 1. ROUTE CLASSIFICATION: DOCTOR_ONLY / ADMIN_ONLY
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    if (session.role !== Role.DOCTOR && session.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Forbidden: Only doctors or admins can generate post-visit summaries' }, { status: 403 });
    }

    const body = await req.json();
    const validated = PostVisitRequestSchema.parse(body);

    // 2. Verify appointment exists
    const appointment = await prisma.appointment.findUnique({
      where: { id: validated.appointmentId },
      include: { doctor: true },
    });

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment record not found' }, { status: 404 });
    }

    // 3. Appointment status validation: Must be CONFIRMED or COMPLETED
    if (appointment.status !== 'CONFIRMED' && appointment.status !== 'COMPLETED') {
      return NextResponse.json({ error: `Cannot generate summary for appointment with status '${appointment.status}'` }, { status: 400 });
    }

    // 4. SERVER-SIDE OWNERSHIP ENFORCEMENT:
    if (session.role === Role.DOCTOR && appointment.doctorId !== session.doctorId) {
      return NextResponse.json({ error: 'Forbidden: You do not own this appointment record' }, { status: 403 });
    }

    // 5. Attempt AI post-visit generation with failure fallback guard
    let aiResult: any = null;
    let aiError: string | undefined = undefined;

    try {
      aiResult = await invokePostVisitLLM(
        validated.notes,
        validated.followUpInstructions,
        validated.prescriptions,
        {
          appointmentId: appointment.id,
          doctorId: appointment.doctorId,
          patientId: appointment.patientId,
        }
      );
    } catch (err: any) {
      console.warn('[POST-VISIT AI WARNING] AI summary generation failed:', err.message);
      aiError = err.message || 'AI provider unavailable';
    }

    // Determine final summary object (AI summary or safe fallback)
    const summaryData = aiResult?.summary || {
      error: true,
      summary: 'Patient summary unavailable — clinician-entered prescription remains available',
      patientInstructions: [
        validated.followUpInstructions || 'Follow clinician instructions as discussed during consultation.',
      ],
      medicationSummary: validated.prescriptions.map((p) => ({
        medication: p.medication,
        dosage: p.dosage,
        frequency: p.frequency,
        duration: p.duration,
        instructions: p.instructions || 'Take as directed by physician',
      })),
      followUpSchedule: validated.followUpInstructions || 'As needed',
      disclaimer: 'AI-generated consultation summary unavailable. Refer directly to clinician instructions below.',
    };

    // Format composite consult notes preserving structured inputs
    const consultNotesRecord = JSON.stringify({
      notes: validated.notes,
      followUpInstructions: validated.followUpInstructions,
      prescriptions: validated.prescriptions,
    });

    // 6. DATABASE TRANSACTION: Update appointment & create/update medication reminders idempotently
    const updatedAppointment = await prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          consultNotes: consultNotesRecord,
          aiPostSummary: JSON.stringify(summaryData),
          status: 'COMPLETED',
        },
      });

      // IDEMPOTENCY GUARD: Delete pre-existing reminders for this appointment before creating fresh ones
      await tx.medicationReminder.deleteMany({
        where: { appointmentId: appointment.id },
      });

      if (validated.prescriptions.length > 0) {
        for (const med of validated.prescriptions) {
          const now = new Date();
          const endDate = new Date();
          const daysMatch = med.duration.match(/(\d+)\s*day/i);
          const daysToAdd = daysMatch ? parseInt(daysMatch[1], 10) : 7;
          endDate.setDate(now.getDate() + daysToAdd);

          await tx.medicationReminder.create({
            data: {
              patientId: appointment.patientId,
              appointmentId: appointment.id,
              medication: med.medication,
              dosage: med.dosage,
              frequency: med.frequency,
              duration: med.duration,
              instructions: med.instructions,
              startDate: now,
              endDate,
              status: 'ACTIVE',
            },
          });
        }
      }

      return appt;
    });

    return NextResponse.json({
      success: true,
      appointment: updatedAppointment,
      summary: summaryData,
      provider: aiResult?.provider || 'none',
      model: aiResult?.model || 'none',
      auditId: aiResult?.auditId,
      aiError,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Post-visit generation failed' }, { status: 400 });
  }
}
