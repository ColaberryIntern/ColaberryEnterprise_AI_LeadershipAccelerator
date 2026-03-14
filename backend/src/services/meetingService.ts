import { google } from 'googleapis';
import { env } from '../config/env';
import LiveSession from '../models/LiveSession';

function getAuthClient() {
  if (!env.googleServiceAccountEmail || !env.googlePrivateKey) {
    throw new Error('Google Calendar not configured');
  }
  return new google.auth.JWT({
    email: env.googleServiceAccountEmail,
    key: env.googlePrivateKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
}

export async function generateMeetLink(session: LiveSession): Promise<string | null> {
  try {
    const auth = getAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const startDateTime = `${session.session_date}T${convertTo24h(session.start_time)}:00`;
    const endDateTime = `${session.session_date}T${convertTo24h(session.end_time)}:00`;

    const event = await calendar.events.insert({
      calendarId: env.googleCalendarId || 'primary',
      requestBody: {
        summary: `[Accelerator] ${session.title}`,
        description: session.description || `Session ${session.session_number}`,
        start: { dateTime: startDateTime, timeZone: 'America/Chicago' },
        end: { dateTime: endDateTime, timeZone: 'America/Chicago' },
        conferenceData: {
          createRequest: {
            requestId: session.id,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
      conferenceDataVersion: 1,
    });

    const meetLink = event.data.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === 'video'
    )?.uri || null;

    if (meetLink) {
      await session.update({ meeting_link: meetLink });
    }

    return meetLink;
  } catch (err: any) {
    console.error('[MeetingService] Failed to generate Meet link:', err.message);
    return null;
  }
}

function convertTo24h(timeStr: string): string {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return '10:00';
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}
