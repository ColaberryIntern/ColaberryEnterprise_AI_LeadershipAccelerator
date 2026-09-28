import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * T605 — the performance metrics route's access matrix.
 *
 * The contrast with T604's status registry is the point, and this suite mounts
 * BOTH routers to state it: the registry answers 200 with the master flag off,
 * because configuration is what an operator needs before deciding to flip
 * anything; these performance reads answer 404, because with the journey dark
 * there are no decisions, receipts or handoffs to report and a page of nulls
 * would be a worse answer than "not here yet".
 *
 * `requireAdmin`, both routers, the controller and the Zod schema are REAL;
 * only the models, the membership bridge and the metrics service are mocked.
 */

const growthJourney = { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false, journeyDecisions: false, journeyHandoffs: false, journeyExecution: false };
jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret', nodeEnv: 'test', growthJourney } }));
jest.mock('../../../services/aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../services/ledgerService', () => ({ logEvent: jest.fn().mockResolvedValue(undefined) }));

const m = { compute: jest.fn(), brands: jest.fn(), programs: jest.fn(), paths: jest.fn(), memberships: jest.fn(), agents: jest.fn() };
// Mocked WHOLLY, not with requireActual: the real service imports the handoff-rates query, which
// imports a model directly rather than through the barrel this suite mocks, and that constructs a
// real Sequelize at load. The bound below is restated here and pinned in the service's own suite.
const MAX_WINDOW_DAYS = 365;
jest.mock('../../../services/growthJourney/performance/journeyMetricsService', () => ({
  computeJourneyMetrics: (...a: unknown[]) => m.compute(...a),
  DEFAULT_WINDOW_DAYS: 30,
  MAX_WINDOW_DAYS: 365,
}));
// T606 added the by-journey handler to this controller, which imports the Marketing Ops roll-up;
// that module loads `config/database`, so it is mocked at its boundary like the metrics service.
jest.mock('../../../services/marketingAnalyticsService', () => ({ getCampaignMetricsByJourney: jest.fn().mockResolvedValue([]) }));
jest.mock('../../../services/growthJourney/performance/performanceReads', () => ({
  readReceipts: jest.fn().mockResolvedValue({ rows: [], total: 0, limit: 25, offset: 0 }),
  readOutcomes: jest.fn().mockResolvedValue({ rows: [], total: 0, limit: 25, offset: 0 }),
  readRates: jest.fn().mockResolvedValue({ brands: [], window_days: 30 }),
  MAX_PAGE: 100,
  DEFAULT_PAGE: 25,
}));
jest.mock('../../../models', () => ({
  Brand: { findAll: (...a: unknown[]) => m.brands(...a) },
  JourneyProgram: { findAll: (...a: unknown[]) => m.programs(...a) },
  JourneyPath: { findAll: (...a: unknown[]) => m.paths(...a) },
  TenantMembership: { count: (...a: unknown[]) => m.memberships(...a) },
  AiAgent: { findAll: (...a: unknown[]) => m.agents(...a) },
  GrowthJourneyDecision: { findAll: jest.fn() },
  GrowthJourneyExecution: { findAll: jest.fn() },
}));
const contextFromAdminRequest = jest.fn();
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({ contextFromAdminRequest: (...a: unknown[]) => contextFromAdminRequest(...a) }));
const recordAccessDecision = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../modules/tenancy/tenantAccessAudit', () => ({ recordAccessDecision: (...a: unknown[]) => recordAccessDecision(...a) }));

import growthJourneyReadRoutes from '../growthJourneyReadRoutes';
import growthJourneyStatusRoutes from '../growthJourneyStatusRoutes';
import { pathToSection } from '../../../middlewares/mgmtSectionGate';

const METRICS = '/api/admin/growth-journey/performance/metrics';
const REGISTRY = '/api/admin/growth-journey/status/registry';
const TENANT = '10000000-0000-4000-8000-000000000002';
const BRAND = '20000000-0000-4000-8000-000000000002';
const OTHER_BRAND = '20000000-0000-4000-8000-000000000009';
const PROGRAM = '30000000-0000-4000-8000-000000000001';

const token = (role = 'admin') => jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', role }, 'test-secret');
function app() {
  const a = express();
  a.use(express.json());
  a.use(growthJourneyStatusRoutes);
  a.use(growthJourneyReadRoutes);
  return a;
}
const auth = (r: request.Test, role = 'admin') => r.set('Authorization', `Bearer ${token(role)}`);
const memberOf = (brandId: string | null, authorized: string[] | null = null) => ({
  platformIdentityId: 'pid-1', tenantId: TENANT, brandId, organizationId: null, roles: ['tenant_admin'],
  isPlatformSuperAdmin: false, authorizedTenantIds: [TENANT], authorizedBrandIds: authorized,
});
const RESULT = { scope: { tenant_id: TENANT, brand_id: null, program_id: null, window_days: 30, from: 'x', to: 'y' }, computed_at: 'y', metrics: [] };

