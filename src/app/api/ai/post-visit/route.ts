import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { invokePostVisitLLM } from '@/lib/ai/adapter';
import { Role } from '@/lib/types';
import { z } from 'zod';

const PostVisitRequestSchema = z.object({
  notes: z.string().min(5, 'Consultation notes required').max(2000, 'Notes max 2000 characters'),
});

export async function POST(req: Request) {
  try {
    // ROUTE CLASSIFICATION: DOCTOR_ONLY / ADMIN_ONLY
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    if (session.role !== Role.DOCTOR && session.role !== Role.ADMIN) {
      return NextResponse.json({ error: 'Forbidden: Only clinical staff can generate post-visit summaries' }, { status: 403 });
    }

    const body = await req.json();
    const validated = PostVisitRequestSchema.parse(body);

    const summary = await invokePostVisitLLM(validated.notes);
    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'AI post-visit generation failed' }, { status: 500 });
  }
}
