/**
 * OH1t: keep the next Open House on our side, and book the countdown for anyone who
 * registered before it was.
 *
 * WHY. Until this, a `live_sessions` row for an Open House existed only after someone ran
 * scripts/ensureOpenHouseSession.ts by hand. The countdown fails closed without that row
 * (no event, nothing booked - correct), but nothing booked those registrants later either:
 * re-enrolling an already-enrolled lead is a no-op. On 2026-11-20 all 22 Dec 3 registrants
 * were enrolled with zero reminders, and were booked by hand.
 *
 * WHAT IT DOES, hourly (schedulerService cron 'OpenHouseSessionSync'):
 *   1. ensureNextOpenHouseSession(): create-or-update the session for the next announced
 *      Open House, keyed on the Eventbrite id (the logic the script used to own).
 *   1b. ensureRoomAndMeeting() (OH1v): give the session its community room and a platform
 *      Zoom meeting, so no Open House depends on a hand-picked meeting again.
 *   2. bookCountdownForEarlierRegistrants(): for each registrant of that session who has NO
 *      countdown row for it (any status), grant the event-reminder permission (never
 *      overwrites a person's own choice) and book the countdown.
 *
 * WHY "NO ROW FOR THIS SESSION, ANY STATUS". A cancelled reminder for this session means
 * someone (a gate, an operator, the person) already decided about it; re-booking would
 * undo that. Keyed on metadata.event_session_id, which sequenceService stamps on every
 * countdown row, so a lead's rows for an earlier Open House do not count.
 *
 * SENDS NOTHING ITSELF. Booking only writes pending rows timed back from the event; the
 * scheduler and every send gate (brand, consent, quiet hours) still decide each send. Steps
 * already in the past are skipped by sequenceService. Never throws from the cron entry.
 */
import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { getCurrentOpenHouseEvent } from './openHouseEventService';
import { getOrCreateExplorerCohort } from './cohortService';
import { instantToWallClock, CENTRAL_TZ } from './centralDate';

type Log = (event: string, context?: Record<string, unknown>) => void;

