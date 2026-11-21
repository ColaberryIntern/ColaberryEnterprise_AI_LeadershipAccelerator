/**
 * OH1u: book Maya's follow-up email after an Open House (copy: openHouseFollowupCopy.ts).
 *
 * Who gets which email (FOLLOWUP_PEOPLE_SQL):
 *   attended  checked in on the platform for that session: a session_guests row that is not
 *             awaiting_class, or a present/late attendance_records row of a signed-in member.
 *   missed    registered for that Open House (open_house_registrations) and not in the above.
 * Attended wins, so nobody gets both.
 *
 * Gates, in order (fail closed at each):
 *   - the follow-up campaign exists and is ACTIVE (Ali activates it in Admin > Campaigns after
 *     approving the copy; while it is a draft nothing is booked at all)
 *   - the session is an Open House and ended at least 30 minutes ago
 *   - the person has a lead record and was not removed from the campaign
 *   - the copy passes screenMayaCopy
 * Then the row is a normal campaign send: the scheduler's own gates (kill switch, brand
 * permission, consent, suppression, send window) still run at send time.
 *
 * Idempotency: one follow-up per (campaign, lead, event_session_id), checked inside a
 * transaction that holds a per-session advisory lock, so the hourly cron and a manual run can
 * never double-book. Re-running books nothing new.
 *
 * Failure modes handled: no campaign / not active / session missing or not ended (nothing
 * booked, reason returned); a per-person failure is counted and logged and the rest continue.
 * Not handled: attendance outside the platform (Zoom-direct joiners look "missed"; the missed
 * copy is written to be true either way).
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { classInstant, formatCentralClock } from './centralDate';
import { longSessionDate } from './email/sessionReminderEmail';
import { followupCopy, firstNameOf, screenFollowupCopy, FollowupTrack, NextOpenHouse } from './openHouseFollowupCopy';

export const OPEN_HOUSE_FOLLOWUP_KEY = 'open_house_followup';

/** How long after the end of an Open House before the follow-ups are booked. */
export const FOLLOWUP_GRACE_MINUTES = 30;
/** The follow-up goes out the morning after, at this Central time (or right away if that is past). */
export const FOLLOWUP_SEND_CLOCK = '10:00';
/** The hourly run looks back this many days for Open Houses to follow up. */
export const FOLLOWUP_LOOKBACK_DAYS = 2;

type Log = (event: string, context?: Record<string, unknown>) => void;
const defaultLog: Log = (event, context = {}) => {
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', service: 'open-house-followup', event, ...context })}\n`);
};

export interface FollowupCampaign { id: string; status: string; sequence_id: string | null; settings: Record<string, any> | null }

