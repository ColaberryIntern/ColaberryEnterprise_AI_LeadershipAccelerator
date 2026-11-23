import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import { guardedSendMail, resolveEmailRecipient } from '../emailService';
import { sendOnce, type ProviderResult } from '../email/idempotentSend';
import { getCaseStudySurfaceProfile } from '../caseStudy/caseStudySurfaceProfiles';
import { isSwitchOn, SWITCHES, type Read } from './darkSwitches';
import { newBookingToken } from './bookingToken';
import { BOOKING_SUBJECT, bookingReplyEmail, FROM_NAME } from './bookingReplyEmail';
import { canMove } from './interviewStates';
import { NO_CLICK_TRACKING } from './mailTracking';

/**
 * Career Prep v27, CP8.1b (kit F4 step 2): reply to the employer with the booking link, for an interview in `new`.
 *
 * OWED: the round to send (`first`, or the Message-ID of the update that rescheduled a booked interview back to `new`)
 * is stored on the interview in the same transaction that puts it in `new` (interviewIngest.ts), so it survives a crash
 * before the send; bookingLinkSweep.ts finishes anything still owed.
 * DARK: switch career_prep_employer_mail_enabled (darkSwitches.ts; absent or unreadable = OFF). Off: nothing is sent and
 * no token is made; a `booking_link_held` event row records it ("held: employer email is switched off").
 * ONCE: `sendOnce` keyed (employer email, the FIXED subject, `placement_interview:<id>:booking_link[:<round>]`): no
 * learner name in the key, so a rename can never cause a second send. The token is minted INSIDE the send, so it exists
 * only when a mail really goes, and a send the ledger already holds is never repeated (its link stays the live one).
 * SAFE: the token is stored only while the interview is still `new`. No employer address, or no job-search address to
 * reply to: no send; the interview goes to `review` for a recruiter.
 * FAILURE: each try counts (booking_link_attempts). A failed or thrown try writes ONE keyed `booking_link_failed` row for
 * the round; the sweep retries after 5 then 30 minutes; after MAX_ATTEMPTS the interview moves new -> review under its
 * row lock (`booking_link_gave_up`), so it is never left waiting in `new` forever.
 * TEST MODE: the recipient redirect applies; the CC to the learner's job-search address is dropped while it is on.
 */
export const MAX_ATTEMPTS = 3;
export type BookingReplyResult =
  | { status: 'held' | 'sent' | 'already_sent' | 'no_contact' | 'not_new' | 'not_found' | 'not_owed' }
  | { status: 'failed' | 'in_flight'; errorClass: string; gaveUp: boolean };

type Row = { id: string; state: string; company: string | null; position: string | null; contact_name: string | null; contact_email: string | null;
  source_event_id: string; full_name: string | null; job_address: string | null; booking_link_round: string | null; booking_link_sent_at: Date | null };

export const bookingLinkBase = (): string => (getCaseStudySurfaceProfile('hire').publicBaseUrl || 'https://hire.refactored.ai').replace(/\/$/, '');
export const bookingLink = (token: string): string => `${bookingLinkBase()}/book/?t=${encodeURIComponent(token)}`;
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const originalMessageId = (sourceEventId: string) => { const m = /^interview\.detected:(<[^>]{1,250}>)$/.exec(sourceEventId); return m ? m[1] : null; };
const errClass = (e: unknown) => ((e as Error)?.name && (e as Error).name !== 'Error' ? (e as Error).name : 'UpstreamUnavailable');

function log(level: 'info' | 'warn', event: string, context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'backend', event,
    outcome: level === 'info' ? 'success' : 'failure', ...(errorClass ? { error_class: errorClass } : {}), context });
  if (level === 'warn') console.warn(line); else console.log(line);
}

/** One keyed event row (`booking_link_<what>:<id>:<round>`); a re-run never writes a second one. */
export async function recordBookingEvent(id: string, what: string, round: string, payload: Record<string, unknown>, move?: { to: 'review' }): Promise<void> {
  await sequelize.query(
    `INSERT INTO placement_events (subject_type, subject_id, event, from_state, to_state, actor, payload, source_event_id)
     VALUES ('placement_interview', :id, :event, 'new', :to, 'platform', CAST(:payload AS jsonb), :src) ON CONFLICT DO NOTHING`,
    { replacements: { id, event: `booking_link_${what}`, to: move?.to ?? 'new', payload: JSON.stringify(payload), src: `booking_link_${what}:${id}:${round}` } });
}

/** Hand the interview to a recruiter (new -> review), once, under its row lock, with one keyed event row. */
export async function bookingToReview(id: string, round: string, what: 'no_contact' | 'gave_up', reason: string): Promise<boolean> {
  return sequelize.transaction(async (t) => {
    const [rows] = await sequelize.query('SELECT state, booking_link_sent_at FROM placement_interviews WHERE id = :id FOR UPDATE', { replacements: { id }, transaction: t });
    const row = (rows as Array<{ state: string; booking_link_sent_at: Date | null }>)[0];
    // Re-checked under the lock: a reply that went out meanwhile must never be reported as "could not be sent".
    if (row?.state !== 'new' || row.booking_link_sent_at || !canMove('new', 'review')) return false;
    await sequelize.query("UPDATE placement_interviews SET state = 'review', updated_at = NOW() WHERE id = :id", { replacements: { id }, transaction: t });
    await sequelize.query(
      `INSERT INTO placement_events (subject_type, subject_id, event, from_state, to_state, actor, payload, source_event_id)
       VALUES ('placement_interview', :id, :event, 'new', 'review', 'platform', CAST(:payload AS jsonb), :src) ON CONFLICT DO NOTHING`,
      { replacements: { id, event: `booking_link_${what}`, payload: JSON.stringify({ reason }), src: `booking_link_${what}:${id}:${round}` }, transaction: t });
    return true;
  });
}

