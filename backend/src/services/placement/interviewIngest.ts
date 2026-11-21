import type { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import type { InboxEvent } from './inboxEventSchema';
import { normalizeJobSearchAddress } from './inboxHealth';
import { canMove, confidenceBand, interviewTypeOf, isInterviewState, type InterviewState } from './interviewStates';

/**
 * Career Prep v27, CP8.1 (kit F4): an `interview.detected` / `interview.updated` event from the inbox manager becomes a
 * placement interview, or a review item for a person (the F9 queue).
 *
 *   detected   the learner is found by the job-search address's canonical mailbox. Confidence >= 0.95 (and not flagged
 *              needs_review) -> state `new`; 0.70 to 0.94 -> `review`; below 0.70 -> NO interview, a `low_confidence`
 *              review item only (a human decides). No learner -> an `unmatched_learner` review item.
 *   updated    "Interview Cancelled" -> cancelled; "Interview Rescheduled" of a booked interview -> new (the link is
 *              offered again, F4 step 5); anything else is recorded on the interview without a state change. F3 carries
 *              no link to the original interview, so the target is matched (matchInterview, PURE) among the learner's
 *              OPEN interviews on the company, and on the position too when the event names one (trimmed, case and
 *              spacing ignored). It must be EXACTLY one: none -> an `unmatched_update` item; more than one -> an
 *              `ambiguous_update` item and NOTHING changes (a cancellation is terminal, so it must never hit a guess).
 *
 * ONCE, EVEN CONCURRENTLY: a detected event is keyed `interview.detected:<Message-ID>` (placement_interviews UNIQUE,
 * INSERT ... ON CONFLICT DO NOTHING); an update is keyed `interview.updated:<Message-ID>` on placement_events (partial
 * UNIQUE) and runs under a row lock on the interview, so two dispatches of one event make one interview and one event
 * row. Every state change writes exactly one placement_events row in the same transaction; a refused move writes nothing.
 * The booking-link reply for `new` is CP8.1b (bookingReply.ts, T16).
 */
export type IngestResult =
  | { status: 'ingested'; interviewId: string; state: InterviewState }
  | { status: 'review'; kind: ReviewKind }
  | { status: 'duplicate' }
  | { status: 'rejected'; reason: 'illegal_transition' }
  | { status: 'deferred' }; // reserved: never returned since T15 (inboxEvents.ts leaves a deferred row unprocessed)
export type ReviewKind = 'low_confidence' | 'unmatched_learner' | 'unmatched_update' | 'ambiguous_update';

export interface OpenInterview { id: string; state: string; company: string | null; position: string | null }
export type Match = { kind: 'one'; row: OpenInterview } | { kind: 'none' } | { kind: 'ambiguous'; ids: string[] };
const norm = (s: string | null | undefined) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** PURE: which open interview an update is about. Company always; position too when the event names one. */
export function matchInterview(open: OpenInterview[], company: string | null | undefined, position: string | null | undefined): Match {
  const c = norm(company);
  if (!c) return { kind: 'none' };
  const p = norm(position);
  const hits = open.filter((i) => norm(i.company) === c && (!p || norm(i.position) === p));
  if (hits.length === 1) return { kind: 'one', row: hits[0] };
  return hits.length ? { kind: 'ambiguous', ids: hits.map((h) => h.id) } : { kind: 'none' };
}

export const ACTOR = 'inbox';
const sourceId = (ev: InboxEvent) => `${ev.type}:${ev.message_id}`;
const clip = (v: string | null | undefined, n: number) => (v ? String(v).slice(0, n) : null);

function log(level: 'info' | 'warn', event: string, context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'backend', event,
    outcome: level === 'info' ? 'success' : 'failure', ...(errorClass ? { error_class: errorClass } : {}), context });
  if (level === 'warn') console.warn(line); else console.log(line);
}

async function learnerOf(ev: InboxEvent): Promise<string | null> {
  const addr = normalizeJobSearchAddress(ev.to_address);
  if (!addr.ok) return null;
  const [rows] = await sequelize.query('SELECT enrollment_id FROM job_search_inboxes WHERE mailbox = :m', { replacements: { m: addr.mailbox } });
  const r = (rows as Array<{ enrollment_id: string }>)[0];
  return r ? String(r.enrollment_id) : null;
}

async function reviewItem(kind: ReviewKind, ev: InboxEvent, enrollmentId: string | null, extra: Record<string, unknown> = {}): Promise<IngestResult> {
  const summary = { company: clip(ev.company, 200), position: clip(ev.position, 200), sub_type: clip(ev.sub_type, 60), confidence: ev.confidence ?? null, subject: clip(ev.subject, 300), ...extra };
  const [rows] = await sequelize.query(
    `INSERT INTO placement_review_items (kind, source_event_id, enrollment_id, summary) VALUES (:k, :s, :e, CAST(:sum AS jsonb))
     ON CONFLICT (kind, source_event_id) DO NOTHING RETURNING id`, { replacements: { k: kind, s: sourceId(ev), e: enrollmentId, sum: JSON.stringify(summary) } });
  if (!(rows as unknown[]).length) return { status: 'duplicate' };
  log('info', 'placement_review_item_opened', { kind, event_id: ev.event_id });
  return { status: 'review', kind };
}

