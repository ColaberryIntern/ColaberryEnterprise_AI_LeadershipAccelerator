import cron from 'node-cron';
import { sequelize } from '../../config/database';
import { careerPrepEnabled } from '../careerPrep/careerPrepFlag';
import { isSwitchOn, SWITCHES } from './darkSwitches';
import { candidateRoomUrl, roomPageUrl } from './roomLink';
import { EMAIL, sendOne, type FinishOpts, type Part } from './bookingConfirm';
import { employerReminderEmail, learnerReminderEmail, nudgeEmail, type ReminderKind } from './bookingReminderEmail';
import type { ConfirmFacts } from './bookingConfirmEmail';

/**
 * Career Prep v27, CP8.2c (kit F4): reminders before a booked interview and the nudge when a booking link goes unused.
 * Every 5 minutes, one pass at a time per process, at most BATCH interviews of each kind per pass.
 *
 *   reminders  24 hours and 1 hour before a booked interview whose confirmation went out (confirm_done_at): to the
 *              learner (Career Prep allow-list) and to the employer and each interviewer (career_prep_employer_mail_enabled;
 *              off: one keyed held row). A reminder is skipped when the confirmation itself went out after its mark (the
 *              confirmation is the fresher message). Times are UTC instants, so a clock change moves nothing.
 *   nudge      a booking link sent more than 24 hours ago, interview still new or awaiting: ONE review item "Not booked in
 *              24 h" (placement_review_items kind not_booked) and one nudge to the employer (switch-gated, else held).
 * ONCE: each send goes through sendOnce keyed (recipient, fixed subject, `placement_interview:<id>:<kind>:<start>`; the nudge
 * keys on the booking-link round), and a keyed `<kind>_done` event row ends the item, so a rescheduled interview gets fresh
 * reminders for its new time. Messages carry the consent-room PAGE link only, never the provider's link (the nudge, sent
 * before any booking, carries no room link). LOCKS: none; single keyed INSERTs only (plan T19 lock order).
 * FAILURE: each item counts its tries in a keyed `<kind>_try` row; after MAX_TRIES it is closed with a `gave_up` done row
 * and an error line for staff, never retried forever.
 */
export const BATCH = 50;
export const MAX_TRIES = 3;
export const NUDGE_AFTER_MS = 24 * 60 * 60_000;
const H = 60 * 60_000;

type Row = { id: string; enrollment_id: string; company: string | null; position: string | null; contact_email: string | null; starts_at: Date | string;
  minutes: number | null; interviewer_emails: string[] | null; booker_tz: string | null; confirm_done_at: Date | string;
  full_name: string | null; personal_email: string | null; job_address: string | null };
type Unbooked = { id: string; enrollment_id: string; company: string | null; position: string | null; contact_email: string | null;
  booking_link_round: string; booking_link_sent_at: Date | string; full_name: string | null; job_address: string | null };

function log(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'backend', event,
    outcome: level === 'info' ? 'success' : 'failure', ...(errorClass ? { error_class: errorClass } : {}), context });
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
}

/** PURE: which reminders are due for a booked interview at `now` (UTC instants; DST cannot shift them). */
export function dueReminders(startsAt: Date, confirmedAt: Date, now: Date): ReminderKind[] {
  const s = startsAt.getTime(); const n = now.getTime(); const c = confirmedAt.getTime();
  const out: ReminderKind[] = [];
  if (n >= s - 24 * H && n < s - H && c < s - 24 * H) out.push('24h');
  if (n >= s - H && n < s && c < s - H) out.push('1h');
  return out;
}

async function event(id: string, name: string, src: string, payload: Record<string, unknown>): Promise<void> {
  await sequelize.query(
    `INSERT INTO placement_events (subject_type, subject_id, event, actor, payload, source_event_id)
     VALUES ('placement_interview', :id, :name, 'platform', CAST(:payload AS jsonb), :src) ON CONFLICT DO NOTHING`,
    { replacements: { id, name, payload: JSON.stringify(payload), src } });
}

