/**
 * The agent-nudge router: auth per ROUTE, the section split, and send-requires-asking.
 *
 * ## Why auth is asserted per route and not left to the lint
 *
 * `scripts/lint-route-auth.js` is a required CI check and it is PER FILE: it asks only whether a
 * source file contains `requireSection` anywhere. An unguarded route in an otherwise-guarded file
 * passes it. So the lint cannot settle this, and these tests enumerate the router's real Express
 * stack and then cross-check the source guard-for-guard.
 *
 * ## The section assertion is the point of this file
 *
 * `agentDomainRoutes` withholds builder NAMES from `program` on purpose, and says why: intern
 * names are applicant data. Every response from this router carries a builder's first name AND
 * their email address. If one of these routes were ever guarded with `program`, the roster that
 * split exists to withhold would be readable by every programme viewer, and no type error and no
 * lint would notice. That is what the third test here exists to catch.
 */

import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * The SERVICE is mocked, not the database.
 *
 * These tests are about who may call these routes and what the routes do with a request body.
 * Mocking the send layer keeps a mail transport and a Postgres connection out of an auth test, and
 * means a mistake in the composer cannot make an auth test go green or red for the wrong reason.
 * `agentNudgeSend`'s own behaviour is covered in `services/internship/__tests__/agentNudgeSend.test.ts`.
 */
const mockPreview = jest.fn();
const mockSendOne = jest.fn();
const mockSendAll = jest.fn();
jest.mock('../../../services/internship/agentNudgeSend', () => ({
  previewAgentNudges: (...a: unknown[]) => mockPreview(...a),
  sendOneNudge: (...a: unknown[]) => mockSendOne(...a),
  sendAllNudges: (...a: unknown[]) => mockSendAll(...a),
}));

import agentNudgeRoutes from '../agentNudgeRoutes';
import { env } from '../../../config/env';

const ROUTER_SRC = path.join(__dirname, '..', 'agentNudgeRoutes.ts');

/** Token for a scoped staff identity holding exactly the given role's sections. */
function tokenFor(mgmtRole: string | null, role = 'staff'): string {
  const payload: Record<string, unknown> = { id: 'test-admin', email: 'test@example.test', role };
  if (mgmtRole) payload.mgmt_role = mgmtRole;
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '5m' });
}

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(agentNudgeRoutes);
  return a;
}

