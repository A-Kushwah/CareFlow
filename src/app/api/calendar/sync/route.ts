import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { syncCalendarEvent } from '@/lib/calendar/googleCalendarAdapter';
import { Role } from '@/lib/types';
import { z } from 'zod';

const CalendarSyncSchema = z.object({
  action: z.enum(['CALENDAR_CREATE_EVENT', 'CALENDAR_UPDATE_EVENT', 'CALENDAR_DELETE_EVENT']),
  payload: z.object({
    appointmentId: z.string(),
    patientName: z.string(),
    patientEmail: z.string().email(),
    doctorName: z.string(),
    doctorEmail: z.string().email(),
    startTime: z.string(),
    endTime: z.string(),
    summary: z.string().optional(),
    description: z.string().optional(),
    calendarEventId: z.string().optional(),
  }),
  idempotencyKey: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    // ROUTE CLASSIFICATION: ADMIN_ONLY / INTERNAL_WORKER
    const session = await getSession();
    const authHeader = req.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET || 'carepulse-secret-worker-key';

    const isWorkerAuthorized = authHeader === `Bearer ${cronSecret}`;
    const isAdminAuthorized = session && session.role === Role.ADMIN;

    if (!isWorkerAuthorized && !isAdminAuthorized) {
      return NextResponse.json({ error: 'Forbidden: Internal worker key or Admin session required' }, { status: 403 });
    }

    const body = await req.json();
    const validated = CalendarSyncSchema.parse(body);

    const result = await syncCalendarEvent(
      validated.action,
      validated.payload,
      validated.idempotencyKey
    );

    return NextResponse.json({ success: result.success, result });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Calendar sync failed' }, { status: 500 });
  }
}
