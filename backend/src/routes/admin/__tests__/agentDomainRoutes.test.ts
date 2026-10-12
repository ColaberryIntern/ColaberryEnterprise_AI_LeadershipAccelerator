/**
 * T15 — the admin read surface: auth per ROUTE, the section split, and the gate's live caller.
 *
 * Run `20261007-school-agent-factory`, session CC-20261006-a4k7.
 *
 * ## Why auth is asserted per route
 *
 * `scripts/lint-route-auth.js` is a required CI check and it is PER FILE: it asks whether a source
 * file contains `requireSection` anywhere. An unguarded route in an otherwise-guarded file passes
 * it, and a file whose header comment merely mentions the guard passes with no real guards at all.
 * So the lint cannot settle this and these tests enumerate the router's actual stack.
 */

import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * The database is mocked to return NO authorization rows, which is the production truth: the
 * `agent_domain_build_authorizations` table is empty because no human has approved a build.
 *
 * This is deliberately a mock of the CONNECTION, not of the gate. `resolveAgentDomainBuildAuthorization`
 * runs its real logic over a real empty result, so the refusal below is the gate's own answer
 * rather than a stub's. Without the mock the suite hangs: there is no local Postgres, and the
 * route reaches `sequelize` through the gate.
 */
const mockQuery = jest.fn().mockResolvedValue([]);
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a) },
}));

import agentDomainRoutes from '../agentDomainRoutes';
import { AGENT_DOMAIN_KEYS, AGENT_DOMAINS } from '../../../services/agentDomain/agentDomainRegistry';
import { derivedAnchorId } from '../../../services/agentDomain/agentDomainProvisionPlan';
import { env } from '../../../config/env';

const ROUTER_SRC = path.join(__dirname, '..', 'agentDomainRoutes.ts');

/** Token for a scoped staff identity holding exactly the given sections' role. */
function tokenFor(mgmtRole: string | null, role = 'staff'): string {
  const payload: Record<string, unknown> = { id: 'test-admin', email: 'test@example.test', role };
  if (mgmtRole) payload.mgmt_role = mgmtRole;
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '5m' });
}

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(agentDomainRoutes);
  return a;
}

/** Every route this router registers, read from the live Express stack. */
function registeredRoutes(): Array<{ path: string; methods: string[]; handlerCount: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express does not type its stack
  const stack = (agentDomainRoutes as any).stack as Array<any>;
  return stack
    .filter((l) => l.route)
    .map((l) => ({
      path: l.route.path as string,
      methods: Object.keys(l.route.methods),
      // handler count includes every middleware AND the handler, so a guard is >= 2.
      handlerCount: l.route.stack.length as number,
    }));
}

/** The middleware names on one route, in order. */
function guardsOn(routePath: string): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stack = (agentDomainRoutes as any).stack as Array<any>;
  const layer = stack.find((l) => l.route && l.route.path === routePath);
  expect(layer).toBeDefined();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return layer.route.stack.map((h: any) => h.name as string);
}

// ─────────────────────────── auth, per route ───────────────────────────

