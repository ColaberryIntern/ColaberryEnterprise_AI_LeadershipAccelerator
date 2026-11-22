import { sequelize } from '../../config/database';
import { InboxEventSchema, type InboxEvent } from './inboxEventSchema';
import { normalizeJobSearchAddress } from './inboxHealth';
import { recordArrival } from './inboxArrival';
import { ingestInterviewEvent } from './interviewIngest';

/**
 * Career Prep v27, CP6.2 (kit F3): one event the inbox manager pushed, after its signature was verified.
 *
 *   store      INSERT ... ON CONFLICT (message_id, type) DO NOTHING: a replay is stored once.
 *   dispatch   email.classified        -> recordArrival (inboxArrival.ts, the one place an arrival changes an inbox)
 *              forwarding.confirmation -> the code and link are kept on the learner's inbox for staff to confirm
 *                                         with one click (CP11.1, never auto-clicked). It is NOT an arrival: Google's
 *                                         confirmation proves the address was added, not that forwarding works.
 *              interview.*             -> ingestInterviewEvent (interviewIngest.ts, T15)
 *   processed  processed_at is set only after the dispatch succeeded AND was not deferred. Rows left NULL (a failed
 *              dispatch, or interview events stored while T12's stub deferred them) are finished by
 *              replayUnprocessedEvents, run once at boot (placementBoot SCHEDULERS). A replay of a processed event is a duplicate
 *              (200, nothing happens); a replay of a stored event whose dispatch FAILED is dispatched again. Every
 *              dispatch target is idempotent (recordArrival keys on the Message-ID), so a second dispatch is safe.
 */
export type AcceptResult = { duplicate: boolean };
/** error.name when the event row was stored but its dispatch failed (the backfill counts it as stored). */
export const DISPATCH_ERROR = 'InboxDispatchError';

function log(level: 'info' | 'warn', event: string, context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'backend', event,
    outcome: level === 'info' ? 'success' : 'failure', ...(errorClass ? { error_class: errorClass } : {}), context });
  if (level === 'warn') console.warn(line); else console.log(line);
}

/** Only Google's own confirmation pages may be stored: staff will open this link later. */
export function safeConfirmationLink(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && (u.hostname === 'mail-settings.google.com' || u.hostname === 'mail.google.com') ? u.toString() : null;
  } catch { return null; }
}

async function storeForwardingConfirmation(ev: InboxEvent): Promise<void> {
  const addr = normalizeJobSearchAddress(ev.to_address);
  const code = ev.confirmation_code && /^[A-Za-z0-9-]{4,32}$/.test(ev.confirmation_code) ? ev.confirmation_code : null;
  const link = safeConfirmationLink(ev.confirmation_link);
  if (!addr.ok || (!code && !link)) { log('warn', 'inbox_forwarding_confirmation_unusable', { event_id: ev.event_id }, 'ValidationError'); return; }
  const [rows] = await sequelize.query(
    `UPDATE job_search_inboxes SET forwarding_code = :c, forwarding_link = :l, updated_at = NOW()
      WHERE mailbox = :m AND forwarding_confirmed_at IS NULL RETURNING id`, { replacements: { c: code, l: link, m: addr.mailbox } });
  if (!(rows as unknown[]).length) log('warn', 'inbox_forwarding_confirmation_unmatched', { event_id: ev.event_id }, 'NotFoundError');
}

/** Dispatch one event. `processed: false` means it was deliberately left for later (the interview stub defers). */
export async function dispatchInboxEvent(ev: InboxEvent): Promise<{ processed: boolean }> {
  if (ev.type === 'email.classified') {
    await recordArrival({ toAddress: ev.to_address, subject: ev.subject ?? null, receivedAt: new Date(ev.received_at), messageId: ev.message_id,
      fromName: ev.contact?.name ?? null, category: ev.category ?? null, confidence: ev.confidence ?? null, outcome: null });
  } else if (ev.type === 'forwarding.confirmation') {
    await storeForwardingConfirmation(ev);
  } else {
    return { processed: (await ingestInterviewEvent(ev)).status !== 'deferred' };
  }
  return { processed: true };
}

