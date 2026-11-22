/**
 * OH1u: book Maya's follow-up email after an Open House (copy: openHouseFollowupCopy.ts).
 *
 * Who gets which email (FOLLOWUP_PEOPLE_SQL):
 *   attended  in the room for that session: a session_guests row that is not awaiting_class, a
 *             present/late attendance_records row, a classroom_enter presence event or a status
 *             (session_pulse) of a signed-in member. Staff addresses (@colaberry.com) never count.
 *   missed    registered for that Open House (open_house_registrations) and not in the above
 *             (staff registrations excluded).
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
import { followupCopy, firstNameOf, screenFollowupCopy, FollowupTrack, NextOpenHouse, OPEN_HOUSE_SIGNUP_URL } from './openHouseFollowupCopy';
import type { SequenceStep } from '../models/FollowUpSequence';

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

// OH1y (22 Nov 2026): a signed-in member who entered the classroom or set their status was in the room even when the
// system marked them absent for skipping the check-in button: six registrants of the 19 Nov Open House were. Staff
// (@colaberry.com) are never attendees of their own Open House.
export const FOLLOWUP_PEOPLE_SQL = `
WITH here AS (
  SELECT email FROM (
    SELECT g.email_lower AS email FROM session_guests g
     WHERE g.session_id = :sid AND NOT g.awaiting_class AND g.email_lower IS NOT NULL
    UNION
    SELECT LOWER(e.email) FROM attendance_records ar JOIN enrollments e ON e.id = ar.enrollment_id
     WHERE ar.session_id = :sid AND ar.status::text IN ('present', 'late') AND e.email IS NOT NULL
    UNION
    SELECT LOWER(e.email) FROM session_presence_events pe JOIN enrollments e ON e.id = pe.enrollment_id
     WHERE pe.session_id = :sid AND pe.event_type = 'classroom_enter' AND e.email IS NOT NULL
    UNION
    SELECT LOWER(e.email) FROM session_pulse sp JOIN enrollments e ON e.id = sp.enrollment_id
     WHERE sp.session_id = :sid AND e.email IS NOT NULL
  ) h WHERE email NOT LIKE '%@colaberry.com'
), reg AS (
  SELECT DISTINCT r.email_lower AS email FROM open_house_registrations r
    JOIN live_sessions s ON s.open_house_event_id = r.event_id
   WHERE s.id = :sid AND r.email_lower IS NOT NULL AND r.email_lower NOT LIKE '%@colaberry.com'
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

/**
 * OH1w: which of the follow-up sequence's steps this person gets. A sequence with audience tags
 * (Ali's rebuild: step 1 attended, step 2 missed) gives each person only the steps tagged for
 * their track, plus untagged steps (everyone). A sequence with no tags at all is the OH1u
 * original: one fixed email, step 0. Returns the steps with their index in the sequence.
 */
export function stepsForTrack(steps: SequenceStep[] | null | undefined, track: FollowupTrack): Array<{ index: number; step: SequenceStep | null }> {
  const list = Array.isArray(steps) ? steps : [];
  const tagged = list.some((x) => x?.audience === 'attended' || x?.audience === 'missed');
  if (!tagged) return [{ index: 0, step: null }];
  return list.map((step, index) => ({ index, step })).filter(({ step }) => !step.audience || step.audience === track);
}

/**
 * The facts and links Maya's AI is given for one follow-up. Every link it may use is listed
 * exactly; the scheduler screens the draft against the same list (allowed_links) and sends the
 * approved fixed copy instead when the draft fails.
 */
export function followupAiNotes(input: {
  track: FollowupTrack; eventDate: string; next: NextOpenHouse | null; replayUrl: string | null; todayUrl: string; signupUrl: string;
}): { notes: string; allowed: string[]; primary: string } {
  const lines = [
    `OPEN HOUSE FOLLOW-UP. The Colaberry Open House was on ${input.eventDate}.`,
    input.track === 'attended'
      ? 'This person CHECKED IN on the platform during the Open House. Thank them for coming.'
      : 'This person registered but did NOT check in on the platform. They may still have joined on Zoom directly, so never say they were absent or that we missed them: say we did not see them check in, thank them if they did join, and make it easy to catch up.',
  ];
  const allowed: string[] = [];
  let primary = input.signupUrl;
  if (input.track === 'attended') {
    lines.push(`Their Today page (the next step): ${input.todayUrl}`);
    allowed.push(input.todayUrl);
    primary = input.todayUrl;
  } else {
    if (input.replayUrl) {
      lines.push(`Recording of the Open House: ${input.replayUrl}`);
      allowed.push(input.replayUrl);
    } else {
      lines.push('There is NO recording link. Do not mention a recording or a replay.');
    }
    if (input.next?.registered) {
      lines.push(`They are already registered for the next Open House, ${input.next.when_label}; their Join link will come by email. Do not ask them to register.`);
    } else {
      if (input.next) lines.push(`The next Open House: ${input.next.when_label}.`);
      lines.push(`Where to save a spot: ${input.signupUrl}`);
      allowed.push(input.signupUrl);
    }
  }
  lines.push(`Links: use ONLY these, exactly as written: ${allowed.join(' , ') || '(none)'}. Never write a placeholder like [insert link].`);
  return { notes: lines.join('\n'), allowed, primary };
}

