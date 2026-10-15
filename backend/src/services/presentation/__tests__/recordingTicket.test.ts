jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret-value' } }));

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  createRecordingTicket,
  verifyRecordingTicket,
  DEFAULT_TICKET_TTL_SECONDS,
} from '../recordingTicket';

/**
 * This ticket is the ONLY thing standing between a URL and somebody's private
 * rehearsal video, because a `<video>` element cannot send an Authorization header.
 * Everything below is a way of getting at a recording you were not issued a link for.
 *
 * The route does still run the full ownership query afterwards — a valid ticket says
 * "this link was issued to you", the query says "and the recording is yours". These
 * tests cover the first half; losing either one alone would serve the wrong video.
 */

const REC = '11111111-1111-1111-1111-111111111111';
const OTHER_REC = '22222222-2222-2222-2222-222222222222';
const ENROL = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SECRET = 'test-secret-value';
const CONTEXT = 'presentation-recording-v1';

/**
 * Signed the way the implementation must sign, written out INDEPENDENTLY.
 *
 * Deliberately not routed through `createRecordingTicket`: a test that mints and
 * verifies through the same function agrees with itself no matter what that function
 * does, which is exactly how the dropped-context mutation survived the first run.
 */
const mintExternally = (claims: unknown, context = CONTEXT) => {
  const body = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(`${context}:${body}`).digest('hex');
  return `${body}.${sig}`;
};
const validClaims = () => ({ recordingId: REC, enrollmentId: ENROL, exp: Math.floor(Date.now() / 1000) + 600 });

describe('a ticket round-trips', () => {
  it('verifies and returns exactly what it was minted with', () => {
    const t = createRecordingTicket(REC, ENROL);
    const claims = verifyRecordingTicket(t);
    expect(claims).not.toBeNull();
    expect(claims!.recordingId).toBe(REC);
    expect(claims!.enrollmentId).toBe(ENROL);
  });

  it('carries the recording AND the viewer, so it cannot be reused for another take', () => {
    // The route compares `claims.recordingId` against the path. Without the binding,
    // one issued link would open every recording the learner could name.
    const t = createRecordingTicket(REC, ENROL);
    expect(verifyRecordingTicket(t)!.recordingId).not.toBe(OTHER_REC);
  });

  it('expires ten minutes out by default', () => {
    expect(DEFAULT_TICKET_TTL_SECONDS).toBe(600);
    const now = new Date('2026-10-14T12:00:00Z');
    const claims = verifyRecordingTicket(createRecordingTicket(REC, ENROL, undefined, now), now);
    expect(claims!.exp).toBe(Math.floor(now.getTime() / 1000) + 600);
  });
});

describe('the signature is pinned to this exact scheme', () => {
  it('a ticket signed with the literal context prefix is ACCEPTED', () => {
    // Computed outside the module. If the implementation stops using the prefix,
    // this fails — where a self-minted fixture would happily agree with the change.
    expect(verifyRecordingTicket(mintExternally(validClaims()))).not.toBeNull();
  });

  it('the same payload with NO prefix is rejected', () => {
    const body = Buffer.from(JSON.stringify(validClaims()), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifyRecordingTicket(`${body}.${sig}`)).toBeNull();
  });

  it('a signature over a DIFFERENT context is rejected', () => {
    // Guards against a token minted elsewhere with the same secret being replayed
    // here. The context prefix is what keeps those namespaces apart.
    expect(verifyRecordingTicket(mintExternally(validClaims(), 'some-other-context'))).toBeNull();
  });
});

