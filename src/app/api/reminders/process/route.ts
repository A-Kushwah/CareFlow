import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { processMedicationReminders } from '@/lib/reminders/service';
import { Role } from '@/lib/types';

export async function POST(req: Request) {
  try {
    // ROUTE CLASSIFICATION: ADMIN_ONLY / INTERNAL_WORKER
    const session = await getSession();
    const authHeader = req.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET || 'careflow-secret-worker-key';

    const isWorkerAuthorized = authHeader === `Bearer ${cronSecret}`;
    const isAdminAuthorized = session && session.role === Role.ADMIN;

    if (!isWorkerAuthorized && !isAdminAuthorized) {
      return NextResponse.json({ error: 'Forbidden: Internal worker key or Admin session required' }, { status: 403 });
    }

    const result = await processMedicationReminders();
    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Reminder processing failed' }, { status: 500 });
  }
}
