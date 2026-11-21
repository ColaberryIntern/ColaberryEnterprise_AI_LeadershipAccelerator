import { sequelize } from '../../config/database';
import { HEALTH_LABEL, inboxHealth, normalizeJobSearchAddress, type InboxHealth } from './inboxHealth';

/**
 * Career Prep v27, CP6.1 (kit F2): the student's job-search inbox. Every statement is keyed by the session enrollment
 * (`WHERE enrollment_id = :e`), so a student can only ever read or change their own.
 *
 * NO STORED STATUS (run assumption, T09 carry-forward): health is recomputed by inboxHealth.ts on every read from the
 * dates the table holds, so it can never disagree with the facts or go stale between a test and a page load.
 *
 * SAVE: Gmail only; the canonical mailbox (dots and +tag removed) is unique across learners, so a second learner
 * claiming the same inbox gets `taken` (the route answers 409). Saving the same address again changes nothing; the same
 * MAILBOX typed differently (dots, a +tag) only updates the shown address and keeps verification; a DIFFERENT mailbox
 * starts the setup over (verification, forwarding confirmation and the last test are cleared),
 * because forwarding was proven for the old address, not the new one. One statement under the per-learner UNIQUE key.
 */
export interface InboxView {
  address: string | null;
  health: InboxHealth;
  healthLabel: string;
  verifiedAt: string | null;
  forwardingConfirmedAt: string | null;
  lastReceivedAt: string | null;
  lastTestAt: string | null;
  lastTestMs: number | null;
  receivedThisMonth: number;
  /** The four setup steps (kit F2), each done only when the platform has seen it happen. */
  steps: { create: boolean; added: boolean; forwarding: boolean; tested: boolean };
}
export interface ReceivedRow { messageId: string; receivedAt: string; fromName: string | null; subject: string | null; category: string | null; confidence: number | null; outcome: string | null }

type Row = { address: string; verified_at: Date | null; forwarding_confirmed_at: Date | null; last_received_at: Date | null; last_test_at: Date | null; last_test_ms: number | null; this_month: number };
const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

export async function getInbox(enrollmentId: string, now = new Date()): Promise<InboxView> {
  const [rows] = await sequelize.query(
    `SELECT i.address, i.verified_at, i.forwarding_confirmed_at, i.last_received_at, i.last_test_at, i.last_test_ms,
            (SELECT COUNT(*)::int FROM inbox_received r WHERE r.enrollment_id = i.enrollment_id
               AND date_trunc('month', r.received_at AT TIME ZONE 'America/Chicago') = date_trunc('month', CAST(:now AS timestamptz) AT TIME ZONE 'America/Chicago')) AS this_month
       FROM job_search_inboxes i WHERE i.enrollment_id = :e`,
    { replacements: { e: enrollmentId, now: now.toISOString() } });
  const r = (rows as Row[])[0];
  const facts = r
    ? { address: r.address, verifiedAt: r.verified_at && new Date(r.verified_at), lastReceivedAt: r.last_received_at && new Date(r.last_received_at), lastTestAt: r.last_test_at && new Date(r.last_test_at), lastTestMs: r.last_test_ms === null ? null : Number(r.last_test_ms) }
    : { address: null, verifiedAt: null, lastReceivedAt: null, lastTestAt: null, lastTestMs: null };
  const health = inboxHealth(facts, now);
  return {
    address: r?.address ?? null, health, healthLabel: HEALTH_LABEL[health],
    verifiedAt: iso(r?.verified_at ?? null), forwardingConfirmedAt: iso(r?.forwarding_confirmed_at ?? null),
    lastReceivedAt: iso(r?.last_received_at ?? null), lastTestAt: iso(r?.last_test_at ?? null), lastTestMs: facts.lastTestMs,
    receivedThisMonth: Number(r?.this_month ?? 0),
    steps: { create: Boolean(r), added: Boolean(r), forwarding: Boolean(r?.forwarding_confirmed_at), tested: Boolean(r?.verified_at) },
  };
}

export type SaveResult = { status: 'saved' | 'unchanged'; inbox: InboxView } | { status: 'invalid'; reason: string } | { status: 'taken' };