/** Every route this router registers, read from the live Express stack. */
function registeredRoutes(): Array<{ path: string; methods: string[]; handlerCount: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express does not type its stack
  const stack = (agentNudgeRoutes as any).stack as Array<any>;
  return stack
    .filter((l) => l.route)
    .map((l) => ({
      path: l.route.path as string,
      methods: Object.keys(l.route.methods),
      // Includes every middleware AND the handler, so a guarded route is >= 2.
      handlerCount: l.route.stack.length as number,
    }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPreview.mockResolvedValue([]);
  mockSendOne.mockResolvedValue({ domain: 'd', email: 'e@x.test', outcome: 'dry_run' });
  mockSendAll.mockResolvedValue({ attempted: 0, sent: 0, outcomes: [] });
});

// ─────────────────────────── auth, per route ───────────────────────────

describe('every route carries its own guard', () => {
  it('POSITIVE CONTROL: the router registers all three routes, so the enumeration is not empty', () => {
    const routes = registeredRoutes();
    expect(routes).toHaveLength(3);
    expect(routes.filter((r) => r.methods.includes('post'))).toHaveLength(2);
    expect(routes.filter((r) => r.methods.includes('get'))).toHaveLength(1);
  });

  it('every route has at least one middleware BEFORE its handler', () => {
    const unguarded = registeredRoutes().filter((r) => r.handlerCount < 2).map((r) => r.path);
    expect(unguarded).toEqual([]);
  });

  /**
   * MUTATION PROOF. Change any `requireSection('internship')` in the router to `'program'` and
   * this test dies naming the section it found:
   *
   *   ● every route carries its own guard › every guard is `internship`, never `program`
   *     Expected: ["internship","internship","internship"] / Received: [...,"program",...]
   *
   * Verified by applying that edit and re-running; reverted afterwards.
   */
  it('every guard is `internship`, never `program`', () => {
    const src = fs.readFileSync(ROUTER_SRC, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const sections = [...src.matchAll(/requireSection\(\s*'([a-z_]+)'\s*\)/g)].map((m) => m[1]);
    // Guard-for-guard against the registered routes: a route added without one makes these
    // disagree, which a per-file lint cannot see.
    expect(sections).toHaveLength(registeredRoutes().length);
    expect(sections).toEqual(['internship', 'internship', 'internship']);
  });
});

describe('the section split is enforced at the door', () => {
  it('refuses an unauthenticated caller', async () => {
    const res = await request(app()).get('/api/admin/agent-nudges');
    expect([401, 403]).toContain(res.status);
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('refuses `curriculum`, which holds `program` but not `internship`', async () => {
    // The whole reason these routes are not on the All Domains page. A programme viewer must not
    // learn the roster, so they must not reach a payload carrying names and addresses.
    const res = await request(app())
      .get('/api/admin/agent-nudges')
      .set('Authorization', `Bearer ${tokenFor('curriculum')}`);
    expect(res.status).toBe(403);
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('admits `internship_review`, which holds `internship` and not `program`', async () => {
    const res = await request(app())
      .get('/api/admin/agent-nudges')
      .set('Authorization', `Bearer ${tokenFor('internship_review')}`);
    expect(res.status).toBe(200);
    expect(mockPreview).toHaveBeenCalledTimes(1);
  });

  it('refuses a `program` caller on BOTH send routes, not just the read', async () => {
    const t = `Bearer ${tokenFor('curriculum')}`;
    const bulk = await request(app()).post('/api/admin/agent-nudges').set('Authorization', t).send({});
    const one = await request(app()).post('/api/admin/agent-nudges/hr').set('Authorization', t).send({});
    expect([bulk.status, one.status]).toEqual([403, 403]);
    expect(mockSendAll).not.toHaveBeenCalled();
    expect(mockSendOne).not.toHaveBeenCalled();
  });
});

// ─────────────────────────── sending requires asking ───────────────────────────

describe('a POST previews unless it is told to send', () => {
  const auth = () => `Bearer ${tokenFor('internship_review')}`;

  it('bulk: an empty body is a DRY RUN', async () => {
    await request(app()).post('/api/admin/agent-nudges').set('Authorization', auth()).send({});
    expect(mockSendAll).toHaveBeenCalledWith({ dryRun: true });
  });

  it('bulk: NO body at all is still a dry run, not a crash', async () => {
    // `req.body` is undefined when nothing is posted and no parser has run. A schema fed undefined
    // would throw inside the handler and 500, which reads to the console like a server fault
    // rather than "you sent nothing".
    const res = await request(app()).post('/api/admin/agent-nudges').set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(mockSendAll).toHaveBeenCalledWith({ dryRun: true });
  });

  it('bulk: `send: true` is the only thing that sends', async () => {
    await request(app()).post('/api/admin/agent-nudges').set('Authorization', auth()).send({ send: true });
    expect(mockSendAll).toHaveBeenCalledWith({ dryRun: false });
  });

  it('single: previews by default and sends only when asked', async () => {
    await request(app()).post('/api/admin/agent-nudges/hr').set('Authorization', auth()).send({});
    expect(mockSendOne).toHaveBeenCalledWith('hr', { dryRun: true });
    await request(app()).post('/api/admin/agent-nudges/hr').set('Authorization', auth()).send({ send: true });
    expect(mockSendOne).toHaveBeenCalledWith('hr', { dryRun: false });
  });

  /**
   * The reason the schema is `.strict()`. `{ sends: true }` is a plausible typo, and under a
   * permissive schema it would be silently dropped and previewed - the caller believing it sent,
   * and nothing in the response contradicting them.
   */
  it('rejects an unknown field rather than silently previewing', async () => {
    const res = await request(app())
      .post('/api/admin/agent-nudges')
      .set('Authorization', auth())
      .send({ sends: true });
    expect(res.status).toBe(400);
    expect(mockSendAll).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean `send`', async () => {
    const res = await request(app())
      .post('/api/admin/agent-nudges')
      .set('Authorization', auth())
      .send({ send: 'yes' });
    expect(res.status).toBe(400);
    expect(mockSendAll).not.toHaveBeenCalled();
  });
});

describe('failures', () => {
  const auth = () => `Bearer ${tokenFor('internship_review')}`;

  it('an unknown domain is a 404, not a 500', async () => {
    mockSendOne.mockRejectedValue(new Error('refusing to nudge domain nope: not an agent domain with a builder'));
    const res = await request(app()).post('/api/admin/agent-nudges/nope').set('Authorization', auth()).send({});
    expect(res.status).toBe(404);
  });

  it('a real fault is a 500 that does not leak the message', async () => {
    mockSendOne.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const res = await request(app()).post('/api/admin/agent-nudges/hr').set('Authorization', auth()).send({});
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });

  it('a read failure does not return a half-built roster', async () => {
    mockPreview.mockRejectedValue(new Error('boom'));
    const res = await request(app()).get('/api/admin/agent-nudges').set('Authorization', auth());
    expect(res.status).toBe(500);
    expect(res.body.builders).toBeUndefined();
  });
});
