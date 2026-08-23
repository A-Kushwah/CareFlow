import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    let dbConnected = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    const emailProvider = process.env.EMAIL_PROVIDER || 'console';
    const llmProvider = process.env.LLM_PROVIDER || 'openai';
    const isGoogleOAuthConfigured = Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    );

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      integrations: {
        database: {
          connected: dbConnected,
          provider: process.env.DATABASE_URL?.startsWith('postgresql') ? 'postgresql' : 'sqlite',
        },
        ai: {
          provider: llmProvider,
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          isConfigured: Boolean(process.env.OPENAI_API_KEY || llmProvider === 'mock' || llmProvider === 'test'),
        },
        email: {
          provider: emailProvider,
          isConfigured: Boolean(process.env.SMTP_HOST || emailProvider === 'console'),
        },
        googleCalendar: {
          mode: 'PER_USER_OAUTH_2.0',
          isOauthClientConfigured: isGoogleOAuthConfigured,
          legacyAdapterFallback: Boolean(process.env.GOOGLE_REFRESH_TOKEN),
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Integrations health check failed' }, { status: 500 });
  }
}
