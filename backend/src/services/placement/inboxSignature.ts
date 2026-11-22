import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Career Prep v27, CP6.2 (kit F3): the inbox manager's request signature. PURE: no I/O, no clock of its own.
 *
 *   X-Timestamp: <unix seconds>
 *   X-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<exact raw body bytes>")>
 *
 * The HMAC covers the EXACT bytes received (never a re-serialized body), so a whitespace change breaks it. The
 * timestamp is inside the signed message, so it cannot be swapped, and a request more than 5 minutes from our clock
 * (either way) is refused, so a captured request cannot be replayed later. Comparison is timing-safe.
 */
export const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

export type SignatureCheck = { ok: true } | { ok: false; reason: 'missing' | 'bad_timestamp' | 'stale' | 'bad_signature' };

const toBuf = (body: Buffer | string) => (Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8'));

/** The header value a sender puts in X-Signature for this timestamp and body. */
export function signInboxRequest(secret: string, timestamp: string, body: Buffer | string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.`).update(toBuf(body)).digest('hex')}`;
}

export function verifyInboxSignature(input: { secret: string; timestamp: string | undefined; signature: string | undefined; body: Buffer | string; now: Date }): SignatureCheck {
  const { secret, timestamp, signature, body, now } = input;
  if (!secret || !timestamp || !signature) return { ok: false, reason: 'missing' };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: 'bad_timestamp' };
  if (Math.abs(now.getTime() - Number(timestamp) * 1000) > SIGNATURE_WINDOW_MS) return { ok: false, reason: 'stale' };
  const m = /^sha256=([a-f0-9]{64})$/i.exec(signature.trim());
  if (!m) return { ok: false, reason: 'bad_signature' };
  const given = Buffer.from(m[1].toLowerCase(), 'hex');
  const expected = Buffer.from(signInboxRequest(secret, timestamp, body).slice('sha256='.length), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected) ? { ok: true } : { ok: false, reason: 'bad_signature' };
}
