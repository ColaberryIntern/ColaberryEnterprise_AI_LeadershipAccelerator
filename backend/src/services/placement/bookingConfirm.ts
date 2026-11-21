import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import { guardedSendMail, resolveEmailRecipient } from '../emailService';
import { sendOnce } from '../email/idempotentSend';
import { getMeetingProvider } from '../communityRooms/meetingProvider';
import { buildInterviewIcs } from '../hire/hireInterviewIcs';
import { careerPrepEnabled } from '../careerPrep/careerPrepFlag';
import { isSwitchOn, SWITCHES, type Read } from './darkSwitches';
import { candidateRoomUrl, roomPageUrl } from './roomLink';
import { FROM_NAME } from './bookingReplyEmail';
import { employerBookedEmail, learnerBookedEmail, type ConfirmFacts, type ConfirmMail } from './bookingConfirmEmail';

/**
 * Career Prep v27, CP8.2b (kit F4 step 3): the work AFTER an employer's booking COMMITS (the route starts it once the
 * confirm transaction is done; never inside it, so a slow provider can neither hold the row lock nor undo a booking).
 *
 *   room      ONE meeting per booked time: getMeetingProvider() with requestId `placement-interview-<id>-<start ISO>` (the
 *             Zoom adapter's idempotency ledger) and autoRecording 'none' (recording starts only after everyone consents,
 *             T22). The provider's id and join link are stored on the interview, WHERE none is stored yet and the booking
 *             still stands; the join link is NEVER put in any message.
 *   learner   one email to the PERSONAL address with an .ics, when the learner is on the Career Prep allow-list (only
 *             Ali at ship). In the app, the booked interview is the notice: the Interviews sheet (T20) shows it.
 *   employer  one email (and .ics) to the employer and to each interviewer, each their own message, ONLY when
 *             career_prep_employer_mail_enabled is on; off: one keyed `booking_confirm_held` row, nothing sent.
 * Every message and .ics carries the consent-room PAGE link (learner: the portal page; employer: the signed hire-site
 * page that expires 2 hours after the end), never the provider's link.
 * ONCE: every send goes through `sendOnce` keyed (recipient, fixed subject, `placement_interview:<id>:booked:<start>`), so
 * a retry, a double click or the sweep never sends twice; a rebook at a new time is a new key and a new room.
 * LOCKS: none held across the provider call or a send; the writes are single conditional UPDATEs, so nothing here can
 * take a lock before an interview row lock (plan T18 lock order).
 * FAILURE: each run counts (confirm_attempts). When anything did not complete (room, a send), one keyed
 * `booking_confirm_failed` row is written and bookingConfirmSweep.ts tries again after 5 then 30 minutes; after
 * MAX_CONFIRM_ATTEMPTS one keyed `booking_confirm_gave_up` row and an error line for staff. Done = confirm_done_at.
 */
export const MAX_CONFIRM_ATTEMPTS = 3;
export const ROOM_TIMEOUT_MS = 25_000;
/**
 * ONE RUN AT A TIME per interview: a run first claims a lease (confirm_last_attempt_at) in one conditional UPDATE, which
 * Postgres serializes on the row; a run that finds a live lease (a replayed confirm racing the original, or the sweep)
 * returns 'busy' without calling the provider or sending. The Zoom ledger alone cannot stop a second create while the
 * first is still 'pending' (it reconciles by listing, and a meeting mid-create is not listed yet). The lease outlasts the
 * room cap plus the sends; a run that died holding it is picked up by the sweep once it lapses (its backoff is longer).
 */
export const LEASE_MS = 2 * 60_000;
type Part = 'sent' | 'skipped' | 'held' | 'failed';
export interface FinishResult { status: 'done' | 'incomplete' | 'busy' | 'not_booked' | 'not_found'; room?: 'ok' | 'failed'; learner?: Part; employer?: Part; gaveUp?: boolean }
export interface FinishOpts { now?: Date; read?: Read; learnerAllowed?: (enrollmentId: string) => Promise<boolean> }

type Row = { id: string; enrollment_id: string; state: string; company: string | null; position: string | null; contact_email: string | null;
  starts_at: Date | string | null; minutes: number | null; interviewer_emails: string[] | null; booker_tz: string | null; room_provider_id: string | null;
  confirm_done_at: Date | null; full_name: string | null; personal_email: string | null; job_address: string | null };

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const errClass = (e: unknown) => ((e as Error)?.name && (e as Error).name !== 'Error' ? (e as Error).name : 'UpstreamUnavailable');
function log(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'backend', event,
    outcome: level === 'info' ? 'success' : 'failure', ...(errorClass ? { error_class: errorClass } : {}), context });
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
}

