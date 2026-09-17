import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * T411 - `GET /api/admin/marketing/campaigns/by-journey`: the admin guard, the
 * query schema, and the brand rule the campaigns table already applies (a brand
 * outside the caller's scope reads as no such brand - 404, never 403, so a
 * brand id cannot be probed here either).
 *
 * The router, the guard and the controller are real; the analytics service, the
 * membership bridge and the Brand model are mocked at their boundaries.
 */

jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret', nodeEnv: 'test' } }));
const getCampaignMetricsByJourney = jest.fn();
const getCampaignMetrics = jest.fn().mockResolvedValue([]);
jest.mock('../../../services/marketingAnalyticsService', () => ({
  getCampaignMetrics: (...a: unknown[]) => getCampaignMetrics(...a),
  getCampaignMetricsByJourney: (...a: unknown[]) => getCampaignMetricsByJourney(...a),
  totalCampaignMetrics: () => ({ visitors: 0, leads: 0, engagement: 0, enrollments: 0 }),
}));
jest.mock('../../../services/marketing/campaignRanking', () => ({ resolveAllRankings: () => ({}) }));
jest.mock('../../../services/adminOs/metricRegistry', () => ({ getMetric: () => null, mayComputeWith: () => false }));
const brandFindByPk = jest.fn();
jest.mock('../../../models', () => ({ Brand: { findByPk: (...a: unknown[]) => brandFindByPk(...a) } }));
const adminTenantScope = jest.fn();
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({
  adminTenantScope: (...a: unknown[]) => adminTenantScope(...a),
  scopeAllows: (scope: { tenantIds: string[]; isSuperAdmin?: boolean }, tenantId: string) => Boolean(scope?.isSuperAdmin) || scope.tenantIds.includes(tenantId),
}));
jest.mock('../../../services/campaignLinkService', () => ({ getChannelROIAggregation: jest.fn(), flagUnregisteredTraffic: jest.fn() }));
jest.mock('../../../services/marketing/needsAttentionService', () => ({ getNeedsAttentionQueue: jest.fn() }));

import marketingRoutes from '../marketingRoutes';

const URL = '/api/admin/marketing/campaigns/by-journey';
const TENANT = { colaberry: '10000000-0000-4000-8000-000000000002', cpn: '10000000-0000-4000-8000-000000000001' };
const BRAND = '20000000-0000-4000-8000-000000000003';
const token = () => jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', role: 'admin' }, 'test-secret');
function app() { const a = express(); a.use(express.json()); a.use(marketingRoutes); return a; }
const get = (url: string) => request(app()).get(url).set('Authorization', `Bearer ${token()}`);

const ROW = {
  brand_id: BRAND, program_slug: 'business-growth', program_name: 'Business Growth', program_status: 'active',
  path_slug: 'workflow_automation', has_leads: true, leads_count: 8, classified_count: 8, campaigns_count: 3,
  emails_sent: 40, opens_count: 20, clicks_count: 10, replies_count: 4, meetings_count: 2, enrollments_count: 1,
  open_rate: 50, click_rate: 25, reply_rate: 10, conversion_rate: 12.5,
};
const EMPTY_PROGRAMME = { ...ROW, program_slug: 'flotation-projects', path_slug: null, has_leads: false, leads_count: null, open_rate: null, conversion_rate: null };

beforeEach(() => {
  getCampaignMetricsByJourney.mockReset().mockResolvedValue([ROW, EMPTY_PROGRAMME]);
  brandFindByPk.mockReset().mockResolvedValue({ id: BRAND, tenant_id: TENANT.colaberry });
  adminTenantScope.mockReset().mockResolvedValue({ tenantIds: [TENANT.colaberry] });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it('401 without a token, and the service is never called', async () => {
  expect((await request(app()).get(URL)).status).toBe(401);
  expect(getCampaignMetricsByJourney).not.toHaveBeenCalled();
});

it('200: the rows and the scope it answered for, with the null row intact', async () => {
  const res = await get(`${URL}?start=2026-09-01&end=2026-09-30&brand_id=${BRAND}`);
  expect(res.status).toBe(200);
  expect(getCampaignMetricsByJourney).toHaveBeenCalledWith({ start: '2026-09-01', end: '2026-09-30', brandId: BRAND });
  expect(res.body.scope).toEqual({ start: '2026-09-01', end: '2026-09-30', brand_id: BRAND });
  expect(res.body.journeys).toHaveLength(2);
  expect(res.body.journeys[1]).toMatchObject({ program_slug: 'flotation-projects', has_leads: false, leads_count: null, open_rate: null });
  expect(res.text).not.toContain('@');
});

it('200 with no scope at all: every programme the caller may see', async () => {
  const res = await get(URL);
  expect(res.status).toBe(200);
  expect(getCampaignMetricsByJourney).toHaveBeenCalledWith({ start: undefined, end: undefined, brandId: undefined });
  expect(res.body.scope).toEqual({ start: null, end: null, brand_id: null });
  expect(brandFindByPk).not.toHaveBeenCalled();
});

it('400 for a malformed date, a malformed brand id, or an unknown parameter - the schema is strict', async () => {
  expect((await get(`${URL}?start=2026-9-1`)).status).toBe(400);
  expect((await get(`${URL}?brand_id=not-a-uuid`)).status).toBe(400);
  expect((await get(`${URL}?programSlug=business-growth`)).status).toBe(400);
  expect(getCampaignMetricsByJourney).not.toHaveBeenCalled();
});

it("404 - never 403 - for a brand in another tenant, and for a brand that does not exist: the two are byte-identical", async () => {
  brandFindByPk.mockResolvedValue({ id: BRAND, tenant_id: TENANT.cpn });
  const foreign = await get(`${URL}?brand_id=${BRAND}`);
  brandFindByPk.mockResolvedValue(null);
  const missing = await get(`${URL}?brand_id=${BRAND}`);
  expect(foreign.status).toBe(404);
  expect(missing.status).toBe(404);
  expect(foreign.text).toBe(missing.text);
  expect(getCampaignMetricsByJourney).not.toHaveBeenCalled();
});

it('500 with an error class and no leaked message when the query fails', async () => {
  getCampaignMetricsByJourney.mockRejectedValue(Object.assign(new Error('relation "journey_programs" does not exist'), { name: 'SequelizeDatabaseError' }));
  const res = await get(URL);
  expect(res.status).toBe(500);
  expect(res.body).toEqual({ error: 'Failed to load journey metrics', error_class: 'InternalError' });
  expect(res.text).not.toContain('journey_programs');
});
