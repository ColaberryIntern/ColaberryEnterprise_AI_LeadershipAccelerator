import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * T4 — the fifteen brand-scoped paths: who may reach them, and what they answer.
 *
 * `requireAdmin`, the real router, the real controllers, the real Zod schemas
 * (Explorer's own, unchanged) and the real brand-scope resolver all run. Only
 * the models, the membership bridge and Explorer's five read services are
 * mocked, so an assertion here is about this build's wiring rather than about a
 * stub.
 *
 * ─── THE CELL THAT DESCRIBES PRODUCTION ON DAY ONE ──────────────────────────
 *
 * `tenant_memberships` holds zero rows, so `ctx.brandId` is null for every
 * admin and a request naming a brand is **403**. That is not a bug to be
 * loosened; it is the state the UI has to render as a named configuration step,
 * and it resolves when an operator populates memberships. The matrix below
 * states it rather than leaving it to be discovered in production.
 */

const growthJourney = {
  growthJourneyEnabled: true,
  journeySignalIngest: false,
  journeyClassification: false,
  journeyDecisions: false,
  journeyHandoffs: false,
  journeyExecution: false,
};
jest.mock('../../../config/env', () => ({
  env: {
    jwtSecret: 'test-secret',
    nodeEnv: 'test',
    databaseUrl: 'postgres://test:test@localhost:5432/test',
    growthJourney,
  },
}));
jest.mock('../../../services/aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../services/ledgerService', () => ({ logEvent: jest.fn().mockResolvedValue(undefined) }));
/*
 * The REAL Sequelize instance, with only `sequelize.query` stubbed.
 *
 * Replacing the whole module breaks every model file that calls `Model.init`
 * against it, and the read router loads a dozen of them transitively. Replacing
 * the whole instance with a `{ query }` object has the same effect. So the
 * actual instance is constructed (from the fake `databaseUrl` above, so it never
 * connects) and only the raw-query method is swapped - which is the one thing
 * the drift sentinel in `explorerBrandReads` uses.
 */
jest.mock('../../../config/database', () => {
  const actual = jest.requireActual('../../../config/database');
  actual.sequelize.query = jest.fn().mockResolvedValue([{ n: 0 }]);
  return actual;
});

/*
 * The read router imports the performance and inspect controllers too, and their
 * service chains construct a real Sequelize at module load
 * (`marketingAnalyticsService` -> `governanceService` -> `settingsService` ->
 * `SystemSetting`). Mocked at the same three boundaries the sibling suite
 * `growthJourneyReadRoutes.access.test.ts` mocks them at, for the same reason.
 * None of them is exercised here; they only have to not explode on import.
 */
jest.mock('../../../services/growthJourney/performance/journeyMetricsService', () => ({
  computeJourneyMetrics: jest.fn(),
  DEFAULT_WINDOW_DAYS: 30,
  MAX_WINDOW_DAYS: 365,
}));
jest.mock('../../../services/marketingAnalyticsService', () => ({
  getCampaignMetricsByJourney: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../services/growthJourney/performance/performanceReads', () => ({
  readReceipts: jest.fn(),
  readOutcomes: jest.fn(),
  readRates: jest.fn(),
  MAX_PAGE: 100,
  DEFAULT_PAGE: 25,
}));

/* ── Explorer's five read services, mocked at their module boundaries ───────── */
const ex = {
  summary: jest.fn(),
  distribution: jest.fn(),
  learners: jest.fn(),
  profile: jest.fn(),
  signals: jest.fn(),
  learnerDecisions: jest.fn(),
  eligibility: jest.fn(),
  decisions: jest.fn(),
  shadow: jest.fn(),
  content: jest.fn(),
  why: jest.fn(),
  campus: jest.fn(),
  outreach: jest.fn(),
};
jest.mock('../../../services/explorerGrowth/explorerOverviewService', () => ({
  getSummary: (...a: unknown[]) => ex.summary(...a),
  getDistribution: (...a: unknown[]) => ex.distribution(...a),
  getLearners: (...a: unknown[]) => ex.learners(...a),
}));
jest.mock('../../../services/explorerGrowth/explorerLearnerService', () => ({
  getLearnerProfile: (...a: unknown[]) => ex.profile(...a),
  getLearnerSignals: (...a: unknown[]) => ex.signals(...a),
  getLearnerDecisions: (...a: unknown[]) => ex.learnerDecisions(...a),
  getEligibility: (...a: unknown[]) => ex.eligibility(...a),
}));
jest.mock('../../../services/explorerGrowth/explorerDecisionsService', () => ({
  getDecisions: (...a: unknown[]) => ex.decisions(...a),
  getShadow: (...a: unknown[]) => ex.shadow(...a),
  getContentHealth: (...a: unknown[]) => ex.content(...a),
}));
jest.mock('../../../services/explorerGrowth/explorerWhyService', () => ({
  getExplorerWhyByDecision: (...a: unknown[]) => ex.why(...a),
}));
jest.mock('../../../services/explorerGrowth/explorerCampusService', () => ({
  getCampusActivity: (...a: unknown[]) => ex.campus(...a),
  getOutreach: (...a: unknown[]) => ex.outreach(...a),
}));
jest.mock('../../../services/growthJourney/explorerProgramBridge', () => ({
  EXPLORER_PROGRAM: { tenantSlug: 'colaberry', brandSlug: 'colaberry-training' },
  BACKFILL_SOURCE: 'explorer_backfill',
}));

const TENANT = '10000000-0000-4000-8000-000000000002';
const BRAND = '20000000-0000-4000-8000-000000000002';
const OTHER_BRAND = '20000000-0000-4000-8000-000000000009';
const LEARNER = '40000000-0000-4000-8000-000000000001';
const DECISION = '50000000-0000-4000-8000-000000000001';

const resolveBrandBySlug = jest.fn();
jest.mock('../../../modules/tenancy/tenantResolver', () => ({
  resolveBrandBySlug: (...a: unknown[]) => resolveBrandBySlug(...a),
}));

const programRow = {
  id: 'prog-1',
  brand_id: BRAND,
  kind: 'learner' as const,
  metadata: null as Record<string, unknown> | null,
  update: jest.fn(async () => undefined),
};
const models = {
  brandFindByPk: jest.fn(),
  programFindByPk: jest.fn(),
  programFindAll: jest.fn(),
};
jest.mock('../../../models', () => ({
  Brand: { findAll: jest.fn(), findByPk: (...a: unknown[]) => models.brandFindByPk(...a) },
  JourneyProgram: { findAll: jest.fn() },
  JourneyPath: { findAll: jest.fn() },
  TenantMembership: { count: jest.fn() },
  AiAgent: { findAll: jest.fn() },
  GrowthJourneyEnrollment: { findByPk: jest.fn(), findAndCountAll: jest.fn() },
  GrowthJourneyDecision: { findAll: jest.fn() },
  GrowthJourneyExecution: { findAll: jest.fn() },
}));
jest.mock('../../../models/JourneyProgram', () => ({
  JourneyProgram: {
    findByPk: (...a: unknown[]) => models.programFindByPk(...a),
    findAll: (...a: unknown[]) => models.programFindAll(...a),
  },
  JOURNEY_PROGRAM_KINDS: ['learner', 'business', 'consulting'],
  JOURNEY_PROGRAM_STATUSES: ['draft', 'active', 'paused', 'retired'],
}));
const contextFromAdminRequest = jest.fn();
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({
  contextFromAdminRequest: (...a: unknown[]) => contextFromAdminRequest(...a),
}));
jest.mock('../../../modules/tenancy/tenantAccessAudit', () => ({
  recordAccessDecision: jest.fn().mockResolvedValue(undefined),
}));

