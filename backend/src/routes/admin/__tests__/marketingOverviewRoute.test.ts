/**
 * GET /api/admin/marketing/overview - the one request behind the Marketing landing page.
 *
 * The first test of any route in marketingRoutes.ts. What is pinned here is the contract the
 * page depends on: the auth gate, the validation gate, and above all the three scope modes -
 * because a scoped operator seeing another tenant's schedule, or a denied one seeing an error
 * page instead of an empty one, are the two ways this surface can quietly go wrong.
 */

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret', nodeEnv: 'test' } }));

// Everything the route file imports that would otherwise boot Sequelize.
jest.mock('../../../controllers/adminMarketingController', () => ({ handleGetCampaignMetrics: jest.fn() }));
jest.mock('../../../services/campaignLinkService', () => ({
  getChannelROIAggregation: jest.fn(), flagUnregisteredTraffic: jest.fn(),
}));
jest.mock('../../../services/marketing/needsAttentionService', () => ({ getNeedsAttentionQueue: jest.fn() }));

const mockOverview = jest.fn();
jest.mock('../../../services/marketing/overviewSummary', () => ({
  getMarketingOverview: (...a: unknown[]) => mockOverview(...a),
}));

const mockScope = jest.fn();
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({
  adminTenantScope: (...a: unknown[]) => mockScope(...a),
}));

import marketingRoutes from '../marketingRoutes';

const BRAND = '280162e1-3e36-434a-a23c-342545777e1b';
const token = () => jwt.sign(
  { sub: '7865c726-ea85-4ed3-bbd7-8413e334ecad', email: 'ali@colaberry.com', role: 'super_admin' },
  'test-secret',
);

function app() {
  const a = express();
  a.use(express.json());
  a.use(marketingRoutes);
  return a;
}

const SUMMARY = {
  upcoming: [], upcoming_truncated: false, accounts: [], handoff_providers: ['x'],
  recent: { published: 4, since: '2026-08-19T00:00:00.000Z', window_days: 30 },
};

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  mockOverview.mockReset().mockResolvedValue(SUMMARY);
  mockScope.mockReset().mockResolvedValue({ mode: 'migration_open' });
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => errorSpy.mockRestore());

const get = (qs = '') => request(app())
  .get(`/api/admin/marketing/overview${qs}`)
  .set('Authorization', `Bearer ${token()}`);

describe('the gates in front of the overview', () => {
  it('401s without a session, and never reaches the service', async () => {
    const res = await request(app()).get('/api/admin/marketing/overview');
    expect(res.status).toBe(401);
    expect(mockOverview).not.toHaveBeenCalled();
  });

  it('400s on a brand id that is not a uuid, before any query runs', async () => {
    const res = await get('?brand_id=not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('ValidationError');
    expect(mockOverview).not.toHaveBeenCalled();
  });
});

describe('scope', () => {
  it('an unscoped admin reads every tenant, filtered to the chosen brand', async () => {
    const res = await get(`?brand_id=${BRAND}`);
    expect(res.status).toBe(200);
    expect(mockOverview).toHaveBeenCalledWith({ tenantIds: null, brandId: BRAND });
    expect(res.body.recent.published).toBe(4);
    expect(res.body.scope_mode).toBe('migration_open');
  });

  it('a scoped admin reads only their tenants', async () => {
    mockScope.mockResolvedValue({ mode: 'scoped', tenantIds: ['t-1', 't-2'] });
    await get();
    expect(mockOverview).toHaveBeenCalledWith({ tenantIds: ['t-1', 't-2'], brandId: null });
  });

  it('a denied admin gets an EMPTY overview, not a 403 - and no query runs', async () => {
    // The page renders this as "nothing in your scope", which is true. A 403 would render as
    // an error, which suggests the Overview itself is broken.
    mockScope.mockResolvedValue({ mode: 'denied' });
    const res = await get();
    expect(res.status).toBe(200);
    expect(mockOverview).not.toHaveBeenCalled();
    expect(res.body.upcoming).toEqual([]);
    expect(res.body.accounts).toEqual([]);
    expect(res.body.handoff_providers).toEqual([]);
    expect(res.body.recent.published).toBe(0);
    expect(res.body.scope_mode).toBe('denied');
  });
});

describe('failure', () => {
  it('500s with a classified error, and logs it as structured JSON rather than swallowing it', async () => {
    mockOverview.mockRejectedValue(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    const res = await get();
    expect(res.status).toBe(500);
    expect(res.body.error_class).toBe('InternalError');
    // The database's message stays in the log, never in the response.
    expect(JSON.stringify(res.body)).not.toContain('connection reset');

    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.event).toBe('marketing_overview_failed');
    expect(logged.error_class).toBe('SequelizeConnectionError');
  });
});