export async function acceptInboxEvent(ev: InboxEvent): Promise<AcceptResult> {
  const [made] = await sequelize.query(
    `INSERT INTO inbox_events (event_id, message_id, type, payload, received_at) VALUES (:id, :mid, :type, CAST(:payload AS jsonb), :at)
     ON CONFLICT (message_id, type) DO NOTHING RETURNING id`,
    { replacements: { id: ev.event_id, mid: ev.message_id, type: ev.type, payload: JSON.stringify(ev), at: new Date(ev.received_at) } });
  let id = (made as Array<{ id: string }>)[0]?.id;
  if (!id) {
    const [seen] = await sequelize.query('SELECT id, processed_at FROM inbox_events WHERE message_id = :mid AND type = :type', { replacements: { mid: ev.message_id, type: ev.type } });
    const prior = (seen as Array<{ id: string; processed_at: Date | null }>)[0];
    if (!prior || prior.processed_at) { log('info', 'inbox_event_duplicate', { event_id: ev.event_id, type: ev.type }); return { duplicate: true }; }
    id = prior.id; // stored before, but its dispatch failed: dispatch it again
  }
  let processed: boolean;
  try { ({ processed } = await dispatchInboxEvent(ev)); } catch (err) {
    // The row IS stored (processed_at NULL); only its dispatch failed. Callers can tell the two apart by the name.
    throw Object.assign(new Error((err as Error)?.message ?? String(err)), { name: DISPATCH_ERROR, cause: err });
  }
  if (processed) await sequelize.query('UPDATE inbox_events SET processed_at = NOW() WHERE id = :id', { replacements: { id } });
  log('info', 'inbox_event_accepted', { event_id: ev.event_id, type: ev.type, processed });
  return { duplicate: false };
}

const parsePayload = (p: unknown): unknown => { if (typeof p !== 'string') return p; try { return JSON.parse(p); } catch { return null; } };

export type ReplayResult ={ scanned: number; processed: number; failed: number; invalid: number };

/**
 * Finish every stored event left unprocessed (processed_at IS NULL), oldest first, at most `limit` per run. Safe to
 * run any number of times: every dispatch is idempotent, and only a successful, non-deferred one marks the row. A row
 * whose payload no longer parses is marked failed_at + error_class 'ContractViolation' (terminal, left for a person, and
 * skipped by every later pass); a dispatch that fails is left to retry; one failing row never stops the rest.
 */
export async function replayUnprocessedEvents(limit = 500): Promise<ReplayResult> {
  const [rows] = await sequelize.query(
    'SELECT id, payload FROM inbox_events WHERE processed_at IS NULL AND failed_at IS NULL ORDER BY received_at, id LIMIT :n', { replacements: { n: Math.max(1, Math.min(limit, 5000)) } });
  const out: ReplayResult = { scanned: (rows as unknown[]).length, processed: 0, failed: 0, invalid: 0 };
  for (const r of rows as Array<{ id: string; payload: unknown }>) {
    const ev = InboxEventSchema.safeParse(parsePayload(r.payload));
    if (!ev.success) {
      // Terminal: a payload that does not parse never will, so it is marked and never clogs a later pass.
      await sequelize.query("UPDATE inbox_events SET failed_at = NOW(), error_class = 'ContractViolation' WHERE id = :id AND processed_at IS NULL", { replacements: { id: r.id } });
      out.invalid += 1; log('warn', 'inbox_replay_invalid_payload', { row_id: r.id }, 'ContractViolation'); continue;
    }
    try {
      if (!(await dispatchInboxEvent(ev.data)).processed) continue;
      await sequelize.query('UPDATE inbox_events SET processed_at = NOW() WHERE id = :id AND processed_at IS NULL', { replacements: { id: r.id } });
      out.processed += 1;
    } catch (err) {
      out.failed += 1;
      log('warn', 'inbox_replay_failed', { row_id: r.id, type: ev.data.type }, (err as Error)?.name && (err as Error).name !== 'Error' ? (err as Error).name : 'UpstreamUnavailable');
    }
  }
  if (out.scanned) log('info', 'inbox_replay_done', { ...out });
  return out;
}

/** Boot: one replay pass in the background (placementBoot SCHEDULERS); a failure is logged, boot never waits. */
export function startInboxReplay(): void {
  replayUnprocessedEvents().catch((err) => log('warn', 'inbox_replay_pass_failed', {}, (err as Error)?.name || 'DatabaseError'));
}
