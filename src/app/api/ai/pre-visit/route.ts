import { NextResponse } from 'next/server';
import { invokePreVisitLLM } from '@/lib/ai/adapter';

export async function POST(req: Request) {
  try {
    const { symptoms } = await req.json();
    const result = await invokePreVisitLLM(symptoms);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to generate pre-visit summary' }, { status: 500 });
  }
}