import growthJourneyReadRoutes from '../growthJourneyReadRoutes';
import { EXPLORER_BRAND_HANDLERS } from '../../../controllers/growthJourneyExplorerController';
import { EXPLORER_BRAND_READS } from '../../../services/growthJourney/reads/explorerBrandReads';

const EXPLORERS = '/api/admin/growth-journey/explorers';
const BRAND_ROLE = '/api/admin/growth-journey/brand-role';

const token = (role = 'admin') => jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', role }, 'test-secret');
function app() {
  const a = express();
  a.use(express.json());
  a.use(growthJourneyReadRoutes);
  return a;
}
const auth = (r: request.Test, role = 'admin') => r.set('Authorization', `Bearer ${token(role)}`);
const memberOf = (brandId: string | null, authorized: string[] | null = null) => ({
  platformIdentityId: 'pid-1',
  tenantId: TENANT,
  brandId,
  organizationId: null,
  roles: ['tenant_admin'],
  isPlatformSuperAdmin: false,
  authorizedTenantIds: [TENANT],
  authorizedBrandIds: authorized,
});

/**
 * The thirteen reads, each with the Explorer service it must reach and nothing
 * else. This table IS the "one route per read" assertion: a path that resolved
 * to a sibling handler would call the wrong spy.
 */