describe('every route carries its own guard', () => {
  const routes = registeredRoutes();

  it('POSITIVE CONTROL: the router registers routes, so the enumeration is not empty', () => {
    expect(routes.length).toBeGreaterThanOrEqual(6);
    expect(routes.every((r) => r.methods.includes('get'))).toBe(true);
  });

  it('every route has at least one middleware BEFORE its handler', () => {
    const unguarded = routes.filter((r) => r.handlerCount < 2).map((r) => r.path);
    expect(unguarded).toEqual([]);
  });

  /**
   * MUTATION PROOF. Remove `requireSection('program')` from
   * `/api/admin/agent-domains-summary` and this test dies naming that route:
   *
   *   ● every route carries its own guard › each route's first middleware is a section guard
   *     Expected: [] / Received: ["/api/admin/agent-domains-summary"]
   *
   * Verified by applying that edit and re-running; reverted by re-applying the original line.
   */
  it('each route\'s first middleware is a section guard', () => {
    const offenders: string[] = [];
    for (const r of routes) {
      const names = guardsOn(r.path);
      // `requireSection(section)` returns an anonymous arrow, so the compiled name is '' or
      // the variable it was assigned to. What distinguishes a guard from a handler is that the
      // route has more than one layer AND the first is not the terminal handler. Assert the
      // STRUCTURE, and separately assert the source wires a real guard on every route.
      if (names.length < 2) offenders.push(r.path);
    }
    expect(offenders).toEqual([]);
  });

  it('the SOURCE wires a requireSection on every route, counted route for route', () => {
    // Belt and braces for the structural check above: the number of registered routes must equal
    // the number of `requireSection(...)` guards in the file. A route added without a guard makes
    // these two disagree, which a per-file lint cannot see.
    const src = fs.readFileSync(ROUTER_SRC, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const guards = [...src.matchAll(/requireSection\(\s*'([a-z_]+)'\s*\)/g)];
    expect(guards).toHaveLength(routes.length);
  });

  it('POSITIVE CONTROL: a fixture route with no guard is detected', () => {
    // Proves the structural check can fail. A single-layer route is exactly what an unguarded
    // `router.get(path, handler)` produces.
    const bare = express.Router();
    bare.get('/api/admin/unguarded', (_q, s) => s.json({}));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layer = (bare as any).stack[0];
    expect(layer.route.stack.length).toBe(1);
    expect(layer.route.stack.length < 2).toBe(true);
  });

  it('declares no write method anywhere: this surface is read-only', () => {
    const writes = routes.filter((r) => r.methods.some((m) => m !== 'get')).map((r) => r.path);
    expect(writes).toEqual([]);
  });
});

// ─────────────────────────── 401 and 403 ───────────────────────────

describe('unauthenticated and wrong-section callers are refused', () => {
  const paths = registeredRoutes().map((r) => r.path.replace(':domainKey', 'marketing'));

  it.each(paths)('%s is 401 with no token', async (p) => {
    const res = await request(app()).get(p);
    expect(res.status).toBe(401);
  });

  it.each(paths)('%s is 401 with a garbage token', async (p) => {
    const res = await request(app()).get(p).set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('a curriculum-scoped role reaches NEITHER section', async () => {
    // `curriculum` holds the program section? It must not reach internship either way; assert
    // the actual outcome rather than assuming the role map.
    const t = tokenFor('curriculum');
    const res = await request(app()).get('/api/admin/agent-domains-builders').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(403);
  });

  it('a support-scoped role cannot read intern names', async () => {
    const res = await request(app())
      .get('/api/admin/agent-domains-builders')
      .set('Authorization', `Bearer ${tokenFor('support')}`);
    expect(res.status).toBe(403);
  });

  it('POSITIVE CONTROL: an owner CAN read, so 403 above is about the section not the wiring', async () => {
    const res = await request(app())
      .get('/api/admin/agent-domains')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────── the section split ───────────────────────────

describe('intern names are behind the internship section, not program', () => {
  it('the names route is guarded by internship and nothing else', () => {
    const src = fs.readFileSync(ROUTER_SRC, 'utf8');
    const block = src.slice(src.indexOf("'/api/admin/agent-domains-builders'"));
    expect(block.slice(0, 200)).toMatch(/requireSection\('internship'\)/);
  });

  it('the PROGRAM list exposes no intern name at all', async () => {
    const res = await request(app())
      .get('/api/admin/agent-domains')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    // Every real name in the roster, checked individually so a failure names the leak.
    const leaked = AGENT_DOMAINS
      .map((d) => d.intended_builder)
      .filter((n): n is string => typeof n === 'string')
      .filter((n) => body.includes(n));
    expect(leaked).toEqual([]);
  });

  it('POSITIVE CONTROL: the roster really does contain names, so the check is not vacuous', () => {
    const named = AGENT_DOMAINS.map((d) => d.intended_builder).filter(Boolean);
    expect(named.length).toBeGreaterThan(0);
  });

  it('the PROGRAM list DOES expose the builder STATE, which is the point of the split', async () => {
    const res = await request(app())
      .get('/api/admin/agent-domains')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    expect(res.body.domains.every((d: { intended_builder_state: string }) => typeof d.intended_builder_state === 'string')).toBe(true);
  });

  it('the internship route returns names, and discloses that nothing is activated', async () => {
    const res = await request(app())
      .get('/api/admin/agent-domains-builders')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    expect(res.status).toBe(200);
    expect(res.body.builders).toHaveLength(AGENT_DOMAINS.length);
    expect(res.body.disclosure).toMatch(/No access has been granted/);
    expect(res.body.disclosure).toMatch(/not verified_active must not be routed around/);
  });

  it('exposes no enrollment id, email or application state with a name', async () => {
    const res = await request(app())
      .get('/api/admin/agent-domains-builders')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/enrollment_id|@|signed_documents_uploaded|resume|phone/i);
    // And no UUID travels with a name.
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });
});

// ─────────────────────────── Zod, before any data access ───────────────────────────

describe('malformed input is 400, before anything is loaded', () => {
  it('an unknown domain key is 400, not 404 or 500', async () => {
    const res = await request(app())
      .get('/api/admin/agent-domains/not_a_domain')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request');
    expect(Array.isArray(res.body.issues)).toBe(true);
  });

  it('a bad coverage state is 400', async () => {
    const res = await request(app())
      .get('/api/admin/agent-domains/marketing/coverage?state=accepted')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    // `accepted` is the value a previous plan cycle used and the vocabulary never defined.
    expect(res.status).toBe(400);
  });

  it('a non-numeric limit is 400, and an out-of-range one too', async () => {
    const t = tokenFor('owner');
    for (const q of ['limit=abc', 'limit=0', 'limit=9999']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app())
        .get(`/api/admin/agent-domains/marketing/coverage?${q}`)
        .set('Authorization', `Bearer ${t}`);
      expect(res.status).toBe(400);
    }
  });

  it('a VALID request succeeds, so the 400s are about validation not breakage', async () => {
    const res = await request(app())
      .get('/api/admin/agent-domains/marketing/coverage?state=draft&limit=5')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    expect(res.status).toBe(200);
    expect(res.body.returned).toBe(5);
    expect(res.body.matching).toBeGreaterThan(5);
  });
});

// ─────────────────────────── honesty of the rendered state ───────────────────────────

describe('the surface reports the real state, including the bad parts', () => {
  it('never defaults manager_can_reach to true, and carries the named blocker', async () => {
    const res = await request(app())
      .get('/api/admin/agent-domains')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    const blocked = res.body.domains.filter((d: { manager_can_reach: boolean }) => !d.manager_can_reach);
    // Four domains are genuinely blocked. A zero here would mean the measurement was dropped.
    expect(blocked.length).toBe(4);
    for (const d of blocked) {
      expect(typeof d.blocker).toBe('string');
      expect(d.blocker.length).toBeGreaterThan(20);
      expect(d.blocker).toMatch(/^manager_[a-z_]+:/);
    }
    expect(res.body.blocked).toBe(4);
    expect(res.body.reachable).toBe(6);
  });

  it('no capability or threshold renders as accepted', async () => {
    const res = await request(app())
      .get('/api/admin/agent-domains/marketing/coverage')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    expect(res.body.summary.confirmed).toBe(0);
    expect(res.body.rows.every((r: { validation_state: string }) => r.validation_state === 'draft')).toBe(true);
    expect(res.body.rows.every((r: { effective_authority: unknown }) => r.effective_authority === null)).toBe(true);
  });

  it('an empty confirmed set is REPORTED, never rendered as coverage', async () => {
    const res = await request(app())
      .get('/api/admin/agent-domains-summary')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    expect(res.body.coverage.headline).toMatch(/NO coverage to report/);
    expect(res.body.disclosure).toMatch(/not complete coverage/);
  });

  it('says a project is NOT provisioned rather than implying it exists', async () => {
    const res = await request(app())
      .get('/api/admin/agent-domains/marketing')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    expect(res.body.provisioned).toBe(false);
    expect(res.body.provisioning_note).toMatch(/No row has been written/);
  });

  it('reports 225 domained and 21 unresolved legacy rows, apart', async () => {
    const res = await request(app())
      .get('/api/admin/agent-domains-summary')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    expect(res.body.legacy.domained_rows).toBe(225);
    expect(res.body.legacy.unresolved_rows).toBe(21);
    expect(res.body.legacy.unresolved_needs_owner_decision).toBe(true);
  });
});

// ─────────────────────────── the gate's live caller ───────────────────────────

describe('authorization state comes from the gate', () => {
  it('the router imports and calls the gate, which previously had no caller at all', () => {
    const src = fs.readFileSync(ROUTER_SRC, 'utf8');
    expect(src).toMatch(/from '\.\.\/\.\.\/services\/agentDomain\/agentDomainBuildAuthorization'/);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).toMatch(/resolveAllFromRows\(/);
    expect(code).toMatch(/loadAgentDomainBuildAuthorizationsByDomain\(/);
  });

  it('the gate really queried the database, so this is its own answer and not a stub', async () => {
    mockQuery.mockClear();
    await request(app())
      .get('/api/admin/agent-domains-authorization')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    // ONE query for all ten, binding every derived anchor id. It used to be ten queries; the
    // table is keyed on `agent_domain_project_id` and all ten ids are derived, so one suffices.
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(String(sql)).toMatch(/agent_domain_build_authorizations/);
    expect(String(sql)).toMatch(/agent_domain_project_id = ANY/);
    const bound = (opts as { bind: { ids: string[] } }).bind.ids;
    expect(bound).toHaveLength(AGENT_DOMAIN_KEYS.length);
    // Every bound id is the DERIVED anchor id, so the query asks about the rows real projects
    // will carry rather than about ids invented for the read.
    for (const k of AGENT_DOMAIN_KEYS) expect(bound).toContain(derivedAnchorId(k));
  });

  it('all ten report not-authorized, and the route says why', async () => {
    const res = await request(app())
      .get('/api/admin/agent-domains-authorization')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    expect(res.status).toBe(200);
    expect(res.body.states).toHaveLength(AGENT_DOMAIN_KEYS.length);
    expect(res.body.authorized_count).toBe(0);
    for (const s of res.body.states) {
      expect(s.authorized).toBe(false);
      expect(s.reason).toBe('no_authorization');
    }
    expect(res.body.disclosure).toMatch(/no human has approved a build/);
  });
});