export async function findFollowupCampaign(): Promise<FollowupCampaign | null> {
  const rows = await sequelize.query<FollowupCampaign>(
    `SELECT id, status, sequence_id, settings FROM campaigns
      WHERE settings->>'campaign_key' = :key AND archived_at IS NULL ORDER BY created_at ASC LIMIT 1`,
    { replacements: { key: OPEN_HOUSE_FOLLOWUP_KEY }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

export const FOLLOWUP_PEOPLE_SQL = `
WITH here AS (
  SELECT g.email_lower AS email FROM session_guests g
   WHERE g.session_id = :sid AND NOT g.awaiting_class AND g.email_lower IS NOT NULL
  UNION
  SELECT LOWER(e.email) FROM attendance_records ar JOIN enrollments e ON e.id = ar.enrollment_id
   WHERE ar.session_id = :sid AND ar.status::text IN ('present', 'late') AND e.email IS NOT NULL
), reg AS (
  SELECT DISTINCT r.email_lower AS email FROM open_house_registrations r
    JOIN live_sessions s ON s.open_house_event_id = r.event_id
   WHERE s.id = :sid AND r.email_lower IS NOT NULL
), people AS (
  SELECT email, 'attended' AS track FROM here
  UNION ALL
  SELECT r.email, 'missed' AS track FROM reg r WHERE NOT EXISTS (SELECT 1 FROM here h WHERE h.email = r.email)
)
SELECT p.email, p.track, l.id AS lead_id, l.name
  FROM people p
  LEFT JOIN LATERAL (SELECT id, name FROM leads WHERE LOWER(email) = p.email ORDER BY id LIMIT 1) l ON true
 WHERE l.id IS NULL OR (
   NOT EXISTS (SELECT 1 FROM campaign_leads cl WHERE cl.campaign_id = :campaignId AND cl.lead_id = l.id AND cl.status = 'removed')
   AND NOT EXISTS (SELECT 1 FROM scheduled_emails se WHERE se.campaign_id = :campaignId AND se.lead_id = l.id
                   AND se.metadata->>'event_session_id' = CAST(:sid AS text)))
 ORDER BY p.track, p.email`;

interface SessionRow { id: string; title: string; session_date: string; start_time: string; end_time: string | null; status: string; open_house_event_id: string | null }

/** When the session ended: its end_time, or 90 minutes after the start when it has none. */
export function sessionEnd(s: Pick<SessionRow, 'session_date' | 'start_time' | 'end_time'>): Date {
  if (s.end_time) return classInstant(s.session_date, s.end_time);
  return new Date(classInstant(s.session_date, s.start_time).getTime() + 90 * 60_000);
}

/** 10:00 AM Central the day after the session, or `now` when that has passed. */
export function followupSendAt(sessionDate: string, now: Date): Date {
  const d = new Date(`${sessionDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const at = classInstant(d.toISOString().slice(0, 10), FOLLOWUP_SEND_CLOCK);
  return Number.isNaN(at.getTime()) || at.getTime() < now.getTime() ? now : at;
}

async function nextOpenHouseAfter(sessionDate: string): Promise<{ when_label: string; emails: Set<string> } | null> {
  const [n] = await sequelize.query<{ d: string; start_time: string; open_house_event_id: string }>(
    `SELECT session_date::text AS d, start_time, open_house_event_id FROM live_sessions
      WHERE open_house_event_id IS NOT NULL AND status IN ('scheduled', 'live') AND session_date > CAST(:date AS date)
      ORDER BY session_date, start_time LIMIT 1`,
    { replacements: { date: sessionDate }, type: QueryTypes.SELECT },
  );
  if (!n) return null;
  const regs = await sequelize.query<{ email: string }>(
    `SELECT DISTINCT email_lower AS email FROM open_house_registrations WHERE event_id = :e`,
    { replacements: { e: n.open_house_event_id }, type: QueryTypes.SELECT },
  );
  return { when_label: `${longSessionDate(n.d)} at ${formatCentralClock(n.d, n.start_time)}`, emails: new Set(regs.map((r) => r.email)) };
}

export interface FollowupBookResult {
  outcome: 'booked' | 'no_campaign' | 'not_active' | 'no_session' | 'not_open_house' | 'not_ended';
  attended: number; missed: number; booked: number; no_lead: number; screened_out: number; errors: number;
}

const empty = (outcome: FollowupBookResult['outcome']): FollowupBookResult =>
  ({ outcome, attended: 0, missed: 0, booked: 0, no_lead: 0, screened_out: 0, errors: 0 });

/** Book the follow-ups for one Open House session. Never throws for a single person. */
export async function bookOpenHouseFollowups(sessionId: string, opts: { now?: Date; log?: Log } = {}): Promise<FollowupBookResult> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? defaultLog;
  const campaign = await findFollowupCampaign();
  if (!campaign || !campaign.sequence_id) return empty('no_campaign');
  if (campaign.status !== 'active') return empty('not_active');
  const [s] = await sequelize.query<SessionRow>(
    `SELECT id, title, session_date::text AS session_date, start_time, end_time, status, open_house_event_id FROM live_sessions WHERE id = :sid`,
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
  if (!s) return empty('no_session');
  if (!s.open_house_event_id || s.status === 'cancelled') return empty('not_open_house');
  if (now.getTime() < sessionEnd(s).getTime() + FOLLOWUP_GRACE_MINUTES * 60_000) return empty('not_ended');

  const replayUrl = String(campaign.settings?.replay_urls?.[sessionId] || '') || null;
  const next = await nextOpenHouseAfter(s.session_date);
  const sendAt = followupSendAt(s.session_date, now);
  const eventDate = longSessionDate(s.session_date);
  const result = empty('booked');
  const { ScheduledEmail, CampaignLead } = await import('../models');
  const { grantEventReminderPermission } = await import('./openHouseCountdown');

  await sequelize.transaction(async (t) => {
    // One booking run per session at a time (cron + manual script): the NOT EXISTS check
    // below and the inserts are then race-free. Released at commit.
    await sequelize.query(`SELECT pg_advisory_xact_lock(hashtext(:k))`, { replacements: { k: `oh1u:${sessionId}` }, transaction: t });
    const people = await sequelize.query<{ email: string; track: FollowupTrack; lead_id: number | null; name: string | null }>(
      FOLLOWUP_PEOPLE_SQL, { replacements: { sid: sessionId, campaignId: campaign.id }, type: QueryTypes.SELECT, transaction: t },
    );
    for (const p of people) {
      if (p.track === 'attended') result.attended += 1; else result.missed += 1;
      if (!p.lead_id) { result.no_lead += 1; continue; }
      const copy = followupCopy({
        track: p.track, firstName: firstNameOf(p.name), eventDate, replayUrl,
        next: next ? { when_label: next.when_label, registered: next.emails.has(p.email) } as NextOpenHouse : null,
      });
      const problems = screenFollowupCopy(copy);
      if (problems.length) {
        result.screened_out += 1;
        log('followup_screened_out', { outcome: 'failure', error_class: 'ContractViolation', context: { lead_id: p.lead_id, track: p.track, problems } });
        continue;
      }
      try {
        await grantEventReminderPermission(campaign.id, Number(p.lead_id));
        // A savepoint per person: in Postgres one failed insert aborts the whole transaction,
        // so without it a single bad row would fail everyone after it.
        await sequelize.transaction({ transaction: t }, async (sp) => {
          await ScheduledEmail.create({
            lead_id: p.lead_id, sequence_id: campaign.sequence_id, campaign_id: campaign.id, step_index: 0,
            channel: 'email', subject: copy.subject, body: copy.body, to_email: p.email, to_phone: null,
            max_attempts: 1, attempts_made: 0, scheduled_for: sendAt, status: 'pending', ai_instructions: null,
            metadata: { event_followup: true, followup_track: p.track, event_session_id: sessionId, event_title: s.title, event_date: s.session_date },
          } as any, { transaction: sp });
          await CampaignLead.findOrCreate({
            where: { campaign_id: campaign.id, lead_id: p.lead_id } as any,
            defaults: { campaign_id: campaign.id, lead_id: p.lead_id, status: 'active', total_steps: 1 } as any,
            transaction: sp,
          });
        });
        result.booked += 1;
      } catch (err: any) {
        result.errors += 1;
        log('followup_book_failed', { outcome: 'failure', error_class: err?.name || 'DatabaseError', context: { lead_id: p.lead_id, message: err?.message } });
      }
    }
  });
  log('followups_booked', { outcome: result.errors ? 'partial' : 'success', context: { session_id: sessionId, ...result } });
  return result;
}

/**
 * The hourly run: every Open House from the last FOLLOWUP_LOOKBACK_DAYS days. Cheap no-op while
 * the campaign is not active. Never throws.
 */
export async function bookRecentOpenHouseFollowups(opts: { now?: Date; log?: Log } = {}): Promise<FollowupBookResult[]> {
  const log = opts.log ?? defaultLog;
  try {
    const campaign = await findFollowupCampaign();
    if (!campaign || campaign.status !== 'active') return [];
    const sessions = await sequelize.query<{ id: string }>(
      `SELECT id FROM live_sessions WHERE open_house_event_id IS NOT NULL AND status <> 'cancelled'
          AND session_date BETWEEN CURRENT_DATE - CAST(:days AS int) AND CURRENT_DATE ORDER BY session_date`,
      { replacements: { days: FOLLOWUP_LOOKBACK_DAYS }, type: QueryTypes.SELECT },
    );
    const out: FollowupBookResult[] = [];
    for (const s of sessions) out.push(await bookOpenHouseFollowups(s.id, opts));
    return out;
  } catch (err: any) {
    log('followups_run_failed', { outcome: 'failure', error_class: err?.name || 'Error', context: { message: err?.message } });
    return [];
  }
}
