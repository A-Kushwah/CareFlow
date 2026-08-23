import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { disconnectGoogleCalendar } from '@/lib/calendar/googleOAuthService';

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    const success = await disconnectGoogleCalendar(session.userId);

    return NextResponse.json({
      success: true,
      disconnected: success,
      message: 'Google Calendar connection deactivated.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to disconnect Google Calendar' }, { status: 500 });
  }
}