async function writeEvent(t: Transaction, subjectId: string, event: string, from: InterviewState | null, to: InterviewState, ev: InboxEvent): Promise<boolean> {
  const [rows] = await sequelize.query(
    `INSERT INTO placement_events (subject_type, subject_id, event, from_state, to_state, actor, payload, source_event_id)
     VALUES ('placement_interview', :id, :event, :from, :to, :actor, CAST(:payload AS jsonb), :src) ON CONFLICT DO NOTHING RETURNING id`,
    { replacements: { id: subjectId, event, from, to, actor: ACTOR, payload: JSON.stringify({ sub_type: ev.sub_type ?? null, confidence: ev.confidence ?? null, event_id: ev.event_id }), src: sourceId(ev) }, transaction: t });
  return (rows as unknown[]).length > 0;
}

async function detected(ev: InboxEvent, enrollmentId: string): Promise<IngestResult> {
  const band = confidenceBand(ev.confidence);
  if (band === 'human_only') return reviewItem('low_confidence', ev, enrollmentId);
  const state: InterviewState = band === 'auto' && !ev.needs_review ? 'new' : 'review';
  return sequelize.transaction(async (t) => {
    const [made] = await sequelize.query(
      `INSERT INTO placement_interviews (enrollment_id, source_event_id, company, position, type, sub_type, contact_name, contact_email, confidence, state)
       VALUES (:e, :src, :company, :position, :type, :sub, :cname, :cemail, :conf, :state) ON CONFLICT (source_event_id) DO NOTHING RETURNING id`,
      { replacements: { e: enrollmentId, src: sourceId(ev), company: clip(ev.company, 200), position: clip(ev.position, 200), type: interviewTypeOf(ev.sub_type),
        sub: clip(ev.sub_type, 60), cname: clip(ev.contact?.name, 160), cemail: clip(ev.contact?.email, 254), conf: ev.confidence ?? null, state }, transaction: t });
    const id = (made as Array<{ id: string }>)[0]?.id;
    if (!id) return { status: 'duplicate' } as const;
    await writeEvent(t, String(id), 'detected', null, state, ev);
    return { status: 'ingested', interviewId: String(id), state } as const;
  });
}

/** PURE: where an update moves an interview; null = recorded without a state change. */
export function updateTarget(subType: string | null | undefined, from: InterviewState): InterviewState | null {
  const s = String(subType ?? '').trim().toLowerCase();
  if (s === 'interview cancelled') return 'cancelled';
  if (s === 'interview rescheduled' && from === 'booked') return 'new';
  return null;
}

type Unmatched = { review: 'unmatched_update' | 'ambiguous_update'; ids: string[] };

async function updated(ev: InboxEvent, enrollmentId: string): Promise<IngestResult> {
  const result = await sequelize.transaction(async (t): Promise<IngestResult | Unmatched> => {
    // Every OPEN interview of this learner, locked in id order (two concurrent updates lock in the same order, so they
    // serialize instead of deadlocking); the company / position match is matchInterview's, not the SQL's.
    const [rows] = await sequelize.query(
      `SELECT id, state, company, position FROM placement_interviews WHERE enrollment_id = :e
         AND state NOT IN ('done','cancelled') ORDER BY id FOR UPDATE`, { replacements: { e: enrollmentId }, transaction: t });
    // Checked AFTER the lock: a concurrent copy of this update that just committed (and, say, cancelled the interview,
    // so no open row is left) is a duplicate, not an unmatched update.
    const [seen] = await sequelize.query('SELECT 1 FROM placement_events WHERE source_event_id = :src', { replacements: { src: sourceId(ev) }, transaction: t });
    if ((seen as unknown[]).length) return { status: 'duplicate' };
    const m = matchInterview(rows as OpenInterview[], ev.company, ev.position);
    if (m.kind !== 'one') return { review: m.kind === 'none' ? 'unmatched_update' : 'ambiguous_update', ids: m.kind === 'ambiguous' ? m.ids : [] };
    const row = m.row;
    if (!isInterviewState(row.state)) return { review: 'unmatched_update', ids: [] };
    const from = row.state;
    const to = updateTarget(ev.sub_type, from) ?? from;
    if (to !== from && !canMove(from, to)) { log('warn', 'placement_interview_move_refused', { interview_id: row.id, from, to }, 'ValidationError'); return { status: 'rejected', reason: 'illegal_transition' }; }
    if (!(await writeEvent(t, String(row.id), to === from ? 'updated' : to === 'cancelled' ? 'cancelled' : 'rescheduled', from, to, ev))) return { status: 'duplicate' };
    if (to !== from) await sequelize.query('UPDATE placement_interviews SET state = :to, updated_at = NOW() WHERE id = :id', { replacements: { to, id: row.id }, transaction: t });
    return { status: 'ingested', interviewId: String(row.id), state: to };
  });
  if ('review' in result) return reviewItem(result.review, ev, enrollmentId, result.ids.length ? { candidate_interview_ids: result.ids } : {});
  return result;
}

export async function ingestInterviewEvent(ev: InboxEvent): Promise<IngestResult> {
  const enrollmentId = await learnerOf(ev);
  if (!enrollmentId) return reviewItem('unmatched_learner', ev, null);
  const r = ev.type === 'interview.detected' ? await detected(ev, enrollmentId) : await updated(ev, enrollmentId);
  if (r.status === 'ingested') log('info', 'placement_interview_ingested', { interview_id: r.interviewId, state: r.state, type: ev.type });
  return r;
}
