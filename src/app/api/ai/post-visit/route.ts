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

    // ----------------------------------------------------------------------
    // STAGE 1: TRANSACTION 1 — SAVE CLINICAL NOTES, PRESCRIPTIONS & REMINDERS
    // Unconditional database commit BEFORE any AI network invocation.
    // ----------------------------------------------------------------------
    const consultNotesRecord = JSON.stringify({
      notes: validated.notes,
      followUpInstructions: validated.followUpInstructions,
      prescriptions: validated.prescriptions,
    });

    const updatedAppointment = await prisma.$transaction(async (tx) => {
      // a. Update Appointment record
      const appt = await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          consultNotes: consultNotesRecord,
          status: 'COMPLETED',
        },
      });

      // b. Persist Doctor-Authored Prescriptions in dedicated Prescription database model with unique constraint
      await tx.prescription.deleteMany({
        where: { appointmentId: appointment.id },
      });

      if (validated.prescriptions.length > 0) {
        for (const med of validated.prescriptions) {
          await tx.prescription.create({
            data: {
              appointmentId: appointment.id,
              patientId: appointment.patientId,
              doctorId: appointment.doctorId,
              medication: med.medication,
              dosage: med.dosage,
              frequency: med.frequency,
              duration: med.duration,
              instructions: med.instructions || 'Take as directed by physician',
            },
          });
        }
      }

      // c. Create MedicationReminders idempotently
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

    // ----------------------------------------------------------------------
    // STAGE 2: AI GENERATION & CODE-LEVEL PRESCRIPTION VERIFICATION
    // OpenAI failure must NEVER roll back Stage 1 clinical records!
    // ----------------------------------------------------------------------
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
      console.warn('[POST-VISIT AI WARNING] Stage 2 AI generation failed:', err.message);
      aiError = err.message || 'AI provider unavailable';
    }

    let summaryData: any = null;

    if (aiResult?.summary) {
      const rawSummary = aiResult.summary;

      // CODE-LEVEL PRESCRIPTION SAFEGUARD:
      // Programmatically verify model output against doctor-authored prescriptions in code and correct any mismatch
      const verifiedMeds = validated.prescriptions.map((docP) => {
        const matchingAiMed = (rawSummary.medicationSummary || []).find(
          (aiM: any) => aiM.medication?.toLowerCase() === docP.medication.toLowerCase()
        );

        return {
          medication: docP.medication,
          dosage: docP.dosage,
          frequency: docP.frequency,
          duration: docP.duration,
          instructions: docP.instructions || matchingAiMed?.instructions || 'Take as directed by physician',
        };
      });

      summaryData = {
        error: false,
        summary: rawSummary.summary,
        patientInstructions: rawSummary.patientInstructions || [validated.followUpInstructions || 'Follow clinician recommendations.'],
        medicationSummary: verifiedMeds,
        followUpSchedule: rawSummary.followUpSchedule || validated.followUpInstructions || 'As needed',
        disclaimer: rawSummary.disclaimer || 'AI-generated consultation summaries organize clinical instructions only. Refer directly to clinician advice.',
      };
    } else {
      // Safe fallback when AI network call or provider failed
      summaryData = {
        error: true,
        summary: 'AI explanation unavailable — clinician instructions are still available',
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
    }

    // Save final verified AI summary to database in separate lightweight update
    const finalAppointment = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        aiPostSummary: JSON.stringify(summaryData),
      },
      include: {
        prescriptions: true,
      },
    });

    return NextResponse.json({
      success: true,
      appointment: finalAppointment,
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
