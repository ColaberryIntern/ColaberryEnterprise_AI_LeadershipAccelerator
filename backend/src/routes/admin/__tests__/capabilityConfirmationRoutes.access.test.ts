import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import fs from 'fs';
import path from 'path';

/**
 * AF11.0 — the confirmation route that AF11.0 shipped without.
 *
 * Measured on `origin/main` 2026-11-17: `recordCapabilityConfirmation` appeared in no route and
 * no controller. The table could never gain a row, so `agentToolGrantService` read an empty set
 * of confirmed ids and refused every grant with `capability_not_confirmed`.
 *
 * Four properties here are worth more than the payload shape:
 *
 *   1. THE IDENTITY COMES FROM THE TOKEN. A body that tries to name the confirmer is refused,
 *      not ignored. This is the one that would be silently wrong.
 *   2. A REFUSAL CARRIES EVERY REASON, as a 409 — including `confirmer_not_super_admin`, which
 *      is deliberately not a 403.
 *   3. THE GATE ROW EXISTS. Asserted through `pathToSection`, because without it the route
 *      403s in production while every test here passes.
 *   4. THIS ROUTE GRANTS NOTHING. A confirmation makes a capability eligible; it does not
 *      touch an agent, a tool or a capability file.
 */

const mockRecord = jest.fn();
const mockLoad = jest.fn();

class FakeRefusedError extends Error {
  readonly issues: { rule: string; detail: string }[];
  constructor(issues: { rule: string; detail: string }[]) {
    super(issues.map((i) => i.detail).join(' '));
    this.name = 'CapabilityConfirmationRefusedError';
    this.issues = issues;
  }
}

jest.mock('../../../services/agentDomain/capabilityConfirmationService', () => ({
  CapabilityConfirmationRefusedError: FakeRefusedError,
  recordCapabilityConfirmation: (...a: unknown[]) => mockRecord(...a),
  loadConfirmation: (...a: unknown[]) => mockLoad(...a),
}));

import routes from '../capabilityConfirmationRoutes';
import { env } from '../../../config/env';
import { pathToSection } from '../../../middlewares/mgmtSectionGate';

const POST_PATH = '/api/admin/agent-domain-capability-confirmations';
const CAPABILITY = 'admissions.maya_applicant_chat_response';

const token = (email: string, role: string) =>
  `Bearer ${jwt.sign({ sub: 'u1', email, role }, env.jwtSecret, { expiresIn: '5m' })}`;
const SUPER = token('ali@colaberry.com', 'super_admin');
const PLAIN_ADMIN = token('ops@colaberry.com', 'admin');

const EVIDENCE = {
  kind: 'manual_review',
  source: 'https://3.basecamp.com/3945211/buckets/7463955/todos/1',
  observed_at: '2026-11-17T22:00:00Z',
  evaluated_by: 'ali@colaberry.com',
  summary: 'Read twelve transcripts end to end.',
};

const CONFIRMED = {
  capability_id: CAPABILITY,
  confirmed_by_identity: 'ali@colaberry.com',
  evidence: EVIDENCE,
};

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(routes);
  return a;
}

beforeEach(() => {
  mockRecord.mockReset().mockResolvedValue(CONFIRMED);
  mockLoad.mockReset().mockResolvedValue(CONFIRMED);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the section gate knows this prefix', () => {
  it('maps the route to program, so it does not 403 unexplained in production', () => {
    // The gate is DENY-BY-DEFAULT. An unmapped prefix reaches a 403 with nothing in the logs
    // saying why, and every test in this file would still pass. This is the only assertion here
    // that catches that.
    expect(pathToSection(POST_PATH)).toBe('program');
    expect(pathToSection(`${POST_PATH}/${CAPABILITY}`)).toBe('program');
  });

  it('CONTROL: an unmapped sibling really does resolve to nothing', () => {
    // Proves the assertion above is reading the map rather than returning 'program' for anything.
    expect(pathToSection('/api/admin/zz-no-such-prefix')).toBeNull();
  });
});

