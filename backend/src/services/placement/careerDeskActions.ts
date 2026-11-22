import { audit, inTransaction, queueStore as store, type ItemRow } from './careerDeskStore';
import { ACTIONS_FOR, isItemKind, type InterviewAction, type ItemAction } from './careerDeskQueue';
import { sendBookingLink, type BookingReplyResult } from './bookingReply';
import { EMAIL, MAX_CONFIRM_ATTEMPTS, sendOne } from './bookingConfirm';
import { nudgeEmail } from './bookingReminderEmail';
import { InboxEventSchema } from './inboxEventSchema';
import { interviewTypeOf } from './interviewStates';
import { isSwitchOn, SWITCHES, type Read } from './darkSwitches';
import { careerPrepEnabled } from '../careerPrep/careerPrepFlag';

/**
 * Career Prep v27, CP11.1 (kit F9): what the staff desk's review-queue buttons DO. Every action writes exactly ONE
 * audit row (placement_events, actor = the staff id, the outcome in its payload), including a refusal and a replay.
 *
 * SEND BOOKING LINK (an interview in review, or a reply HELD while employer mail was off): review -> new under the
 * interview's row lock (the stored round, else 'first'), then bookingReply.sendBookingLink, which checks
 * career_prep_employer_mail_enabled ITSELF (off or unreadable: held again, nothing sent) and sends through sendOnce, so a
 * double click or a held link sent twice sends ONE email. Low confidence ("Send booking link") and No learner matched
 * ("Match and send") first make the interview from the stored inbox event (UNIQUE source id: a replay makes none).
 * NUDGE (Not booked in 24 h): the scheduler's own nudge email and send key, so staff and the scheduler never both send
 * it; switch-gated the same way. Every other action resolves the item (one conditional UPDATE: a second click changes
 * nothing). "I checked the Zoom meeting" also forgets the stored recording read-back, so the next join asks Zoom again
 * and the withheld join link is released only if the meeting now matches everyone's consent.
 * FAILURE: a database error propagates (the route answers an honest 500); a send that failed is reported (502), and the
 * booking-link reply keeps its own retry and give-up path (bookingLinkSweep.ts).
 */
export type DeskResult = { status: 'ok'; outcome: string; message: string; interviewId?: string }
  | { status: 'not_found' | 'conflict' | 'failed'; message: string };
export interface ActionOpts { staff: string; read?: Read; note?: string | null; enrollmentId?: string | null; contactEmail?: string | null }

const ok = (outcome: string, message: string, interviewId?: string): DeskResult => ({ status: 'ok', outcome, message, ...(interviewId ? { interviewId } : {}) });
const no = (status: 'not_found' | 'conflict' | 'failed', message: string): DeskResult => ({ status, message });
const noteOf = (n?: string | null) => (n ? n.slice(0, 500) : null);

const SEND_WORDS: Partial<Record<BookingReplyResult['status'], DeskResult>> = {
  sent: ok('sent', 'Booking link sent to the employer.'),
  already_sent: ok('already_sent', 'The booking link had already gone; nothing new was sent.'),
  held: ok('held', 'Held: employer email is switched off. Nothing was sent; it waits in Held booking links.'),
  no_contact: ok('no_contact', 'No employer email or job-search address to reply to: it is back with a recruiter.'),
};

/** Send (or hold) the booking link for an interview in review or owed one. No audit here (the caller writes it). */
async function sendLinkCore(interviewId: string, o: ActionOpts): Promise<{ r: DeskResult; from: string | null }> {
  const iv = await store.interview(interviewId);
  if (!iv) return { r: no('not_found', 'No such interview.'), from: null };
  if (iv.state === 'review') {
    const round = await inTransaction((t) => store.reviewToNew(interviewId, o.contactEmail ?? null, t));
    return { r: round ? await deliver(interviewId, o.read) : no('conflict', 'This interview just changed (someone else acted on it). Refresh the queue.'), from: iv.state };
  }
  if (iv.state === 'new' && iv.booking_link_round && !iv.booking_link_sent_at) return { r: await deliver(interviewId, o.read), from: iv.state };
  return { r: no('conflict', iv.booking_link_sent_at ? 'The booking link already went for this interview.' : 'This interview is not waiting for a booking link.'), from: iv.state };
}

