import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * T604 — the status registry's access matrix, and the ORDERING that makes it
 * readable while the master flag is off.
 *
 * The harness mounts BOTH routers in `adminRoutes` order - the status router,
 * then `growthJourneyRoutes` - because the property under test is not a
 * property of either file alone: `growthJourneyRoutes` applies
 * `requireGrowthJourneyEnabled` over the whole `/api/admin/growth-journey`
 * prefix, so the registry answers 200 with the flag off only from in front of
 * it. Every test below runs with the master flag OFF, which is the state the
 * registry exists for, and asserts `/participations` is 404 with the same token
 * in the same app - the ordering exercised, not the file.
 *
 * `requireAdmin`, both routers and the controller are REAL; only the models,
 * the membership bridge and the audit writer are mocked.
 *
 * TWO FLAG SOURCES, on purpose. The router's 404 guard reads the master through
 * `config/env` (resolved once at load, which is why this suite mocks that module and flips
 * the object), while the registry reports all six through `resolveGrowthJourneyFlags()`,
 * which reads `process.env` per call - the only sanctioned way to read a sub-flag, per the
 * dark-launch guard in `config/__tests__/growthJourneyFlags.test.ts`. So `setMaster` below
 * sets both, and the flag-off default clears the variable rather than trusting the runner's
 * environment to be unset.
 */

