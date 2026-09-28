import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * T606 — the five performance routes' access matrix, and the privacy property.
 *
 * The suite that matters most here is the last describe: an adversarial
 * `status_reason` and an adversarial outcome `metadata`, both carrying
 * addresses, going through the REAL services (only the models are mocked) and
 * out through the REAL controllers - and no `@` in the response. That is the
 * plan's privacy acceptance, asserted end to end rather than at the projection.
 *
 * `requireAdmin`, the router, the controllers, the Zod schemas and the two read
 * services are REAL; the models, the membership bridge, Phase 4's rates query
 * and the Marketing Ops roll-up are mocked.
 */

const growthJourney = { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false, journeyDecisions: false, journeyHandoffs: false, journeyExecution: false };
jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret', nodeEnv: 'test', growthJourney } }));
jest.mock('../../../services/aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../services/ledgerService', () => ({ logEvent: jest.fn().mockResolvedValue(undefined) }));

const m = { receipts: jest.fn(), outcomes: jest.fn(), rates: jest.fn(), byJourney: jest.fn(), decisions: jest.fn(), executions: jest.fn(), handoffs: jest.fn(), handoffCount: jest.fn(), agents: jest.fn() };
jest.mock('../../../models', () => ({
  GrowthJourneyExecution: { findAndCountAll: (...a: unknown[]) => m.receipts(...a), findAll: (...a: unknown[]) => m.executions(...a) },
  GrowthJourneyOutcome: { findAndCountAll: (...a: unknown[]) => m.outcomes(...a) },
  GrowthJourneyDecision: { findAll: (...a: unknown[]) => m.decisions(...a) },
  GrowthJourneyHandoff: { findAll: (...a: unknown[]) => m.handoffs(...a), count: (...a: unknown[]) => m.handoffCount(...a) },
  AiAgent: { findAll: (...a: unknown[]) => m.agents(...a) },
}));
jest.mock('../../../services/growthJourney/outcomes/handoffRatesQuery', () => ({
  loadHandoffRates: (...a: unknown[]) => m.rates(...a),
  DEFAULT_RATES_WINDOW_DAYS: 30,
}));
jest.mock('../../../services/marketingAnalyticsService', () => ({ getCampaignMetricsByJourney: (...a: unknown[]) => m.byJourney(...a) }));
const contextFromAdminRequest = jest.fn();
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({ contextFromAdminRequest: (...a: unknown[]) => contextFromAdminRequest(...a) }));
const recordAccessDecision = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../modules/tenancy/tenantAccessAudit', () => ({ recordAccessDecision: (...a: unknown[]) => recordAccessDecision(...a) }));

import growthJourneyReadRoutes from '../growthJourneyReadRoutes';
import { PERFORMANCE_MAX_LIMIT, PERFORMANCE_MAX_WINDOW_DAYS } from '../../../schemas/growthJourneySchema';

const BASE = '/api/admin/growth-journey/performance';
const ROUTES = ['metrics', 'rates', 'receipts', 'outcomes', 'by-journey'] as const;
const TENANT = '10000000-0000-4000-8000-000000000002';
const BRAND = '20000000-0000-4000-8000-000000000002';
const OTHER_BRAND = '20000000-0000-4000-8000-000000000009';

const token = (role = 'admin') => jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', role }, 'test-secret');
const app = () => express().use(express.json()).use(growthJourneyReadRoutes);
const auth = (r: request.Test, role = 'admin') => r.set('Authorization', `Bearer ${token(role)}`);
const memberOf = (brandId: string | null, authorized: string[] | null = null) => ({
  platformIdentityId: 'pid-1', tenantId: TENANT, brandId, organizationId: null, roles: ['tenant_admin'],
  isPlatformSuperAdmin: false, authorizedTenantIds: [TENANT], authorizedBrandIds: authorized,
});

function setMaster(on: boolean): void {
  growthJourney.growthJourneyEnabled = on;
  if (on) process.env.GROWTH_JOURNEY_ENABLED = 'true';
  else delete process.env.GROWTH_JOURNEY_ENABLED;
}

const receiptRow = (over: Record<string, unknown> = {}) => {
  const values: Record<string, unknown> = {
    id: 'e1', brand_id: BRAND, program_id: null, channel: 'email', action_type: 'SEND_EMAIL',
    status: 'failed', status_reason: 'sent', campaign_key: null,
    created_at: new Date('2026-09-28T10:00:00Z'), updated_at: new Date('2026-09-28T11:00:00Z'), ...over,
  };
  return { get: (k: string) => values[k] };
};
/**
 * Phase 4's whole result shape: the `/metrics` route runs the REAL journeyMetricsService, which
 * reads the rate numerators off it, so a thin stub would 500 rather than test anything.
 */
