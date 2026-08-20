import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { invokePreVisitLLM } from '@/lib/ai/adapter';
import { z } from 'zod';

const PreVisitRequestSchema = z.object({
  symptoms: z.string().min(3, 'Symptoms must be at least 3 characters').max(2000, 'Symptoms max 2000 characters'),
});

export async function POST(req: Request) {
  try {
    // ROUTE CLASSIFICATION: PATIENT_ONLY / DOCTOR_ONLY / ADMIN_ONLY
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: Session required for AI symptom assessment' }, { status: 401 });
    }

    const body = await req.json();
    const validated = PreVisitRequestSchema.parse(body);

    const summary = await invokePreVisitLLM(validated.symptoms);
    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'AI pre-visit generation failed' }, { status: 500 });
  }
}
