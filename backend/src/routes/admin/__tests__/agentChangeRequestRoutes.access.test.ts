/**
 * AF4.2 router: auth per ROUTE, and the asymmetry between filing and deciding.
 *
 * ## The asymmetry IS the security property, so it is pinned rather than described
 *
 * Filing sits on `requireSection('dashboard')`; deciding sits on `requireAdmin`. That difference
 * is not stylistic. `dashboard` is the one section every mgmt role carries, so if the decide route
 * sat on it, every mentor, support rep and community organizer could approve a platform change —
 * and nothing about that mistake would produce a type error, a lint failure or a 500. It would
 * simply work, for the wrong people.
 *
 * `scripts/lint-route-auth.js` cannot catch it either: that check is PER FILE and asks only
 * whether a guard appears somewhere in the source. This file has four routes, so a file-level
 * answer is worth very little here. These tests enumerate the live Express stack and assert the
 * guard assignment route by route.
 */

const mockFile = jest.fn();
const mockDecide = jest.fn();
const mockListMine = jest.fn();
const mockListAll = jest.fn();

jest.mock('../../../services/agentDomain/agentChangeRequestService', () => ({
  fileChangeRequest: (...a: unknown[]) => mockFile(...a),
  decideChangeRequest: (...a: unknown[]) => mockDecide(...a),
  listMyChangeRequests: (...a: unknown[]) => mockListMine(...a),
  listAllChangeRequests: (...a: unknown[]) => mockListAll(...a),
  ActorNotResolvedError: class extends Error {},
  DomainNotYoursError: class extends Error {},
  ChangeRequestNotFoundError: class extends Error {},
  ChangeRequestRefusedError: class extends Error {},
}));
jest.mock('../../../config/database', () => ({ sequelize: { fake: true } }));

import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import agentChangeRequestRoutes from '../agentChangeRequestRoutes';
import { env } from '../../../config/env';

const ROUTER_SRC = path.join(__dirname, '..', 'agentChangeRequestRoutes.ts');
const MINE = '/api/admin/agent-domain-change-requests-mine';
const QUEUE = '/api/admin/agent-domain-change-requests';
/** The dataset picker's read surface, added to this router with the dataset-scope change. */
const DATASETS = '/api/admin/agent-domain-datasets';
/** AF11.11. The people picker for `acts_on_output`, read while filling the same form. */
const ACTORS = '/api/admin/agent-domain-actors';
const DECIDE = '/api/admin/agent-domain-change-requests/11111111-2222-4333-8444-555555555555/decide';

function tokenFor(mgmtRole: string | null, role = 'staff'): string {
  const payload: Record<string, unknown> = { id: 'test-admin', email: 'test@example.test', role };
  if (mgmtRole) payload.mgmt_role = mgmtRole;
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '5m' });
}

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(agentChangeRequestRoutes);
  return a;
}

function registeredRoutes(): Array<{ path: string; methods: string[]; handlerCount: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express does not type its stack
  const stack = (agentChangeRequestRoutes as any).stack as Array<any>;
  return stack
    .filter((l) => l.route)
    .map((l) => ({
      path: l.route.path as string,
      methods: Object.keys(l.route.methods),
      handlerCount: l.route.stack.length as number,
    }));
}

/** The router source with comments removed, so a guard named in prose is not counted as code. */
function routerCode(): string {
  return fs.readFileSync(ROUTER_SRC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFile.mockResolvedValue({ id: 'cr-1', status: 'submitted' });
  mockDecide.mockResolvedValue({ id: 'cr-1', status: 'approved' });
  mockListMine.mockResolvedValue([]);
  mockListAll.mockResolvedValue([]);
});