const LOAD = `SELECT i.id, i.enrollment_id, i.state, i.company, i.position, i.contact_email, i.starts_at, i.minutes, i.interviewer_emails, i.booker_tz,
    i.room_provider_id, i.confirm_done_at, e.full_name, e.email AS personal_email, j.address AS job_address
  FROM placement_interviews i JOIN enrollments e ON e.id = i.enrollment_id LEFT JOIN job_search_inboxes j ON j.enrollment_id = i.enrollment_id
  WHERE i.id = :id`;

/** One keyed event row for this booked time; a re-run never writes a second one. */
async function recordEvent(id: string, what: string, start: string, payload: Record<string, unknown>): Promise<void> {
  await sequelize.query(
    `INSERT INTO placement_events (subject_type, subject_id, event, from_state, to_state, actor, payload, source_event_id)
     VALUES ('placement_interview', :id, :event, 'booked', 'booked', 'platform', CAST(:payload AS jsonb), :src) ON CONFLICT DO NOTHING`,
    { replacements: { id, event: `booking_confirm_${what}`, payload: JSON.stringify(payload), src: `booking_confirm_${what}:${id}:${start}` } });
}

/** Create the room once and store it; false when it could not be made (the messages still go: they never need it). */
async function ensureRoom(r: Row, start: Date, minutes: number): Promise<boolean> {
  if (r.room_provider_id) return true;
  try {
    const made = await Promise.race([
      getMeetingProvider().createMeeting({
        title: `Interview: ${r.company?.trim() || 'employer'} and a Refactored candidate`, description: 'Booked on hire.refactored.ai',
        startAt: start, endAt: new Date(start.getTime() + minutes * 60_000), requestId: `placement-interview-${r.id}-${start.toISOString()}`, autoRecording: 'none',
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error('room timed out'), { name: 'TimeoutError' })), ROOM_TIMEOUT_MS)),
    ]);
    if (!made.providerEventId || !made.joinUrl) throw Object.assign(new Error('provider returned no meeting'), { name: 'ContractViolation' });
    await sequelize.query(
      `UPDATE placement_interviews SET room_provider_id = :pid, room_url = :url, updated_at = NOW()
        WHERE id = :id AND room_provider_id IS NULL AND state = 'booked' AND starts_at = :start`,
      { replacements: { pid: made.providerEventId, url: made.joinUrl, id: r.id, start } });
    return true;
  } catch (err) {
    log('error', 'placement_room_create_failed', { interview_id: r.id }, errClass(err));
    return false;
  }
}

/** One message, one recipient, through the send ledger, with the .ics. */
async function sendOne(to: string, mail: ConfirmMail, eventId: string, ics: string, replyTo: string | null): Promise<Part> {
  const res = await sendOnce({ recipient: to, subject: mail.subject, businessEventId: eventId }, async () => {
    const routed = await resolveEmailRecipient(to, mail.subject);
    const info = await guardedSendMail({ from: `"${FROM_NAME}" <${env.emailFrom}>`, to: routed.to, subject: routed.subject, text: mail.text,
      ...(replyTo ? { replyTo } : {}), icalEvent: { method: 'PUBLISH', filename: 'interview.ics', content: ics },
      headers: { 'X-MC-Tags': 'career-prep-booking-confirmed', 'X-MC-Metadata': JSON.stringify({ business_event_id: eventId }) } });
    return info?.messageId ? { ok: true, messageId: String(info.messageId) } : { ok: false, errorClass: 'SendBlocked', error: 'blocked by kill switch or dev guard' };
  }).catch((err: unknown) => ({ outcome: 'failed' as const, errorClass: errClass(err) }));
  if (res.outcome === 'sent' || (res.outcome === 'skipped' && res.reason === 'already_sent')) return 'sent';
  log('warn', 'placement_booking_confirm_send_failed', { event_id: eventId }, res.outcome === 'skipped' ? 'SendInFlight' : res.errorClass);
  return 'failed';
}

const ics = (r: Row, f: ConfirmFacts, page: string, now: Date) => buildInterviewIcs({ interviewId: `placement-${r.id}`, start: f.startsAt, minutes: f.minutes, roomUrl: page, now,
  summary: `Interview: ${f.company?.trim() || 'employer'}${f.position?.trim() ? `, ${f.position.trim()}` : ''}`, description: `Join from the room page: ${page}` });

async function notifyLearner(r: Row, f: ConfirmFacts, key: string, opts: FinishOpts, now: Date): Promise<Part> {
  if (!(await (opts.learnerAllowed ?? ((e: string) => careerPrepEnabled(e)))(r.enrollment_id))) return 'skipped';
  if (!r.personal_email || !EMAIL.test(r.personal_email)) { log('warn', 'placement_booking_learner_no_email', { interview_id: r.id }, 'NoRecipient'); return 'skipped'; }
  const page = candidateRoomUrl(r.id);
  return sendOne(r.personal_email, learnerBookedEmail(f, page), key, ics(r, f, page, now), null);
}

