/**
 * The case-study/service link admin API: validation, tenant scoping, the idempotent suggest call, and the
 * confirm/reject decision.
 *
 * The route-auth block at the bottom is PER ROUTE, on purpose. The required CI lint
 * (`scripts/lint-route-auth.js`) is per FILE: it asks whether the source contains the substring
 * `requireSection` anywhere, so a file whose other routes are guarded — or whose header comment merely mentions
 * the guard — passes the lint with an unguarded route in it. Verified on 2026-10-02 by deleting the guard from the
 * decide route: the lint still reported "all 129 admin route files are auth-guarded". So the per-route check has
 * to live here.
 */
import fs from 'fs';
import path from 'path';

const requireSection = jest.fn(() => (req: any, _res: any, next: any) => {
  req.admin = { email: 'ali@colaberry.com' };
  next();
});
jest.mock('../../../middlewares/authMiddleware', () => ({ requireSection: (...a: any[]) => requireSection(...a) }));

const lookupGovContractsContainer = jest.fn();
jest.mock('../../../scripts/lib/factoryDemoContainer', () => ({
  lookupGovContractsContainer: (...a: any[]) => lookupGovContractsContainer(...a),
}));

// Partial mock: override the functions but KEEP the real error classes, because the routes branch on `instanceof`.
const suggestLinksForCaseStudy = jest.fn();
const listLinksForCaseStudy = jest.fn();
const listLinksForService = jest.fn();
const decideLink = jest.fn();
jest.mock('../../../services/caseStudy/caseStudyServiceLinkStore', () => {
  const actual = jest.requireActual('../../../services/caseStudy/caseStudyServiceLinkStore');
  return {
    ...actual,
    suggestLinksForCaseStudy: (...a: any[]) => suggestLinksForCaseStudy(...a),
    listLinksForCaseStudy: (...a: any[]) => listLinksForCaseStudy(...a),
    listLinksForService: (...a: any[]) => listLinksForService(...a),
    decideLink: (...a: any[]) => decideLink(...a),
  };
});

import express from 'express';
import request from 'supertest';
import linkRoutes from '../caseStudyServiceLinkRoutes';
import {
  CaseStudyNotFoundError,
  CaseStudyServiceLinkNotFoundError,
} from '../../../services/caseStudy/caseStudyServiceLinkStore';

const app = express();
app.use(express.json());
app.use(linkRoutes);

const CS = '11111111-1111-4111-a111-111111111111';
const LINK = '22222222-2222-4222-a222-222222222222';
const SVC = '33333333-3333-4333-a333-333333333333';

beforeEach(() => {
  jest.clearAllMocks();
  lookupGovContractsContainer.mockResolvedValue({ tenant: { id: 't1' }, org: { id: 'o1' } });
  listLinksForCaseStudy.mockResolvedValue([]);
  listLinksForService.mockResolvedValue([]);
});