const growthJourney = { growthJourneyEnabled: false, journeySignalIngest: false, journeyClassification: false, journeyDecisions: false, journeyHandoffs: false, journeyExecution: false };
jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret', nodeEnv: 'test', growthJourney } }));
jest.mock('../../../services/aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../services/ledgerService', () => ({ logEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../services/growthJourney/integration/integrateDisposition', () => ({ integrateDisposition: jest.fn() }));
jest.mock('../../../services/growthJourney/offerEligibility', () => {
  class OfferNotEligibleError extends Error {
    readonly error_class = 'OfferNotEligibleError';
    constructor(readonly decision: Record<string, unknown>) { super('Offer not eligible'); this.name = 'OfferNotEligibleError'; }
  }
  return { OfferNotEligibleError };
});
jest.mock('../../../services/growthJourney/classificationService', () => ({ overrideClassification: jest.fn() }));
// T609: `/health` mounts here, and its handler imports the journey health reader, which
// reaches `ledgerRead` -> `config/database` -> a real Sequelize built from `env.databaseUrl`.
// This suite mocks `config/env` without one, so the import alone took the whole file from
// green to "failed to run". The reader is stubbed because this suite tests ACCESS and mount
// order, not health arithmetic - `journeyHealth.test.ts` owns the numbers.
// T610: /readiness mounts here too, and its reader reaches the models barrel and
// config/database the same way the health reader does. Stubbed for the same reason:
// this suite tests ACCESS and mount order; buildReadiness.test.ts owns the checklist.
// `scrubReadiness` is a SPY that returns its argument, not a re-implementation: duplicating
// scrub logic in a mock is how a mock ends up proving itself, but an identity stub made the
// only possible assertion a source-text one. A spy costs nothing and lets the cell below
// assert that the controller actually CALLED it - a behavioural kill rather than a grep.
// The real function's behaviour is pinned by unit cells in buildReadiness.test.ts.
//
// An earlier version of this comment claimed requireActual was "not an option" because the
// real module reaches config/database. That was wrong, and the CLI's suite in this same
// commit disproves it by doing exactly that and passing: the CLI mock only replaces
// `buildReadiness`, so nothing constructs a connection. Here the whole module is replaced
// because this suite must not load the reader's model graph at all.
const scrubReadinessSpy = jest.fn(<T,>(r: T): T => r);
// T611: `growthJourneyRoutes` now imports the chain controller, whose service reaches the
// models barrel and `config/database`. Unmocked, a real Sequelize is constructed from an
// `env` this suite stubs without a databaseUrl, and the whole file fails to load. This
// suite does not exercise the chain; it only mounts the router that carries it.
jest.mock('../../../services/growthJourney/readiness/buildReadiness', () => ({
  buildReadiness: jest.fn().mockResolvedValue({
    items: [{ key: 'master_flag', ready: false, reason: 'off', next_move: 'turn it on' }],
    score: { ready: 0, known: 1, unknown: 0, pct: 0 },
    next_move: 'master_flag',
    as_of: '2026-09-29T18:00:00.000Z',
  }),
  scrubReadiness: scrubReadinessSpy,
}));
jest.mock('../../../services/growthJourney/health/journeyHealth', () => ({
  buildJourneyHealth: jest.fn().mockResolvedValue({
    receipts: [], stuck_pending_review: { count: 0, over_hours: 72 }, held: { total: 0, by_reason: {} },
    refused: { total: 0, by_reason: {}, capped: false }, crons: [], controls: { pause: 0, rollout: 0 },
    journey_hold_rows: 0, ledger_read: 'ok', window_hours: 24,
  }),
}));

const m = {
  brands: jest.fn(),
  programs: jest.fn(),
  paths: jest.fn(),
  memberships: jest.fn(),
  agents: jest.fn(),
  enrollments: jest.fn(),
};
jest.mock('../../../models', () => ({
  Brand: { findAll: (...a: unknown[]) => m.brands(...a) },
  JourneyProgram: { findAll: (...a: unknown[]) => m.programs(...a) },
  JourneyPath: { findAll: (...a: unknown[]) => m.paths(...a) },
  TenantMembership: { count: (...a: unknown[]) => m.memberships(...a) },
  AiAgent: { findAll: (...a: unknown[]) => m.agents(...a) },
  GrowthJourneyEnrollment: { findAndCountAll: (...a: unknown[]) => m.enrollments(...a), findByPk: jest.fn() },
  GrowthJourneyClassification: { findAndCountAll: jest.fn(), findByPk: jest.fn() },
  GrowthJourneyDecision: { findAndCountAll: jest.fn(), findByPk: jest.fn() },
}));
const contextFromAdminRequest = jest.fn();
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({ contextFromAdminRequest: (...a: unknown[]) => contextFromAdminRequest(...a) }));
const recordAccessDecision = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../modules/tenancy/tenantAccessAudit', () => ({ recordAccessDecision: (...a: unknown[]) => recordAccessDecision(...a) }));

import growthJourneyRoutes from '../growthJourneyRoutes';
import growthJourneyStatusRoutes from '../growthJourneyStatusRoutes';
import { GROWTH_JOURNEY_AGENT_ENTRIES } from '../../../services/agentRegistry/growthJourneyAgents';
import { TERMINOLOGY } from '../../../services/growthJourney/journeyTerminology';
import { pathToSection } from '../../../middlewares/mgmtSectionGate';

const REGISTRY = '/api/admin/growth-journey/status/registry';
const HEALTH = '/api/admin/growth-journey/status/health';
const READINESS = '/api/admin/growth-journey/status/readiness';
const PARTICIPATIONS = '/api/admin/growth-journey/participations';
const TENANT = '10000000-0000-4000-8000-000000000002';
const BRAND = '20000000-0000-4000-8000-000000000002';
const PROGRAM = '30000000-0000-4000-8000-000000000001';

/** Both sources of the master flag: the guard's (`config/env`) and the registry's (`process.env`). */
function setMaster(on: boolean): void {
  growthJourney.growthJourneyEnabled = on;
  if (on) process.env.GROWTH_JOURNEY_ENABLED = 'true';
  else delete process.env.GROWTH_JOURNEY_ENABLED;
}

const token = (role = 'admin') => jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', role }, 'test-secret');
/** Both routers, in `adminRoutes` order: the status mount ABOVE the journey mount. */
function app() {
  const a = express();
  a.use(express.json());
  a.use(growthJourneyStatusRoutes);
  a.use(growthJourneyRoutes);
  return a;
}
const auth = (r: request.Test, role = 'admin') => r.set('Authorization', `Bearer ${token(role)}`);

/**
 * The same two routers, mounted in the order `adminRoutes.ts` ACTUALLY DECLARES - read from its
 * source, not restated here. `app()` above hard-codes the correct order, which proves the
 * consequence; this proves the cause is wired that way in production, so moving the mount line
 * fails this suite as well as `adminRoutes.order.test.ts`.
 */
function appInAdminRoutesOrder() {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'adminRoutes.ts'), 'utf8');
  const statusAt = source.indexOf('router.use(growthJourneyStatusRoutes);');
  const journeyAt = source.indexOf('router.use(growthJourneyRoutes);');
  expect(statusAt).toBeGreaterThan(-1);
  expect(journeyAt).toBeGreaterThan(-1);
  const a = express();
  a.use(express.json());
  for (const [, router] of [[statusAt, growthJourneyStatusRoutes], [journeyAt, growthJourneyRoutes]].sort((x, y) => (x[0] as number) - (y[0] as number))) {
    a.use(router as express.Router);
  }
  return a;
}