const PATHS: Array<{ name: string; path: string; spy: jest.Mock }> = [
  { name: 'summary', path: `${EXPLORERS}/summary`, spy: ex.summary },
  { name: 'distribution', path: `${EXPLORERS}/distribution`, spy: ex.distribution },
  { name: 'campus', path: `${EXPLORERS}/campus`, spy: ex.campus },
  { name: 'outreach', path: `${EXPLORERS}/outreach`, spy: ex.outreach },
  { name: 'learners', path: `${EXPLORERS}/learners`, spy: ex.learners },
  { name: 'learner', path: `${EXPLORERS}/learners/${LEARNER}`, spy: ex.profile },
  { name: 'learner signals', path: `${EXPLORERS}/learners/${LEARNER}/signals`, spy: ex.signals },
  { name: 'learner decisions', path: `${EXPLORERS}/learners/${LEARNER}/decisions`, spy: ex.learnerDecisions },
  { name: 'eligibility', path: `${EXPLORERS}/eligibility/${LEARNER}`, spy: ex.eligibility },
  { name: 'decisions', path: `${EXPLORERS}/decisions`, spy: ex.decisions },
  { name: 'why', path: `${EXPLORERS}/decisions/${DECISION}`, spy: ex.why },
  { name: 'shadow', path: `${EXPLORERS}/shadow`, spy: ex.shadow },
  { name: 'content', path: `${EXPLORERS}/content`, spy: ex.content },
];

beforeEach(() => {
  jest.clearAllMocks();
  growthJourney.growthJourneyEnabled = true;
  resolveBrandBySlug.mockResolvedValue({ id: BRAND });
  models.brandFindByPk.mockResolvedValue(null);
  models.programFindByPk.mockResolvedValue(null);
  models.programFindAll.mockResolvedValue([programRow]);
  programRow.metadata = null;
  contextFromAdminRequest.mockResolvedValue(memberOf(BRAND, [BRAND]));
  for (const spy of Object.values(ex)) spy.mockResolvedValue({ rows: [], total: 0 });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('the counts cannot drift', () => {
  it('registers one route per read, and one handler per read', () => {
    // The drift this prevents already happened once, in this build's own plan:
    // the read list grew from six to eleven to thirteen while the route task
    // still said eight, leaving four UI panels unreachable.
    expect(PATHS).toHaveLength(EXPLORER_BRAND_READS.length);
    expect(EXPLORER_BRAND_HANDLERS).toHaveLength(EXPLORER_BRAND_READS.length);
    expect(new Set(PATHS.map((p) => p.path)).size).toBe(PATHS.length);
  });
});

describe('each path resolves to its OWN handler', () => {
  it.each(PATHS)('$name', async ({ path, spy }) => {
    const res = await auth(request(app()).get(path).query({ brand_id: BRAND }));

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    // And no sibling was reached. `/learners/<uuid>` resolving to the roster
    // handler would have returned 200 and looked healthy.
    for (const other of PATHS.filter((p) => p.path !== path)) {
      if (other.spy !== spy) expect(other.spy).not.toHaveBeenCalled();
    }
  });
});

describe('authorization', () => {
  it('401 unauthenticated, on every read', async () => {
    for (const { path } of PATHS) {
      const res = await request(app()).get(path);
      expect(res.status).toBe(401);
    }
  });

  it('401 unauthenticated on the brand-role GET and PUT', async () => {
    // The cell T3 deliberately could not assert: the service has no notion of a
    // caller, so this is the first place the write's auth is provable.
    expect((await request(app()).get(BRAND_ROLE).query({ brand_id: BRAND })).status).toBe(401);
    expect(
      (await request(app()).put(BRAND_ROLE).query({ brand_id: BRAND }).send({ title: 'x', description: 'y' })).status
    ).toBe(401);
  });

  it('403 when the caller does not hold the requested brand', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(BRAND, [BRAND]));

    const res = await auth(request(app()).get(`${EXPLORERS}/summary`).query({ brand_id: OTHER_BRAND }));

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Brand not in scope');
    // Refused BEFORE Explorer was asked anything.
    expect(ex.summary).not.toHaveBeenCalled();
  });

  it('403 on the WRITE for a brand the caller does not hold, and nothing is written', async () => {
    const res = await auth(
      request(app()).put(BRAND_ROLE).query({ brand_id: OTHER_BRAND }).send({ title: 'x', description: 'y' })
    );

    expect(res.status).toBe(403);
    expect(programRow.update).not.toHaveBeenCalled();
  });

  it('403 TODAY, with an empty membership table, which is production on day one', async () => {
    // Zero rows in `tenant_memberships` means no admin holds a brand, so
    // `ctx.brandId` is null and cannot equal a requested uuid.
    contextFromAdminRequest.mockResolvedValue(memberOf(null, null));

    const res = await auth(request(app()).get(`${EXPLORERS}/summary`).query({ brand_id: BRAND }));

    expect(res.status).toBe(403);
  });

  it('200 and unnarrowed when no brand is requested and the caller holds none', async () => {
    // How the page is useful before the seed runs. Honest: nothing is narrowed.
    contextFromAdminRequest.mockResolvedValue(memberOf(null, null));

    const res = await auth(request(app()).get(`${EXPLORERS}/summary`));

    expect(res.status).toBe(200);
    expect(res.body.scope.in_scope).toBe(true);
    expect(res.body.scope.reason).toBe('all_brands');
  });

  it('narrows to the caller\'s OWN brand when they omit brand_id', async () => {
    // Otherwise a brand-restricted operator could omit the parameter and be
    // served everyone's rows - a widening by the code whose job is refusing to.
    contextFromAdminRequest.mockResolvedValue(memberOf(OTHER_BRAND, [OTHER_BRAND]));
    // A real brand row, so the refusal is `other_brand` rather than
    // `unknown_brand`. Both refuse; they are distinguished so the UI can say
    // which, and so a bogus id can never read as a legitimately empty brand.
    models.brandFindByPk.mockResolvedValue({ id: OTHER_BRAND });

    const res = await auth(request(app()).get(`${EXPLORERS}/summary`));

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(res.body.scope.reason).toBe('other_brand');
    expect(ex.summary).not.toHaveBeenCalled();
  });
});

