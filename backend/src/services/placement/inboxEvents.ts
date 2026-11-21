import { sequelize } from '../../config/database';
import type { InboxEvent } from './inboxEventSchema';
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
 *              interview.*             -> ingestInterviewEvent (a stub until T15)
 *   processed  processed_at is set only after the dispatch succeeded AND was not deferred (the interview stub defers,
 *              so stored interview events wait with processed_at NULL for T15). A replay of a processed event is a duplicate
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
    // Until T15's ingestion lands, interview events stay processed_at NULL, so T15 picks up exactly those rows.
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