const zeroRate = () => ({ value: null, numerator: 0, denominator: 0, reason: 'no_denominator' as const });
const ratesResult = (over: Record<string, unknown> = {}) => ({
  all: {
    brand_id: BRAND, owner_queue: 'all', window: { from: 'x', to: 'y' }, handoffs: 0, accepted: 0, verdicts: 0,
    acceptance_rate: zeroRate(), expiry_rate: zeroRate(), connection_rate: zeroRate(), meeting_rate: zeroRate(),
    qualification_rate: zeroRate(), proposal_rate: zeroRate(), conversion_rate: zeroRate(), false_positive_handoff_rate: zeroRate(),
    time_to_accept_hours: { value: null, samples: 0 }, time_to_disposition_hours: { value: null, samples: 0 },
    time_to_first_connection_hours: { value: null, samples: 0 },
    ...over,
  },
  by_queue: {},
});

const outcomeRow = (over: Record<string, unknown> = {}) => {
  const values: Record<string, unknown> = {
    id: 'o1', brand_id: BRAND, subject_ref: 'lead:123', outcome_type: 'reply', source: 'interaction_outcomes',
    occurred_at: new Date('2026-09-28T09:00:00Z'), handoff_id: null, decision_id: null, ...over,
  };
  return { get: (k: string) => values[k] };
};

beforeEach(() => {
  jest.clearAllMocks();
  setMaster(true);
  m.receipts.mockResolvedValue({ rows: [], count: 0 });
  m.outcomes.mockResolvedValue({ rows: [], count: 0 });
  m.rates.mockResolvedValue(ratesResult());
  m.byJourney.mockResolvedValue([]);
  m.decisions.mockResolvedValue([]);
  m.executions.mockResolvedValue([]);
  m.handoffs.mockResolvedValue([]);
  m.handoffCount.mockResolvedValue(0);
  m.agents.mockResolvedValue([]);
  contextFromAdminRequest.mockResolvedValue(memberOf(null, [BRAND]));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  setMaster(false);
  expect(recordAccessDecision).not.toHaveBeenCalled(); // a GET is never audited
  jest.restoreAllMocks();
});

