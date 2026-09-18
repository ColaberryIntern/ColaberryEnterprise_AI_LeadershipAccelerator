import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * T411 - the graph route carries the journey terms into the service.
 *
 * No new route: `/api/admin/campaign-intelligence/graph` gains three scope
 * terms on the query it already parses. The router, the guard and the parser
 * are real; the graph service is mocked at its boundary, because what this
 * suite is about is the wiring - the terms reaching `getCampaignGraphData`, and
 * a malformed one refused before it does.
 */

jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret', nodeEnv: 'test' } }));
// The graph service is required for real below (its `parseGraphScope` is what this suite exercises), so the
// model layer it imports at load is stubbed: CI runs with no DATABASE_URL and this is a test about wiring.
jest.mock('../../../config/database', () => {
  const { Sequelize } = jest.requireActual('sequelize');
  const sequelize = new Sequelize('postgres://never:never@127.0.0.1:1/never', { logging: false });
  sequelize.query = jest.fn();
  return { sequelize };
});
jest.mock('../../../models', () => ({
  Lead: {}, Campaign: {}, CampaignLead: {}, CommunicationLog: {}, Enrollment: {}, StrategyCall: {},
  ChatConversation: {}, CallContactLog: {}, Brand: {}, GrowthJourneyClassification: {}, GrowthJourneyProfile: {},
}));
jest.mock('../../../models/Visitor', () => ({ __esModule: true, default: {} }));
jest.mock('../../../models/AlumniReferralProfile', () => ({ __esModule: true, default: {} }));
const getCampaignGraphData = jest.fn();
jest.mock('../../../services/reporting/campaignGraphService', () => ({
  ...jest.requireActual('../../../services/reporting/campaignGraphService'),
  getCampaignGraphData: (...a: unknown[]) => getCampaignGraphData(...a),
  getNodeUsers: jest.fn(),
  getEdgeUsers: jest.fn(),
  getSlicedGraphData: jest.fn(),
  getCachedLeadPaths: jest.fn(() => null),
}));
jest.mock('../../../services/campaignKnowledgeService', () => ({ harvestInsights: jest.fn(), getRelevantInsights: jest.fn(), getKnowledgeSummary: jest.fn() }));
jest.mock('../../../services/campaignOptimizationService', () => ({ generateOptimizations: jest.fn() }));
jest.mock('../../../services/campaignStrategyService', () => ({ recommendCampaignsForLead: jest.fn(), recommendLeadsForCampaign: jest.fn() }));
jest.mock('../../../services/aiMessageService', () => ({ scoreMessageEffectiveness: jest.fn() }));
jest.mock('../../../services/revenueDashboardService', () => ({ calculateMultiTouchAttribution: jest.fn() }));
jest.mock('../../../services/campaignBuilderService', () => ({ parseNaturalLanguageCampaign: jest.fn() }));
jest.mock('../../../services/testing/testLeadGenerator', () => ({ getPersonaArchetypes: jest.fn() }));

import campaignIntelligenceRoutes from '../campaignIntelligenceRoutes';

const URL = '/api/admin/campaign-intelligence/graph';
const token = () => jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', role: 'admin' }, 'test-secret');
function app() { const a = express(); a.use(express.json()); a.use(campaignIntelligenceRoutes); return a; }
const get = (url: string) => request(app()).get(url).set('Authorization', `Bearer ${token()}`);

beforeEach(() => {
  getCampaignGraphData.mockReset().mockResolvedValue({ nodes: [], edges: [], time_window: 'all', brand_filter: null, brands: [] });
});

it('401 without a token, and the graph is never built', async () => {
  expect((await request(app()).get(URL)).status).toBe(401);
  expect(getCampaignGraphData).not.toHaveBeenCalled();
});

it('the journey terms reach the service as the fourth argument, beside the window, brand and campaign', async () => {
  const CAMPAIGN = 'c0000000-0000-4000-8000-000000000001';
  const BRAND = '20000000-0000-4000-8000-000000000003';
  const res = await get(`${URL}?timeWindow=30d&brandId=${BRAND}&campaignId=${CAMPAIGN}&programSlug=business-growth&pathSlug=workflow_automation&state=EXPLORING_SOLUTIONS`);
  expect(res.status).toBe(200);
  expect(getCampaignGraphData).toHaveBeenCalledWith('30d', BRAND, CAMPAIGN, {
    programSlug: 'business-growth', pathSlug: 'workflow_automation', state: 'EXPLORING_SOLUTIONS',
  });
});

it('one term alone is a filter; no term is an empty object - the unfiltered graph, exactly as before', async () => {
  await get(`${URL}?programSlug=cpn-scholars`);
  expect(getCampaignGraphData).toHaveBeenLastCalledWith(undefined, undefined, undefined, { programSlug: 'cpn-scholars' });
  await get(URL);
  expect(getCampaignGraphData).toHaveBeenLastCalledWith(undefined, undefined, undefined, {});
});

it('a malformed journey term is a 400 with the error class, and the graph is never built', async () => {
  const res = await get(`${URL}?state=${encodeURIComponent('not a state')}`);
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'state must be a slug', error_class: 'ValidationError' });
  expect(getCampaignGraphData).not.toHaveBeenCalled();
});
