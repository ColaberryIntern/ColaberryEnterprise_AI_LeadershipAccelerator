import { getSetting } from '../settingsService';
import { careerPrepEnabled, careerPrepEnrollmentIds } from '../careerPrep/careerPrepFlag';
import { audit, inTransaction, queueStore } from './careerDeskStore';
import { opsStore } from './careerDeskOpsStore';
import { confirmView, HELD_NOTE, heldView, itemView, reviewInterviewView, type QueueItem } from './careerDeskQueue';
import { bookingLine, inboxLine, kpiLine, offerLine, percent, RECRUITERS, recordingNotice, recordingSince, since30 } from './careerDeskViews';
import { MAX_CONFIRM_ATTEMPTS } from './bookingConfirm';
import { feeRate } from './offerService';
import { sendTest } from './inboxTestJob';
import { SWITCHES, type Read } from './darkSwitches';
import type { DeskResult } from './careerDeskActions';

/**
 * Career Prep v27, CP11.1 (kit F9): the staff interview desk's reads (overview, review queue, inbox health, bookings,
 * placements and fees) and its inbox and placement actions. The review-queue actions are careerDeskActions.ts. Every
 * route is admin + requireSection('placement') (routes/admin/careerDeskRoutes.ts).
 *
 * SWITCHES are shown as read now: on, off, or unreadable (a database hiccup). The platform rule (darkSwitches.ts) treats
 * unreadable as OFF, so the desk says so instead of hiding it. SEND TEST calls the SAME inboxTestJob.sendTest guard as
 * the scheduler: career_prep_inbox_tests_enabled off = switched_off (the route answers 409, nothing is sent, the refusal
 * is audited); on = one test per inbox per Central day (a retry the same day only after the latest test missed its 10
 * minutes, the T11 rule). FORWARDING: the Gmail confirmation link is handed to the staff member who clicks (and only
 * an https Google link), never followed by the platform; "Mark confirmed" records that they did. Every action writes
 * exactly one audit row (placement_events, actor = the staff id). Empty lists are empty arrays, never invented rows.
 */
export type SwitchState = 'on' | 'off' | 'unreadable';
export async function switchState(key: string, read: Read = getSetting): Promise<SwitchState> {
  try { const v = await read(key); return v === true || v === 'true' ? 'on' : 'off'; } catch { return 'unreadable'; }
}
const ok = (outcome: string, message: string): DeskResult => ({ status: 'ok', outcome, message });
const no = (status: 'not_found' | 'conflict' | 'failed', message: string): DeskResult => ({ status, message });

export async function overview(read: Read = getSetting, now = new Date()) {
  const [employerMail, inboxTests, scope] = await Promise.all([switchState(SWITCHES.employerMail, read), switchState(SWITCHES.inboxTests, read), opsStore.scopeMissing(recordingSince(now))]);
  return { recruiters: RECRUITERS.map((r) => ({ ...r })), switches: { employerMail, inboxTests }, recording: recordingNotice(scope), heldNote: HELD_NOTE };
}

export async function reviewQueue(now = new Date()) {
  const [items, ivs, confirms, held] = await Promise.all([queueStore.openItems(), queueStore.reviewInterviews(), queueStore.confirmGaveUp(MAX_CONFIRM_ATTEMPTS), queueStore.heldReplies()]);
  const learners = [...new Set(items.filter((i) => i.kind === 'unmatched_update' || i.kind === 'ambiguous_update').map((i) => i.enrollment_id).filter((e): e is string => Boolean(e)))];
  const related = await queueStore.related(learners);
  const queue: QueueItem[] = [...items.map((i) => itemView(i, related, now)).filter((x): x is QueueItem => x !== null), ...ivs.map(reviewInterviewView), ...confirms.map(confirmView)]
    .sort((a, b) => a.since.localeCompare(b.since));
  return { items: queue, held: held.map(heldView), heldNote: HELD_NOTE };
}

export async function inboxHealthList(read: Read = getSetting, now = new Date()) {
  const ids = await careerPrepEnrollmentIds(read);
  const [rows, testsSwitch] = await Promise.all([opsStore.inboxes(ids, since30(now)), switchState(SWITCHES.inboxTests, read)]);
  return { testsSwitch, learners: rows.map((r) => inboxLine(r, now)) };
}

export async function bookingList(now = new Date()) {
  const [rows, scope] = await Promise.all([opsStore.bookings(), opsStore.scopeMissing(recordingSince(now))]);
  return { bookings: rows.map(bookingLine), recording: recordingNotice(scope) };
}

export async function placements(read: Read = getSetting) {
  const [rate, rows, k, clients] = await Promise.all([feeRate(read), opsStore.offers(), opsStore.kpis(), opsStore.clients()]);
  return { feeRate: { rate, label: percent(rate) }, kpis: kpiLine(k), offers: rows.map(offerLine), clients: clients.map((c) => ({ id: String(c.id), name: c.name, candidates: Number(c.candidates) })) };
}