describe('GET /api/admin/factory/case-studies/:id/service-links', () => {
  it("lists the record's links, scoped to the caller's tenant", async () => {
    listLinksForCaseStudy.mockResolvedValue([{ id: LINK, state: 'suggested' }]);
    const res = await request(app).get(`/api/admin/factory/case-studies/${CS}/service-links`);
    expect(res.status).toBe(200);
    expect(res.body.links).toHaveLength(1);
    expect(listLinksForCaseStudy).toHaveBeenCalledWith({ caseStudyId: CS, tenantId: 't1', state: undefined });
  });

  it('passes a state filter through', async () => {
    await request(app).get(`/api/admin/factory/case-studies/${CS}/service-links?state=confirmed`);
    expect(listLinksForCaseStudy).toHaveBeenCalledWith({ caseStudyId: CS, tenantId: 't1', state: 'confirmed' });
  });

  it('400s a non-uuid id and an unknown state, without touching the store', async () => {
    expect((await request(app).get('/api/admin/factory/case-studies/not-a-uuid/service-links')).status).toBe(400);
    expect((await request(app).get(`/api/admin/factory/case-studies/${CS}/service-links?state=maybe`)).status).toBe(400);
    expect(listLinksForCaseStudy).not.toHaveBeenCalled();
  });

  it('503s rather than reading across tenants when the workspace will not resolve', async () => {
    lookupGovContractsContainer.mockResolvedValue(null);
    const res = await request(app).get(`/api/admin/factory/case-studies/${CS}/service-links`);
    expect(res.status).toBe(503);
    expect(listLinksForCaseStudy).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/factory/case-studies/:id/service-links/suggest', () => {
  it('runs the pass, stamps who ran it, and returns the refreshed list', async () => {
    suggestLinksForCaseStudy.mockResolvedValue({ caseStudyId: CS, inserted: 2, alreadyPresent: 0, proposed: [1, 2] });
    listLinksForCaseStudy.mockResolvedValue([{ id: LINK }, { id: 'l2' }]);
    const res = await request(app).post(`/api/admin/factory/case-studies/${CS}/service-links/suggest`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ inserted: 2, alreadyPresent: 0 });
    expect(res.body.links).toHaveLength(2);
    expect(suggestLinksForCaseStudy).toHaveBeenCalledWith({
      caseStudyId: CS, tenantId: 't1', suggestedBy: 'ali@colaberry.com',
    });
  });

  it('reports inserted 0 on a re-run, which is how a caller sees it was idempotent', async () => {
    suggestLinksForCaseStudy.mockResolvedValue({ caseStudyId: CS, inserted: 0, alreadyPresent: 2, proposed: [1, 2] });
    const res = await request(app).post(`/api/admin/factory/case-studies/${CS}/service-links/suggest`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ inserted: 0, alreadyPresent: 2 });
  });

  it('404s an unknown case study', async () => {
    suggestLinksForCaseStudy.mockRejectedValue(new CaseStudyNotFoundError(CS));
    const res = await request(app).post(`/api/admin/factory/case-studies/${CS}/service-links/suggest`);
    expect(res.status).toBe(404);
  });

  it('500s on an unexpected failure without leaking the message', async () => {
    suggestLinksForCaseStudy.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const res = await request(app).post(`/api/admin/factory/case-studies/${CS}/service-links/suggest`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });
});

describe('GET /api/admin/factory/services/:id/case-studies', () => {
  it("lists a service's evidence", async () => {
    listLinksForService.mockResolvedValue([{ id: LINK, caseStudyId: CS, state: 'confirmed' }]);
    const res = await request(app).get(`/api/admin/factory/services/${SVC}/case-studies?state=confirmed`);
    expect(res.status).toBe(200);
    expect(listLinksForService).toHaveBeenCalledWith({
      serviceOfferingId: SVC, tenantId: 't1', state: 'confirmed',
    });
  });

  it('400s a non-uuid service id', async () => {
    expect((await request(app).get('/api/admin/factory/services/nope/case-studies')).status).toBe(400);
    expect(listLinksForService).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/factory/service-links/:id/decide', () => {
  it('records a confirmation against the acting admin', async () => {
    decideLink.mockResolvedValue({ id: LINK, state: 'confirmed', decidedBy: 'ali@colaberry.com' });
    const res = await request(app).post(`/api/admin/factory/service-links/${LINK}/decide`).send({ state: 'confirmed' });
    expect(res.status).toBe(200);
    expect(decideLink).toHaveBeenCalledWith({
      id: LINK, tenantId: 't1', state: 'confirmed', decidedBy: 'ali@colaberry.com',
    });
  });

  it('records a rejection', async () => {
    decideLink.mockResolvedValue({ id: LINK, state: 'rejected' });
    const res = await request(app).post(`/api/admin/factory/service-links/${LINK}/decide`).send({ state: 'rejected' });
    expect(res.status).toBe(200);
    expect(decideLink.mock.calls[0][0].state).toBe('rejected');
  });

  it("400s an attempt to push a link back to 'suggested', and never calls the store", async () => {
    const res = await request(app).post(`/api/admin/factory/service-links/${LINK}/decide`).send({ state: 'suggested' });
    expect(res.status).toBe(400);
    expect(decideLink).not.toHaveBeenCalled();
  });

  it('400s a missing body', async () => {
    expect((await request(app).post(`/api/admin/factory/service-links/${LINK}/decide`).send({})).status).toBe(400);
    expect(decideLink).not.toHaveBeenCalled();
  });

  it('404s a link outside this workspace', async () => {
    decideLink.mockRejectedValue(new CaseStudyServiceLinkNotFoundError(LINK));
    const res = await request(app).post(`/api/admin/factory/service-links/${LINK}/decide`).send({ state: 'confirmed' });
    expect(res.status).toBe(404);
  });
});

describe('route-auth — EVERY route carries its own guard', () => {
  it('pairs each router.get/post with requireSection in its own argument list', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'caseStudyServiceLinkRoutes.ts'), 'utf8');
    // Each route declaration plus the lines up to its handler. Asserting on the DECLARATIONS rather than counting
    // `requireSection` occurrences in the file: the header comment names the guard in prose, so a whole-file count
    // already reads one higher than the number of guarded routes and could never detect a missing one.
    const declarations = src.match(/router\.(get|post|put|patch|delete)\([\s\S]*?async \(/g) ?? [];
    expect(declarations.length).toBe(4);
    const unguarded = declarations.filter((d) => !d.includes("requireSection('program')"));
    expect(unguarded).toEqual([]);
  });
});
