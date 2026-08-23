import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { invokePreVisitLLM } from '@/lib/ai/adapter';
import { z } from 'zod';

const PreVisitRequestSchema = z.object({
  symptoms: z.string().min(1, 'Symptoms are required'),
  appointmentId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    // ROUTE CLASSIFICATION: PATIENT_ONLY / DOCTOR_ONLY / ADMIN_ONLY
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    const body = await req.json();
    const validated = PreVisitRequestSchema.parse(body);

    const result = await invokePreVisitLLM(validated.symptoms, {
      appointmentId: validated.appointmentId,
      patientId: session.userId,
    });

    return NextResponse.json({
      success: true,
      summary: result.summary,
      provider: result.provider,
      model: result.model,
      auditId: result.auditId,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Pre-visit generation failed' }, { status: 400 });
  }
}
