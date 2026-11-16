/**
 * AI Service Gap Detector routes: auth, fail-closed tenant scope (503), validation, status codes, actor stamping,
 * rate limit, the one-running-batch 409, and that no route reaches a mutating service module.
 */
import fs from 'fs';
import path from 'path';

jest.mock('../../../middlewares/authMiddleware', () => ({
  requireSection: () => (req: { headers: Record<string, string>; admin?: unknown }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    if (!req.headers.authorization) { res.status(401).json({ error: 'Authentication required' }); return; }
    req.admin = { email: 'admin@example.test' };
    next();
  },
}));
const lookupGovContractsContainer = jest.fn();
jest.mock('../../../scripts/lib/factoryDemoContainer', () => ({ lookupGovContractsContainer: () => lookupGovContractsContainer() }));
const analyze = jest.fn(); const latest = jest.fn(); const review = jest.fn();
jest.mock('../../../services/factory/serviceGap/serviceGapAnalysis', () => {
  const actual = jest.requireActual('../../../services/factory/serviceGap/serviceGapAnalysis');
  return { ...actual, analyzeCaseStudy: (...a: unknown[]) => analyze(...a), latestAnalyses: (...a: unknown[]) => latest(...a), reviewAnalysis: (...a: unknown[]) => review(...a) };
});
const startRun = jest.fn(); const processRun = jest.fn(); const latestRun = jest.fn();
jest.mock('../../../services/factory/serviceGap/serviceGapBatch', () => ({
  startRun: (...a: unknown[]) => startRun(...a), processRun: (...a: unknown[]) => processRun(...a), latestRun: (...a: unknown[]) => latestRun(...a),
}));
const loadEvidence = jest.fn(); const loadCatalog = jest.fn();
jest.mock('../../../services/factory/serviceGap/serviceGapLoader', () => ({ loadEvidence: (...a: unknown[]) => loadEvidence(...a), loadCatalog: (...a: unknown[]) => loadCatalog(...a) }));
const buildOpportunities = jest.fn();
jest.mock('../../../services/factory/serviceGap/serviceGapOpportunities', () => ({ buildOpportunities: (...a: unknown[]) => buildOpportunities(...a) }));
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../services/openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));

import express from 'express';
import request from 'supertest';
import routes, { ANALYZE_LIMIT, __resetAnalyzeLimit } from '../serviceGapRoutes';
import { GapReviewNotFound } from '../../../services/factory/serviceGap/serviceGapAnalysis';
import { ev } from '../../../services/factory/serviceGap/__tests__/serviceGapFixtures';

const app = express();
app.use(express.json());
app.use(routes);
const CS = '11111111-1111-4111-a111-111111111111';
const AID = '22222222-2222-4222-a222-222222222222';
const AUTH = { Authorization: 'Bearer t' };
const analyzeUrl = `/api/admin/factory/case-studies/${CS}/service-gap-analysis`;

let err: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  __resetAnalyzeLimit();
  err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  lookupGovContractsContainer.mockResolvedValue({ tenant: { id: 't1' } });
  loadEvidence.mockResolvedValue(new Map([[CS, ev({ id: CS })]]));
  loadCatalog.mockResolvedValue([]);
});
afterEach(() => err.mockRestore());

describe('auth and tenant scope', () => {
  it('401s without a session on every route', async () => {
    for (const [m, u] of [['get', '/api/admin/factory/service-gap-opportunities'], ['post', analyzeUrl], ['post', '/api/admin/factory/service-gap-analysis/batch'], ['post', `/api/admin/factory/service-gap-analyses/${AID}/review`]] as const) {
      expect((await request(app)[m](u)).status).toBe(401);
    }
  });

  it('503s (fails closed) when the gov workspace cannot be resolved, and never analyzes', async () => {
    lookupGovContractsContainer.mockResolvedValue(null);
    expect((await request(app).post(analyzeUrl).set(AUTH).send({})).status).toBe(503);
    lookupGovContractsContainer.mockRejectedValue(new Error('db down'));
    expect((await request(app).get('/api/admin/factory/service-gap-opportunities').set(AUTH)).status).toBe(503);
    expect(analyze).not.toHaveBeenCalled();
    expect(buildOpportunities).not.toHaveBeenCalled();
  });
});

