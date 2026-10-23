jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret-value' } }));

import crypto from 'crypto';
import {
  createRecordingTicket,
  createStaffRecordingTicket,
  verifyRecordingTicket,
  isStaffTicket,
} from '../recordingTicket';

/**
 * THE STAFF CLAIM SKIPS THE OWNERSHIP CHECK, so it is the one claim in this
 * system worth attacking. A learner who could set it on their own ticket would
 * be able to fetch any recording in the cohort by id.
 *
 * Every test below is a way of trying to get `isStaffTicket` to return true for
 * a ticket that was not minted as one.
 */

const REC = '11111111-1111-1111-1111-111111111111';
const ENROL = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SECRET = 'test-secret-value';
const CONTEXT = 'presentation-recording-v1';

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const sign = (body: string) =>
  crypto.createHmac('sha256', SECRET).update(`${CONTEXT}:${body}`).digest('hex');

/** Mint a ticket with arbitrary claims, correctly signed. The attacker's best case. */
const forge = (claims: Record<string, unknown>) => {
  const body = b64url(JSON.stringify(claims));
  return `${body}.${sign(body)}`;
};

const future = () => Math.floor(Date.now() / 1000) + 600;

describe('a staff ticket', () => {
  it('verifies, and says it is staff', () => {
    const t = createStaffRecordingTicket(REC, 'ali@colaberry.com');
    const claims = verifyRecordingTicket(t);
    expect(claims).not.toBeNull();
    expect(claims!.recordingId).toBe(REC);
    expect(isStaffTicket(claims)).toBe(true);
  });

  it('records who it was issued to, because the row is an audit line', () => {
    const claims = verifyRecordingTicket(createStaffRecordingTicket(REC, 'ram@colaberry.com'));
    expect(claims!.staffIdentity).toBe('ram@colaberry.com');
  });

  it('carries no enrollment, so it cannot be mistaken for a learner of that id', () => {
    const claims = verifyRecordingTicket(createStaffRecordingTicket(REC, 'ali@colaberry.com'));
    expect(claims!.enrollmentId).toBe('');
  });

  it('is still bound to ONE recording', () => {
    const claims = verifyRecordingTicket(createStaffRecordingTicket(REC, 'ali@colaberry.com'));
    expect(claims!.recordingId).toBe(REC);
  });

  it('still expires', () => {
    const minted = new Date('2026-10-23T12:00:00Z');
    const t = createStaffRecordingTicket(REC, 'ali@colaberry.com', 60, minted);
    expect(verifyRecordingTicket(t, new Date('2026-10-23T12:00:30Z'))).not.toBeNull();
    expect(verifyRecordingTicket(t, new Date('2026-10-23T12:01:01Z'))).toBeNull();
  });

  it('gets longer than the learner default when the caller asks', () => {
    const minted = new Date('2026-10-23T12:00:00Z');
    const t = createStaffRecordingTicket(REC, 'ali@colaberry.com', 1800, minted);
    // 20 minutes in — past a learner's 10-minute ticket, inside a reviewer's.
    expect(verifyRecordingTicket(t, new Date('2026-10-23T12:20:00Z'))).not.toBeNull();
  });
});

describe('a learner ticket is not a staff ticket', () => {
  it('verifies but is not staff', () => {
    const claims = verifyRecordingTicket(createRecordingTicket(REC, ENROL));
    expect(claims).not.toBeNull();
    expect(isStaffTicket(claims)).toBe(false);
  });

  it('has no way to ask for the staff claim — the function takes no such argument', () => {
    // createRecordingTicket's signature is (recordingId, enrollmentId, ttl, now).
    // Nothing a caller passes can land in `staff`, which is the actual control.
    const claims = verifyRecordingTicket(createRecordingTicket(REC, ENROL, 600));
    expect(claims!.staff).toBeUndefined();
  });
});

describe('forging the staff claim', () => {
  it('fails when the body is edited and the signature left alone', () => {
    const real = createRecordingTicket(REC, ENROL);
    const [, signature] = real.split('.');
    const tampered = b64url(JSON.stringify({
      recordingId: REC, enrollmentId: ENROL, staff: true, staffIdentity: 'x', exp: future(),
    }));
    expect(verifyRecordingTicket(`${tampered}.${signature}`)).toBeNull();
  });

  it('fails without the server secret, even with a perfectly shaped body', () => {
    const body = b64url(JSON.stringify({
      recordingId: REC, enrollmentId: '', staff: true, staffIdentity: 'mallory', exp: future(),
    }));
    const wrong = crypto.createHmac('sha256', 'not-the-secret').update(`${CONTEXT}:${body}`).digest('hex');
    expect(verifyRecordingTicket(`${body}.${wrong}`)).toBeNull();
  });

  it('REJECTS a truthy-but-not-true staff claim, even correctly signed', () => {
    // This is the one an attacker cannot reach but a future call site could
    // write by accident. It must fail closed rather than coerce.
    const t = forge({ recordingId: REC, enrollmentId: '', staff: 1, staffIdentity: 'x', exp: future() });
    expect(verifyRecordingTicket(t)).toBeNull();
  });

  it('REJECTS a staff claim with no identity attached', () => {
    const t = forge({ recordingId: REC, enrollmentId: '', staff: true, exp: future() });
    expect(verifyRecordingTicket(t)).toBeNull();
  });

  it('rejects `staff: false` rather than treating it as a learner ticket', () => {
    // Fail closed on anything that is not exactly absent or exactly true, so the
    // shape of a valid ticket stays small enough to reason about.
    const t = forge({ recordingId: REC, enrollmentId: ENROL, staff: false, exp: future() });
    expect(verifyRecordingTicket(t)).toBeNull();
  });

  it('a correctly signed staff ticket for ANOTHER recording does not open this one', () => {
    const other = '22222222-2222-2222-2222-222222222222';
    const claims = verifyRecordingTicket(createStaffRecordingTicket(other, 'ali@colaberry.com'));
    // The route compares claims.recordingId to the path param; this is that check.
    expect(claims!.recordingId).not.toBe(REC);
  });
});

describe('isStaffTicket', () => {
  it('is false for null, so a failed verify cannot read as staff', () => {
    expect(isStaffTicket(null)).toBe(false);
  });

  it('is false for a verified learner ticket', () => {
    expect(isStaffTicket(verifyRecordingTicket(createRecordingTicket(REC, ENROL)))).toBe(false);
  });
});
