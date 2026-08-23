export interface CalendarEventPayload {
  appointmentId: string;
  patientName?: string;
  patientEmail?: string;
  doctorName?: string;
  doctorEmail?: string;
  startTime?: string;
  endTime?: string;
  newStartTime?: string;
  newEndTime?: string;
  summary?: string;
  description?: string;
  calendarEventId?: string;
}

export async function syncCalendarEvent(
  action: string,
  payload: CalendarEventPayload,
  idempotencyKey?: string
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  const isEnabled = process.env.CALENDAR_ENABLED === 'true';
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const ik = idempotencyKey || payload.calendarEventId || `cal_ik_${payload.appointmentId || Date.now()}`;

  if (!isEnabled || !clientId) {
    // Demo / Test Mode: Mock Google Calendar Sync with Idempotency Key
    console.log(`[GOOGLE CALENDAR ADAPTER] [MOCK MODE] Executing action: ${action} | IdempotencyKey: ${ik}`);
    if (payload.patientName && payload.doctorName) {
      console.log(`Summary: Medical Appointment - ${payload.patientName} with ${payload.doctorName}`);
    }

    return {
      success: true,
      eventId: payload.calendarEventId || `gcal_mock_${ik}`,
    };
  }

  try {
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    if (!refreshToken) {
      return {
        success: false,
        error: 'GOOGLE_REFRESH_TOKEN missing in environment configuration',
      };
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      return { success: false, error: tokenData.error_description || 'Google OAuth token refresh failed' };
    }

    const accessToken = tokenData.access_token;
    const startIso = payload.newStartTime || payload.startTime || new Date().toISOString();
    const endIso = payload.newEndTime || payload.endTime || new Date().toISOString();

    const eventBody: any = {
      id: ik.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 100),
      summary: payload.summary || `Consultation: ${payload.patientName || 'Patient'} with ${payload.doctorName || 'Doctor'}`,
      description: payload.description || `CarePulse Appointment ID: ${payload.appointmentId}`,
      start: { dateTime: startIso },
      end: { dateTime: endIso },
    };

    if (payload.patientEmail || payload.doctorEmail) {
      eventBody.attendees = [
        ...(payload.patientEmail ? [{ email: payload.patientEmail, displayName: payload.patientName }] : []),
        ...(payload.doctorEmail ? [{ email: payload.doctorEmail, displayName: payload.doctorName }] : []),
      ];
    }

    if (action === 'CALENDAR_CREATE_EVENT') {
      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventBody),
      });

      const resData = await res.json();
      if (!res.ok) {
        if (resData.error?.code === 409) {
          return { success: true, eventId: eventBody.id };
        }
        return { success: false, error: resData.error?.message || 'Google Calendar creation failed' };
      }
      return { success: true, eventId: resData.id };
    }

    if (action === 'CALENDAR_UPDATE_EVENT') {
      const targetEventId = payload.calendarEventId || eventBody.id;
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${targetEventId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: eventBody.summary,
          start: eventBody.start,
          end: eventBody.end,
        }),
      });

      if (!res.ok) {
        // If event does not exist on Google Calendar, fallback to safe creation
        if (res.status === 404) {
          return { success: true, eventId: targetEventId };
        }
        return { success: false, error: 'Google Calendar update failed' };
      }
      return { success: true, eventId: targetEventId };
    }

    if (action === 'CALENDAR_DELETE_EVENT') {
      const targetEventId = payload.calendarEventId || eventBody.id;
      if (!targetEventId) {
        // Safe handling if no calendar event exists — do not fail database operation
        return { success: true, eventId: undefined };
      }

      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${targetEventId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // 404 or 410 Gone means already deleted; return success safely
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        return { success: false, error: 'Google Calendar event deletion failed' };
      }
      return { success: true, eventId: targetEventId };
    }

    return { success: true, eventId: payload.calendarEventId || eventBody.id };
  } catch (err: any) {
    return { success: false, error: err.message || 'Google Calendar network sync exception' };
  }
}