describe(`POST ${POST_PATH}`, () => {
  it('401 without a token, and nothing is recorded', async () => {
    const res = await request(app()).post(POST_PATH).send({ capability_id: CAPABILITY, evidence: EVIDENCE });
    expect(res.status).toBe(401);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('201 and the confirmation, for a Super Admin with complete evidence', async () => {
    const res = await request(app()).post(POST_PATH).set('Authorization', SUPER)
      .send({ capability_id: CAPABILITY, evidence: EVIDENCE });
    expect(res.status).toBe(201);
    expect(res.body.confirmation).toMatchObject({ capability_id: CAPABILITY });
  });

  it('takes the identity and the role from the TOKEN, never the body', async () => {
    await request(app()).post(POST_PATH).set('Authorization', SUPER)
      .send({ capability_id: CAPABILITY, evidence: EVIDENCE });
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ali@colaberry.com',
      actorRole: 'super_admin',
      capabilityId: CAPABILITY,
    }));
  });

  it('REFUSES a body that tries to name the confirmer, rather than dropping the key', async () => {
    // The failure this prevents: a permissive object silently drops `confirmed_by` and answers
    // 201, and the caller reasonably believes they confirmed a capability as somebody else.
    for (const extra of [{ confirmed_by: 'someone@else.com' }, { actor_role: 'super_admin' }, { email: 'x@y.z' }]) {
      const res = await request(app()).post(POST_PATH).set('Authorization', SUPER)
        .send({ capability_id: CAPABILITY, evidence: EVIDENCE, ...extra });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid_confirmation_body');
    }
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('400 on a body with no capability id and on one with no evidence key', async () => {
    for (const body of [{ evidence: EVIDENCE }, { capability_id: CAPABILITY }, { capability_id: '', evidence: EVIDENCE }]) {
      const res = await request(app()).post(POST_PATH).set('Authorization', SUPER).send(body);
      expect(res.status).toBe(400);
    }
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('passes PARTIAL evidence through, so the contract can name what is missing', async () => {
    // Deliberately not validated here. If this schema required the four fields, the contract's
    // `evidence_incomplete` - which names all of them in one sentence - would be unreachable.
    const res = await request(app()).post(POST_PATH).set('Authorization', SUPER)
      .send({ capability_id: CAPABILITY, evidence: {} });
    expect(res.status).toBe(201);
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ evidence: {} }));
  });

  it('409 with EVERY reason when the contract refuses', async () => {
    mockRecord.mockRejectedValue(new FakeRefusedError([
      { rule: 'evidence_incomplete', detail: 'Evidence needs all of: kind, source, observed_at and evaluated_by.' },
      { rule: 'confirmer_not_recorded', detail: 'Not on the recorded-humans roster.' },
    ]));
    const res = await request(app()).post(POST_PATH).set('Authorization', SUPER)
      .send({ capability_id: CAPABILITY, evidence: {} });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('confirmation_refused');
    // Both, not the first. Returning one would make fixing a body a guessing game played one
    // round-trip at a time.
    expect(res.body.issues.map((i: { rule: string }) => i.rule))
      .toEqual(['evidence_incomplete', 'confirmer_not_recorded']);
  });

  it('a plain admin reaches the service and is refused as 409, NOT 403', async () => {
    // requireAdmin admits them; the service refuses by name. A 403 would send them looking for a
    // login problem instead of reading the rule about who may confirm.
    mockRecord.mockRejectedValue(new FakeRefusedError([
      { rule: 'confirmer_not_super_admin', detail: 'Only a Super Admin may confirm a capability.' },
    ]));
    const res = await request(app()).post(POST_PATH).set('Authorization', PLAIN_ADMIN)
      .send({ capability_id: CAPABILITY, evidence: EVIDENCE });
    expect(res.status).toBe(409);
    expect(res.body.issues[0].rule).toBe('confirmer_not_super_admin');
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ actorRole: 'admin' }));
  });

  it('500 with a code when the write throws', async () => {
    mockRecord.mockRejectedValue(new Error('boom'));
    const res = await request(app()).post(POST_PATH).set('Authorization', SUPER)
      .send({ capability_id: CAPABILITY, evidence: EVIDENCE });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('confirmation_failed');
  });
});

describe(`GET ${POST_PATH}/:capabilityId`, () => {
  it('401 without a token', async () => {
    expect((await request(app()).get(`${POST_PATH}/${CAPABILITY}`)).status).toBe(401);
  });

  it('200 with the confirmation when one exists', async () => {
    const res = await request(app()).get(`${POST_PATH}/${CAPABILITY}`).set('Authorization', PLAIN_ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.confirmation).toMatchObject({ capability_id: CAPABILITY });
  });

  it('404 rather than a 200 carrying null when none exists', async () => {
    // A 200 with a null invites a caller to treat "not confirmed" as a success.
    mockLoad.mockResolvedValue(null);
    const res = await request(app()).get(`${POST_PATH}/${CAPABILITY}`).set('Authorization', PLAIN_ADMIN);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('confirmation_not_found');
  });

  it('500 when the read throws', async () => {
    mockLoad.mockRejectedValue(new Error('boom'));
    const res = await request(app()).get(`${POST_PATH}/${CAPABILITY}`).set('Authorization', PLAIN_ADMIN);
    expect(res.status).toBe(500);
  });
});

describe('blast radius: a confirmation grants nothing', () => {
  const controller = fs.readFileSync(
    path.join(__dirname, '../../../controllers/capabilityConfirmationController.ts'),
    'utf8',
  );
  /** Comments quote the names of the things this route must not do, so strip them first. */
  const code = controller.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('CONTROL: the stripper leaves the real code behind', () => {
    expect(code).toContain('recordCapabilityConfirmation');
    expect(code).not.toContain('AF11.0');
  });

  it.each([
    'grantToolToAgent',
    'AiAgent',
    'tools_granted',
    'autonomy_level',
    'enabled',
    'promote',
    'sendEmail',
  ])('never reaches for %s', (forbidden) => {
    expect(code).not.toContain(forbidden);
  });

  it('never reads an identity out of the request body', () => {
    // This assertion exists because a mutant SURVIVED the behavioural tests: replacing
    // `actor.email` with `req.body?.confirmed_by ?? actor.email` changed nothing any request
    // could observe. With `.strict()` in place a body carrying that key is already a 400, so
    // the two readings are indistinguishable over HTTP.
    //
    // The property is still worth holding on its own. `.strict()` could be relaxed one day for
    // an unrelated reason, and on that day the body read would quietly become reachable and
    // every test above would still pass. Identity-from-the-token is asserted at the source so
    // it does not depend on a second rule continuing to exist.
    expect(code).not.toMatch(/req\.body[^\n]*\b(confirmed_by|actor_role|email)\b/);
    expect(code).toContain('admin?.email');
  });

  it('CONTROL: that matcher really does catch a body-read of an identity', () => {
    // Without this, a regex that matches nothing would read as a pass forever.
    const planted = 'const e = (req.body?.confirmed_by as string) ?? actor.email;';
    expect(planted).toMatch(/req\.body[^\n]*\b(confirmed_by|actor_role|email)\b/);
  });

  it('calls exactly the two service functions it declares', () => {
    const called = ['recordCapabilityConfirmation', 'loadConfirmation'].filter((f) => code.includes(`${f}(`));
    expect(called.sort()).toEqual(['loadConfirmation', 'recordCapabilityConfirmation']);
  });
});