describe('out of scope answers 200 with data null, never zeros', () => {
  it('serves nothing for a brand that is not Explorer\'s', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(OTHER_BRAND, [OTHER_BRAND]));
    models.brandFindByPk.mockResolvedValue({ id: OTHER_BRAND });

    const res = await auth(request(app()).get(`${EXPLORERS}/learners`).query({ brand_id: OTHER_BRAND }));

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(res.body.scope.in_scope).toBe(false);
    expect(res.body.scope.reason).toBe('other_brand');
    // A `rows: []` here would assert "this brand has no explorers yet" while
    // meaning "this is not the brand that has them".
    expect(res.body.data).not.toEqual({ rows: [], total: 0 });
    expect(ex.learners).not.toHaveBeenCalled();
  });
});

describe('the master flag', () => {
  it('404s every one of the fifteen paths when the journey is dark', async () => {
    growthJourney.growthJourneyEnabled = false;

    for (const { path } of PATHS) {
      expect((await auth(request(app()).get(path).query({ brand_id: BRAND }))).status).toBe(404);
    }
    expect((await auth(request(app()).get(BRAND_ROLE).query({ brand_id: BRAND }))).status).toBe(404);
    expect(
      (await auth(request(app()).put(BRAND_ROLE).query({ brand_id: BRAND }).send({ title: 'x', description: 'y' })))
        .status
    ).toBe(404);
  });
});