/** Count one try for an item; the running total. */
async function countTry(id: string, src: string): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO placement_events (subject_type, subject_id, event, actor, payload, source_event_id)
     VALUES ('placement_interview', :id, 'reminder_try', 'platform', '{"tries":1}'::jsonb, :src)
     ON CONFLICT (source_event_id) WHERE source_event_id IS NOT NULL
     DO UPDATE SET payload = jsonb_build_object('tries', (placement_events.payload->>'tries')::int + 1) RETURNING (payload->>'tries')::int AS tries`,
    { replacements: { id, src } });
  return Number((rows as Array<{ tries: number }>)[0]?.tries ?? MAX_TRIES + 1);
}

const facts = (r: Row): ConfirmFacts => ({ candidateName: r.full_name, company: r.company, position: r.position, startsAt: new Date(r.starts_at), minutes: Number(r.minutes ?? 30), bookerTz: r.booker_tz });
const employerList = (r: Pick<Row, 'contact_email' | 'interviewer_emails'>) =>
  [...new Set([r.contact_email, ...(r.interviewer_emails ?? [])].map((e) => String(e ?? '').trim().toLowerCase()).filter((e) => EMAIL.test(e)))];

/** One reminder for one interview: learner, then employer side; true when the item is finished (sent, held or given up). */
export async function remindOne(r: Row, kind: ReminderKind, opts: FinishOpts = {}): Promise<boolean> {
  const f = facts(r);
  const start = f.startsAt.toISOString();
  const tag = `${kind}:${r.id}:${start}`;
  const tries = await countTry(r.id, `reminder_try:${tag}`);
  if (tries > MAX_TRIES) {
    await event(r.id, 'reminder_done', `reminder_done:${tag}`, { gave_up: true });
    log('error', 'placement_reminder_gave_up', { interview_id: r.id, kind, fix: 'check Mandrill; the booked interview stands' }, 'RetriesExhausted');
    return true;
  }
  const key = `placement_interview:${r.id}:reminder_${kind}:${start}`;
  const parts: Part[] = [];
  if (await (opts.learnerAllowed ?? ((e: string) => careerPrepEnabled(e)))(r.enrollment_id) && r.personal_email && EMAIL.test(r.personal_email)) {
    parts.push(await sendOne(r.personal_email, learnerReminderEmail(kind, f, candidateRoomUrl(r.id)), key, null, null, 'career-prep-interview-reminder'));
  }
  if (!(await isSwitchOn(SWITCHES.employerMail, opts.read))) await event(r.id, 'reminder_held', `reminder_held:${tag}`, { reason: 'held: employer email is switched off' });
  else {
    const page = roomPageUrl(r.id, new Date(f.startsAt.getTime() + f.minutes * 60_000));
    for (const to of employerList(r)) parts.push(await sendOne(to, employerReminderEmail(kind, f, page), key, null, r.job_address, 'career-prep-interview-reminder'));
  }
  if (parts.includes('failed')) return false;
  await event(r.id, 'reminder_done', `reminder_done:${tag}`, { sent: parts.length });
  return true;
}

/** The nudge for one unused booking link: the review item, then the employer nudge. True when finished. */
export async function nudgeOne(u: Unbooked, opts: FinishOpts = {}): Promise<boolean> {
  const tag = `${u.id}:${u.booking_link_round}`;
  const tries = await countTry(u.id, `booking_nudge_try:${tag}`);
  await sequelize.query(
    `INSERT INTO placement_review_items (kind, source_event_id, enrollment_id, interview_id, summary)
     VALUES ('not_booked', :src, :e, :id, CAST(:sum AS jsonb)) ON CONFLICT (kind, source_event_id) DO NOTHING`,
    { replacements: { src: `not_booked:${tag}`, e: u.enrollment_id, id: u.id, sum: JSON.stringify({ title: 'Not booked in 24 h', company: u.company, position: u.position, link_sent_at: new Date(u.booking_link_sent_at).toISOString() }) } });
  if (tries > MAX_TRIES) {
    await event(u.id, 'booking_nudge_done', `booking_nudge_done:${tag}`, { gave_up: true });
    log('error', 'placement_booking_nudge_gave_up', { interview_id: u.id, fix: 'the review item stands; a recruiter follows up' }, 'RetriesExhausted');
    return true;
  }
  let part: Part = 'skipped';
  if (!(await isSwitchOn(SWITCHES.employerMail, opts.read))) {
    await event(u.id, 'booking_nudge_held', `booking_nudge_held:${tag}`, { reason: 'held: employer email is switched off' });
    part = 'held';
  } else if (u.contact_email && EMAIL.test(u.contact_email)) {
    part = await sendOne(u.contact_email.trim().toLowerCase(), nudgeEmail({ candidateName: u.full_name, company: u.company, position: u.position }),
      `placement_interview:${u.id}:booking_nudge:${u.booking_link_round}`, null, u.job_address, 'career-prep-booking-nudge');
  }
  if (part === 'failed') return false;
  await event(u.id, 'booking_nudge_done', `booking_nudge_done:${tag}`, { part });
  return true;
}

const BOOKED = `SELECT i.id, i.enrollment_id, i.company, i.position, i.contact_email, i.starts_at, i.minutes, i.interviewer_emails, i.booker_tz,
    i.confirm_done_at, e.full_name, e.email AS personal_email, j.address AS job_address
  FROM placement_interviews i JOIN enrollments e ON e.id = i.enrollment_id LEFT JOIN job_search_inboxes j ON j.enrollment_id = i.enrollment_id
  WHERE i.state = 'booked' AND i.confirm_done_at IS NOT NULL AND i.starts_at > :now AND i.starts_at <= :horizon
  ORDER BY i.starts_at LIMIT ${BATCH}`;
const UNBOOKED = `SELECT i.id, i.enrollment_id, i.company, i.position, i.contact_email, i.booking_link_round, i.booking_link_sent_at, e.full_name, j.address AS job_address
  FROM placement_interviews i JOIN enrollments e ON e.id = i.enrollment_id LEFT JOIN job_search_inboxes j ON j.enrollment_id = i.enrollment_id
  WHERE i.state IN ('new', 'awaiting') AND i.booking_link_round IS NOT NULL AND i.booking_link_sent_at IS NOT NULL AND i.booking_link_sent_at < :cutoff
    AND NOT EXISTS (SELECT 1 FROM placement_events x WHERE x.source_event_id = 'booking_nudge_done:' || i.id || ':' || i.booking_link_round)
  ORDER BY i.booking_link_sent_at LIMIT ${BATCH}`;

/** The done rows already written for these interviews (one query, not one per row). */
async function doneKeys(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const [rows] = await sequelize.query(
    "SELECT source_event_id FROM placement_events WHERE event = 'reminder_done' AND subject_type = 'placement_interview' AND subject_id IN (:ids)", { replacements: { ids } });
  return new Set((rows as Array<{ source_event_id: string }>).map((x) => x.source_event_id));
}

async function schedulerPass(now: Date, opts: FinishOpts): Promise<{ reminded: number; nudged: number }> {
  const out = { reminded: 0, nudged: 0 };
  const [booked] = await sequelize.query(BOOKED, { replacements: { now, horizon: new Date(now.getTime() + 24 * H) } });
  const done = await doneKeys((booked as Row[]).map((r) => String(r.id)));
  for (const r of booked as Row[]) {
    for (const kind of dueReminders(new Date(r.starts_at), new Date(r.confirm_done_at), now)) {
      if (done.has(`reminder_done:${kind}:${r.id}:${new Date(r.starts_at).toISOString()}`)) continue;
      try { if (await remindOne(r, kind, opts)) out.reminded += 1; } catch (err) { log('warn', 'placement_reminder_failed', { interview_id: r.id, kind }, (err as Error)?.name || 'DatabaseError'); }
    }
  }
  const [unbooked] = await sequelize.query(UNBOOKED, { replacements: { cutoff: new Date(now.getTime() - NUDGE_AFTER_MS) } });
  for (const u of unbooked as Unbooked[]) {
    try { if (await nudgeOne(u, opts)) out.nudged += 1; } catch (err) { log('warn', 'placement_booking_nudge_failed', { interview_id: u.id }, (err as Error)?.name || 'DatabaseError'); }
  }
  if (out.reminded || out.nudged) log('info', 'placement_booking_scheduler_done', out);
  return out;
}

let passRunning = false;
/** One pass at a time in this process: a tick that starts while a pass runs returns at once. */
export async function runBookingScheduler(now = new Date(), opts: FinishOpts = {}): Promise<{ reminded: number; nudged: number; overlapped?: true }> {
  if (passRunning) return { reminded: 0, nudged: 0, overlapped: true };
  passRunning = true;
  try { return await schedulerPass(now, opts); } finally { passRunning = false; }
}

let started = false;
/** Every 5 minutes (boot/placementBoot.ts SCHEDULERS). */
export function startBookingScheduler(): void {
  if (started) return;
  started = true;
  cron.schedule('*/5 * * * *', () => {
    runBookingScheduler().catch((err) => log('warn', 'placement_booking_scheduler_failed', {}, (err as Error)?.name || 'DatabaseError'));
  }, { timezone: 'America/Chicago' });
}
