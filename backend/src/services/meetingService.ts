import { Op } from 'sequelize';
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

/** Whether the Google Calendar / Meet integration is configured in this env. */
export function isMeetConfigured(): boolean {
  return Boolean(env.googleServiceAccountEmail && env.googlePrivateKey);
}

/**
 * Pure: should a teaching Meet link be generated for this session now? No if it
 * already has one, or the session is over/cancelled, or Meet isn't configured.
 * Exported for unit testing.
 */
export function shouldGenerateMeetLink(
  session: { meeting_link?: string | null; status: string },
  meetConfigured: boolean
): boolean {
  if (session.meeting_link) return false;
  if (session.status === 'completed' || session.status === 'cancelled') return false;
  return meetConfigured;
}

/**
 * Idempotent + best-effort: ensure a session has a teaching Meet link. Returns
 * the existing link, a newly generated one, or null (already over / not
 * configured / generation failed). Never throws — safe to call from crons and
 * batch jobs so a Google hiccup never blocks the caller.
 */
export async function ensureSessionMeetLink(session: LiveSession): Promise<string | null> {
  if (session.meeting_link) return session.meeting_link;
  if (!shouldGenerateMeetLink(session, isMeetConfigured())) return null;
  return generateMeetLink(session); // best-effort — returns null on failure
}

/**
 * Backfill / on-demand: generate a teaching Meet link for every upcoming
 * (scheduled | live) session in a cohort that lacks one. Idempotent — sessions
 * that already have a link are skipped. Best-effort per session.
 */
export async function generateCohortMeetLinks(
  cohortId: string
): Promise<{ total: number; generated: number; skipped: number; failed: number }> {
  const sessions = await LiveSession.findAll({
    where: { cohort_id: cohortId, status: { [Op.in]: ['scheduled', 'live'] } },
    order: [['session_number', 'ASC']],
  });
  let generated = 0;
  let skipped = 0;
  let failed = 0;
  for (const s of sessions) {
    if (s.meeting_link) {
      skipped++;
      continue;
    }
    const link = await ensureSessionMeetLink(s);
    if (link) generated++;
    else failed++;
  }
  return { total: sessions.length, generated, skipped, failed };
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
