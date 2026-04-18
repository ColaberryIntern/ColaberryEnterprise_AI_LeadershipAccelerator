import crypto from 'crypto';
import { verifyHmacSignature, sha256Hex } from '../../utils/hmac';

function sign(payload: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

describe('verifyHmacSignature', () => {
  const payload = JSON.stringify({ hello: 'world' });
  const secret = 'test-secret-1';
  const prev = 'test-secret-0';

  it('accepts when no secret is configured', () => {
    expect(verifyHmacSignature(payload, 'anything', null)).toBe(true);
    expect(verifyHmacSignature(payload, undefined, '')).toBe(true);
  });

  it('rejects when secret is present but signature is missing', () => {
    expect(verifyHmacSignature(payload, '', secret)).toBe(false);
    expect(verifyHmacSignature(payload, null, secret)).toBe(false);
  });

  it('accepts a valid signature', () => {
    expect(verifyHmacSignature(payload, sign(payload, secret), secret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyHmacSignature(payload, sign(payload, 'wrong'), secret)).toBe(false);
    expect(verifyHmacSignature(payload, 'sha256=deadbeef', secret)).toBe(false);
  });

  it('accepts a signature from the previous secret during rotation', () => {
    expect(verifyHmacSignature(payload, sign(payload, prev), secret, prev)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const sig = sign(payload, secret);
    expect(verifyHmacSignature(payload + 'x', sig, secret)).toBe(false);
  });
});

describe('sha256Hex', () => {
  it('returns deterministic hex digest', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
