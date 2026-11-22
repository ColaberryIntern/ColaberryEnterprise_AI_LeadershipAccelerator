import type { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';

/**
 * Career Prep v27, CP11.1 (kit F9): the statements behind the staff desk's REVIEW QUEUE and its actions, plus the audit
 * row every desk action writes. careerDeskService.ts decides; this only reads and writes. Inbox health, bookings and
 * placements live in careerDeskOpsStore.ts.
 * No statement here selects placement_interviews.room_url or room_provider_id (the provider link never leaves the room
 * routes), and a review summary or inbox payload goes only to the service, which copies named fields out of it.
 * Every list is capped and ordered oldest first, so the longest wait is at the top.
 * LOCK ORDER (plan T19): an interview row lock is taken before anything else in a transaction; a review item is never
 * locked, it is resolved by one conditional UPDATE after the interview work.
 */
type Rep = Record<string, unknown>;
export const q = async <T>(sql: string, replacements: Rep = {}, transaction?: Transaction): Promise<T[]> =>
  (await sequelize.query(sql, { replacements, transaction }))[0] as T[];
const LIMIT = 200;
export const inTransaction = <T>(fn: (t: Transaction) => Promise<T>): Promise<T> => sequelize.transaction(fn);
type When = Date | string;

export interface ItemRow { id: string; kind: string; source_event_id: string; enrollment_id: string | null; interview_id: string | null; summary: unknown; created_at: When; full_name: string | null; status?: string }
export interface RelatedRow { id: string; enrollment_id: string; company: string | null; position: string | null; state: string; starts_at: When | null }
export interface ReviewIvRow { id: string; enrollment_id: string; full_name: string | null; company: string | null; position: string | null; confidence: string | number | null;
  contact_name: string | null; contact_email: string | null; updated_at: When; reason: string | null }
export interface ConfirmRow { id: string; enrollment_id: string; full_name: string | null; company: string | null; position: string | null; starts_at: When }
export interface HeldRow { id: string; enrollment_id: string; full_name: string | null; company: string | null; position: string | null; contact_email: string | null; held_at: When }
export interface IvRow { id: string; enrollment_id: string; state: string; company: string | null; position: string | null; contact_email: string | null;
  booking_link_round: string | null; booking_link_sent_at: When | null; token_expires_at: When | null; full_name: string | null; job_address: string | null }
export interface NewInterview { enrollmentId: string; sourceEventId: string; company: string | null; position: string | null; type: string | null; subType: string | null;
  contactName: string | null; contactEmail: string | null; confidence: number | null }
export interface Audit { subjectType: string; subjectId: string; event: string; actor: string; from?: string | null; to?: string | null; payload: Rep }

const openItems = () => q<ItemRow>(`SELECT r.id, r.kind, r.source_event_id, r.enrollment_id, r.interview_id, r.summary, r.created_at, e.full_name
  FROM placement_review_items r LEFT JOIN enrollments e ON e.id = r.enrollment_id WHERE r.status = 'open' ORDER BY r.created_at, r.id LIMIT ${LIMIT}`);

const item = async (id: string): Promise<ItemRow | undefined> => (await q<ItemRow>(`SELECT id, kind, source_event_id, enrollment_id, interview_id, summary, created_at,
  status, NULL AS full_name FROM placement_review_items WHERE id = :id`, { id }))[0];

/** The learner's interviews, so an update that matched none (or several) names the rounds it could be about. */
const related = (ids: string[]) => (ids.length ? q<RelatedRow>(`SELECT id, enrollment_id, company, position, state, starts_at FROM placement_interviews
  WHERE enrollment_id IN (:ids) ORDER BY created_at DESC LIMIT 500`, { ids }) : Promise.resolve([] as RelatedRow[]));

/** Interviews with a recruiter, with the event that sent each one there (mid confidence, gave up, no contact). */
const reviewInterviews = () => q<ReviewIvRow>(`SELECT i.id, i.enrollment_id, e.full_name, i.company, i.position, i.confidence, i.contact_name, i.contact_email, i.updated_at,
    (SELECT x.event FROM placement_events x WHERE x.subject_type = 'placement_interview' AND x.subject_id = i.id::text AND x.to_state = 'review'
      ORDER BY x.created_at DESC, x.id DESC LIMIT 1) AS reason
  FROM placement_interviews i JOIN enrollments e ON e.id = i.enrollment_id WHERE i.state = 'review' ORDER BY i.updated_at, i.id LIMIT ${LIMIT}`);

/** Booked interviews whose after-booking work (room, invites) gave up (bookingConfirm.ts MAX_CONFIRM_ATTEMPTS). */
const confirmGaveUp = (max: number) => q<ConfirmRow>(`SELECT i.id, i.enrollment_id, e.full_name, i.company, i.position, i.starts_at
  FROM placement_interviews i JOIN enrollments e ON e.id = i.enrollment_id
  WHERE i.state = 'booked' AND i.confirm_done_at IS NULL AND i.confirm_attempts >= :max ORDER BY i.starts_at, i.id LIMIT ${LIMIT}`, { max });

/** Booking-link replies HELD while employer mail was off (or unreadable): still new, never sent, a held row for the round. */
const heldReplies = () => q<HeldRow>(`SELECT i.id, i.enrollment_id, e.full_name, i.company, i.position, i.contact_email, x.created_at AS held_at
  FROM placement_interviews i JOIN enrollments e ON e.id = i.enrollment_id
  JOIN placement_events x ON x.source_event_id = 'booking_link_held:' || i.id || ':' || i.booking_link_round
  WHERE i.state = 'new' AND i.booking_link_round IS NOT NULL AND i.booking_link_sent_at IS NULL ORDER BY x.created_at, i.id LIMIT ${LIMIT}`);

const interview = async (id: string): Promise<IvRow | undefined> => (await q<IvRow>(`SELECT i.id, i.enrollment_id, i.state, i.company, i.position, i.contact_email,
    i.booking_link_round, i.booking_link_sent_at, i.token_expires_at, e.full_name, j.address AS job_address
  FROM placement_interviews i JOIN enrollments e ON e.id = i.enrollment_id LEFT JOIN job_search_inboxes j ON j.enrollment_id = i.enrollment_id WHERE i.id = :id`, { id }))[0];

/** The stored inbox event a review item came from (its source id is `<type>:<Message-ID>`). */
async function sourceEvent(sourceEventId: string): Promise<unknown> {
  const at = sourceEventId.indexOf(':');
  if (at <= 0) return undefined;
  const [row] = await q<{ payload: unknown }>('SELECT payload FROM inbox_events WHERE type = :type AND message_id = :mid',
    { type: sourceEventId.slice(0, at), mid: sourceEventId.slice(at + 1) });
  return row?.payload;
}

/**
 * review -> new with the booking link owed again (the stored round, else 'first'; tries reset so the cap allows a fresh
 * send), under the interview's row lock. Refused unless it is in review and no link ever went. The round, or null.
 */
async function reviewToNew(id: string, contactEmail: string | null, t: Transaction): Promise<string | null> {
  const [row] = await q<{ state: string; booking_link_sent_at: When | null }>('SELECT state, booking_link_sent_at FROM placement_interviews WHERE id = :id FOR UPDATE', { id }, t);
  if (row?.state !== 'review' || row.booking_link_sent_at) return null;
  const [moved] = await q<{ booking_link_round: string }>(`UPDATE placement_interviews SET state = 'new', booking_link_round = COALESCE(booking_link_round, 'first'),
      booking_link_attempts = 0, booking_link_last_attempt_at = NULL, contact_email = COALESCE(:c, contact_email), updated_at = NOW()
    WHERE id = :id AND state = 'review' RETURNING booking_link_round`, { id, c: contactEmail }, t);
  return moved?.booking_link_round ?? null;
}

const changed = async (sql: string, r: Rep, t: Transaction) => (await q(sql, r, t)).length > 0;

/** One interview per source event (UNIQUE source_event_id): a replay answers the existing id. Made in `review`. */
async function makeInterview(n: NewInterview, t: Transaction): Promise<string> {
  const r = { e: n.enrollmentId, src: n.sourceEventId, company: n.company, position: n.position, type: n.type, sub: n.subType, cname: n.contactName, cemail: n.contactEmail, conf: n.confidence };
  const [made] = await q<{ id: string }>(`INSERT INTO placement_interviews (enrollment_id, source_event_id, company, position, type, sub_type, contact_name, contact_email, confidence, state)
    VALUES (:e, :src, :company, :position, :type, :sub, :cname, :cemail, :conf, 'review') ON CONFLICT (source_event_id) DO NOTHING RETURNING id`, r, t);
  if (made) return String(made.id);
  const [had] = await q<{ id: string }>('SELECT id FROM placement_interviews WHERE source_event_id = :src', { src: n.sourceEventId }, t);
  return String(had.id);
}

export const queueStore = {
  openItems, item, related, reviewInterviews, confirmGaveUp, heldReplies, interview, sourceEvent, reviewToNew, makeInterview,
  cancelReview: (id: string, t: Transaction) => changed("UPDATE placement_interviews SET state = 'cancelled', updated_at = NOW() WHERE id = :id AND state = 'review' RETURNING id", { id }, t),
  /** Lets the confirm sweep try a given-up booking again (the give-up log line's own fix: confirm_attempts = 0). */
  retryConfirm: (id: string, max: number, t: Transaction) => changed(`UPDATE placement_interviews SET confirm_attempts = 0, confirm_last_attempt_at = NULL
    WHERE id = :id AND state = 'booked' AND confirm_done_at IS NULL AND confirm_attempts >= :max RETURNING id`, { id, max }, t),
  setType: (id: string, type: string, t: Transaction) => changed(`UPDATE placement_interviews SET type = :type, updated_at = NOW()
    WHERE id = :id AND state NOT IN ('done', 'cancelled') AND type IS DISTINCT FROM :type RETURNING id`, { id, type }, t),
  /** After a person fixed the meeting: forget the stored recording read-back, so the next join asks Zoom again. */
  forgetReadback: (id: string, t: Transaction) => changed(`UPDATE placement_interviews SET readback_meeting_id = NULL, readback_recording = NULL, readback_at = NULL
    WHERE id = :id RETURNING id`, { id }, t),
  resolveItem: (id: string, by: string, t: Transaction) => changed(`UPDATE placement_review_items SET status = 'resolved', resolved_by = :by, resolved_at = NOW()
    WHERE id = :id AND status = 'open' RETURNING id`, { id, by }, t),
};

/** The audit row: one placement_events row per staff action, actor = the staff id (no source key: every click is kept). */
export async function audit(a: Audit, t?: Transaction): Promise<void> {
  await q(`INSERT INTO placement_events (subject_type, subject_id, event, from_state, to_state, actor, payload)
    VALUES (:st, :sid, :event, :from, :to, :actor, CAST(:payload AS jsonb))`,
  { st: a.subjectType, sid: a.subjectId.slice(0, 64), event: a.event.slice(0, 60), from: a.from ?? null, to: a.to ?? null, actor: a.actor.slice(0, 80), payload: JSON.stringify(a.payload) }, t);
}
