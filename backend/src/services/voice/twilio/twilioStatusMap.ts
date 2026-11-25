/**
 * Twilio status callback -> canonical call events (VS2.1). Pure, so the carrier adapter and the
 * webhook ingest share one mapping and duplicates/out-of-order deliveries reduce identically.
 *
 * Event key = CallSid + CallStatus + SequenceNumber: Twilio redelivering the same callback produces
 * the same key (deduplicated by voice_call_events_key_uq); a different status is a different event.
 * Order is irrelevant because callStateReducer is order-independent.
 *
 * Privacy: To, From, Caller and every other phone field are read by nobody here; the event carries
 * only the CallSid alias, a state, a time and AnsweredBy.
 */
import { CONTRACT_VERSION, type CallState, type CanonicalCallEvent } from '../contracts/schemas';

const STATUS: Record<string, CallState> = {
  queued: 'queued', initiated: 'queued', ringing: 'ringing', 'in-progress': 'answered', answered: 'answered',
  completed: 'completed', busy: 'busy', 'no-answer': 'no_answer', failed: 'failed', canceled: 'canceled',
};

export function mapTwilioCallStatus(s: unknown): CallState | null {
  return typeof s === 'string' ? STATUS[s.toLowerCase()] ?? null : null;
}

export function mapAnsweredBy(v: unknown): 'human' | 'machine' | 'unknown' | undefined {
  if (typeof v !== 'string' || !v) return undefined;
  if (v === 'human') return 'human';
  if (v.startsWith('machine') || v === 'fax') return 'machine';
  return 'unknown';
}

/** Twilio sends an RFC 2822 `Timestamp`; fall back to when we received it. */
function occurredAt(ts: unknown, receivedAt: string): string {
  if (typeof ts === 'string') {
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return receivedAt;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

/**
 * Returns [] for a payload that is not a call status we understand (logged by the caller), never
 * throws: a malformed callback must not 500 and make Twilio retry forever.
 */
export function twilioStatusToEvents(callId: string, payload: Record<string, unknown>, receivedAt: string): CanonicalCallEvent[] {
  const sid = str(payload.CallSid);
  const state = mapTwilioCallStatus(payload.CallStatus);
  if (!sid || !state || !/^CA[0-9a-f]{32}$/i.test(sid)) return [];
  const seq = str(payload.SequenceNumber) ?? '';
  const errorCode = str(payload.ErrorCode);
  const ev: CanonicalCallEvent = {
    contractVersion: CONTRACT_VERSION,
    eventKey: `twilio:${sid}:${String(payload.CallStatus).toLowerCase()}:${seq}`,
    callId: callId.toLowerCase(),
    source: 'carrier',
    state,
    occurredAt: occurredAt(payload.Timestamp, receivedAt),
    providerCallId: sid,
  };
  const answeredBy = mapAnsweredBy(payload.AnsweredBy);
  if (answeredBy) ev.answeredBy = answeredBy;
  if (errorCode && /^\d{3,6}$/.test(errorCode)) ev.errorClass = `TwilioError${errorCode}`;
  return [ev];
}