describe('every way of forging one', () => {
  it('rejects a tampered recording id — the obvious attack', () => {
    const [, sig] = createRecordingTicket(REC, ENROL).split('.');
    const forgedBody = Buffer.from(
      JSON.stringify({ recordingId: OTHER_REC, enrollmentId: ENROL, exp: Math.floor(Date.now() / 1000) + 600 }),
      'utf8',
    ).toString('base64url');
    expect(verifyRecordingTicket(`${forgedBody}.${sig}`)).toBeNull();
  });

  it('rejects a tampered enrollment — one learner claiming another is the viewer', () => {
    const [, sig] = createRecordingTicket(REC, ENROL).split('.');
    const forgedBody = Buffer.from(
      JSON.stringify({ recordingId: REC, enrollmentId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', exp: Math.floor(Date.now() / 1000) + 600 }),
      'utf8',
    ).toString('base64url');
    expect(verifyRecordingTicket(`${forgedBody}.${sig}`)).toBeNull();
  });

  it('rejects a ticket signed with a DIFFERENT secret', () => {
    const body = Buffer.from(JSON.stringify(validClaims()), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', 'not-the-secret').update(`${CONTEXT}:${body}`).digest('hex');
    expect(verifyRecordingTicket(`${body}.${sig}`)).toBeNull();
  });

  it('rejects an UNSIGNED payload — no signature is not the same as a valid one', () => {
    const body = Buffer.from(JSON.stringify(validClaims()), 'utf8').toString('base64url');
    expect(verifyRecordingTicket(body)).toBeNull();
    expect(verifyRecordingTicket(`${body}.`)).toBeNull();
  });

  it('rejects malformed input instead of throwing', () => {
    for (const bad of [null, undefined, '', 'garbage', 'a.b.c', '.', '..', 'øøø.øøø']) {
      expect(verifyRecordingTicket(bad as unknown as string)).toBeNull();
    }
  });
});

/**
 * THE GAP THE FIRST MUTATION RUN EXPOSED.
 *
 * Removing the claim-shape check survived, because every malformed fixture was
 * already being rejected by the EXPIRY check first. Nothing exercised a correctly
 * signed, UNEXPIRED token with a missing or wrong-typed id — so the shape check was
 * untested and could have been deleted silently.
 */
describe('claim shape, on tokens that are otherwise completely valid', () => {
  const soon = () => Math.floor(Date.now() / 1000) + 600;

  it('rejects a valid, unexpired token with NO recordingId', () => {
    expect(verifyRecordingTicket(mintExternally({ enrollmentId: ENROL, exp: soon() }))).toBeNull();
  });

  it('rejects a valid, unexpired token with NO enrollmentId', () => {
    expect(verifyRecordingTicket(mintExternally({ recordingId: REC, exp: soon() }))).toBeNull();
  });

  it('rejects ids of the wrong type, which JSON will happily carry', () => {
    expect(verifyRecordingTicket(mintExternally({ recordingId: 42, enrollmentId: ENROL, exp: soon() }))).toBeNull();
    expect(verifyRecordingTicket(mintExternally({ recordingId: REC, enrollmentId: { a: 1 }, exp: soon() }))).toBeNull();
  });

  it('rejects a missing or non-numeric expiry', () => {
    expect(verifyRecordingTicket(mintExternally({ recordingId: REC, enrollmentId: ENROL }))).toBeNull();
    expect(verifyRecordingTicket(mintExternally({ recordingId: REC, enrollmentId: ENROL, exp: 'soon' }))).toBeNull();
  });

  it('rejects an empty object', () => {
    expect(verifyRecordingTicket(mintExternally({}))).toBeNull();
  });
});

describe('expiry', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const later = (s: number) => new Date(now.getTime() + s * 1000);

  it('is valid a second before it expires', () => {
    expect(verifyRecordingTicket(createRecordingTicket(REC, ENROL, 600, now), later(599))).not.toBeNull();
  });

  it('is DEAD at the expiry second, not merely after it', () => {
    expect(verifyRecordingTicket(createRecordingTicket(REC, ENROL, 600, now), later(600))).toBeNull();
  });

  it('stays dead long after', () => {
    expect(verifyRecordingTicket(createRecordingTicket(REC, ENROL, 600, now), later(86_400))).toBeNull();
  });

  it('an expiry pushed out by hand is rejected', () => {
    // The whole point of the signature: a leaked URL cannot be given a longer life.
    const [body, sig] = createRecordingTicket(REC, ENROL, 600, now).split('.');
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    claims.exp += 86_400;
    const extended = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    expect(verifyRecordingTicket(`${extended}.${sig}`, later(700))).toBeNull();
  });
});

/**
 * NOT A BEHAVIOURAL TEST, deliberately.
 *
 * Swapping `timingSafeEqual` for `!==` is functionally identical, so a mutation of it
 * changes nothing observable and no unit test can catch it — calling that a coverage
 * gap would be pretending. The property is real, so it is checked where it IS
 * visible: in the source.
 */
describe('constant-time comparison', () => {
  it('uses timingSafeEqual rather than string equality', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'recordingTicket.ts'), 'utf8');
    expect(src).toContain('crypto.timingSafeEqual');
    expect(src).not.toMatch(/expected\s*!==\s*signature/);
  });
});
