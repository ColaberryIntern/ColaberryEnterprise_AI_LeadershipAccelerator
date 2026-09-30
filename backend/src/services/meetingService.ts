import { Op } from 'sequelize';
import LiveSession from '../models/LiveSession';
import { createMeetingForSession, isZoomConfigured } from './zoomService';

// Class video/recording provider — Zoom (replaces Google Meet/Calendar; see
// PROGRESS.md for why: Meet cloud recording required an org-wide Workspace
// edition upgrade, and depended on a human clicking Record — 2 real classes
// went unrecorded under that flow. Zoom's auto_recording setting removes the
// human-error mode entirely). Function names below are kept stable
// (generateMeetLink / ensureSessionMeetLink / etc.) so every existing caller
// — acceleratorController.ts, and schedulerService.ts's self-healing 30-min
// cron — needs zero changes.
export async function generateMeetLink(session: LiveSession): Promise<string | null> {
  try {
    const startDateTime = `${session.session_date}T${convertTo24h(session.start_time)}:00`;
    const durationMinutes = minutesBetween(session.start_time, session.end_time);

    const meeting = await createMeetingForSession(session, { startDateTime, durationMinutes });

    // meeting_provider is never set anywhere else — it only ever carries the
    // DB default ('google_meet') otherwise. Skipping this write would make
    // every Zoom session's recording silently dispatch to the dead Drive
    // path forever (sessionRecordingService.ts branches on this field).
    await session.update({
      meeting_link: meeting.joinUrl,
      meeting_provider: 'zoom',
      zoom_meeting_id: meeting.meetingId,
    });

    return meeting.joinUrl;
  } catch (err: any) {
    console.error('[MeetingService] Failed to generate Zoom meeting:', err.message);
    return null;
  }
}

/** Whether the Zoom meeting/recording integration is configured in this env. */
export function isMeetConfigured(): boolean {
  return isZoomConfigured();
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
 * batch jobs so a Zoom hiccup never blocks the caller.
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

function minutesBetween(startStr: string, endStr: string): number {
  const [sh, sm] = convertTo24h(startStr).split(':').map(Number);
  const [eh, em] = convertTo24h(endStr).split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}
