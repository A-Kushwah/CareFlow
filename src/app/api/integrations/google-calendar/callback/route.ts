import { NextResponse } from 'next/server';
import { verifyOAuthState, exchangeCodeAndSaveConnection } from '@/lib/calendar/googleOAuthService';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const oauthError = searchParams.get('error');

    if (oauthError) {
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(oauthError)}`, req.url));
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL('/?error=missing_oauth_parameters', req.url));
    }

    const statePayload = await verifyOAuthState(state);
    if (!statePayload) {
      return NextResponse.redirect(new URL('/?error=invalid_expired_or_replayed_oauth_state', req.url));
    }

    await exchangeCodeAndSaveConnection(statePayload.userId, code);

    const redirectPath = statePayload.returnUrl || '/';
    const finalUrl = new URL(`${redirectPath.startsWith('/') ? redirectPath : '/'}${redirectPath.includes('?') ? '&' : '?'}calendar_connected=true`, req.url);
    return NextResponse.redirect(finalUrl);
  } catch (err: any) {
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(err.message || 'oauth_exchange_failed')}`, req.url));
  }
}