/** A Sequelize-ish row: the controller reads through `get(key)`. */
const rowOf = (values: Record<string, unknown>) => ({ get: (k: string) => values[k] });

const brandRow = (over: Record<string, unknown> = {}) => rowOf({ id: BRAND, tenant_id: TENANT, slug: 'colaberry-training', name: 'Colaberry Training', status: 'active', default_journey_program_id: PROGRAM, ...over });
const programRow = (over: Record<string, unknown> = {}) => rowOf({ id: PROGRAM, brand_id: BRAND, slug: 'learner', name: 'Colaberry Training Learner Journey', kind: 'learner', status: 'draft', metadata: { terminology: TERMINOLOGY.learner }, ...over });
const pathRow = (over: Record<string, unknown> = {}) => rowOf({ program_id: PROGRAM, offer_family: 'free_training', name: 'Free Training', status: 'active', ...over });
const agentRow = (name: string, over: Record<string, unknown> = {}) => rowOf({ agent_name: name, enabled: false, last_run_at: null, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  setMaster(false);
  m.brands.mockResolvedValue([brandRow()]);
  m.programs.mockResolvedValue([programRow()]);
  m.paths.mockResolvedValue([pathRow()]);
  m.memberships.mockResolvedValue(0);
  m.agents.mockResolvedValue(GROWTH_JOURNEY_AGENT_ENTRIES.map((e) => agentRow(e.agent_name)));
  m.enrollments.mockResolvedValue({ rows: [], count: 0 });
  contextFromAdminRequest.mockResolvedValue({ platformIdentityId: 'pid-1', tenantId: TENANT, brandId: null, organizationId: null, roles: ['tenant_admin'], isPlatformSuperAdmin: false, authorizedTenantIds: [TENANT], authorizedBrandIds: null });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  setMaster(false);
  // A read route: nothing is audited (an audit row would be a write on a GET) and no journey
  // subject table is touched, not even the one the sibling router would have read.
  expect(recordAccessDecision).not.toHaveBeenCalled();
  expect(m.enrollments).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('the status matrix', () => {
  it('401 unauthenticated, before anything is read', async () => {
    expect((await request(app()).get(REGISTRY)).status).toBe(401);
    expect(m.brands).not.toHaveBeenCalled();
  });

  it('401 on a token this service did not sign', async () => {
    const other = jwt.sign({ sub: 'staff-1', role: 'admin' }, 'not-the-secret');
    expect((await request(app()).get(REGISTRY).set('Authorization', `Bearer ${other}`)).status).toBe(401);
    expect(m.brands).not.toHaveBeenCalled();
  });

  it('403 for a scoped management role (curriculum), before anything is read', async () => {
    const res = await auth(request(app()).get(REGISTRY), 'curriculum');
    expect(res.status).toBe(403);
    expect(m.brands).not.toHaveBeenCalled();
  });

  it('200 for an admin WITH THE MASTER FLAG OFF, and the flag it reports is off', async () => {
    const res = await auth(request(app()).get(REGISTRY));
    expect(res.status).toBe(200);
    expect(res.body.flags).toEqual({ master: false, signal_ingest: false, classification: false, decisions: false, handoffs: false, execution: false });
  });

  it('the same token on a flag-gated sibling route is 404 in the same app - the ordering, not the file', async () => {
    const a = app();
    expect((await auth(request(a).get(REGISTRY))).status).toBe(200);
    expect((await auth(request(a).get(PARTICIPATIONS))).status).toBe(404);
  });

  it('and in the order adminRoutes.ts declares, which is where the ordering has to be true', async () => {
    const a = appInAdminRoutesOrder();
    expect((await auth(request(a).get(REGISTRY))).status).toBe(200);
    expect((await auth(request(a).get(PARTICIPATIONS))).status).toBe(404);
  });

  it('and with the master flag ON both are reachable: the registry is not a flag-off special case', async () => {
    setMaster(true);
    const a = app();
    const registry = await auth(request(a).get(REGISTRY));
    expect(registry.status).toBe(200);
    expect(registry.body.flags.master).toBe(true);
    expect((await auth(request(a).get(PARTICIPATIONS))).status).not.toBe(404);
    // This is the ONE cell that calls the sibling route for real, and that route is supposed to
    // read the enrolment table. Cleared here so the afterEach guard keeps meaning what it says
    // for every other cell: the REGISTRY never reads a journey subject table.
    m.enrollments.mockClear();
  });

  it('the guard is path-scoped: a route registered after this router is untouched by it', async () => {
    const a = express();
    a.use(growthJourneyStatusRoutes);
    a.get('/public/thing', (_req, res) => { res.json({ ok: true }); });
    const res = await request(a).get('/public/thing');
    expect(res.status).toBe(200);
  });
});

describe('what the registry returns', () => {
  it('the configuration: brands, programmes with their terminology, paths, flags, memberships, the three agents', async () => {
    const res = await auth(request(app()).get(REGISTRY));
    expect(res.body.brands).toEqual([{ id: BRAND, tenant_id: TENANT, slug: 'colaberry-training', name: 'Colaberry Training', status: 'active', default_journey_program_id: PROGRAM }]);
    expect(res.body.programs).toEqual([{ id: PROGRAM, brand_id: BRAND, slug: 'learner', name: 'Colaberry Training Learner Journey', kind: 'learner', status: 'draft', terminology: { subject: 'learner', relationship: 'enrolment', pipeline: 'path' } }]);
    expect(res.body.paths).toEqual([{ program_id: PROGRAM, offer_family: 'free_training', name: 'Free Training', status: 'active' }]);
    expect(res.body.memberships_populated).toBe(false);
    expect(res.body.agents).toEqual(GROWTH_JOURNEY_AGENT_ENTRIES.map((e) => ({ agent_name: e.agent_name, enabled: false, last_run_at: null })));
    // The whole response, by key: adding a field is a deliberate diff here, which is how a
    // journey row (a subject, a decision, a receipt) cannot arrive unnoticed.
    expect(Object.keys(res.body).sort()).toEqual(['agents', 'brands', 'flags', 'memberships_populated', 'paths', 'programs']);
  });

  it('memberships_populated is a boolean, never the count', async () => {
    m.memberships.mockResolvedValue(37);
    const res = await auth(request(app()).get(REGISTRY));
    expect(res.body.memberships_populated).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('37');
  });

  it('a programme whose metadata has no terminology reports null, never a guess from its kind', async () => {
    m.programs.mockResolvedValue([programRow({ metadata: null }), programRow({ id: 'p2', metadata: { other: 'key' } }), programRow({ id: 'p3', metadata: { terminology: { subject: 'learner' } } })]);
    const res = await auth(request(app()).get(REGISTRY));
    expect(res.body.programs.map((p: { terminology: unknown }) => p.terminology)).toEqual([null, null, null]);
  });

  it('an agent the registry declares but the database has not seeded reports enabled: null', async () => {
    m.agents.mockResolvedValue([agentRow(GROWTH_JOURNEY_AGENT_ENTRIES[0].agent_name, { enabled: true, last_run_at: new Date('2026-09-22T04:20:00Z') })]);
    const res = await auth(request(app()).get(REGISTRY));
    expect(res.body.agents).toEqual([
      { agent_name: GROWTH_JOURNEY_AGENT_ENTRIES[0].agent_name, enabled: true, last_run_at: '2026-09-22T04:20:00.000Z' },
      ...GROWTH_JOURNEY_AGENT_ENTRIES.slice(1).map((e) => ({ agent_name: e.agent_name, enabled: null, last_run_at: null })),
    ]);
  });

  it('carries no address, even when a brand name is an adversarial one', async () => {
    m.brands.mockResolvedValue([brandRow({ name: 'Colaberry <ali@colaberry.com> Training' })]);
    const res = await auth(request(app()).get(REGISTRY));
    // The name IS returned - it is configuration a human typed - so the rule this pins is the
    // one that matters: nothing here reads a journey subject table, so no PERSON's address can
    // reach the response. The adversarial brand name is the control that the assertion is real.
    expect(res.body.brands[0].name).toContain('@');
    expect(m.enrollments).not.toHaveBeenCalled();
    const withoutBrands = { ...res.body, brands: [] };
    expect(JSON.stringify(withoutBrands)).not.toContain('@');
  });

  it('a read failure is a 500 with an error class and no detail', async () => {
    m.programs.mockRejectedValue(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    const res = await auth(request(app()).get(REGISTRY));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Status registry read failed', error_class: 'SequelizeConnectionError' });
  });
});

describe('the RBAC classification of the status prefix', () => {
  it('classifies as campaigns, like the rest of the journey surface', () => {
    expect(pathToSection(REGISTRY)).toBe('campaigns');
    expect(pathToSection('/api/admin/growth-journey/status')).toBe('campaigns');
    expect(pathToSection(PARTICIPATIONS)).toBe('campaigns');
  });
});

describe('T609: /health joins the same always-readable surface, behind the same guard', () => {
  it('is reachable with the master flag OFF, which is the whole point of mounting it here', async () => {
    const a = app();
    setMaster(false);
    const res = await auth(request(a).get(HEALTH));
    expect(res.status).toBe(200);
    expect(res.body.ledger_read).toBe('ok');
  });

  it('refuses an unauthenticated caller', async () => {
    const res = await request(app()).get(HEALTH);
    expect(res.status).toBe(401);
  });

  it('403 for a scoped management role (curriculum)', async () => {
    // `router.use(BASE, requireAdmin)` covers the whole prefix, so this is structurally
    // the same guard /registry is asserted against - but "structurally identical" is the
    // kind of claim that stops being true the moment someone registers a route above the
    // guard, so the new route gets its own cell rather than inheriting the argument.
    const res = await auth(request(app()).get(HEALTH), 'curriculum');
    expect(res.status).toBe(403);
  });

  it('validates the window rather than quietly reading a different one', async () => {
    const a = app();
    const bad = await auth(request(a).get(`${HEALTH}?window_hours=abc`));
    expect(bad.status).toBe(400);
    const tooBig = await auth(request(a).get(`${HEALTH}?window_hours=99999`));
    expect(tooBig.status).toBe(400);
    const ok = await auth(request(a).get(`${HEALTH}?window_hours=48`));
    expect(ok.status).toBe(200);
  });
});

describe('T610: /readiness is on the same always-readable surface', () => {
  it('is reachable with the master flag OFF, which is the whole point of a launch checklist', async () => {
    const a = app();
    setMaster(false);
    const res = await auth(request(a).get(READINESS));
    expect(res.status).toBe(200);
    expect(res.body.next_move).toBe('master_flag');
    expect(res.body.as_of).toBe('2026-09-29T18:00:00.000Z');
  });

  it('refuses an unauthenticated caller', async () => {
    const res = await request(app()).get(READINESS);
    expect(res.status).toBe(401);
  });

  it('403 for a scoped management role (curriculum)', async () => {
    const res = await auth(request(app()).get(READINESS), 'curriculum');
    expect(res.status).toBe(403);
  });

  it('takes no query parameters, and an unexpected one changes nothing', async () => {
    // There is no window to choose and no paging: the list is fixed items in a fixed
    // order. A route that silently accepted a filter would imply otherwise.
    const res = await auth(request(app()).get(`${READINESS}?window_hours=48&limit=3`));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });
});

describe('T610: the readiness route scrubs on the way out', () => {
  it('the controller actually CALLS scrubReadiness on the report it serves', async () => {
    // The behavioural half. M12 removes the scrub call; this fails on the spy rather than
    // on a grep, which is what makes the kill about behaviour and not about spelling.
    scrubReadinessSpy.mockClear();
    const res = await auth(request(app()).get(READINESS));
    expect(res.status).toBe(200);
    expect(scrubReadinessSpy).toHaveBeenCalledTimes(1);
    expect(scrubReadinessSpy.mock.calls[0][0]).toMatchObject({ next_move: 'master_flag' });
  });

  it('the controller passes the report through scrubReadiness, asserted against its source too', () => {
    // A unit test of the handler cannot see this, because the mock above is identity; and
    // the contract's bar is "`@` anywhere in a JSON response of a NEW ROUTE fails the
    // phase", so the route must scrub rather than inherit the reader's good behaviour.
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'controllers', 'growthJourneyStatusController.ts'),
      'utf8',
    ).replace(/\r\n/g, '\n');
    expect(source).toContain('scrubReadiness(await buildReadiness(');
    expect(source).toContain("import { buildReadiness, scrubReadiness } from '../services/growthJourney/readiness/buildReadiness';");
  });
});
