/**
 * The candidate router: auth per ROUTE, Zod on every body, and scoping that cannot be bypassed.
 *
 * ## Why auth is asserted per route and not left to the lint
 *
 * `scripts/lint-route-auth.js` is PER FILE: it asks only whether a source file contains
 * `requireSection` anywhere. A file with three guarded routes and one unguarded route passes it.
 * This router has four, so the lint is already insufficient here. These tests enumerate the live
 * Express stack, so a route added without a guard is a failing test rather than an open door.
 *
 * ## Why the service is mocked and the database is not reached
 *
 * These tests are about who may call the route and what the route does with what it is given. A
 * Postgres connection in an auth test only creates ways for it to go green or red for the wrong
 * reason. The service's own behaviour is covered in
 * `services/agentDomain/__tests__/candidateService.test.ts`.
 */

import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockSetState = jest.fn();
const mockProven = jest.fn();
jest.mock('../../../services/agentDomain/candidateService', () => ({
  listCandidates: (...a: unknown[]) => mockList(...a),
  createCandidate: (...a: unknown[]) => mockCreate(...a),
  setProductState: (...a: unknown[]) => mockSetState(...a),
  markProvenByHand: (...a: unknown[]) => mockProven(...a),
}));

const mockResolveIds = jest.fn();
const mockLoadMine = jest.fn();
jest.mock('../../../services/agentDomain/agentDomainProvisionedReader', () => ({
  resolveOwnerIdentityIds: (...a: unknown[]) => mockResolveIds(...a),
  loadMyDomains: (...a: unknown[]) => mockLoadMine(...a),
}));
jest.mock('../../../config/database', () => ({ sequelize: { fake: true } }));

import candidateRoutes from '../agentDomainCandidateRoutes';
import { env } from '../../../config/env';

const ROUTER_SRC = path.join(__dirname, '..', 'agentDomainCandidateRoutes.ts');
const LIST = '/api/admin/agent-domain-candidates-mine';
const ID = '11111111-2222-4333-8444-555555555555';

function tokenFor(mgmtRole: string | null, role = 'staff'): string {
  const payload: Record<string, unknown> = {
    id: 'test-admin',
    email: 'builder@example.test',
    role,
  };
  if (mgmtRole) payload.mgmt_role = mgmtRole;
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '5m' });
}

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(candidateRoutes);
  return a;
}

function registeredRoutes(): Array<{ path: string; methods: string[]; handlerCount: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express does not type its stack
  const stack = (candidateRoutes as any).stack as Array<any>;
  return stack
    .filter((l) => l.route)
    .map((l) => ({
      path: l.route.path as string,
      methods: Object.keys(l.route.methods),
      handlerCount: l.route.stack.length as number,
    }));
}

const auth = (r: request.Test): request.Test =>
  r.set('Authorization', `Bearer ${tokenFor('platform')}`);

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveIds.mockResolvedValue(['identity-1']);
  mockLoadMine.mockResolvedValue([{ domain_key: 'admissions' }]);
  mockList.mockResolvedValue({ candidates: [], scoped_to_domains: ['admissions'], reason: 'none' });
  mockCreate.mockResolvedValue({ candidate: { id: ID }, created: true });
  mockSetState.mockResolvedValue({ id: ID, product_state: 'in_app' });
  mockProven.mockResolvedValue({ id: ID });
});

