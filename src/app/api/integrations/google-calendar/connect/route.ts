import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getGoogleAuthUrl } from '@/lib/calendar/googleOAuthService';

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: Authenticated session required' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const returnUrl = searchParams.get('returnUrl') || '/settings';

    const authUrl = await getGoogleAuthUrl(session.userId, returnUrl);
    return NextResponse.redirect(authUrl);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to initiate Google Calendar connection' }, { status: 500 });
  }
}
