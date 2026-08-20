import { NextResponse } from 'next/server';
import { syncCalendarEvent } from '@/lib/calendar/googleCalendarAdapter';

export async function POST(req: Request) {
  try {
    const { action, payload } = await req.json();

    if (!action || !payload) {
      return NextResponse.json({ error: 'action and payload are required' }, { status: 400 });
    }

    const result = await syncCalendarEvent(action, payload);
    return NextResponse.json({ result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Calendar sync failed' }, { status: 500 });
  }
}
