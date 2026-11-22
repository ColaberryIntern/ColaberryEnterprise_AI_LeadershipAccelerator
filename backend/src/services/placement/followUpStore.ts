import { sequelize } from '../../config/database';
import type { OnlyIf, Template } from './followUpRules';

/**
 * Career Prep v27, CP10.3: every statement the follow-ups run (routes/hireClientFollowUpRoutes.ts, followUpScheduler.ts
 * and followUpTracking.ts decide; this only reads and writes).
 *   EMPLOYER reads and the cancel take the signed-in client's id and are scoped by it in SQL.
 *   The scheduler CLAIMS due rows with one UPDATE ... FOR UPDATE SKIP LOCKED (two passes at once never take the same row)
 *   and every later write is conditional on status = 'sending', so a row can only finish once.
 * "Replied" means the candidate answered one of THIS client's offers on the platform (accepted, declined or asked to talk
 * first) after the follow-up was scheduled (for "only if they haven't replied") or after it was sent (the table's
 * "Replied"). An email reply goes straight to the employer (Reply-To) and is not visible here.
 */
const q = async <T>(sql: string, replacements: Record<string, unknown>): Promise<T[]> => (await sequelize.query(sql, { replacements }))[0] as T[];

const REPLIED_SINCE = (since: string) => `EXISTS (SELECT 1 FROM placement_offers o WHERE o.client_id = f.client_id AND o.enrollment_id = f.enrollment_id
    AND o.status IN ('accepted','declined','talk_first') AND o.decided_at > ${since})`;

export interface NewFollowUp {
  id: string; clientId: string; memberId: string; enrollmentId: string; offerId: string | null; subject: string; body: string; bookingLink: string | null;
  template: Template; sendOn: Date; onlyIf: OnlyIf; createdBy: string;
}
export interface FollowUpRow {
  id: string; enrollment_id: string; full_name: string | null; subject: string; template: string; send_on: Date | string; only_if: string; status: string;
  status_reason: string | null; attempts: number; sent_at: Date | string | null; opens: number; clicks: Record<string, number> | null; replied: boolean;
}
export interface SendContext {
  id: string; status: string; subject: string; body: string; booking_link: string | null; only_if: string; full_name: string | null; to_email: string | null;
  member_email: string | null; display_name: string | null; company: string; put_forward: boolean; replied: boolean;
}

/** Store a new follow-up. false when the id (the idempotency key) is already stored: the caller re-reads it, scoped. */
export async function insertFollowUp(f: NewFollowUp): Promise<boolean> {
  const rows = await q<{ id: string }>(`INSERT INTO employer_follow_ups (id, client_id, member_id, enrollment_id, offer_id, subject, body, booking_link, template, send_on, only_if, created_by)
    VALUES (:id, :clientId, :memberId, :enrollmentId, :offerId, :subject, :body, :bookingLink, :template, :sendOn, :onlyIf, :createdBy)
    ON CONFLICT (id) DO NOTHING RETURNING id`, { ...f });
  return rows.length === 1;
}

/** THIS client's follow-ups, newest send time first (at most 200), or the one with `id`. */
export async function clientFollowUps(clientId: string, id?: string): Promise<FollowUpRow[]> {
  return q<FollowUpRow>(`SELECT f.id, f.enrollment_id, e.full_name, f.subject, f.template, f.send_on, f.only_if, f.status, f.status_reason, f.attempts, f.sent_at,
      f.opens, f.clicks, (f.sent_at IS NOT NULL AND ${REPLIED_SINCE('f.sent_at')}) AS replied
    FROM employer_follow_ups f JOIN enrollments e ON e.id = f.enrollment_id
    WHERE f.client_id = :clientId ${id ? 'AND f.id = :id' : ''} ORDER BY f.send_on DESC, f.created_at DESC LIMIT 200`, { clientId, id: id ?? null });
}

/** Cancel one of THIS client's follow-ups while it is still only scheduled. true when it was cancelled. */
export async function cancelFollowUp(clientId: string, id: string): Promise<boolean> {
  return (await q<{ id: string }>(`UPDATE employer_follow_ups SET status = 'cancelled', status_reason = 'employer', updated_at = NOW()
    WHERE id = :id AND client_id = :clientId AND status = 'scheduled' RETURNING id`, { id, clientId })).length === 1;
}

/**
 * Employer email switched off: every due row (at most `limit`) is held, never sent later behind anyone's back. That
 * includes a row left `sending` since before `staleBefore` (a pass that died): it is never resumed after an off-to-on
 * flip; only a row claimed while the switch is on can be sent.
 */
export async function holdDue(now: Date, staleBefore: Date, limit: number): Promise<string[]> {
  return (await q<{ id: string }>(`UPDATE employer_follow_ups SET status = 'held', status_reason = 'employer_mail_off', updated_at = NOW()
    WHERE id IN (SELECT id FROM employer_follow_ups
      WHERE (status = 'scheduled' AND send_on <= :now) OR (status = 'sending' AND last_attempt_at < :staleBefore)
      ORDER BY send_on LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    RETURNING id`, { now, staleBefore })).map((r) => String(r.id));
}