const outcomeOf = (r: DeskResult) => (r.status === 'ok' ? r.outcome : r.status);

/** "Send booking link" on an interview (review, or a held reply): ONE audit row with the outcome. */
export async function sendLink(interviewId: string, o: ActionOpts): Promise<DeskResult> {
  const { r, from } = await sendLinkCore(interviewId, o);
  if (from === null) return r;
  await audit({ subjectType: 'placement_interview', subjectId: interviewId, event: 'desk_send_link', actor: o.staff, from,
    payload: { outcome: outcomeOf(r), approved_by: o.staff, contact_added: Boolean(o.contactEmail) } });
  return r.status === 'ok' ? { ...r, interviewId } : r;
}

async function deliver(interviewId: string, read?: Read): Promise<DeskResult> {
  const res = await sendBookingLink(interviewId, { read });
  if (res.status === 'failed' || res.status === 'in_flight') return no('failed', `The booking link could not be sent (${res.errorClass}). It is retried on its own${res.gaveUp ? '; it is back with a recruiter' : ''}.`);
  return SEND_WORDS[res.status] ?? no('conflict', 'This interview is not waiting for a booking link.');
}

/** The item's interview, made from its stored inbox event (Low confidence, or No learner matched once staff pick one). */
async function makeFromEvent(it: ItemRow, enrollmentId: string, staff: string): Promise<DeskResult> {
  const ev = InboxEventSchema.safeParse(await store.sourceEvent(it.source_event_id));
  if (!ev.success || ev.data.type !== 'interview.detected') return no('conflict', 'The original interview email is not stored, so no interview can be made from it.');
  const e = ev.data;
  const clip = (v: string | null | undefined, n: number) => (v ? v.slice(0, n) : null);
  const id = await inTransaction(async (t) => {
    const made = await store.makeInterview({ enrollmentId, sourceEventId: it.source_event_id, company: clip(e.company, 200), position: clip(e.position, 200),
      type: interviewTypeOf(e.sub_type), subType: clip(e.sub_type, 60), contactName: clip(e.contact?.name, 160), contactEmail: clip(e.contact?.email, 254), confidence: e.confidence ?? null }, t);
    await store.resolveItem(String(it.id), staff, t);
    return made;
  });
  return ok('made', 'Interview made.', id);
}

async function nudge(it: ItemRow, staff: string, read?: Read): Promise<DeskResult> {
  const iv = it.interview_id ? await store.interview(it.interview_id) : undefined;
  if (!iv) return no('not_found', 'No such interview.');
  if (!['new', 'awaiting'].includes(iv.state) || !iv.booking_link_round || !iv.booking_link_sent_at) return no('conflict', 'This interview is no longer waiting to be booked.');
  if (!(await isSwitchOn(SWITCHES.employerMail, read))) return ok('held', 'Held: employer email is switched off. Nothing was sent.');
  const to = String(iv.contact_email ?? '').trim().toLowerCase();
  if (!EMAIL.test(to)) return no('conflict', 'No employer email on file to nudge.');
  const part = await sendOne(to, nudgeEmail({ candidateName: iv.full_name, company: iv.company, position: iv.position }),
    `placement_interview:${iv.id}:booking_nudge:${iv.booking_link_round}`, null, iv.job_address, 'career-prep-booking-nudge');
  if (part !== 'sent') return no('failed', 'The nudge could not be sent. Try again in a few minutes.');
  await inTransaction((t) => store.resolveItem(String(it.id), staff, t));
  return ok('sent', 'Nudge sent to the employer (once: a nudge that already went is not sent again).');
}

async function resolveWith(it: ItemRow, action: ItemAction, staff: string): Promise<DeskResult> {
  const done = await inTransaction(async (t) => {
    if (action === 'recheck_recording' && it.interview_id) await store.forgetReadback(it.interview_id, t); // interview row first (lock order)
    return store.resolveItem(String(it.id), staff, t);
  });
  return done ? ok('resolved', 'Done.') : ok('already_resolved', 'Already done; nothing changed.');
}

type Ran = { r: DeskResult; resolved: boolean; interviewId?: string };

