import { createHash } from 'crypto';
import { sequelize } from '../../config/database';
import { normalizeJobSearchAddress } from './inboxHealth';

/**
 * Career Prep v27, CP6.1c (kit F2): a message reached the central inbox through a learner's Gmail forwarding.
 * `recordArrival` is the ONE place an arrival changes an inbox; the signed events route (CP6.2, T12) only calls it.
 *
 *   1. The `To` address is folded to its canonical Gmail mailbox (dots and +tag removed), the uniqueness key, and the
 *      inbox is locked (FOR UPDATE) inside one transaction. An address no learner uses is ignored and logged (hashed:
 *      no address ever reaches a log line).
 *   2. One `inbox_received` row per RFC 5322 Message-ID (`ON CONFLICT DO NOTHING`). A message seen before changes
 *      nothing at all, so a replayed event or a re-run backfill is a no-op.
 *   3. `last_received_at` moves forward only; the first arrival marks the address verified (forwarding proven).
 *   4. The daily test: the subject carries `[test:<token>]`. ONLY the token of the LATEST test, still unarrived,
 *      sets `last_test_ms` (and ends a broken spell). An older test arriving late can never make a newer, unarrived
 *      test look arrived: each new send replaces the token and resets `last_test_ms` to NULL (inboxTestJob.ts).
 *
 * Failure modes: invalid input -> `ignored/invalid`, nothing written; a database error rolls the whole arrival back
 * (one transaction, no partial write) and is thrown to the caller, whose retry is safe because of step 2's key.
 */
export interface ArrivalInput {
  toAddress: string;
  subject: string | null;
  receivedAt: Date;
  messageId: string;
  fromName?: string | null;
  category?: string | null;
  confidence?: number | null;
  outcome?: string | null;
}
export type ArrivalResult =
  | { status: 'recorded'; enrollmentId: string; testMs: number | null }
  | { status: 'duplicate' }
  | { status: 'ignored'; reason: 'invalid' | 'unknown_address' };

export interface InboxTestState {
  verified_at: Date | null;
  last_received_at: Date | null;
  last_test_at: Date | null;
  last_test_token: string | null;
  last_test_ms: number | null;
}
export interface ArrivalEffect { lastReceivedAt: Date; verifiedAt: Date; testMs: number | null }

const TOKEN = /\[test:([a-f0-9]{16,64})\]/;
/** The daily test's token out of a subject (a test-mode prefix in front of it is fine), or null. */
export function testTokenIn(subject: string | null | undefined): string | null {
  return TOKEN.exec(String(subject ?? ''))?.[1] ?? null;
}

const at = (d: Date | string | null): Date | null => (d ? new Date(d) : null);

/** PURE: what one new arrival does to an inbox. */
export function arrivalEffect(row: InboxTestState, input: Pick<ArrivalInput, 'subject' | 'receivedAt'>): ArrivalEffect {
  const received = input.receivedAt;
  const last = at(row.last_received_at);
  const sentAt = at(row.last_test_at);
  const token = testTokenIn(input.subject);
  const isLatestTest = Boolean(token && sentAt && row.last_test_token === token && row.last_test_ms === null);
  return {
    lastReceivedAt: last && last.getTime() > received.getTime() ? last : received,
    verifiedAt: at(row.verified_at) ?? received,
    testMs: isLatestTest && sentAt ? Math.max(0, received.getTime() - sentAt.getTime()) : null,
  };
}

const clip = (v: string | null | undefined, n: number): string | null => (v === null || v === undefined || v === '' ? null : String(v).slice(0, n));
const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 12);

function log(level: 'info' | 'warn', event: string, context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'backend', event,
    outcome: level === 'info' ? 'success' : 'failure', ...(errorClass ? { error_class: errorClass } : {}), context });
  if (level === 'warn') console.warn(line); else console.log(line);
}

function validInput(i: ArrivalInput): boolean {
  const id = String(i?.messageId ?? '').trim();
  return Boolean(id) && id.length <= 255 && i.receivedAt instanceof Date && !Number.isNaN(i.receivedAt.getTime());
}

type Locked = InboxTestState & { id: string; enrollment_id: string };

export async function recordArrival(input: ArrivalInput): Promise<ArrivalResult> {
  if (!validInput(input)) { log('warn', 'inbox_arrival_invalid', {}, 'ValidationError'); return { status: 'ignored', reason: 'invalid' }; }
  const addr = normalizeJobSearchAddress(input.toAddress);
  if (!addr.ok) { log('warn', 'inbox_arrival_unknown_address', { address_hash: hash(String(input.toAddress ?? '').toLowerCase()) }, 'NotFoundError'); return { status: 'ignored', reason: 'unknown_address' }; }
  return sequelize.transaction(async (transaction) => {
    const [found] = await sequelize.query(
      `SELECT id, enrollment_id, verified_at, last_received_at, last_test_at, last_test_token, last_test_ms
         FROM job_search_inboxes WHERE mailbox = :m FOR UPDATE`, { replacements: { m: addr.mailbox }, transaction });
    const row = (found as Locked[])[0];
    if (!row) { log('warn', 'inbox_arrival_unknown_address', { address_hash: hash(addr.mailbox) }, 'NotFoundError'); return { status: 'ignored', reason: 'unknown_address' } as const; }
    const conf = typeof input.confidence === 'number' && input.confidence >= 0 && input.confidence <= 1 ? input.confidence : null;
    const [inserted] = await sequelize.query(
      `INSERT INTO inbox_received (enrollment_id, message_id, received_at, from_name, subject, category, confidence, outcome)
       VALUES (:e, :mid, :at, :from, :subj, :cat, :conf, :out) ON CONFLICT (message_id) DO NOTHING RETURNING id`,
      { replacements: { e: row.enrollment_id, mid: input.messageId.trim(), at: input.receivedAt, from: clip(input.fromName, 160), subj: clip(input.subject, 300),
        cat: clip(input.category, 40), conf, out: clip(input.outcome, 160) }, transaction });
    if (!(inserted as unknown[]).length) return { status: 'duplicate' } as const;
    const fx = arrivalEffect(row, input);
    const tested = fx.testMs !== null;
    await sequelize.query(
      `UPDATE job_search_inboxes SET last_received_at = :lr, verified_at = :v,
         last_test_ms = CASE WHEN :tested THEN :ms ELSE last_test_ms END,
         broken_since = CASE WHEN :tested THEN NULL ELSE broken_since END,
         broken_alerted_at = CASE WHEN :tested THEN NULL ELSE broken_alerted_at END,
         broken_alert_attempts = CASE WHEN :tested THEN 0 ELSE broken_alert_attempts END,
         updated_at = NOW()
       WHERE id = :id`,
      { replacements: { lr: fx.lastReceivedAt, v: fx.verifiedAt, tested, ms: fx.testMs, id: row.id }, transaction });
    log('info', 'inbox_arrival_recorded', { enrollment_id: row.enrollment_id, test_ms: fx.testMs });
    return { status: 'recorded', enrollmentId: String(row.enrollment_id), testMs: fx.testMs } as const;
  });
}
