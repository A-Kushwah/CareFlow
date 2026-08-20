export interface CalendarEventPayload {
  appointmentId: string;
  patientName: string;
  patientEmail: string;
  doctorName: string;
  doctorEmail: string;
  startTime: string; // ISO String
  endTime: string;   // ISO String
  summary?: string;
  description?: string;
  calendarEventId?: string;
}

export async function syncCalendarEvent(
  action: string,
  payload: CalendarEventPayload
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  const isEnabled = process.env.CALENDAR_ENABLED === 'true';
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!isEnabled || !clientId) {
    // Demo Mode: Mock Google Calendar Sync
    console.log(`[GOOGLE CALENDAR ADAPTER] [MOCK MODE] Executing action: ${action}`);
    console.log(`Summary: Medical Appointment - ${payload.patientName} with ${payload.doctorName}`);
    console.log(`Time: ${payload.startTime} to ${payload.endTime}`);

    return {
      success: true,
      eventId: payload.calendarEventId || `gcal_mock_${payload.appointmentId.slice(0, 8)}_${Date.now()}`,
    };
  }

  try {
    // Real Google Calendar API v3 REST dispatch
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    if (!refreshToken) {
      return {
        success: false,
        error: 'GOOGLE_REFRESH_TOKEN missing in environment configuration',
      };
    }

    // Acquire access token from Google OAuth endpoint
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
    const eventBody = {
      summary: payload.summary || `Consultation: ${payload.patientName} with ${payload.doctorName}`,
      description: payload.description || `CarePulse Appointment ID: ${payload.appointmentId}`,
      start: { dateTime: payload.startTime },
      end: { dateTime: payload.endTime },
      attendees: [
        { email: payload.patientEmail, displayName: payload.patientName },
        { email: payload.doctorEmail, displayName: payload.doctorName },
      ],
    };

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
      if (!res.ok) return { success: false, error: resData.error?.message || 'Google Calendar creation failed' };
      return { success: true, eventId: resData.id };
    }

    if (action === 'CALENDAR_DELETE_EVENT' && payload.calendarEventId) {
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${payload.calendarEventId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) return { success: false, error: 'Google Calendar event deletion failed' };
      return { success: true, eventId: payload.calendarEventId };
    }

    return { success: true, eventId: payload.calendarEventId || `gcal_${Date.now()}` };
  } catch (err: any) {
    return { success: false, error: err.message || 'Google Calendar network sync exception' };
  }
}
