import { correlationKey, mintToken, verifyToken } from '../correlationToken';

const KEY = correlationKey('unit-test-base-key-0123456789');
const OTHER = correlationKey('a-different-key-0123456789');
const CALL = '0b1c2d3e-4f50-4617-8899-aabbccddeeff';
const NOW = Date.parse('2026-11-24T20:00:00Z');

describe('correlation token (VS2.1)', () => {
  it('round-trips callId, purpose and a unique nonce', () => {
    const a = verifyToken(mintToken(CALL, 'twiml', 300, NOW, KEY), 'twiml', NOW + 1000, KEY);
    const b = verifyToken(mintToken(CALL, 'twiml', 300, NOW, KEY), 'twiml', NOW + 1000, KEY);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.claims.callId).toBe(CALL);
      expect(a.claims.nonce).not.toBe(b.claims.nonce);
    }
  });

  it('lowercases the callId (an uppercase copy is the same call)', () => {
    const v = verifyToken(mintToken(CALL.toUpperCase(), 'status', 60, NOW, KEY), 'status', NOW, KEY);
    expect(v.ok && v.claims.callId).toBe(CALL);
  });

  it('carries no phone number, prompt or PII: only callId, purpose, exp, nonce', () => {
    const t = mintToken(CALL, 'session', 60, NOW, KEY);
    const claims = JSON.parse(Buffer.from(t.split('.')[0], 'base64url').toString());
    expect(Object.keys(claims).sort()).toEqual(['callId', 'exp', 'nonce', 'purpose']);
  });

  it('rejects an expired token at the expiry second', () => {
    const t = mintToken(CALL, 'twiml', 60, NOW, KEY);
    expect(verifyToken(t, 'twiml', NOW + 59_000, KEY).ok).toBe(true);
    expect(verifyToken(t, 'twiml', NOW + 60_000, KEY)).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a token minted for another purpose (a status ref cannot open a session)', () => {
    expect(verifyToken(mintToken(CALL, 'status', 60, NOW, KEY), 'session', NOW, KEY)).toEqual({ ok: false, reason: 'wrong_purpose' });
  });

  it('rejects a token signed with another key, and a tampered body', () => {
    const t = mintToken(CALL, 'twiml', 60, NOW, KEY);
    expect(verifyToken(t, 'twiml', NOW, OTHER)).toEqual({ ok: false, reason: 'bad_signature' });
    const forged = Buffer.from(JSON.stringify({ callId: CALL, purpose: 'twiml', exp: 9e9, nonce: 'x' })).toString('base64url');
    expect(verifyToken(`${forged}.${t.split('.')[1]}`, 'twiml', NOW, KEY)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it.each([[undefined], [''], ['abc'], ['a.b.c'], ['.sig'], [123], ['x'.repeat(601)]])('rejects malformed input %p', (t) => {
    expect(verifyToken(t, 'twiml', NOW, KEY).ok).toBe(false);
  });

  it('the correlation key differs from the base key it is derived from', () => {
    expect(correlationKey('base-key-0123456789').toString('hex')).not.toBe(Buffer.from('base-key-0123456789').toString('hex'));
  });
});
