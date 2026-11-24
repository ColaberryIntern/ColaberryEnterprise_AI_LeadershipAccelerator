/**
 * Persistence for verified carrier/session events (VS2.1). Every write is idempotent:
 *   - appendCallEvents: INSERT ... ON CONFLICT (call_id, event_key) DO NOTHING, so a redelivered
 *     Twilio callback is a no-op.
 *   - consumeToken: INSERT ... ON CONFLICT (purpose, nonce) DO NOTHING, so a replayed single-use
 *     token is detected (no row returned) and refused by the caller.
 *   - recomputeCall: re-reduces the WHOLE stored event set (order-independent reducer) under a row
 *     lock, so concurrent callbacks converge on the same voice_calls row.
 *
 * tenant_id is copied from the voice_calls row, never taken from the request. An event for a callId
 * with no voice_calls row inserts nothing and is reported as `unknownCall`.
 *
 * Failure: database errors propagate to the webhook controller, which logs the error class and
 * answers 500 so Twilio's own retry redelivers (safe: every write here is idempotent).
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { CONTRACT_VERSION, type CallState, type CanonicalCallEvent } from '../contracts/schemas';
import { reduceCallEvents, type CallRecord } from '../contracts/callStateReducer';
import type { TokenClaims } from './correlationToken';

export interface AppendResult { inserted: number; duplicates: number; unknownCall: boolean }

/** Extra event fields kept in payload_ref as compact JSON (no phone field ever reaches an event). */
interface EventExtras { p?: string; a?: 'human' | 'machine' | 'unknown'; e?: string }

export function packExtras(ev: CanonicalCallEvent): string | null {
  const x: EventExtras = {};
  if (ev.providerCallId) x.p = ev.providerCallId;
  if (ev.answeredBy) x.a = ev.answeredBy;
  if (ev.errorClass) x.e = ev.errorClass.slice(0, 100);
  return Object.keys(x).length ? JSON.stringify(x) : null;
}

export function unpackExtras(ref: string | null): EventExtras {
  if (!ref) return {};
  try {
    const v = JSON.parse(ref) as EventExtras;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {}; // a non-JSON payload_ref (another writer's opaque reference) carries no extras
  }
}

async function callExists(callId: string): Promise<boolean> {
  const rows = await sequelize.query<{ id: string }>('SELECT id FROM voice_calls WHERE id = :callId', { replacements: { callId }, type: QueryTypes.SELECT });
  return rows.length > 0;
}

export async function appendCallEvents(events: CanonicalCallEvent[]): Promise<AppendResult> {
  const out: AppendResult = { inserted: 0, duplicates: 0, unknownCall: false };
  for (const ev of events) {
    const rows = await sequelize.query<{ id: string }>(
      `INSERT INTO voice_call_events (tenant_id, call_id, event_key, source, state, occurred_at, payload_ref)
       SELECT c.tenant_id, c.id, :eventKey, :source, :state, :occurredAt, :extras FROM voice_calls c WHERE c.id = :callId
       ON CONFLICT (call_id, event_key) DO NOTHING RETURNING id`,
      { replacements: { callId: ev.callId, eventKey: ev.eventKey, source: ev.source, state: ev.state, occurredAt: ev.occurredAt, extras: packExtras(ev) }, type: QueryTypes.SELECT },
    );
    if (rows.length) out.inserted += 1;
    else if (await callExists(ev.callId)) out.duplicates += 1;
    else out.unknownCall = true;
  }
  return out;
}

export type ConsumeResult = 'consumed' | 'replay' | 'unknown_call';

export async function consumeToken(claims: TokenClaims): Promise<ConsumeResult> {
  const rows = await sequelize.query<{ id: string }>(
    `INSERT INTO voice_token_uses (tenant_id, call_id, purpose, nonce)
     SELECT c.tenant_id, c.id, :purpose, :nonce FROM voice_calls c WHERE c.id = :callId
     ON CONFLICT (purpose, nonce) DO NOTHING RETURNING id`,
    { replacements: { callId: claims.callId, purpose: claims.purpose, nonce: claims.nonce }, type: QueryTypes.SELECT },
  );
  if (rows.length) return 'consumed';
  return (await callExists(claims.callId)) ? 'replay' : 'unknown_call';
}

interface EventRow { event_key: string; source: string; state: string; occurred_at: Date | string; payload_ref: string | null }

export function rowsToEvents(callId: string, rows: EventRow[]): CanonicalCallEvent[] {
  return rows.map((r) => {
    const x = unpackExtras(r.payload_ref);
    const ev: CanonicalCallEvent = {
      contractVersion: CONTRACT_VERSION, eventKey: r.event_key, callId, source: r.source as CanonicalCallEvent['source'],
      state: r.state as CallState, occurredAt: new Date(r.occurred_at).toISOString(),
    };
    if (x.p) ev.providerCallId = x.p;
    if (x.a) ev.answeredBy = x.a;
    if (x.e) ev.errorClass = x.e;
    return ev;
  });
}

/** Re-reduce every stored event and write the derived record onto voice_calls. Returns the record. */
export async function recomputeCall(callId: string): Promise<CallRecord | null> {
  return sequelize.transaction(async (transaction) => {
    const lock = await sequelize.query<{ id: string }>('SELECT id FROM voice_calls WHERE id = :callId FOR UPDATE', { replacements: { callId }, type: QueryTypes.SELECT, transaction });
    if (!lock.length) return null;
    const rows = await sequelize.query<EventRow>(
      'SELECT event_key, source, state, occurred_at, payload_ref FROM voice_call_events WHERE call_id = :callId ORDER BY seq',
      { replacements: { callId }, type: QueryTypes.SELECT, transaction },
    );
    const rec = reduceCallEvents(callId, rowsToEvents(callId, rows));
    await sequelize.query(
      `UPDATE voice_calls SET state = :state, provider_call_id = COALESCE(provider_call_id, :sid), carrier_answered = :carrier,
         human_answered = :human, session_succeeded = :session, error_class = COALESCE(:errorClass, error_class),
         ended_at = COALESCE(:endedAt, ended_at), updated_at = NOW() WHERE id = :callId`,
      { replacements: { callId, state: rec.state, sid: rec.providerCallIds[0] ?? null, carrier: rec.carrierAnswered, human: rec.humanAnswered,
        session: rec.sessionSucceeded, errorClass: rec.lastErrorClass ?? null, endedAt: rec.terminalAt ?? null }, transaction },
    );
    return rec;
  });
}

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * True only when the number is an ACTIVE Twilio row in our voice_numbers inventory (the restricted
 * e164 column is read here and by the carrier, nowhere else). Anything not E.164 is false without
 * a query. The number is never logged.
 */
export async function isOwnedActiveNumber(e164: string): Promise<boolean> {
  if (!E164.test(e164)) return false;
  const rows = await sequelize.query<{ ok: number }>(
    "SELECT 1 AS ok FROM voice_numbers WHERE provider = 'twilio' AND status = 'active' AND e164_restricted = :e164 LIMIT 1",
    { replacements: { e164 }, type: QueryTypes.SELECT },
  );
  return rows.length > 0;
}