describe('the status matrix, on all five routes', () => {
  it.each(ROUTES)('401 unauthenticated: %s', async (route) => {
    expect((await request(app()).get(`${BASE}/${route}`)).status).toBe(401);
    expect(contextFromAdminRequest).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('403 for a scoped management role: %s', async (route) => {
    expect((await auth(request(app()).get(`${BASE}/${route}`), 'curriculum')).status).toBe(403);
    expect(contextFromAdminRequest).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('404 with the master flag off, before anything is read: %s', async (route) => {
    setMaster(false);
    expect((await auth(request(app()).get(`${BASE}/${route}`))).status).toBe(404);
    expect(contextFromAdminRequest).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('200 for an admin: %s', async (route) => {
    expect((await auth(request(app()).get(`${BASE}/${route}`))).status).toBe(200);
  });

  it.each(ROUTES)('403 on a brand outside the caller\'s scope, before any read: %s', async (route) => {
    contextFromAdminRequest.mockResolvedValue(memberOf(BRAND, [BRAND]));
    const res = await auth(request(app()).get(`${BASE}/${route}?brand_id=${OTHER_BRAND}`));
    expect(res.status).toBe(403);
    expect(m.receipts).not.toHaveBeenCalled();
    expect(m.outcomes).not.toHaveBeenCalled();
    expect(m.byJourney).not.toHaveBeenCalled();
  });

  it('an admin with no membership gets an empty page, not an error', async () => {
    // Production today: `tenant_memberships` is empty, so this is every admin. Fail-closed.
    contextFromAdminRequest.mockResolvedValue({ platformIdentityId: null, tenantId: null, brandId: null, organizationId: null, roles: [], isPlatformSuperAdmin: false, authorizedTenantIds: [], authorizedBrandIds: null });
    const receipts = await auth(request(app()).get(`${BASE}/receipts`));
    expect(receipts.status).toBe(200);
    expect(receipts.body).toMatchObject({ rows: [], total: 0 });
    const byJourney = await auth(request(app()).get(`${BASE}/by-journey`));
    expect(byJourney.body).toMatchObject({ journeys: [] });
    expect(m.receipts).not.toHaveBeenCalled();
    expect(m.byJourney).not.toHaveBeenCalled();
  });
});

describe('the query is validated at the boundary', () => {
  it.each([
    ['receipts?limit=0'],
    [`receipts?limit=${PERFORMANCE_MAX_LIMIT + 1}`],
    ['receipts?limit=abc'],
    ['receipts?offset=-1'],
    ['receipts?status=not_a_status'],
    ['receipts?channel=carrier_pigeon'],
    ['outcomes?outcome_type=invented'],
    ['outcomes?source=some_table'],
    [`rates?window_days=${PERFORMANCE_MAX_WINDOW_DAYS + 1}`],
    ['rates?window_days=0'],
    ['by-journey?start=28-09-2026'],
    ['receipts?brand_id=not-a-uuid'],
  ])('400 on %s, before anything is read', async (query) => {
    const res = await auth(request(app()).get(`${BASE}/${query}`));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request');
    expect(m.receipts).not.toHaveBeenCalled();
    expect(m.outcomes).not.toHaveBeenCalled();
    expect(m.rates).not.toHaveBeenCalled();
  });

  it('accepts the bounds themselves and passes them through', async () => {
    await auth(request(app()).get(`${BASE}/receipts?limit=${PERFORMANCE_MAX_LIMIT}&offset=50&status=blocked&channel=in_app`));
    const [query] = m.receipts.mock.calls[0] as [{ limit: number; offset: number; where: Record<string, unknown> }];
    expect(query).toMatchObject({ limit: PERFORMANCE_MAX_LIMIT, offset: 50 });
    expect(query.where).toMatchObject({ status: 'blocked', channel: 'in_app' });
  });

  it('the metrics route runs the real registry service and answers with its shape', async () => {
    // Not a stub: `/metrics` is T605's service, real here, over the mocked models. Its presence in
    // this suite is what proves the five routes share one guard, one scope and one failure path.
    const res = await auth(request(app()).get(`${BASE}/metrics`));
    expect(res.status).toBe(200);
    expect(res.body.metrics.length).toBeGreaterThanOrEqual(10);
    expect(res.body.scope).toMatchObject({ tenant_id: TENANT, window_days: 30 });
  });

  it('a brand with more handoffs than the cap is refused with its reason, and Phase 4\'s row read is not reached', async () => {
    m.handoffCount.mockResolvedValue(5_001);
    const res = await auth(request(app()).get(`${BASE}/rates?window_days=365`));
    expect(res.status).toBe(200);
    expect(res.body.brands[0]).toMatchObject({ capped: true, reason: 'window_too_large', handoffs_in_window: 5_001, rates: null });
    expect(m.rates).not.toHaveBeenCalled();
  });

  it('the rates window defaults to 30 days and honours a smaller one', async () => {
    await auth(request(app()).get(`${BASE}/rates`));
    expect(m.rates).toHaveBeenCalledWith(expect.objectContaining({ windowDays: 30 }));
    m.rates.mockClear();
    await auth(request(app()).get(`${BASE}/rates?window_days=7`));
    expect(m.rates).toHaveBeenCalledWith(expect.objectContaining({ windowDays: 7 }));
  });
});

describe('the by-journey roll-up is the Marketing Ops service, brand-scoped', () => {
  it('calls the ONE existing service and filters its rows to the caller\'s brands', async () => {
    m.byJourney.mockResolvedValue([
      { brand_id: BRAND, program_slug: 'learner', leads_count: 4 },
      { brand_id: OTHER_BRAND, program_slug: 'business-growth', leads_count: 99 },
    ]);
    const res = await auth(request(app()).get(`${BASE}/by-journey?start=2026-09-01&end=2026-09-28`));
    expect(res.status).toBe(200);
    expect(m.byJourney).toHaveBeenCalledWith({ start: '2026-09-01', end: '2026-09-28', brandId: undefined });
    // The other brand's row is dropped even though the service returned it: the caller holds one brand.
    expect(res.body.journeys).toEqual([{ brand_id: BRAND, program_slug: 'learner', leads_count: 4 }]);
    expect(JSON.stringify(res.body)).not.toContain('99');
  });

  it('reports the scope it used', async () => {
    const res = await auth(request(app()).get(`${BASE}/by-journey`));
    expect(res.body.scope).toEqual({ tenant_id: TENANT, brand_id: null, program_id: null, start: null, end: null });
  });
});

describe('the privacy property, end to end through the real services', () => {
  it('an adversarial status_reason carrying an address comes back redacted, and the response holds no @', async () => {
    m.receipts.mockResolvedValue({ rows: [receiptRow({ status_reason: 'bounce: 550 5.1.1 unknown mailbox ali@colaberry.com (see postmaster@colaberry.com)' })], count: 1 });
    const res = await auth(request(app()).get(`${BASE}/receipts`));
    expect(res.status).toBe(200);
    expect(res.body.rows[0]).toMatchObject({ status_reason: 'redacted', status_reason_redacted: true });
    expect(JSON.stringify(res.body)).not.toContain('@');
  });

  it('an outcome whose metadata carries a reply\'s words never has them projected', async () => {
    m.outcomes.mockResolvedValue({
      rows: [outcomeRow({ metadata: { reply_body: 'reach me on ali@colaberry.com', quoted: 'sent from my iPhone' }, value: 'ali@colaberry.com' })],
      count: 1,
    });
    const res = await auth(request(app()).get(`${BASE}/outcomes`));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.rows[0]).sort()).toEqual(['brand_id', 'decision_id', 'handoff_id', 'id', 'occurred_at', 'outcome_type', 'source', 'subject_ref']);
    expect(JSON.stringify(res.body)).not.toContain('@');
    expect(JSON.stringify(res.body)).not.toContain('iPhone');
  });

  it('and a subject_ref IS shown, because it is a pointer rather than an address', async () => {
    m.outcomes.mockResolvedValue({ rows: [outcomeRow()], count: 1 });
    const res = await auth(request(app()).get(`${BASE}/outcomes`));
    expect(res.body.rows[0].subject_ref).toBe('lead:123');
  });

  it('a read failure is a 500 with an error class and no detail', async () => {
    m.receipts.mockRejectedValue(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    const res = await auth(request(app()).get(`${BASE}/receipts`));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Journey performance read failed', error_class: 'SequelizeConnectionError' });
  });
});
