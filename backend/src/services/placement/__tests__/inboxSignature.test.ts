import { SIGNATURE_WINDOW_MS, signInboxRequest, verifyInboxSignature } from '../inboxSignature';

/** CP6.2 (kit F3): the inbox manager's request signature over the exact bytes, with a 5-minute window. */
const SECRET = ['inbox', 'sig', 'test'].join('-');
const NOW = new Date('2026-11-21T18:00:00Z');
const TS = String(Math.floor(NOW.getTime() / 1000));
const BODY = Buffer.from('{"event_id":"e1","type":"email.classified"}');
const check = (over: Partial<Parameters<typeof verifyInboxSignature>[0]> = {}) =>
  verifyInboxSignature({ secret: SECRET, timestamp: TS, signature: signInboxRequest(SECRET, TS, BODY), body: BODY, now: NOW, ...over });

describe('verifyInboxSignature', () => {
  it('accepts a request signed over its exact bytes (string or Buffer, either hex case)', () => {
    expect(check()).toEqual({ ok: true });
    expect(check({ body: BODY.toString('utf8') })).toEqual({ ok: true });
    expect(check({ signature: signInboxRequest(SECRET, TS, BODY).replace(/[a-f]/g, (c) => c.toUpperCase()).replace('SHA256=', 'sha256=') })).toEqual({ ok: true });
  });
  it('the same JSON with different whitespace, or one changed byte, is refused', () => {
    expect(check({ body: Buffer.from('{"event_id": "e1", "type": "email.classified"}') })).toEqual({ ok: false, reason: 'bad_signature' });
    expect(check({ body: Buffer.from('{"event_id":"e2","type":"email.classified"}') })).toEqual({ ok: false, reason: 'bad_signature' });
  });
  it('the timestamp is signed: changing it breaks the signature', () => {
    expect(check({ timestamp: String(Number(TS) - 1) })).toEqual({ ok: false, reason: 'bad_signature' });
  });
  it('a 5-minute window either way: 5 min exactly is fine, 5 min + 1 s is stale (past or future)', () => {
    const at = (ms: number) => { const ts = String(Math.floor((NOW.getTime() + ms) / 1000)); return check({ timestamp: ts, signature: signInboxRequest(SECRET, ts, BODY) }); };
    expect(at(-SIGNATURE_WINDOW_MS)).toEqual({ ok: true });
    expect(at(-SIGNATURE_WINDOW_MS - 1000)).toEqual({ ok: false, reason: 'stale' });
    expect(at(SIGNATURE_WINDOW_MS + 1000)).toEqual({ ok: false, reason: 'stale' });
  });
  it('a wrong secret, a malformed header, or a missing piece is refused', () => {
    expect(check({ signature: signInboxRequest('another-secret', TS, BODY) })).toEqual({ ok: false, reason: 'bad_signature' });
    expect(check({ signature: 'sha1=abc' })).toEqual({ ok: false, reason: 'bad_signature' });
    expect(check({ signature: `sha256=${'0'.repeat(63)}` })).toEqual({ ok: false, reason: 'bad_signature' });
    expect(check({ signature: undefined })).toEqual({ ok: false, reason: 'missing' });
    expect(check({ timestamp: undefined })).toEqual({ ok: false, reason: 'missing' });
    expect(check({ secret: '' })).toEqual({ ok: false, reason: 'missing' });
    expect(check({ timestamp: '2026-11-21T18:00:00Z' })).toEqual({ ok: false, reason: 'bad_timestamp' });
  });
});