function setMaster(on: boolean): void {
  growthJourney.growthJourneyEnabled = on;
  if (on) process.env.GROWTH_JOURNEY_ENABLED = 'true';
  else delete process.env.GROWTH_JOURNEY_ENABLED;
}

beforeEach(() => {
  jest.clearAllMocks();
  setMaster(true);
  m.compute.mockResolvedValue(RESULT);
  m.brands.mockResolvedValue([]);
  m.programs.mockResolvedValue([]);
  m.paths.mockResolvedValue([]);
  m.memberships.mockResolvedValue(0);
  m.agents.mockResolvedValue([]);
  contextFromAdminRequest.mockResolvedValue(memberOf(null, [BRAND]));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  setMaster(false);
  // A read route: no audit row on a GET.
  expect(recordAccessDecision).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('the status matrix', () => {
  it('401 unauthenticated, before the service is asked', async () => {
    expect((await request(app()).get(METRICS)).status).toBe(401);
    expect(m.compute).not.toHaveBeenCalled();
  });

  it('403 for a scoped management role', async () => {
    expect((await auth(request(app()).get(METRICS), 'curriculum')).status).toBe(403);
    expect(m.compute).not.toHaveBeenCalled();
  });

  it('404 with the master flag OFF - and the status registry is 200 in the same app with the same token', async () => {
    setMaster(false);
    const a = app();
    expect((await auth(request(a).get(METRICS))).status).toBe(404);
    expect(m.compute).not.toHaveBeenCalled();
    expect((await auth(request(a).get(REGISTRY))).status).toBe(200);
  });

  it('200 for an admin with the flag on', async () => {
    const res = await auth(request(app()).get(METRICS));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(RESULT);
  });

  it('the guard is path-scoped: a route registered after this router is untouched', async () => {
    const a = express();
    a.use(growthJourneyReadRoutes);
    a.get('/public/thing', (_req, res) => { res.json({ ok: true }); });
    expect((await request(a).get('/public/thing')).status).toBe(200);
  });

  it('classifies as campaigns, like the rest of the journey surface', () => {
    expect(pathToSection(METRICS)).toBe('campaigns');
  });
});

describe('the scope comes from the memberships, never from the query', () => {
  it('passes the caller\'s authorized brands to the service', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(null, [BRAND, OTHER_BRAND]));
    await auth(request(app()).get(METRICS));
    expect(m.compute).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT, brandIds: [BRAND, OTHER_BRAND] }));
  });

  it('403 on a brand_id outside the caller\'s scope, before the service is asked', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(BRAND, [BRAND]));
    const res = await auth(request(app()).get(`${METRICS}?brand_id=${OTHER_BRAND}`));
    expect(res.status).toBe(403);
    expect(m.compute).not.toHaveBeenCalled();
  });

  it('narrows to a brand_id inside the scope', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(BRAND, [BRAND]));
    await auth(request(app()).get(`${METRICS}?brand_id=${BRAND}&program_id=${PROGRAM}`));
    expect(m.compute).toHaveBeenCalledWith(expect.objectContaining({ brandId: BRAND, programId: PROGRAM }));
  });

  it('an admin with no membership reads an empty scope, not an error', async () => {
    // Production today: `tenant_memberships` is empty, so this is every admin. Fail-closed.
    contextFromAdminRequest.mockResolvedValue({ platformIdentityId: null, tenantId: null, brandId: null, organizationId: null, roles: [], isPlatformSuperAdmin: false, authorizedTenantIds: [], authorizedBrandIds: null });
    const res = await auth(request(app()).get(METRICS));
    expect(res.status).toBe(200);
    expect(m.compute).toHaveBeenCalledWith(expect.objectContaining({ tenantId: '', brandIds: [] }));
  });
});

describe('the query is validated at the boundary', () => {
  it.each([
    ['brand_id=not-a-uuid'],
    ['program_id=12345'],
    ['window_days=0'],
    [`window_days=${MAX_WINDOW_DAYS + 1}`],
    ['window_days=abc'],
    ['window_days=1.5'],
  ])('400 on %s, before the service is asked', async (query) => {
    const res = await auth(request(app()).get(`${METRICS}?${query}`));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request');
    expect(m.compute).not.toHaveBeenCalled();
  });

  it('accepts a window inside the bound and passes it through', async () => {
    await auth(request(app()).get(`${METRICS}?window_days=90`));
    expect(m.compute).toHaveBeenCalledWith(expect.objectContaining({ windowDays: 90 }));
  });

  it('a service failure is a 500 with an error class and no detail', async () => {
    m.compute.mockRejectedValue(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    const res = await auth(request(app()).get(METRICS));
    expect(res.status).toBe(500);
    // T606 gave the five performance handlers ONE failure path, so the message is the shared one;
    // the per-route detail is the `event` in the log line, not the body a caller sees.
    expect(res.body).toEqual({ error: 'Journey performance read failed', error_class: 'SequelizeConnectionError' });
  });
});