const TEST_WORDS: Record<string, DeskResult> = {
  sent: ok('sent', 'Test sent. It should arrive within 10 minutes.'),
  already_today: ok('already_today', 'A test already went today and has not missed its 10 minutes; nothing new was sent.'),
  switched_off: { status: 'conflict', message: 'Inbox tests are switched off' },
  no_inbox: no('not_found', 'This learner has no job-search inbox yet.'),
};

/** The desk's Send test: the scheduler's own guard, ONE audit row whatever happened (a refusal included). */
export async function deskSendTest(enrollmentId: string, staff: string, read?: Read, now = new Date()): Promise<DeskResult & { switchedOff?: true }> {
  const r = await sendTest(enrollmentId, { now, retryMissed: true, deps: { read } });
  await audit({ subjectType: 'job_search_inbox', subjectId: enrollmentId, event: 'desk_send_test', actor: staff, payload: { outcome: r.status } });
  if (r.status === 'failed') return no('failed', `The test could not be sent (${r.errorClass}). Try again in a few minutes.`);
  return r.status === 'switched_off' ? { ...TEST_WORDS.switched_off, switchedOff: true } : TEST_WORDS[r.status];
}

const GOOGLE = new Set(['mail-settings.google.com', 'mail.google.com']);
const safeLink = (raw: string | null) => { try { const u = new URL(String(raw)); return u.protocol === 'https:' && GOOGLE.has(u.hostname) ? u.toString() : null; } catch { return null; } };

/** Open: the pending Gmail confirmation for THIS click (link and code). Confirm: record that staff confirmed it. */
export async function forwardingAction(enrollmentId: string, action: 'open' | 'confirm', staff: string): Promise<DeskResult & { link?: string | null; code?: string | null }> {
  const row = await opsStore.forwarding(enrollmentId);
  let r: DeskResult & { link?: string | null; code?: string | null };
  if (!row) r = no('not_found', 'This learner has no job-search inbox yet.');
  else if (action === 'open') {
    r = row.forwarding_confirmed_at ? ok('already_confirmed', 'Forwarding is already confirmed.')
      : !row.forwarding_link && !row.forwarding_code ? no('conflict', 'No Gmail confirmation has arrived yet.')
        : { ...ok('opened', 'Open the link (or use the code) in Gmail, then mark it confirmed.'), link: safeLink(row.forwarding_link), code: row.forwarding_code };
  } else {
    r = (await inTransaction((t) => opsStore.markForwarded(enrollmentId, t))) ? ok('confirmed', 'Forwarding marked confirmed.') : ok('already_confirmed', 'Forwarding is already confirmed.');
  }
  await audit({ subjectType: 'job_search_inbox', subjectId: enrollmentId, event: `desk_forwarding_${action}`, actor: staff, payload: { outcome: r.status === 'ok' ? r.outcome : r.status } });
  return r;
}

/** An invoice record's status (not invoiced, invoiced, paid), under its row lock; one audit row. */
export async function setInvoiceStatus(invoiceId: string, status: string, staff: string): Promise<DeskResult> {
  const before = await inTransaction(async (t) => {
    const prev = await opsStore.setInvoice(invoiceId, status, t);
    if (prev !== undefined) await audit({ subjectType: 'placement_invoice', subjectId: invoiceId, event: 'desk_invoice_status', actor: staff, from: prev, to: status, payload: { outcome: prev === status ? 'unchanged' : 'changed' } }, t);
    return prev;
  });
  if (before === undefined) {
    await audit({ subjectType: 'placement_invoice', subjectId: invoiceId, event: 'desk_invoice_status', actor: staff, to: status, payload: { outcome: 'not_found' } });
    return no('not_found', 'No such invoice record.');
  }
  return before === status ? ok('unchanged', 'Already set; nothing changed.') : ok('changed', 'Invoice status saved.');
}

/** Put a Career Prep learner forward to an employer account (they then see the learner in their portal); one audit row. */
export async function putForward(clientId: string, enrollmentId: string, staff: string): Promise<DeskResult> {
  const result = (await careerPrepEnabled(enrollmentId)) ? await inTransaction((t) => opsStore.putForward(clientId, enrollmentId, staff, t)) : 'not_found';
  await audit({ subjectType: 'hire_client', subjectId: clientId, event: 'desk_put_forward', actor: staff, payload: { enrollment_id: enrollmentId, outcome: result } });
  if (result === 'not_found') return no('not_found', 'No such employer account, or that learner is not in Career Prep.');
  return result === 'added' ? ok('added', 'Put forward: the employer now sees this candidate.') : ok('already', 'Already put forward; nothing changed.');
}
