import { NextResponse } from 'next/server';
import { processOutboxNotifications } from '@/lib/notifications/processor';

export async function POST() {
  try {
    const summary = await processOutboxNotifications(20);
    return NextResponse.json({
      message: 'Outbox processing run completed',
      summary,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Outbox processing failed' }, { status: 500 });
  }
}