/** Book the follow-ups for one Open House session (or one person in it). Never throws for a single person. */
export async function bookOpenHouseFollowups(sessionId: string, opts: { now?: Date; log?: Log; leadId?: number } = {}): Promise<FollowupBookResult> {
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

  const [seq] = await sequelize.query<{ steps: SequenceStep[] }>(
    `SELECT steps FROM follow_up_sequences WHERE id = :id`, { replacements: { id: campaign.sequence_id }, type: QueryTypes.SELECT },
  );
  const replayUrl = String(campaign.settings?.replay_urls?.[sessionId] || '') || null;
  const next = await nextOpenHouseAfter(s.session_date);
  const sendAt = followupSendAt(s.session_date, now);
  const eventDate = longSessionDate(s.session_date);
  const result = empty('booked');
  const { ScheduledEmail, CampaignLead } = await import('../models');
  const { grantEventReminderPermission, PORTAL_TODAY_URL } = await import('./openHouseCountdown');
  const { admitToCampaign } = await import('./campaignMembership');

  await sequelize.transaction(async (t) => {
    // One booking run per session at a time (cron, exit sweep, manual script): the NOT EXISTS
    // check below and the inserts are then race-free. Released at commit.
    await sequelize.query(`SELECT pg_advisory_xact_lock(hashtext(:k))`, { replacements: { k: `oh1u:${sessionId}` }, transaction: t });
    const everyone = await sequelize.query<{ email: string; track: FollowupTrack; lead_id: number | null; name: string | null }>(
      FOLLOWUP_PEOPLE_SQL, { replacements: { sid: sessionId, campaignId: campaign.id }, type: QueryTypes.SELECT, transaction: t },
    );
    const people = opts.leadId ? everyone.filter((p) => Number(p.lead_id) === Number(opts.leadId)) : everyone;
    for (const p of people) {
      if (p.track === 'attended') result.attended += 1; else result.missed += 1;
      if (!p.lead_id) { result.no_lead += 1; continue; }
      const nextFor: NextOpenHouse | null = next ? { when_label: next.when_label, registered: next.emails.has(p.email) } : null;
      const copy = followupCopy({ track: p.track, firstName: firstNameOf(p.name), eventDate, replayUrl, next: nextFor });
      const problems = screenFollowupCopy(copy);
      if (problems.length) {
        result.screened_out += 1;
        log('followup_screened_out', { outcome: 'failure', error_class: 'ContractViolation', context: { lead_id: p.lead_id, track: p.track, problems } });
        continue;
      }
      const ai = followupAiNotes({ track: p.track, eventDate, next: nextFor, replayUrl, todayUrl: PORTAL_TODAY_URL, signupUrl: OPEN_HOUSE_SIGNUP_URL });
      try {
        await grantEventReminderPermission(campaign.id, Number(p.lead_id));
        // One campaign at a time: the follow-up takes them out of the countdown (and anything else).
        await admitToCampaign(campaign.id, Number(p.lead_id), { supersede: true });
        const steps = stepsForTrack(seq?.steps, p.track);
        // A savepoint per person: in Postgres one failed insert aborts the whole transaction,
        // so without it a single bad row would fail everyone after it.
        await sequelize.transaction({ transaction: t }, async (sp) => {
          for (const { index, step } of steps) {
            await ScheduledEmail.create({
              lead_id: p.lead_id, sequence_id: campaign.sequence_id, campaign_id: campaign.id, step_index: index,
              channel: 'email', subject: step?.subject || copy.subject,
              // The approved fixed copy is the body until (and unless) the AI draft passes the screen.
              body: copy.body, to_email: p.email, to_phone: null,
              max_attempts: 1, attempts_made: 0,
              scheduled_for: new Date(sendAt.getTime() + (step?.delay_days || 0) * 86_400_000),
              status: 'pending', ai_instructions: step?.ai_instructions || null,
              metadata: {
                event_followup: true, followup_track: p.track, event_session_id: sessionId, event_title: s.title, event_date: s.session_date,
                step_goal: step?.step_goal || null, ai_tone: step?.ai_tone || null,
                ai_context_notes: [ai.notes, step?.ai_context_notes].filter(Boolean).join('\n'),
                allowed_links: ai.allowed, primary_link: ai.primary,
              },
            } as any, { transaction: sp });
          }
          const [cl, created] = await CampaignLead.findOrCreate({
            where: { campaign_id: campaign.id, lead_id: p.lead_id } as any,
            defaults: { campaign_id: campaign.id, lead_id: p.lead_id, status: 'active', total_steps: steps.length } as any,
            transaction: sp,
          });
          if (!created && (cl as any).status === 'completed') await cl.update({ status: 'active', completed_at: null } as any, { transaction: sp });
        });
        result.booked += 1;
      } catch (err: any) {
        result.errors += 1;
        log('followup_book_failed', { outcome: 'failure', error_class: err?.name || 'DatabaseError', context: { lead_id: p.lead_id, message: err?.message } });
      }
    }
  });
  log('followups_booked', { outcome: result.errors ? 'partial' : 'success', context: { session_id: sessionId, lead_id: opts.leadId ?? null, ...result } });
  return result;
}

/** True when this session is an Open House from the last FOLLOWUP_LOOKBACK_DAYS days (the automatic window). */
export async function isRecentOpenHouse(sessionId: string): Promise<boolean> {
  const rows = await sequelize.query<{ ok: boolean }>(
    `SELECT TRUE AS ok FROM live_sessions WHERE id = :sid AND open_house_event_id IS NOT NULL
        AND session_date BETWEEN CURRENT_DATE - CAST(:days AS int) AND CURRENT_DATE`,
    { replacements: { sid: sessionId, days: FOLLOWUP_LOOKBACK_DAYS }, type: QueryTypes.SELECT },
  );
  return rows.length > 0;
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