export async function saveInboxAddress(enrollmentId: string, raw: string, now = new Date()): Promise<SaveResult> {
  const check = normalizeJobSearchAddress(raw);
  if (!check.ok) return { status: 'invalid', reason: check.reason };
  const [owner] = await sequelize.query('SELECT enrollment_id FROM job_search_inboxes WHERE mailbox = :m', { replacements: { m: check.mailbox } });
  const holder = (owner as Array<{ enrollment_id: string }>)[0];
  if (holder && String(holder.enrollment_id) !== enrollmentId) return { status: 'taken' };
  try {
    const [rows] = await sequelize.query(
      // A DIFFERENT mailbox restarts the setup; the SAME mailbox typed differently (dots, a +tag) only updates the
      // displayed address and keeps verification; the same typed address changes nothing (no row returned).
      `INSERT INTO job_search_inboxes (enrollment_id, address, mailbox) VALUES (:e, :a, :m)
       ON CONFLICT (enrollment_id) DO UPDATE SET address = EXCLUDED.address, mailbox = EXCLUDED.mailbox,
         verified_at = CASE WHEN job_search_inboxes.mailbox IS DISTINCT FROM EXCLUDED.mailbox THEN NULL ELSE job_search_inboxes.verified_at END,
         forwarding_confirmed_at = CASE WHEN job_search_inboxes.mailbox IS DISTINCT FROM EXCLUDED.mailbox THEN NULL ELSE job_search_inboxes.forwarding_confirmed_at END,
         forwarding_code = CASE WHEN job_search_inboxes.mailbox IS DISTINCT FROM EXCLUDED.mailbox THEN NULL ELSE job_search_inboxes.forwarding_code END,
         forwarding_link = CASE WHEN job_search_inboxes.mailbox IS DISTINCT FROM EXCLUDED.mailbox THEN NULL ELSE job_search_inboxes.forwarding_link END,
         last_test_at = CASE WHEN job_search_inboxes.mailbox IS DISTINCT FROM EXCLUDED.mailbox THEN NULL ELSE job_search_inboxes.last_test_at END,
         last_test_token = CASE WHEN job_search_inboxes.mailbox IS DISTINCT FROM EXCLUDED.mailbox THEN NULL ELSE job_search_inboxes.last_test_token END,
         last_test_ms = CASE WHEN job_search_inboxes.mailbox IS DISTINCT FROM EXCLUDED.mailbox THEN NULL ELSE job_search_inboxes.last_test_ms END,
         updated_at = NOW()
       WHERE job_search_inboxes.mailbox IS DISTINCT FROM EXCLUDED.mailbox OR job_search_inboxes.address IS DISTINCT FROM EXCLUDED.address
       RETURNING id`,
      { replacements: { e: enrollmentId, a: check.address, m: check.mailbox } });
    return { status: (rows as unknown[]).length ? 'saved' : 'unchanged', inbox: await getInbox(enrollmentId, now) };
  } catch (err) {
    // Two learners racing for one mailbox: the UNIQUE index decides; the loser is told it is taken.
    if ((err as { name?: string })?.name === 'SequelizeUniqueConstraintError' || /uq_job_search_inboxes_mailbox/.test(String((err as Error)?.message))) return { status: 'taken' };
    throw err;
  }
}

export async function listReceived(enrollmentId: string, limit = 50): Promise<ReceivedRow[]> {
  const [rows] = await sequelize.query(
    `SELECT message_id, received_at, from_name, subject, category, confidence, outcome FROM inbox_received
      WHERE enrollment_id = :e ORDER BY received_at DESC LIMIT :n`, { replacements: { e: enrollmentId, n: Math.min(Math.max(1, limit), 200) } });
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    messageId: String(r.message_id), receivedAt: new Date(r.received_at as string).toISOString(), fromName: (r.from_name as string) ?? null,
    subject: (r.subject as string) ?? null, category: (r.category as string) ?? null, confidence: r.confidence === null || r.confidence === undefined ? null : Number(r.confidence), outcome: (r.outcome as string) ?? null,
  }));
}
