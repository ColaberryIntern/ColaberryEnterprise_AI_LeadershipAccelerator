/**
 * Signed, short-lived correlation references (VS2.1).
 *
 * Twilio is told which call a request belongs to through an opaque `ref` (a TwiML URL query value or
 * a ConversationRelay / Stream custom parameter). The ref carries our callId, a purpose, an expiry
 * and a random nonce, signed with HMAC-SHA256. It never carries a prompt, a phone number or PII.
 *
 * Purposes:
 *   twiml   - the answer URL Twilio fetches once when the call connects. SINGLE-USE (voice_token_uses).
 *   session - the WebSocket session handshake. SINGLE-USE.
 *   status  - status callbacks; Twilio sends several per call, so this one is multi-use until expiry.
 *
 * Verification is pure (signature, purpose, expiry); single use is enforced by the event store.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { destinationHashKey } from '../gateway/destinationHash';

export type TokenPurpose = 'twiml' | 'session' | 'status';
export const SINGLE_USE: ReadonlySet<TokenPurpose> = new Set(['twiml', 'session']);

export interface TokenClaims { callId: string; purpose: TokenPurpose; exp: number; nonce: string }
export type VerifyResult = { ok: true; claims: TokenClaims } | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'wrong_purpose' };

const b64url = (b: Buffer): string => b.toString('base64url');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A key separate from the destination-hash key (derived from it), so one use cannot forge the other. */
export function correlationKey(base: string = destinationHashKey()): Buffer {
  return createHmac('sha256', base).update('voice-correlation-token-v1').digest();
}

function sign(body: string, key: Buffer): string {
  return b64url(createHmac('sha256', key).update(body).digest());
}

export function mintToken(callId: string, purpose: TokenPurpose, ttlSeconds: number, nowMs: number = Date.now(), key: Buffer = correlationKey()): string {
  const claims: TokenClaims = { callId: callId.toLowerCase(), purpose, exp: Math.floor(nowMs / 1000) + ttlSeconds, nonce: b64url(randomBytes(16)) };
  const body = b64url(Buffer.from(JSON.stringify(claims)));
  return `${body}.${sign(body, key)}`;
}

export function verifyToken(token: unknown, purpose: TokenPurpose, nowMs: number = Date.now(), key: Buffer = correlationKey()): VerifyResult {
  if (typeof token !== 'string' || token.length > 600) return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const expected = Buffer.from(sign(parts[0], key));
  const given = Buffer.from(parts[1]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: 'bad_signature' };
  let claims: TokenClaims;
  try {
    claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8')) as TokenClaims;
  } catch {
    return { ok: false, reason: 'malformed' }; // signed by us but unparseable: cannot happen unless the key leaked
  }
  if (!claims || typeof claims.callId !== 'string' || !UUID.test(claims.callId) || typeof claims.exp !== 'number' || typeof claims.nonce !== 'string') {
    return { ok: false, reason: 'malformed' };
  }
  if (claims.purpose !== purpose) return { ok: false, reason: 'wrong_purpose' };
  if (claims.exp * 1000 <= nowMs) return { ok: false, reason: 'expired' };
  return { ok: true, claims };
}