describe('every route carries its own guard', () => {
  it('POSITIVE CONTROL: the router registers four routes', () => {
    const routes = registeredRoutes();
    expect(routes).toHaveLength(4);
    expect(routes.map((r) => r.methods[0]).sort()).toEqual(['get', 'patch', 'patch', 'post']);
  });

  it('every route has at least one middleware BEFORE its handler', () => {
    const unguarded = registeredRoutes().filter((r) => r.handlerCount < 2).map((r) => r.path);
    expect(unguarded).toEqual([]);
  });

  /**
   * MUTATION PROOF. Change any `requireSection('dashboard')` to `'program'` and this dies naming
   * what it found; delete one and the length comparison dies. That is the thing the per-file lint
   * cannot see.
   */
  it('every guard is `dashboard`, one per route, never `program`', () => {
    const src = fs.readFileSync(ROUTER_SRC, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const sections = [...src.matchAll(/requireSection\(\s*'([a-z_]+)'\s*\)/g)].map((m) => m[1]);
    expect(sections).toHaveLength(registeredRoutes().length);
    expect(new Set(sections)).toEqual(new Set(['dashboard']));
  });

  it('every write route validates with Zod, one schema per write', () => {
    const src = fs.readFileSync(ROUTER_SRC, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const writes = registeredRoutes().filter((r) => !r.methods.includes('get'));
    expect(writes).toHaveLength(3);
    expect([...src.matchAll(/\bsafeParse\(/g)]).toHaveLength(writes.length);
    expect(src).toMatch(/z\.object\(/);
  });
});

describe('the door', () => {
  it('refuses an unauthenticated caller and never reaches the service', async () => {
    const res = await request(app()).get(LIST);
    expect([401, 403]).toContain(res.status);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('refuses a token with no management role', async () => {
    const res = await request(app()).get(LIST).set('Authorization', `Bearer ${tokenFor(null)}`);
    expect([401, 403]).toContain(res.status);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('lets a scoped builder through', async () => {
    const res = await auth(request(app()).get(LIST));
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalled();
  });
});

describe('scoping: a caller owning no domain gets an empty list, never another domain\'s rows', () => {
  it('passes the caller\'s OWN domain keys to the service, not an unfiltered read', async () => {
    mockLoadMine.mockResolvedValue([{ domain_key: 'admissions' }, { domain_key: 'curriculum' }]);
    await auth(request(app()).get(LIST));
    expect(mockList).toHaveBeenCalledWith(['admissions', 'curriculum']);
  });

  it('an owner of nothing sends an EMPTY key list down, which the service turns into nothing', async () => {
    // The route does not special-case this. It passes `[]`, and `listCandidates` refuses to read
    // the table at all for an empty scope. Both halves are needed: a route that skipped the call
    // would be correct today and wrong the moment somebody adds a second caller.
    mockLoadMine.mockResolvedValue([]);
    mockList.mockResolvedValue({ candidates: [], scoped_to_domains: [], reason: 'you own none' });
    const res = await auth(request(app()).get(LIST));
    expect(mockList).toHaveBeenCalledWith([]);
    expect(res.body.candidates).toEqual([]);
    expect(String(res.body.reason).length).toBeGreaterThan(10);
  });

  it('refuses a create in a domain the caller does not own, and never calls the service', async () => {
    mockLoadMine.mockResolvedValue([{ domain_key: 'admissions' }]);
    const res = await auth(request(app()).post(LIST)).send({
      domain_key: 'curriculum',
      title: 'Something in a domain that is not mine',
      source: 'owner',
    });
    expect(res.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(res.body.your_domains).toEqual(['admissions']);
    expect(String(res.body.reason).length).toBeGreaterThan(20);
  });

  it('scopes the two PATCH writes by passing the owned keys into the service', async () => {
    await auth(request(app()).patch(`${LIST}/${ID}/product-state`))
      .send({ product_state: 'in_app', matched_feature_key: 'x.y' });
    expect(mockSetState).toHaveBeenCalledWith(ID, ['admissions'], 'in_app', 'x.y');

    await auth(request(app()).patch(`${LIST}/${ID}/proven-by-hand`)).send({});
    expect(mockProven.mock.calls[0][1]).toEqual(['admissions']);
  });

  it('404s a write the service says is not the caller\'s, with a stated reason', async () => {
    mockSetState.mockResolvedValue(null);
    const res = await auth(request(app()).patch(`${LIST}/${ID}/product-state`))
      .send({ product_state: 'in_app' });
    expect(res.status).toBe(404);
    expect(String(res.body.reason).length).toBeGreaterThan(20);
  });
});

describe('the bodies are validated', () => {
  it('rejects an unknown source rather than storing it', async () => {
    const res = await auth(request(app()).post(LIST))
      .send({ domain_key: 'admissions', title: 'A real title here', source: 'whoever' });
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects an unknown product state', async () => {
    // `used_by_hand` is a legal TOOL_PRODUCT_STATES value and an illegal one here. The two
    // vocabularies answer different questions and the route refuses the confusion.
    const res = await auth(request(app()).patch(`${LIST}/${ID}/product-state`))
      .send({ product_state: 'used_by_hand' });
    expect(res.status).toBe(400);
    expect(mockSetState).not.toHaveBeenCalled();
  });

  it('rejects a title too short to mean anything', async () => {
    const res = await auth(request(app()).post(LIST))
      .send({ domain_key: 'admissions', title: 'x', source: 'owner' });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed timestamp instead of storing an Invalid Date', async () => {
    const res = await auth(request(app()).patch(`${LIST}/${ID}/proven-by-hand`))
      .send({ proven_at: 'yesterday afternoon' });
    expect(res.status).toBe(400);
    expect(mockProven).not.toHaveBeenCalled();
  });

  it('accepts an omitted timestamp and defaults to now', async () => {
    const res = await auth(request(app()).patch(`${LIST}/${ID}/proven-by-hand`)).send({});
    expect(res.status).toBe(200);
    const at = mockProven.mock.calls[0][2] as Date;
    expect(at instanceof Date).toBe(true);
    expect(Number.isNaN(at.getTime())).toBe(false);
  });

  it('says "already on the list" rather than claiming a new one', async () => {
    mockCreate.mockResolvedValue({ candidate: { id: ID }, created: false });
    const res = await auth(request(app()).post(LIST))
      .send({ domain_key: 'admissions', title: 'An existing candidate title', source: 'research' });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
  });
});

describe('a rejected promise becomes a 500, not nothing at all', () => {
  it('returns a body and an error class when the service throws', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockList.mockRejectedValue(new TypeError('boom'));
    const res = await auth(request(app()).get(LIST));
    expect(res.status).toBe(500);
    expect(res.body.error_class).toBe('TypeError');
    err.mockRestore();
  });
});