async function deliver(r: Row, round: string, now: Date): Promise<ProviderResult> {
  const { token, hash, expiresAt } = newBookingToken(now);
  const [held] = await sequelize.query(
    `UPDATE placement_interviews SET booking_token_hash = :h, token_expires_at = :x, token_used_at = NULL, updated_at = NOW()
      WHERE id = :id AND state = 'new' RETURNING id`, { replacements: { h: hash, x: expiresAt, id: r.id } });
  if (!(held as unknown[]).length) return { ok: false, errorClass: 'StateChanged', error: 'the interview left new before the send' };
  const mail = bookingReplyEmail({ contactName: r.contact_name, candidateName: r.full_name, company: r.company, position: r.position, link: bookingLink(token) });
  const to = String(r.contact_email);
  const routed = await resolveEmailRecipient(to, mail.subject);
  const testMode = routed.to.trim().toLowerCase() !== to.trim().toLowerCase();
  const inReplyTo = round === 'first' ? originalMessageId(r.source_event_id) : null;
  const info = await guardedSendMail({ from: `"${FROM_NAME}" <${env.emailFrom}>`, to: routed.to, ...(testMode ? {} : { cc: String(r.job_address) }),
    replyTo: String(r.job_address), subject: routed.subject, text: mail.text,
    headers: { 'X-MC-Tags': 'career-prep-booking-link', ...NO_CLICK_TRACKING, ...(inReplyTo ? { 'In-Reply-To': inReplyTo, References: inReplyTo } : {}) } });
  return info?.messageId ? { ok: true, messageId: String(info.messageId) } : { ok: false, errorClass: 'SendBlocked', error: 'blocked by kill switch or dev guard' };
}

/** Count this try; returns the attempt number, or 0 when the interview is no longer new. */
async function countAttempt(id: string, now: Date): Promise<number> {
  const [rows] = await sequelize.query(
    `UPDATE placement_interviews SET booking_link_attempts = booking_link_attempts + 1, booking_link_last_attempt_at = :now
      WHERE id = :id AND state = 'new' RETURNING booking_link_attempts`, { replacements: { id, now } });
  return Number((rows as Array<{ booking_link_attempts: number }>)[0]?.booking_link_attempts ?? 0);
}

/** A failed try: one keyed failed row for the round; at the cap, give up to a recruiter. */
export async function bookingFailed(id: string, round: string, attempt: number, errorClass: string): Promise<boolean> {
  await recordBookingEvent(id, 'failed', round, { first_error_class: errorClass, attempt });
  log('warn', 'booking_link_send_failed', { interview_id: id, attempt }, errorClass);
  return attempt >= MAX_ATTEMPTS ? bookingToReview(id, round, 'gave_up', `the booking link could not be sent after ${MAX_ATTEMPTS} tries`) : false;
}

export async function sendBookingLink(interviewId: string, opts: { round?: string; read?: Read; now?: Date } = {}): Promise<BookingReplyResult> {
  const now = opts.now ?? new Date();
  const [rows] = await sequelize.query(
    `SELECT i.id, i.state, i.company, i.position, i.contact_name, i.contact_email, i.source_event_id, i.booking_link_round, i.booking_link_sent_at,
            e.full_name, j.address AS job_address
       FROM placement_interviews i JOIN enrollments e ON e.id = i.enrollment_id LEFT JOIN job_search_inboxes j ON j.enrollment_id = i.enrollment_id
      WHERE i.id = :id`, { replacements: { id: interviewId } });
  const r = (rows as Row[])[0];
  if (!r) return { status: 'not_found' };
  if (r.state !== 'new') return { status: 'not_new' };
  const round = opts.round ?? r.booking_link_round;
  if (!round || r.booking_link_sent_at) return { status: 'not_owed' };
  if (!(await isSwitchOn(SWITCHES.employerMail, opts.read))) {
    await recordBookingEvent(r.id, 'held', round, { reason: 'held: employer email is switched off' });
    return { status: 'held' };
  }
  if (!r.contact_email || !EMAIL.test(r.contact_email) || !r.job_address) {
    await bookingToReview(r.id, round, 'no_contact', !r.job_address ? 'no job-search address to reply to' : 'no employer email address');
    return { status: 'no_contact' };
  }
  const attempt = await countAttempt(r.id, now);
  if (!attempt) return { status: 'not_new' };
  const res = await sendOnce({ recipient: r.contact_email, subject: BOOKING_SUBJECT, businessEventId: `placement_interview:${r.id}:booking_link${round === 'first' ? '' : `:${round}`}` },
    () => deliver(r, round, now)).catch((err: unknown) => ({ outcome: 'failed' as const, errorClass: errClass(err) }));
  if (res.outcome === 'sent' || (res.outcome === 'skipped' && res.reason === 'already_sent')) {
    await sequelize.query('UPDATE placement_interviews SET booking_link_sent_at = :now WHERE id = :id AND booking_link_sent_at IS NULL', { replacements: { now, id: r.id } });
    if (res.outcome === 'sent') await recordBookingEvent(r.id, 'sent', round, {});
    return { status: res.outcome === 'sent' ? 'sent' : 'already_sent' };
  }
  const errorClass = res.outcome === 'skipped' ? 'SendInFlight' : res.errorClass;
  const gaveUp = await bookingFailed(r.id, round, attempt, errorClass);
  return { status: res.outcome === 'skipped' ? 'in_flight' : 'failed', errorClass, gaveUp };
}