async function notifyEmployer(r: Row, f: ConfirmFacts, key: string, start: string, opts: FinishOpts, now: Date): Promise<Part> {
  if (!(await isSwitchOn(SWITCHES.employerMail, opts.read))) {
    await recordEvent(r.id, 'held', start, { reason: 'held: employer email is switched off' });
    return 'held';
  }
  const to = [...new Set([r.contact_email, ...(r.interviewer_emails ?? [])].map((e) => String(e ?? '').trim().toLowerCase()).filter((e) => EMAIL.test(e)))];
  if (!to.length) { log('warn', 'placement_booking_employer_no_email', { interview_id: r.id }, 'NoRecipient'); return 'skipped'; }
  const page = roomPageUrl(r.id, new Date(f.startsAt.getTime() + f.minutes * 60_000));
  const file = ics(r, f, page, now);
  let out: Part = 'sent';
  for (const addr of to) if ((await sendOne(addr, employerBookedEmail(f, page), key, file, r.job_address)) === 'failed') out = 'failed';
  return out;
}

/** Claim the lease and count this run; 0 when another run holds the lease, or the booking is gone or already done. */
async function countAttempt(id: string, start: Date, now: Date): Promise<number> {
  const [rows] = await sequelize.query(
    `UPDATE placement_interviews SET confirm_attempts = confirm_attempts + 1, confirm_last_attempt_at = :now
      WHERE id = :id AND state = 'booked' AND starts_at = :start AND confirm_done_at IS NULL
        AND (confirm_last_attempt_at IS NULL OR confirm_last_attempt_at < :lease) RETURNING confirm_attempts`,
    { replacements: { id, start, now, lease: new Date(now.getTime() - LEASE_MS) } });
  return Number((rows as Array<{ confirm_attempts: number }>)[0]?.confirm_attempts ?? 0);
}

export async function finishBooking(interviewId: string, opts: FinishOpts = {}): Promise<FinishResult> {
  const now = opts.now ?? new Date();
  const [rows] = await sequelize.query(LOAD, { replacements: { id: interviewId } });
  const r = (rows as Row[])[0];
  if (!r) return { status: 'not_found' };
  if (r.state !== 'booked' || !r.starts_at) return { status: 'not_booked' };
  if (r.confirm_done_at) return { status: 'done' };
  const startsAt = new Date(r.starts_at);
  const start = startsAt.toISOString();
  const attempt = await countAttempt(r.id, startsAt, now);
  if (!attempt) return { status: 'busy' }; // another run holds the lease (or the booking changed under us)
  const f: ConfirmFacts = { candidateName: r.full_name, company: r.company, position: r.position, startsAt, minutes: Number(r.minutes ?? 30), bookerTz: r.booker_tz };
  const key = `placement_interview:${r.id}:booked:${start}`;
  const room = (await ensureRoom(r, startsAt, f.minutes)) ? 'ok' : 'failed';
  const learner = await notifyLearner(r, f, key, opts, now).catch((e: unknown) => { log('warn', 'placement_booking_learner_failed', { interview_id: r.id }, errClass(e)); return 'failed' as Part; });
  const employer = await notifyEmployer(r, f, key, start, opts, now).catch((e: unknown) => { log('warn', 'placement_booking_employer_failed', { interview_id: r.id }, errClass(e)); return 'failed' as Part; });
  if (room === 'ok' && learner !== 'failed' && employer !== 'failed') {
    await sequelize.query('UPDATE placement_interviews SET confirm_done_at = :now WHERE id = :id AND state = \'booked\' AND starts_at = :start AND confirm_done_at IS NULL',
      { replacements: { now, id: r.id, start: startsAt } });
    await recordEvent(r.id, 'done', start, { learner, employer });
    log('info', 'placement_booking_confirmed', { interview_id: r.id, learner, employer });
    return { status: 'done', room, learner, employer };
  }
  await recordEvent(r.id, 'failed', start, { room, learner, employer, attempt });
  const gaveUp = attempt >= MAX_CONFIRM_ATTEMPTS;
  if (gaveUp) {
    await recordEvent(r.id, 'gave_up', start, { room, learner, employer });
    log('error', 'placement_booking_confirm_gave_up', { interview_id: r.id, room, learner, employer, fix: 'check Zoom and Mandrill, then set confirm_attempts = 0' }, 'RetriesExhausted');
  }
  return { status: 'incomplete', room, learner, employer, gaveUp };
}

/** The route's hook: start the work after the commit without making the booker wait; anything thrown is logged. */
export function finishInBackground(interviewId: string, run: (id: string) => Promise<unknown> = finishBooking): void {
  run(interviewId).catch((err: unknown) => log('error', 'placement_booking_confirm_crashed', { interview_id: interviewId }, errClass(err)));
}
