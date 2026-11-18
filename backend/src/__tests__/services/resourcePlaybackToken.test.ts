process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-playback-tokens';

import {
  mintPlaybackToken,
  verifyPlaybackToken,
  TTL_SECONDS,
} from '../../services/communityRooms/resourcePlaybackToken';

const ROOM = '5ee02845-0205-4a82-bef5-c5f006199413';
const RESOURCE = '9789ca54-9772-4c87-98ba-4220a38f7f53';
const ENROLLMENT = '58358d9f-8837-4f3e-81bd-05cc06f076b8';
const OTHER_RESOURCE = '77e989d5-c2ba-4e9b-abfd-e9244aef2be4';

function mint(overrides: Partial<Parameters<typeof mintPlaybackToken>[0]> = {}) {
  return mintPlaybackToken({ roomId: ROOM, resourceId: RESOURCE, enrollmentId: ENROLLMENT, ...overrides });
}

describe('resource playback tokens', () => {
  it('round-trips the enrollment that asked for it', () => {
    const { token } = mint();
    expect(verifyPlaybackToken(token, { roomId: ROOM, resourceId: RESOURCE }))
      .toEqual({ ok: true, enrollmentId: ENROLLMENT });
  });

  it('is bound to one resource, so it cannot be replayed against another file in the same room', () => {
    const { token } = mint();
    expect(verifyPlaybackToken(token, { roomId: ROOM, resourceId: OTHER_RESOURCE }))
      .toEqual({ ok: false, reason: 'wrong_resource' });
  });

  it('is bound to one room', () => {
    const { token } = mint();
    expect(verifyPlaybackToken(token, { roomId: OTHER_RESOURCE, resourceId: RESOURCE }))
      .toEqual({ ok: false, reason: 'wrong_resource' });
  });

  it('expires', () => {
    const now = Date.UTC(2026, 10, 18, 12, 0, 0);
    const { token, expiresAt } = mint({ now });
    expect(verifyPlaybackToken(token, { roomId: ROOM, resourceId: RESOURCE }, expiresAt.getTime() - 1000))
      .toEqual({ ok: true, enrollmentId: ENROLLMENT });
    expect(verifyPlaybackToken(token, { roomId: ROOM, resourceId: RESOURCE }, expiresAt.getTime()))
      .toEqual({ ok: false, reason: 'expired' });
  });

  it('lasts long enough for the longest recording we hold, which runs 2h57m', () => {
    expect(TTL_SECONDS).toBeGreaterThan(2 * 3600 + 57 * 60);
  });

  it('rejects a payload edited to name a different enrollment', () => {
    const { token } = mint();
    const [version, payload, sig] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    decoded.e = 'someone-else';
    const forged = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    expect(verifyPlaybackToken(`${version}.${forged}.${sig}`, { roomId: ROOM, resourceId: RESOURCE }))
      .toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a payload edited to extend its own expiry', () => {
    const now = Date.UTC(2026, 10, 18, 12, 0, 0);
    const { token } = mint({ now });
    const [version, payload, sig] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    decoded.x = decoded.x + 86400 * 365;
    const forged = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    expect(verifyPlaybackToken(`${version}.${forged}.${sig}`, { roomId: ROOM, resourceId: RESOURCE }))
      .toEqual({ ok: false, reason: 'bad_signature' });
  });

  // A length mismatch makes crypto.timingSafeEqual throw, which would turn a
  // junk query parameter into a 500 instead of a 404.
  it('does not throw on signatures of the wrong length', () => {
    const { token } = mint();
    const [version, payload] = token.split('.');
    expect(() => verifyPlaybackToken(`${version}.${payload}.short`, { roomId: ROOM, resourceId: RESOURCE })).not.toThrow();
    expect(verifyPlaybackToken(`${version}.${payload}.short`, { roomId: ROOM, resourceId: RESOURCE }))
      .toEqual({ ok: false, reason: 'bad_signature' });
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a token', 'hello'],
    ['wrong version', 'v2.abc.def'],
    ['too few parts', 'v1.abc'],
  ])('reports %s as malformed rather than throwing', (_label, value) => {
    expect(verifyPlaybackToken(value as string | undefined, { roomId: ROOM, resourceId: RESOURCE }))
      .toEqual({ ok: false, reason: 'malformed' });
  });

  it('gives a different signature for every enrollment, so one student cannot reuse another token', () => {
    const a = mint({ now: 1_700_000_000_000 }).token;
    const b = mint({ enrollmentId: 'another-enrollment', now: 1_700_000_000_000 }).token;
    expect(a).not.toEqual(b);
  });
});
