/**
 * D5 - "a guest cannot reach anything else", proved rather than asserted in a comment.
 *
 * ## Why this test exists at all, when the guard already holds
 *
 * A guest pass and a participant token are signed with THE SAME KEY. `mintGuestPass` calls
 * `jwt.sign(..., env.jwtSecret)` and `requireParticipant` calls `jwt.verify(..., env.jwtSecret)`,
 * so a guest pass is a cryptographically valid token as far as the portal's verifier is
 * concerned. The signature is not what stops it.
 *
 * What stops it is one line - `if (payload.role !== 'participant') return 403` - and a guest
 * pass carries `typ: 'guest'` with no `role` claim at all. That is a property spanning two files
 * that have no reason to know about each other, and nothing pinned it: `sessionGuest.test.ts`
 * tests the pass against the GUEST surface, and `participantAuth.test.ts` mocks `jwt.verify`
 * outright, so it has never seen a real token of any kind.
 *
 * The failure it guards against is small to write and total in effect. Adding `role:
 * 'participant'` to the guest payload - which someone might do to reuse a participant helper -
 * would hand every Open House walk-in the entire student portal, and every existing test would
 * still pass.
 *
 * ## This file does NOT mock jsonwebtoken, deliberately
 *
 * A fabricated payload object would only re-test the role check, which
 * `participantAuth.test.ts` already does. The whole point here is that the token is minted by
 * the real minting function and read by the real guard, under one secret, so the two cannot
 * drift apart without this failing.
 */
jest.mock('../../config/env', () => ({
  env: {
    // One secret for both sides, which is the condition that makes this test meaningful.
    jwtSecret: 'one-shared-secret-for-both-sides',
    databaseUrl: 'postgres://u:p@localhost:5432/test',
    nodeEnv: 'test',
  },
}));
jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn() }));

import jwt from 'jsonwebtoken';
import { mintGuestPass, verifyGuestPass } from '../sessionGuestService';
import { requireParticipant } from '../../middlewares/participantAuth';

const SESSION = '7aa7ce89-187d-4604-9b86-a3b2a69579ce';
const GUEST = 'guest-42';

function ctx(token: string, method = 'GET') {
  const req: any = { method, headers: { authorization: `Bearer ${token}` }, ip: '127.0.0.1' };
  const res: any = {
    statusCode: 0,
    body: null as any,
    status(c: number) { this.statusCode = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
  return { req, res, next: jest.fn() };
}

/** A real participant token, signed with the same secret, so the harness can be shown to pass. */
const participantToken = () => jwt.sign(
  { sub: 'enr-1', email: 'student@example.com', cohort_id: 'coh-1', role: 'participant' },
  'one-shared-secret-for-both-sides',
  { expiresIn: '1h' },
);

describe('a guest pass is a valid token that the portal still refuses', () => {
  it('IS a valid signature, so the signature is not what protects the portal', () => {
    // Stated first because it is the premise. If this ever stopped being true the test below
    // would pass for the wrong reason, and the real protection would be untested.
    const pass = mintGuestPass(SESSION, GUEST);
    const decoded = jwt.verify(pass, 'one-shared-secret-for-both-sides') as any;

    expect(decoded.typ).toBe('guest');
    expect(decoded.sid).toBe(SESSION);
  });

  it('carries NO participant role, which is the thing that stops it', () => {
    const decoded = jwt.decode(mintGuestPass(SESSION, GUEST)) as any;

    expect(decoded.role).toBeUndefined();
    expect(decoded.cohort_id).toBeUndefined();
    expect(decoded.sub).toBeUndefined();
  });

  it('is REFUSED by the participant guard with 403', () => {
    const { req, res, next } = ctx(mintGuestPass(SESSION, GUEST));

    requireParticipant(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect(req.participant).toBeUndefined();
  });

  it('is refused for a WRITE as well as a read', () => {
    // The dangerous direction. A guest reaching a GET leaks; a guest reaching a POST can
    // submit work, post to a room, or change progression as somebody else.
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const { req, res, next } = ctx(mintGuestPass(SESSION, GUEST), method);
      requireParticipant(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('CONTROL: a real participant token signed with the SAME secret is admitted', () => {
    // Without this, every refusal above could be a guard that rejects everything, and the test
    // would keep passing after the portal stopped working entirely.
    const { req, res, next } = ctx(participantToken());

    requireParticipant(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(0);
    expect(req.participant.role).toBe('participant');
  });
});

describe('and the reverse direction, which is the same mistake mirrored', () => {
  it('a participant token is NOT accepted as a guest pass', () => {
    // Passes because a participant token carries no `sid`. Stated plainly because the first
    // version of this test was offered as proof of the `typ` check and is nothing of the kind:
    // see the describe block below for what actually proves that.
    expect(verifyGuestPass(participantToken(), SESSION)).toBeNull();
  });

  it('a guest pass is bound to ONE session', () => {
    const pass = mintGuestPass(SESSION, GUEST);

    expect(verifyGuestPass(pass, SESSION)).toBe(GUEST);
    expect(verifyGuestPass(pass, 'a-different-session-id')).toBeNull();
  });

  it('a pass signed with another key is refused', () => {
    const forged = jwt.sign({ typ: 'guest', sid: SESSION, gid: GUEST }, 'not-the-secret');

    expect(verifyGuestPass(forged, SESSION)).toBeNull();
  });

  it('refuses a missing pass rather than throwing', () => {
    expect(verifyGuestPass(undefined, SESSION)).toBeNull();
  });
});

/**
 * THE `typ` CHECK, AND AN HONEST ACCOUNT OF WHAT IT IS WORTH.
 *
 * Deleting `p?.typ === 'guest'` from `verifyGuestPass` breaks nothing today, and a mutation
 * proved that: it survived. Not because the check is untested, but because no token this system
 * currently mints can defeat it. The only other session-scoped token is the kit token,
 * `{ typ: 'kit', sid }`, which has no `gid` and so fails the next clause anyway.
 *
 * So the check is defense in depth rather than the load-bearing guard, and the honest thing is
 * to say so instead of implying the mutation found a hole. What IS worth pinning is that the
 * check DISCRIMINATES on `typ` - because the day another session-scoped token grows a `gid`
 * field, that check is the only thing standing between it and a vote. The test below mints
 * exactly that shape, which is a plausible future token rather than a contrived one, and it is
 * what makes the mutation fail.
 */
describe('the typ claim is what separates a pass from any other session token', () => {
  it('refuses a token that has the right session and guest id but the wrong typ', () => {
    const wrongTyp = jwt.sign(
      { typ: 'kit', sid: SESSION, gid: GUEST },
      'one-shared-secret-for-both-sides',
      { expiresIn: '1h' },
    );

    expect(verifyGuestPass(wrongTyp, SESSION)).toBeNull();
  });

  it('refuses a token with no typ at all', () => {
    const noTyp = jwt.sign(
      { sid: SESSION, gid: GUEST },
      'one-shared-secret-for-both-sides',
      { expiresIn: '1h' },
    );

    expect(verifyGuestPass(noTyp, SESSION)).toBeNull();
  });

  it('CONTROL: the same shape WITH typ guest is accepted', () => {
    // So the two refusals above cannot be a function that rejects every hand-built token.
    const right = jwt.sign(
      { typ: 'guest', sid: SESSION, gid: GUEST },
      'one-shared-secret-for-both-sides',
      { expiresIn: '1h' },
    );

    expect(verifyGuestPass(right, SESSION)).toBe(GUEST);
  });
});