/**
 * Claim up to `limit` rows to send now, counting the try: due scheduled rows whose retry wait is over, and rows left
 * `sending` since before `staleBefore` (a pass that died mid-send; sendOnce stops a second email).
 */
export async function claimDue(now: Date, staleBefore: Date, limit: number): Promise<Array<{ id: string; attempts: number }>> {
  const rows = await q<{ id: string; attempts: number }>(`UPDATE employer_follow_ups SET status = 'sending', attempts = attempts + 1, last_attempt_at = :now, updated_at = NOW()
    WHERE id IN (SELECT id FROM employer_follow_ups
      WHERE (status = 'scheduled' AND send_on <= :now AND (next_attempt_at IS NULL OR next_attempt_at <= :now)) OR (status = 'sending' AND last_attempt_at < :staleBefore)
      ORDER BY send_on LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    RETURNING id, attempts`, { now, staleBefore });
  return rows.map((r) => ({ id: String(r.id), attempts: Number(r.attempts) }));
}

/** Everything a send needs, read at send time: the candidate's address now, the sender still a member, the condition. */
export async function sendContext(id: string): Promise<SendContext | undefined> {
  return (await q<SendContext>(`SELECT f.id, f.status, f.subject, f.body, f.booking_link, f.only_if, e.full_name, e.email AS to_email, m.email AS member_email,
      m.display_name, c.name AS company,
      EXISTS (SELECT 1 FROM hire_client_candidates cc WHERE cc.client_id = f.client_id AND cc.enrollment_id = f.enrollment_id) AS put_forward,
      ${REPLIED_SINCE('f.created_at')} AS replied
    FROM employer_follow_ups f JOIN enrollments e ON e.id = f.enrollment_id JOIN hire_clients c ON c.id = f.client_id
    LEFT JOIN hire_client_members m ON m.id = f.member_id AND m.client_id = f.client_id
    WHERE f.id = :id`, { id }))[0];
}

export type Finish =
  | { status: 'sent'; messageId: string | null; to: string; link: string | null; now: Date }
  | { status: 'scheduled'; nextAttemptAt: Date; errorClass: string }
  | { status: 'failed' | 'cancelled' | 'held'; reason: string };

/** Finish a claimed row. Only a row still `sending` changes, so a row finishes once. true when it changed. */
export async function finish(id: string, f: Finish): Promise<boolean> {
  const set = f.status === 'sent' ? "status = 'sent', sent_at = :now, mandrill_id = :messageId, to_email = :to, link = :link, next_attempt_at = NULL"
    : f.status === 'scheduled' ? "status = 'scheduled', next_attempt_at = :nextAttemptAt, last_error_class = :errorClass"
      : `status = :status, status_reason = :reason${f.status === 'failed' ? ', last_error_class = :reason' : ''}`;
  return (await q<{ id: string }>(`UPDATE employer_follow_ups SET ${set}, updated_at = NOW() WHERE id = :id AND status = 'sending' RETURNING id`, { id, ...f })).length === 1;
}

/**
 * One Mandrill open or click, counted ONCE (the event key is the primary key of employer_follow_up_events) and only for
 * a follow-up that was really sent. A click counts under "link" when it is the message's own link, else "other"; the
 * url itself is never stored. Engagement only moves the status forward (sent -> opened -> clicked). true when counted.
 */
export async function recordEngagement(eventKey: string, followUpId: string, kind: 'open' | 'click', url: string): Promise<boolean> {
  const rows = await q<{ id: string }>(`WITH ev AS (
      INSERT INTO employer_follow_up_events (event_key, follow_up_id, kind)
      SELECT :eventKey, f.id, :kind FROM employer_follow_ups f WHERE f.id = :followUpId AND f.sent_at IS NOT NULL
      ON CONFLICT (event_key) DO NOTHING RETURNING follow_up_id)
    UPDATE employer_follow_ups f SET
      opens = f.opens + CASE WHEN :kind = 'open' THEN 1 ELSE 0 END,
      clicks = CASE WHEN :kind <> 'click' THEN f.clicks ELSE jsonb_set(f.clicks, ARRAY[CASE WHEN f.link = :url THEN 'link' ELSE 'other' END],
        to_jsonb(COALESCE((f.clicks ->> CASE WHEN f.link = :url THEN 'link' ELSE 'other' END)::int, 0) + 1)) END,
      status = CASE WHEN :kind = 'click' AND f.status IN ('sent','opened') THEN 'clicked' WHEN :kind = 'open' AND f.status = 'sent' THEN 'opened' ELSE f.status END,
      updated_at = NOW()
    FROM ev WHERE f.id = ev.follow_up_id RETURNING f.id`, { eventKey, followUpId, kind, url });
  return rows.length === 1;
}