async function runItem(it: ItemRow, action: ItemAction, o: ActionOpts): Promise<Ran> {
  if (it.status === 'resolved') return { r: ok('already_resolved', 'Already done; nothing changed.'), resolved: false };
  if (!isItemKind(it.kind) || !ACTIONS_FOR[it.kind].includes(action)) return { r: no('conflict', 'That action does not fit this item.'), resolved: false };
  if (action === 'nudge') { const r = await nudge(it, o.staff, o.read); return { r, resolved: r.status === 'ok' && r.outcome === 'sent' }; }
  if (action !== 'make_interview' && action !== 'match') { const r = await resolveWith(it, action, o.staff); return { r, resolved: r.status === 'ok' && r.outcome === 'resolved' }; }
  const learner = action === 'match' ? o.enrollmentId : it.enrollment_id;
  if (!learner) return { r: no('conflict', 'Pick the learner this email is for.'), resolved: false };
  if (action === 'match' && !(await careerPrepEnabled(learner))) return { r: no('not_found', 'That learner is not in Career Prep.'), resolved: false };
  const made = await makeFromEvent(it, learner, o.staff);
  if (made.status !== 'ok' || !made.interviewId) return { r: made, resolved: false };
  const { r } = await sendLinkCore(made.interviewId, o);
  return { r: r.status === 'ok' ? { ...r, interviewId: made.interviewId } : r, resolved: true, interviewId: made.interviewId };
}

/** One review-queue item's action, with its ONE audit row (a made interview and its send outcome are in its payload). */
export async function itemAction(itemId: string, action: ItemAction, o: ActionOpts): Promise<DeskResult> {
  const it = await store.item(itemId);
  if (!it) return no('not_found', 'No such review item.');
  const { r, resolved, interviewId } = await runItem(it, action, o);
  await audit({ subjectType: 'placement_review_item', subjectId: String(it.id), event: `desk_${action}`, actor: o.staff, from: it.status ?? null,
    to: resolved ? 'resolved' : it.status ?? null,
    payload: { kind: it.kind, outcome: outcomeOf(r), note: noteOf(o.note), ...(interviewId ? { interview_id: interviewId } : {}), ...(o.enrollmentId ? { enrollment_id: o.enrollmentId } : {}) } });
  return r;
}

/** Not an interview / Try the room and invites again, on an interview, with its one audit row. */
export async function interviewAction(interviewId: string, action: Exclude<InterviewAction, 'send_link'>, o: ActionOpts): Promise<DeskResult> {
  const iv = await store.interview(interviewId);
  if (!iv) return no('not_found', 'No such interview.');
  const changed = await inTransaction((t) => (action === 'not_interview' ? store.cancelReview(interviewId, t) : store.retryConfirm(interviewId, MAX_CONFIRM_ATTEMPTS, t)));
  const r = changed ? ok(action === 'not_interview' ? 'cancelled' : 'retrying', action === 'not_interview' ? 'Marked as not an interview.' : 'The room and invites will be tried again within 5 minutes.')
    : no('conflict', action === 'not_interview' ? 'Only an interview with a recruiter can be marked not an interview.' : 'Nothing to try again for this interview.');
  await audit({ subjectType: 'placement_interview', subjectId: interviewId, event: `desk_${action}`, actor: o.staff, from: iv.state,
    to: changed && action === 'not_interview' ? 'cancelled' : iv.state, payload: { outcome: outcomeOf(r), note: noteOf(o.note) } });
  return r;
}

/** The interview's type (the next-interview card's type line), set by a person; one audit row. */
export async function setInterviewType(interviewId: string, type: string, o: ActionOpts): Promise<DeskResult> {
  const iv = await store.interview(interviewId);
  if (!iv) return no('not_found', 'No such interview.');
  const changed = await inTransaction((t) => store.setType(interviewId, type, t));
  await audit({ subjectType: 'placement_interview', subjectId: interviewId, event: 'desk_set_type', actor: o.staff, from: iv.state, to: iv.state, payload: { type, outcome: changed ? 'changed' : 'unchanged' } });
  return changed ? ok('changed', 'Interview type saved.') : ['done', 'cancelled'].includes(iv.state) ? no('conflict', 'This interview is over.') : ok('unchanged', 'Already set; nothing changed.');
}