describe('input validation', () => {
  it('400 on a malformed brand uuid', async () => {
    const res = await auth(request(app()).get(`${EXPLORERS}/summary`).query({ brand_id: 'colaberry-training' }));
    expect(res.status).toBe(400);
  });

  it('400 on a malformed learner id', async () => {
    const res = await auth(request(app()).get(`${EXPLORERS}/learners/not-a-uuid`).query({ brand_id: BRAND }));
    expect(res.status).toBe(400);
    expect(ex.profile).not.toHaveBeenCalled();
  });

  it('400 on an unknown query key, because Explorer\'s schemas are strict', async () => {
    // The property worth checking after splitting the query in two: an unknown
    // key is not one of the three scope keys, so it stays in the remainder, and
    // the remainder goes to Explorer's own strict schema.
    const res = await auth(
      request(app()).get(`${EXPLORERS}/learners`).query({ brand_id: BRAND, nonsense: '1' })
    );
    expect(res.status).toBe(400);
  });

  it('400 on a query parameter sent to a read that takes none', async () => {
    const res = await auth(request(app()).get(`${EXPLORERS}/summary`).query({ brand_id: BRAND, limit: '50' }));
    expect(res.status).toBe(400);
  });

  it('enforces Explorer\'s OWN bounds, not a copy of them', async () => {
    // `e_min` above 100 is rejected by `scoreParam` in `explorerGrowthSchema`.
    // If this route had re-declared the schema, this bound could drift.
    const res = await auth(
      request(app()).get(`${EXPLORERS}/learners`).query({ brand_id: BRAND, e_min: '101' })
    );
    expect(res.status).toBe(400);
  });

  it('passes Explorer\'s parsed query straight through', async () => {
    await auth(request(app()).get(`${EXPLORERS}/distribution`).query({ brand_id: BRAND, days: '14' }));
    expect(ex.distribution).toHaveBeenCalledWith(14);

    await auth(
      request(app()).get(`${EXPLORERS}/outreach`).query({ brand_id: BRAND, view: 'engaged', limit: '10' })
    );
    expect(ex.outreach).toHaveBeenCalledWith('engaged', 10, { offset: 0 });
  });

  it('400 on a brand-role request with no brand at all', async () => {
    // Unlike the reads, "whichever brand you happen to be scoped to" is not an
    // acceptable answer for a role: it is how somebody renames the wrong brand.
    expect((await auth(request(app()).get(BRAND_ROLE))).status).toBe(400);
    expect((await auth(request(app()).put(BRAND_ROLE).send({ title: 'x', description: 'y' }))).status).toBe(400);
  });

  it('400 on a role body with markup only, or an unknown key', async () => {
    const q = { brand_id: BRAND };
    expect(
      (await auth(request(app()).put(BRAND_ROLE).query(q).send({ title: '<b></b>', description: 'y' }))).status
    ).toBe(400);
    expect(
      (await auth(request(app()).put(BRAND_ROLE).query(q).send({ title: 'x', description: 'y', role: {} }))).status
    ).toBe(400);
  });
});

describe('the brand role end to end', () => {
  it('GET returns the kind default for a brand nobody has configured', async () => {
    const res = await auth(request(app()).get(BRAND_ROLE).query({ brand_id: BRAND }));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('default');
    expect(res.body.role.title).toBe('Enrollment Specialist');
    expect(res.body.role.updated_at).toBeNull();
  });

  it('PUT stores the stripped value and keeps terminology intact', async () => {
    programRow.metadata = { terminology: { subject: 'learner', relationship: 'enrolment', pipeline: 'path' } };

    const res = await auth(
      request(app())
        .put(BRAND_ROLE)
        .query({ brand_id: BRAND })
        .send({ title: 'Enrollment <b>Specialist</b>', description: 'Reaches out.' })
    );

    expect(res.status).toBe(200);
    expect(res.body.role.title).toBe('Enrollment Specialist');
    const written = (programRow.update.mock.calls[0] as unknown as [{ metadata: Record<string, unknown> }])[0].metadata;
    expect(written.terminology).toEqual({ subject: 'learner', relationship: 'enrolment', pipeline: 'path' });
  });

  it('409, not 500, when the brand has no journey programme', async () => {
    models.programFindAll.mockResolvedValue([]);

    const res = await auth(
      request(app()).put(BRAND_ROLE).query({ brand_id: BRAND }).send({ title: 'x', description: 'y' })
    );

    // The brand exists and the caller may ask about it; what is missing is the
    // programme the role would be stored on. That is a state, not a bad request.
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('no_programme');
  });

  it('GET reads a programme-less brand as unset rather than refusing', async () => {
    models.programFindAll.mockResolvedValue([]);

    const res = await auth(request(app()).get(BRAND_ROLE).query({ brand_id: BRAND }));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('no_programme');
    expect(res.body.role).toBeNull();
  });
});

describe('failure handling', () => {
  it('500 with a classified error, and no learner identifier in the body', async () => {
    ex.summary.mockRejectedValue(new Error('explorer exploded'));

    const res = await auth(request(app()).get(`${EXPLORERS}/summary`).query({ brand_id: BRAND }));

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Journey read failed');
    expect(res.body.error_class).toBeTruthy();
    // The upstream message is logged, not returned.
    expect(JSON.stringify(res.body)).not.toContain('explorer exploded');
  });
});
