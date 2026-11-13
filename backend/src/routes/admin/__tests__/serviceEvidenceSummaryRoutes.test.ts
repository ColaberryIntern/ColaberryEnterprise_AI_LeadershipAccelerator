/**
 * GET /api/admin/factory/services/evidence-summary: auth, query validation, tenant scope, the response contract at
 * the boundary, and that internals never leak. The service is mocked; its logic is covered by its own suites.
 */
import fs from 'fs';
import path from 'path';

jest.mock('../../../middlewares/authMiddleware', () => ({
  requireSection: (section: string) => (req: { headers: Record<string, string>; admin?: unknown }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    if (section !== 'program') { res.status(500).json({ error: `unexpected section ${section}` }); return; }
    if (!req.headers.authorization) { res.status(401).json({ error: 'Authentication required' }); return; }
    req.admin = { email: 'ali@colaberry.com' };
    next();
  },
}));
const lookupGovContractsContainer = jest.fn();
jest.mock('../../../scripts/lib/factoryDemoContainer', () => ({ lookupGovContractsContainer: () => lookupGovContractsContainer() }));
const getSummary = jest.fn();
jest.mock('../../../services/factory/serviceEvidenceSummary', () => ({ getServiceEvidenceSummary: (...a: unknown[]) => getSummary(...a) }));

import express from 'express';
import request from 'supertest';
import routes from '../serviceEvidenceSummaryRoutes';

const app = express();
app.use(routes);
const URL = '/api/admin/factory/services/evidence-summary';
const AUTH = { Authorization: 'Bearer t' };

const validSummary = (status = 'active') => ({
  status, generatedAt: '2026-11-13T00:00:00.000Z', services: [], intake: [],
  industryMatrix: { industries: [], cells: [] }, growthSeries: [],
  decideNow: { blockedCaseStudies: { count: 0, ids: [] }, demandWithoutProof: { count: null, ids: [] }, staleServices: { count: 0, ids: [] }, openFitGaps: { count: null, items: [] } },
  opportunityFeed: { source: 'unavailable', openCount: null },
});

let errSpy: jest.SpyInstance; let logSpy: jest.SpyInstance;
const ENV = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  lookupGovContractsContainer.mockResolvedValue({ tenant: { id: 't1' } });
  getSummary.mockImplementation(async ({ status }: { status: string }) => validSummary(status));
});
afterEach(() => { errSpy.mockRestore(); logSpy.mockRestore(); process.env = { ...ENV }; });

describe('GET evidence-summary', () => {
  it('401s without auth and never reads anything', async () => {
    const res = await request(app).get(URL);
    expect(res.status).toBe(401);
    expect(lookupGovContractsContainer).not.toHaveBeenCalled();
    expect(getSummary).not.toHaveBeenCalled();
  });

  it('200s with the summary, scoped to the resolved tenant; status defaults to active', async () => {
    const res = await request(app).get(URL).set(AUTH);
    expect(res.status).toBe(200);
    expect(getSummary).toHaveBeenCalledWith({ tenantId: 't1', status: 'active' });
    expect(res.body).toEqual(validSummary('active'));
  });

  it('passes growth and all through, and ignores any tenant the caller tries to send', async () => {
    for (const status of ['growth', 'all']) {
      const res = await request(app).get(`${URL}?status=${status}&tenantId=HACK`).set(AUTH);
      expect(res.status).toBe(200);
      expect(getSummary).toHaveBeenLastCalledWith({ tenantId: 't1', status });
    }
  });

  it('400s a bad status before resolving anything', async () => {
    for (const q of ['?status=retired', '?status=bogus', '?status[]=all']) {
      expect((await request(app).get(URL + q).set(AUTH)).status).toBe(400);
    }
    expect(getSummary).not.toHaveBeenCalled();
  });

  it('503s when the workspace cannot be resolved (null or a throw), never reading across tenants', async () => {
    lookupGovContractsContainer.mockResolvedValueOnce(null);
    expect((await request(app).get(URL).set(AUTH)).status).toBe(503);
    lookupGovContractsContainer.mockRejectedValueOnce(new Error('db down'));
    expect((await request(app).get(URL).set(AUTH)).status).toBe(503);
    expect(getSummary).not.toHaveBeenCalled();
  });

  it('500s with a fixed sentence and hides the internal error', async () => {
    getSummary.mockRejectedValueOnce(new Error('relation "case_study_service_links" does not exist'));
    const res = await request(app).get(URL).set(AUTH);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not load the evidence summary.' });
    expect(JSON.parse(String(errSpy.mock.calls[0][0]))).toMatchObject({ event: 'service_evidence_summary_failed', error_class: 'Error' });
  });

  it('fails LOUD on a response that breaks the contract in test/dev', async () => {
    getSummary.mockResolvedValueOnce({ ...validSummary(), services: [{ id: 'x' }] });
    const res = await request(app).get(URL).set(AUTH);
    expect(res.status).toBe(500);
    expect(res.body.errorClass).toBe('ContractViolation');
  });

  it('logs and still serves a contract drift in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.APP_ENV;
    getSummary.mockResolvedValueOnce({ ...validSummary(), services: [{ id: 'x' }] });
    const res = await request(app).get(URL).set(AUTH);
    expect(res.status).toBe(200);
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('service_evidence_summary_contract_violation'))).toBe(true);
    // A drift that drops whole top-level keys is still served, not turned into a 500 by the success log line.
    getSummary.mockResolvedValueOnce({ status: 'active' });
    expect((await request(app).get(URL).set(AUTH)).status).toBe(200);
  });

  it('is registered in adminRoutes', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'adminRoutes.ts'), 'utf8');
    expect(src).toContain("import serviceEvidenceSummaryRoutes from './admin/serviceEvidenceSummaryRoutes';");
    expect(src).toContain('router.use(serviceEvidenceSummaryRoutes);');
  });
});
