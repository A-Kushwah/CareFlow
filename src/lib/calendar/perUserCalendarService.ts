import { prisma } from '../prisma';
import { getValidAccessToken } from './googleOAuthService';

export async function syncPerUserCalendarEvents(
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  appointmentId: string
) {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        doctor: { include: { user: true } },
      },
    });

    if (!appointment) return;

    const patientId = appointment.patientId;
    const doctorUserId = appointment.doctor.userId;

    const usersToSync = [
      { userId: patientId, role: 'PATIENT', email: appointment.patient.email, name: appointment.patient.name },
      { userId: doctorUserId, role: 'DOCTOR', email: appointment.doctor.user.email, name: appointment.doctor.user.name },
    ];

    for (const participant of usersToSync) {
      try {
        const accessToken = await getValidAccessToken(participant.userId);
        if (!accessToken) {
          // User is not connected to Google Calendar or token was revoked
          continue;
        }

        const existingEvent = await prisma.appointmentCalendarEvent.findUnique({
          where: {
            appointmentId_userId_provider: {
              appointmentId,
              userId: participant.userId,
              provider: 'google',
            },
          },
        });

        const otherParticipant = usersToSync.find((u) => u.userId !== participant.userId);
        const summary = `Consultation: ${appointment.patient.name} with ${appointment.doctor.user.name}`;
        const description = `CareFlow Appointment ID: ${appointment.id}\nSymptoms: ${appointment.symptoms || 'N/A'}`;
        const startIso = appointment.startTime.toISOString();
        const endIso = appointment.endTime.toISOString();

        if (action === 'CREATE') {
          const eventBody: any = {
            summary,
            description,
            start: { dateTime: startIso },
            end: { dateTime: endIso },
          };

          if (otherParticipant?.email) {
            eventBody.attendees = [{ email: otherParticipant.email, displayName: otherParticipant.name }];
          }

          // SendUpdates=all ensures Google Calendar dispatches attendee email invites
          const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(eventBody),
          });

          const data = await res.json();
          if (res.ok && data.id) {
            await prisma.appointmentCalendarEvent.upsert({
              where: {
                appointmentId_userId_provider: {
                  appointmentId,
                  userId: participant.userId,
                  provider: 'google',
                },
              },
              update: {
                providerEventId: data.id,
                status: 'SYNCED',
                lastError: null,
                updatedAt: new Date(),
              },
              create: {
                appointmentId,
                userId: participant.userId,
                provider: 'google',
                providerEventId: data.id,
                status: 'SYNCED',
              },
            });

            await prisma.googleCalendarConnection.updateMany({
              where: { userId: participant.userId, provider: 'google' },
              data: { lastSyncAt: new Date() },
            });
          }
        } else if (action === 'UPDATE' && existingEvent?.providerEventId) {
          const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingEvent.providerEventId}?sendUpdates=all`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              summary,
              start: { dateTime: startIso },
              end: { dateTime: endIso },
            }),
          });

          if (!res.ok && res.status === 404) {
            // Re-create event if 404
            await syncPerUserCalendarEvents('CREATE', appointmentId);
          } else if (res.ok) {
            await prisma.appointmentCalendarEvent.update({
              where: { id: existingEvent.id },
              data: { status: 'SYNCED', lastError: null, updatedAt: new Date() },
            });
          }
        } else if (action === 'DELETE' && existingEvent?.providerEventId) {
          const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingEvent.providerEventId}?sendUpdates=all`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (res.ok || res.status === 404 || res.status === 410) {
            await prisma.appointmentCalendarEvent.update({
              where: { id: existingEvent.id },
              data: { status: 'DELETED', updatedAt: new Date() },
            });
          }
        }
      } catch (userErr: any) {
        console.error(`[PER-USER CALENDAR SYNC] Error for user ${participant.userId}: ${userErr.message}`);
      }
    }
  } catch (err: any) {
    console.error(`[PER-USER CALENDAR SYNC] Exception during sync: ${err.message}`);
  }
}