describe('POST analyze', () => {
  it('analyzes for this tenant and admin, passing force through', async () => {
    analyze.mockResolvedValue({ view: { id: AID }, reused: false });
    const res = await request(app).post(analyzeUrl).set(AUTH).send({ force: true });
    expect(res.status).toBe(200);
    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', actor: 'admin@example.test', force: true }));
  });

  it('400s a bad id and unknown body fields (cannot smuggle a decision or a tenant)', async () => {
    expect((await request(app).post('/api/admin/factory/case-studies/nope/service-gap-analysis').set(AUTH).send({})).status).toBe(400);
    expect((await request(app).post(analyzeUrl).set(AUTH).send({ decision: 'PROPOSE_NEW' })).status).toBe(400);
    expect((await request(app).post(analyzeUrl).set(AUTH).send({ tenantId: 'x' })).status).toBe(400);
  });

  it('404s an unknown or archived case study', async () => {
    loadEvidence.mockResolvedValue(new Map());
    expect((await request(app).post(analyzeUrl).set(AUTH).send({})).status).toBe(404);
  });

  it('429s past the per-admin limit', async () => {
    analyze.mockResolvedValue({ view: { id: AID }, reused: true });
    for (let i = 0; i < ANALYZE_LIMIT.max; i += 1) expect((await request(app).post(analyzeUrl).set(AUTH).send({})).status).toBe(200);
    expect((await request(app).post(analyzeUrl).set(AUTH).send({})).status).toBe(429);
  });

  it('500s with a sentence that says manual linking still works', async () => {
    analyze.mockRejectedValue(new Error('boom'));
    const res = await request(app).post(analyzeUrl).set(AUTH).send({});
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Manual linking still works/);
  });
});

describe('batch', () => {
  it('202s and starts processing in the background', async () => {
    startRun.mockResolvedValue({ run: { id: 'r1', status: 'running' }, started: true, caseStudyIds: [CS] });
    processRun.mockResolvedValue(undefined);
    const res = await request(app).post('/api/admin/factory/service-gap-analysis/batch').set(AUTH);
    expect(res.status).toBe(202);
    expect(processRun).toHaveBeenCalledWith(expect.objectContaining({ runId: 'r1', tenantId: 't1', caseStudyIds: [CS] }));
  });

  it('409s when a run is already in progress, and does not start another', async () => {
    startRun.mockResolvedValue({ run: { id: 'r0', status: 'running' }, started: false, caseStudyIds: [] });
    const res = await request(app).post('/api/admin/factory/service-gap-analysis/batch').set(AUTH);
    expect(res.status).toBe(409);
    expect(res.body.run.id).toBe('r0');
    expect(processRun).not.toHaveBeenCalled();
  });
});

describe('review', () => {
  it('records accepted/dismissed with the acting admin; rejects other states', async () => {
    review.mockResolvedValue({ id: AID, reviewState: 'dismissed' });
    const ok = await request(app).post(`/api/admin/factory/service-gap-analyses/${AID}/review`).set(AUTH).send({ state: 'dismissed', note: 'Not a new service' });
    expect(ok.status).toBe(200);
    expect(review).toHaveBeenCalledWith({ tenantId: 't1', id: AID, state: 'dismissed', note: 'Not a new service', actor: 'admin@example.test' });
    expect((await request(app).post(`/api/admin/factory/service-gap-analyses/${AID}/review`).set(AUTH).send({ state: 'confirmed' })).status).toBe(400);
  });

  it('404s an analysis from another tenant (or none)', async () => {
    review.mockRejectedValue(new GapReviewNotFound());
    expect((await request(app).post(`/api/admin/factory/service-gap-analyses/${AID}/review`).set(AUTH).send({ state: 'accepted' })).status).toBe(404);
  });
});

it('the route module imports no mutating service (advisory only)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'serviceGapRoutes.ts'), 'utf8');
  const imports = src.split(/\r?\n/).filter((l) => l.startsWith('import ')).join(' ');
  expect(imports).toMatch(/serviceGap/);
  expect(imports).not.toMatch(/serviceProposal|serviceCatalog|caseStudyServiceLinkStore|decideLink|promote/);
});
