import { NextResponse } from 'next/server';
import { invokePostVisitLLM } from '@/lib/ai/adapter';
import { prisma } from '@/lib/prisma';
import { AppointmentStatus } from '@/lib/types';

export async function POST(req: Request) {
  try {
    const { appointmentId, consultNotes } = await req.json();

    if (!appointmentId || !consultNotes) {
      return NextResponse.json({ error: 'appointmentId and consultNotes are required' }, { status: 400 });
    }

    const summaryResult = await invokePostVisitLLM(consultNotes);

    // Save notes & post-visit summary to appointment record
    const updatedAppointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        consultNotes,
        aiPostSummary: JSON.stringify(summaryResult),
        status: AppointmentStatus.COMPLETED,
      },
    });

    return NextResponse.json({
      message: 'Consultation completed and post-visit summary generated',
      summary: summaryResult,
      appointment: updatedAppointment,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to complete visit summary' }, { status: 500 });
  }
}