export const defaultLog: Log = (event, context = {}) => {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(), level: 'info', service: 'open-house-session', event, ...context,
  })}\n`);
};

/** "2026-11-19" and "18:30" in Central, from the instant the endpoint reports. */
export function centralParts(startsAt: Date): { date: string; time: string } {
  // instantToWallClock returns ISO-SHAPED "YYYY-MM-DDTHH:mm:ss". Split on the T and assert
  // the shape, so a format change fails loudly instead of writing a blank clock
  // (start_time is NOT NULL; an early draft split on a space and would have).
  const wall = instantToWallClock(startsAt, CENTRAL_TZ);
  const [date, clock] = wall.split('T');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}/.test(clock || '')) {
    throw new Error(`unreadable wall clock from instantToWallClock: ${JSON.stringify(wall)}`);
  }
  return { date, time: clock.slice(0, 5) };
}

export interface SessionSyncResult {
  outcome: 'no_event' | 'unreadable_start' | 'dry_run' | 'created' | 'updated';
  id?: string;
  event_id?: string;
  would?: 'insert' | 'update';
}

/**
 * Create or update the `live_sessions` row for the next announced Open House. Idempotent:
 * keyed on the Eventbrite id by a unique partial index. Never touches status or the
 * reminder stamps, so a re-run cannot cause a re-send or resurrect a completed row.
 */
export async function ensureNextOpenHouseSession(opts: { dryRun?: boolean } = {}, log: Log = defaultLog): Promise<SessionSyncResult> {
  const event = await getCurrentOpenHouseEvent();
  if (!event || !event.announced || !event.event_id || !event.starts_at) {
    log('no_event_announced', { outcome: 'noop' });
    return { outcome: 'no_event' };
  }
  const startsAt = new Date(event.starts_at);
  if (Number.isNaN(startsAt.getTime())) {
    log('unreadable_start', { outcome: 'failure', starts_at: event.starts_at });
    return { outcome: 'unreadable_start', event_id: event.event_id };
  }
  // end_time is NOT NULL; an hour is what every Open House has run for.
  const hourLater = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const endsAt = event.ends_at ? new Date(event.ends_at) : hourLater;
  const start = centralParts(startsAt);
  const end = centralParts(Number.isNaN(endsAt.getTime()) ? hourLater : endsAt);
  const cohort = await getOrCreateExplorerCohort();

  const existing = await sequelize.query<{ id: string }>(
    `SELECT id FROM live_sessions WHERE open_house_event_id = :eventId`,
    { replacements: { eventId: event.event_id }, type: QueryTypes.SELECT },
  );
  log('resolved', {
    event_id: event.event_id, title: event.name, date: start.date, start_time: start.time,
    end_time: end.time, cohort_id: cohort.id, existing: existing[0]?.id ?? null, dryRun: !!opts.dryRun,
  });
  if (opts.dryRun) {
    const would = existing.length ? 'update' : 'insert';
    log('dry_run', { outcome: 'noop', would });
    return { outcome: 'dry_run', event_id: event.event_id, id: existing[0]?.id, would };
  }

  if (existing.length > 0) {
    // No updated_at: this table has no such column.
    await sequelize.query(
      `UPDATE live_sessions SET title = :title, session_date = :date, start_time = :start, end_time = :end WHERE id = :id`,
      { replacements: { id: existing[0].id, title: event.name, date: start.date, start: start.time, end: end.time }, type: QueryTypes.UPDATE },
    );
    log('updated', { id: existing[0].id, outcome: 'success' });
    return { outcome: 'updated', id: existing[0].id, event_id: event.event_id };
  }

  // status 'scheduled' is what the schedulers filter on. session_type stays the 'core'
  // default (the enum admits only core/lab); open_house_event_id is what marks an Open House.
  // cohort_id is NOT NULL; the Explorer cohort is whose calendar it belongs on, and nothing
  // reads it for recipients. id is minted here: live_sessions.id has no column default.
  const id = randomUUID();
  await sequelize.query(
    `INSERT INTO live_sessions
       (id, cohort_id, session_number, title, description, session_date, start_time, end_time,
        status, open_house_event_id, created_at)
     VALUES (:id, :cohort, 0, :title, :description, :date, :start, :end, 'scheduled', :eventId, NOW())`,
    {
      replacements: {
        id, cohort: cohort.id, title: event.name,
        description: 'Open House. Registrations are taken on our own landing page; reminders go to those registrants only.',
        date: start.date, start: start.time, end: end.time, eventId: event.event_id,
      },
      type: QueryTypes.INSERT,
    },
  );
  log('created', { id, outcome: 'success' });
  return { outcome: 'created', id, event_id: event.event_id };
}

/**
 * Registrants of an upcoming Open House session who have no countdown row for it, in any
 * status. A lead whose campaign enrollment was 'removed' is left alone.
 */
export const UNBOOKED_REGISTRANTS_SQL = `
  SELECT DISTINCT l.id AS lead_id
    FROM live_sessions s
    JOIN open_house_registrations r ON r.event_id = s.open_house_event_id
    JOIN leads l ON LOWER(l.email) = r.email_lower
   WHERE s.id = :sessionId
     AND s.status IN ('scheduled', 'live')
     AND NOT EXISTS (SELECT 1 FROM campaign_leads cl
                      WHERE cl.campaign_id = :campaignId AND cl.lead_id = l.id AND cl.status = 'removed')
     AND NOT EXISTS (SELECT 1 FROM scheduled_emails se
                      WHERE se.campaign_id = :campaignId AND se.lead_id = l.id
                        AND se.metadata->>'event_session_id' = CAST(:sessionId AS text))
   ORDER BY l.id`;

export interface BookResult {
  campaign: 'ok' | 'none' | 'not_active';
  candidates: number;
  booked: number;
  rows: number;
  nothing_booked: number;
  errors: number;
}

export async function bookCountdownForEarlierRegistrants(sessionId: string, log: Log = defaultLog): Promise<BookResult> {
  const result: BookResult = { campaign: 'ok', candidates: 0, booked: 0, rows: 0, nothing_booked: 0, errors: 0 };
  const { findOpenHouseCountdownCampaign, grantEventReminderPermission } = await import('./openHouseCountdown');
  const campaign = await findOpenHouseCountdownCampaign();
  if (!campaign || !campaign.sequence_id) { result.campaign = 'none'; return result; }
  // A draft or paused countdown books nothing here; activating the campaign enrolls its queue.
  if (campaign.status !== 'active') { result.campaign = 'not_active'; return result; }

  const leads = await sequelize.query<{ lead_id: number }>(UNBOOKED_REGISTRANTS_SQL, {
    replacements: { sessionId, campaignId: campaign.id }, type: QueryTypes.SELECT,
  });
  result.candidates = leads.length;
  const { enrollLeadInSequence } = await import('./sequenceService');
  const { admitToCampaign } = await import('./campaignMembership');
  for (const { lead_id } of leads) {
    try {
      await grantEventReminderPermission(campaign.id, Number(lead_id));
      // OH1w: the Open House takes precedence; booking the countdown moves them out of any
      // other running campaign (one campaign at a time).
      await admitToCampaign(campaign.id, Number(lead_id), { supersede: true });
      const out = await enrollLeadInSequence(Number(lead_id), campaign.sequence_id, campaign.id);
      const n = Array.isArray(out) ? out.length : 0;
      if (n > 0) { result.booked++; result.rows += n; } else result.nothing_booked++;
    } catch (err: any) {
      result.errors++;
      log('book_failed', { lead_id, outcome: 'failure', message: err?.message });
    }
  }
  if (result.candidates) log('booked_earlier_registrants', { session_id: sessionId, ...result });
  return result;
}

export interface RoomAndMeetingResult {
  room_id: string | null;
  meeting: 'minted' | 'kept' | 'failed' | 'no_session';
}

/**
 * OH1v (Ali, 2026-11-20): "Every event that comes in, you should be assigning to a room and a
 * zoom as well." "Just use the zoom you have."
 *
 * Before this, an Open House session got a community room only when it was created through the
 * admin screens, and a Zoom meeting only when someone clicked Generate Meet link. The sync-made
 * Dec 3 session had neither, and Nov 19 ran on a hand-picked recurring Support meeting
 * (waiting room on, no attendance, the platform recorded an empty room).
 *
 * Room: the same ensureRoomForSession every class uses (idempotent findOrCreate on the session).
 * Zoom: the same generateMeetLink every class uses: the platform's own host, waiting room off,
 * cloud recording on, stored on the session, which is where the check-in link in every reminder
 * sends people. Only minted when the session has NO link, so a re-run never mints a second
 * meeting and never replaces a link someone set on purpose.
 */
export async function ensureRoomAndMeeting(sessionId: string, log: Log = defaultLog): Promise<RoomAndMeetingResult> {
  const { LiveSession } = await import('../models');
  const session = await LiveSession.findByPk(sessionId);
  if (!session) return { room_id: null, meeting: 'no_session' };

  const { resolveRoomId } = await import('./acceleratorService');
  const room_id = await resolveRoomId(session);

  let meeting: RoomAndMeetingResult['meeting'] = 'kept';
  if (!(session as any).meeting_link) {
    const { generateMeetLink } = await import('./meetingService');
    meeting = (await generateMeetLink(session)) ? 'minted' : 'failed';
  }
  log('room_and_meeting', {
    session_id: sessionId, room_id, meeting,
    outcome: meeting === 'failed' || !room_id ? 'partial' : 'success',
  });
  return { room_id, meeting };
}

/** The cron entry: ensure the session, its room and Zoom, then book whoever it was missing. Never throws. */
export async function syncOpenHouseCountdown(log: Log = defaultLog): Promise<{
  session: SessionSyncResult | null; venue: RoomAndMeetingResult | null; booking: BookResult | null;
}> {
  let session: SessionSyncResult | null = null;
  let venue: RoomAndMeetingResult | null = null;
  try {
    session = await ensureNextOpenHouseSession({}, log);
    if (!session.id || (session.outcome !== 'created' && session.outcome !== 'updated')) return { session, venue, booking: null };
    venue = await ensureRoomAndMeeting(session.id, log);
    const booking = await bookCountdownForEarlierRegistrants(session.id, log);
    return { session, venue, booking };
  } catch (err: any) {
    log('sync_failed', { outcome: 'failure', message: err?.message });
    return { session, venue, booking: null };
  }
}
