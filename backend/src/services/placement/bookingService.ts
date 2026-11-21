import type { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import { heldTimes } from '../hire/hireInterviews';
import { readAvailability } from '../hire/hireStudioSettings';
import { localDate, openSlots, type HeldTime } from '../hire/hireSlots';
import { hashBookingToken, isPlausibleToken, tokenStatus } from './bookingToken';
import { candidateFirstName } from './bookingReplyEmail';
import { canMove, isInterviewState, type InterviewState } from './interviewStates';
import { roomPageUrl } from './roomLink';
import { label } from './timeLabel';

/**
 * Career Prep v27, CP8.2 (kit F4 step 3): the public booking page's data and its one write, for the holder of a booking
 * link (hire.refactored.ai/book/?t=<token>). No login; the token is the only key and only its hash is stored.
 *
 *   view     the learner's FIRST name, the role, the length, the recording notice and the open times: the next 7 days
 *            (5 weekdays) from the learner's own availability (hire_interview_availability), minus every time they
 *            already hold (Hire profile interviews and booked placement interviews), with 15 minutes kept free around
 *            each. Opening the link moves `new` -> `awaiting` (once). Availability off -> no times, reason
 *            'arranging', and the interview goes to `review` for a recruiter (once). Never the learner's email or phone.
 *   confirm  locks the interview row (by the token hash), re-checks the token AND that the state may still move to
 *            booked (ingest may have cancelled it meanwhile), then takes the per-learner advisory lock the Hire profile's
 *            own booking uses (`hire_interviews:<enrollment>`; row lock FIRST, never the other way, so no deadlock),
 *            recomputes that day's open times and books only if the time is still open: two bookers racing for one time,
 *            one wins. The token is marked used in the same transaction. The same confirm again (a double click) answers
 *            the same booking. Invites and emails are CP8.2b (bookingConfirm.ts), run by the route AFTER the commit.
 * Times are UTC instants; labels are Central, plus the booker's own zone when they send one.
 */
export const BUFFER_MINUTES = 15;
export const DEFAULT_MINUTES = 30;
export const GRID_DAYS = 7;
export const CENTRAL = 'America/Chicago';
export const RECORDING_NOTICE = 'The interview is held in the Refactored interview room. It is recorded only if everyone agrees when it starts; if anyone declines, it goes ahead unrecorded.';

type Row = { id: string; enrollment_id: string; state: string; company: string | null; position: string | null; minutes: number | null;
  token_expires_at: Date | null; token_used_at: Date | null; starts_at: Date | null; full_name: string | null };
export interface Slot { startsAt: string; central: string; local: string | null }
export interface BookingView { candidate: string; company: string | null; position: string | null; minutes: number; slots: Slot[]; recordingNotice: string; timezone: string; reason: 'arranging' | null }
export type Gone = 'used' | 'expired' | 'closed';
export type ViewResult = { status: 'ok'; view: BookingView } | { status: 'not_found' } | { status: 'gone'; reason: Gone };
export type ConfirmResult =
  | { status: 'booked'; interviewId: string; startsAt: string; minutes: number; roomPage: string; replay: boolean }
  | { status: 'not_found' } | { status: 'gone'; reason: Gone } | { status: 'taken' } | { status: 'arranging' };

const SELECT = `SELECT i.id, i.enrollment_id, i.state, i.company, i.position, i.minutes, i.token_expires_at, i.token_used_at, i.starts_at, e.full_name
  FROM placement_interviews i JOIN enrollments e ON e.id = i.enrollment_id WHERE i.booking_token_hash = :h`;

export { label };

function log(event: string, context: Record<string, unknown>): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', service: 'backend', event, outcome: 'success', context }));
}

/** Move once (keyed event row), under the interview row lock; a move the state machine refuses does nothing. */
async function moveOnce(id: string, to: InterviewState, event: string, t?: Transaction): Promise<void> {
  const run = async (tx: Transaction) => {
    const [rows] = await sequelize.query('SELECT state FROM placement_interviews WHERE id = :id FOR UPDATE', { replacements: { id }, transaction: tx });
    const from = (rows as Array<{ state: string }>)[0]?.state;
    if (!isInterviewState(from) || !canMove(from, to)) return;
    await sequelize.query('UPDATE placement_interviews SET state = :to, updated_at = NOW() WHERE id = :id', { replacements: { to, id }, transaction: tx });
    await sequelize.query(
      `INSERT INTO placement_events (subject_type, subject_id, event, from_state, to_state, actor, payload, source_event_id)
       VALUES ('placement_interview', :id, :event, :from, :to, 'booking_page', '{}'::jsonb, :src) ON CONFLICT DO NOTHING`,
      { replacements: { id, event, from, to, src: `${event}:${id}` }, transaction: tx });
  };
  if (t) await run(t); else await sequelize.transaction(run);
}

/**
 * Every time the learner already holds. ONE source for both booking paths: hireInterviews.heldTimes reads the Hire
 * profile interviews AND the booked placement interviews, so the Hire profile and this page can never double-book.
 * (This interview itself is never booked while its token is live, so it cannot hold its own time.)
 */
const allHeld = (eid: string, from: Date, to: Date, t?: Transaction): Promise<HeldTime[]> => heldTimes(eid, from, to, t);

