import test from 'node:test';
import assert from 'node:assert/strict';
import { syncCalendarEvent } from '../src/lib/calendar/googleCalendarAdapter';

test('Google Calendar Adapter: Mock Event Creation', async () => {
  const payload = {
    appointmentId: 'appt-12345',
    patientName: 'Alex Rivera',
    patientEmail: 'alex@example.com',
    doctorName: 'Dr. Sarah Jenkins',
    doctorEmail: 'sarah@careflow.com',
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 1800000).toISOString(),
  };

  const result = await syncCalendarEvent('CALENDAR_CREATE_EVENT', payload);
  assert.equal(result.success, true, 'Mock calendar creation must succeed');
  assert.ok(result.eventId, 'Event ID must be generated');
});

test('Google Calendar Adapter: Event Deletion Sync', async () => {
  const payload = {
    appointmentId: 'appt-12345',
    patientName: 'Alex Rivera',
    patientEmail: 'alex@example.com',
    doctorName: 'Dr. Sarah Jenkins',
    doctorEmail: 'sarah@careflow.com',
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 1800000).toISOString(),
    calendarEventId: 'mock-cal-event-999',
  };

  const result = await syncCalendarEvent('CALENDAR_DELETE_EVENT', payload);
  assert.equal(result.success, true, 'Event deletion must succeed');
  assert.equal(result.eventId, 'mock-cal-event-999', 'Event ID must match target');
});