describe('every route carries its own guard', () => {
  it('POSITIVE CONTROL: the router registers six routes, so the enumeration is not empty', () => {
    const routes = registeredRoutes();
    expect(routes).toHaveLength(6);
    expect(routes.map((r) => `${r.methods[0]} ${r.path}`).sort()).toEqual([
      `get ${QUEUE}`,
      `get ${MINE}`,
      `get ${DATASETS}`,
      // AF11.11. This control caught the route being added, which is what it is for.
      `get ${ACTORS}`,
      `post ${QUEUE}/:id/decide`,
      `post ${MINE}`,
    ].sort());
  });

  it('every route has at least one middleware BEFORE its handler', () => {
    const unguarded = registeredRoutes().filter((r) => r.handlerCount < 2).map((r) => r.path);
    expect(unguarded).toEqual([]);
  });

  /**
   * MUTATION PROOF. Change either guard in the router and this dies naming what it found. The
   * total count is compared against the number of registered routes, so a route ADDED without a
   * guard also fails here — the thing the per-file lint cannot see.
   */
  it('exactly four requireSection(dashboard) and exactly two requireAdmin, matching the route count', () => {
    const src = routerCode();
    const sections = [...src.matchAll(/requireSection\(\s*'([a-z_]+)'\s*\)/g)].map((m) => m[1]);
    const admins = [...src.matchAll(/\brequireAdmin\b/g)].length;
    // FOUR now: filing, the intern's own list, and the TWO pickers they read while filling the
    // form — the dataset picker and, since AF11.11, the people picker behind `acts_on_output`.
    //
    // Both pickers deliberately sit on the FILING grant rather than the deciding one. Behind
    // `requireAdmin` the only people who could see either list would be the ones who never fill
    // in the form, which would make `read_datasets_not_catalogued` and
    // `acts_on_output_not_a_person` refusals with no way out.
    expect(sections).toEqual(['dashboard', 'dashboard', 'dashboard', 'dashboard']);
    // One import mention plus two usages.
    expect(admins).toBe(3);
    expect(sections.length + 2).toBe(registeredRoutes().length);
  });

  it('puts the dataset picker on the FILING grant, never on the deciding one', () => {
    const src = routerCode();
    // Anchored on the path rather than on ordering, so a reshuffle of the router does not make
    // this pass for the wrong reason.
    const block = src.slice(src.indexOf(`'${DATASETS}'`), src.indexOf(`'${DATASETS}'`) + 160);
    expect(block).toMatch(/requireSection\(\s*'dashboard'\s*\)/);
    expect(block).not.toMatch(/requireAdmin/);
  });

  it('puts the PEOPLE picker on the FILING grant too, for the same reason', () => {
    const src = routerCode();
    // AF11.7 refuses an address that is not on the roster, so a filer who cannot read the roster
    // cannot resolve the refusal. Same shape of problem as the dataset picker above, same fix.
    const block = src.slice(src.indexOf(`'${ACTORS}'`), src.indexOf(`'${ACTORS}'`) + 160);
    expect(block).toMatch(/requireSection\(\s*'dashboard'\s*\)/);
    expect(block).not.toMatch(/requireAdmin/);
  });

  /**
   * The asymmetry, asserted structurally: the DECIDE route must not be reachable on a section
   * grant. If someone "simplifies" the router by putting every route on `requireSection`, this
   * dies even though the test above would still pass with four dashboard guards.
   */
  it('THE DECIDE ROUTE IS NOT ON A SECTION GRANT', () => {
    const src = routerCode();
    const decideBlock = src.slice(src.indexOf("/:id/decide"));
    expect(decideBlock).toMatch(/requireAdmin/);
    expect(decideBlock).not.toMatch(/requireSection/);
  });
});

describe('the door — deciding', () => {
  it('refuses an unauthenticated caller and never reaches the service', async () => {
    const res = await request(app()).post(DECIDE).send({ decision: 'approved' });
    expect([401, 403]).toContain(res.status);
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it('REFUSES A DASHBOARD-ONLY IDENTITY, which is the whole point of the asymmetry', async () => {
    // An intern holds `dashboard`. They can file. They must not be able to approve.
    const res = await request(app())
      .post(DECIDE)
      .set('Authorization', `Bearer ${tokenFor('mentor', 'staff')}`)
      .send({ decision: 'approved' });
    expect([401, 403]).toContain(res.status);
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it('lets an admin through to the service', async () => {
    const res = await request(app())
      .post(DECIDE)
      .set('Authorization', `Bearer ${tokenFor(null, 'admin')}`)
      .send({ decision: 'approved' });
    expect(res.status).toBe(200);
    expect(mockDecide).toHaveBeenCalled();
  });
});

describe('the door — filing', () => {
  it('refuses an unauthenticated caller', async () => {
    const res = await request(app()).post(MINE).send({ domain_key: 'd', title: 'Something' });
    expect([401, 403]).toContain(res.status);
    expect(mockFile).not.toHaveBeenCalled();
  });

  it('refuses a token with no management role', async () => {
    const res = await request(app())
      .post(MINE)
      .set('Authorization', `Bearer ${tokenFor(null, 'student')}`)
      .send({ domain_key: 'd', title: 'Something' });
    expect([401, 403]).toContain(res.status);
    expect(mockFile).not.toHaveBeenCalled();
  });

  it('refuses the QUEUE read to a non-admin, so an intern cannot see everyone else’s requests', async () => {
    const res = await request(app())
      .get(QUEUE)
      .set('Authorization', `Bearer ${tokenFor('mentor', 'staff')}`);
    expect([401, 403]).toContain(res.status);
    expect(mockListAll).not.toHaveBeenCalled();
  });
});