export async function bookingView(token: string, opts: { now?: Date; tz?: string | null } = {}): Promise<ViewResult> {
  if (!isPlausibleToken(token)) return { status: 'not_found' };
  const now = opts.now ?? new Date();
  const [rows] = await sequelize.query(SELECT, { replacements: { h: hashBookingToken(token) } });
  const r = (rows as Row[])[0];
  if (!r) return { status: 'not_found' };
  const st = tokenStatus(r, now);
  if (st !== 'ok') return { status: 'gone', reason: st };
  const minutes = Number(r.minutes ?? DEFAULT_MINUTES);
  const base = { candidate: candidateFirstName(r.full_name), company: r.company, position: r.position, minutes, recordingNotice: RECORDING_NOTICE, timezone: CENTRAL };
  const a = await readAvailability(r.enrollment_id);
  if (!a.enabled) {
    await moveOnce(r.id, 'review', 'booking_arranging');
    return { status: 'ok', view: { ...base, slots: [], reason: 'arranging' } };
  }
  if (r.state === 'new') { await moveOnce(r.id, 'awaiting', 'link_opened'); log('placement_booking_link_opened', { interview_id: r.id }); }
  const until = new Date(now.getTime() + GRID_DAYS * 86_400_000);
  const held = await allHeld(r.enrollment_id, now, until);
  const starts = openSlots({ tz: a.tz, blocks: a.blocks, maxPerWeek: a.maxPerWeek, minNoticeHours: a.minNoticeHours },
    { minutes, fromDate: localDate(now, a.tz), now, held, days: GRID_DAYS, bufferMinutes: BUFFER_MINUTES });
  const tz = opts.tz && opts.tz !== CENTRAL ? opts.tz : null;
  return { status: 'ok', view: { ...base, reason: null, slots: starts.map((s) => ({ startsAt: s.toISOString(), central: label(s, CENTRAL), local: tz ? label(s, tz) : null })) } };
}

export interface ConfirmInput { slot: string; tz: string; interviewers: string[] }

export async function confirmBooking(token: string, input: ConfirmInput, now: Date = new Date()): Promise<ConfirmResult> {
  if (!isPlausibleToken(token)) return { status: 'not_found' };
  const slot = new Date(input.slot);
  return sequelize.transaction(async (t): Promise<ConfirmResult> => {
    const [rows] = await sequelize.query(`${SELECT} FOR UPDATE OF i`, { replacements: { h: hashBookingToken(token) }, transaction: t });
    const r = (rows as Row[])[0];
    if (!r) return { status: 'not_found' };
    const minutes = Number(r.minutes ?? DEFAULT_MINUTES);
    const booked = (at: Date, replay: boolean): ConfirmResult => ({ status: 'booked', interviewId: r.id, startsAt: at.toISOString(), minutes, roomPage: roomPageUrl(r.id, new Date(at.getTime() + minutes * 60_000)), replay });
    if (r.token_used_at && r.state === 'booked' && r.starts_at && new Date(r.starts_at).getTime() === slot.getTime()) return booked(slot, true);
    const st = tokenStatus(r, now);
    if (st !== 'ok') return { status: 'gone', reason: st };
    if (!isInterviewState(r.state) || !canMove(r.state, 'booked')) return { status: 'gone', reason: 'closed' };
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:k))', { replacements: { k: `hire_interviews:${r.enrollment_id}` }, transaction: t });
    const a = await readAvailability(r.enrollment_id);
    if (!a.enabled) return { status: 'arranging' };
    if (slot.getTime() > now.getTime() + GRID_DAYS * 86_400_000) return { status: 'taken' };
    const held = await allHeld(r.enrollment_id, slot, slot, t);
    const open = openSlots({ tz: a.tz, blocks: a.blocks, maxPerWeek: a.maxPerWeek, minNoticeHours: a.minNoticeHours },
      { minutes, fromDate: localDate(slot, a.tz), now, held, days: 1, bufferMinutes: BUFFER_MINUTES });
    if (!open.some((s) => s.getTime() === slot.getTime())) return { status: 'taken' };
    const emails = [...new Set(input.interviewers.map((e) => e.trim().toLowerCase()))];
    // A booking at a NEW time (after a reschedule) drops the old time's meeting, so bookingConfirm makes the room for
    // the new time (its requestId carries the start); the same time keeps its room. The old meeting is not cancelled here.
    await sequelize.query(
      `UPDATE placement_interviews SET state = 'booked', starts_at = :at, minutes = :m, token_used_at = :now, interviewer_emails = ${emails.length ? 'ARRAY[:emails]::text[]' : "'{}'::text[]"},
         booker_tz = :tz, confirm_done_at = NULL, confirm_attempts = 0, confirm_last_attempt_at = NULL,
         room_provider_id = CASE WHEN starts_at IS DISTINCT FROM :at THEN NULL ELSE room_provider_id END,
         room_url = CASE WHEN starts_at IS DISTINCT FROM :at THEN NULL ELSE room_url END, updated_at = NOW() WHERE id = :id`,
      { replacements: { at: slot, m: minutes, now, emails, tz: input.tz, id: r.id }, transaction: t });
    await sequelize.query(
      `INSERT INTO placement_events (subject_type, subject_id, event, from_state, to_state, actor, payload, source_event_id)
       VALUES ('placement_interview', :id, 'booked', :from, 'booked', 'booking_page', CAST(:p AS jsonb), :src) ON CONFLICT DO NOTHING`,
      { replacements: { id: r.id, from: r.state, p: JSON.stringify({ starts_at: slot.toISOString(), interviewers: input.interviewers.length }), src: `booked:${r.id}:${slot.toISOString()}` }, transaction: t });
    log('placement_interview_booked', { interview_id: r.id, starts_at: slot.toISOString() });
    return booked(slot, false);
  });
}
