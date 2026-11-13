/**
 * propose-service / promote admin routes: validation, tenant scope, status codes, actor stamping, auth.
 * The service module is mocked except its error class (the routes branch on instanceof).
 */
import fs from 'fs';
import path from 'path';

jest.mock('../../../middlewares/authMiddleware', () => ({
  requireSection: () => (req: { headers: Record<string, string>; admin?: unknown }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    if (!req.headers.authorization) { res.status(401).json({ error: 'Authentication required' }); return; }
    req.admin = { email: 'ali@colaberry.com' };
    next();
  },
}));
const lookupGovContractsContainer = jest.fn();
jest.mock('../../../scripts/lib/factoryDemoContainer', () => ({ lookupGovContractsContainer: () => lookupGovContractsContainer() }));
const propose = jest.fn(); const promote = jest.fn();
jest.mock('../../../services/factory/serviceProposal', () => {
  const actual = jest.requireActual('../../../services/factory/serviceProposal');
  return { ...actual, proposeServiceFromCaseStudy: (...a: unknown[]) => propose(...a), promoteServiceOffering: (...a: unknown[]) => promote(...a) };
});

import express from 'express';
import request from 'supertest';
import routes from '../serviceProposalRoutes';
import { ServiceProposalError, PROMOTION_REFUSED_MESSAGE } from '../../../services/factory/serviceProposal';

const app = express();
app.use(express.json());
app.use(routes);
const CS = '11111111-1111-4111-a111-111111111111';
const SVC = '33333333-3333-4333-a333-333333333333';
const AUTH = { Authorization: 'Bearer t' };
const proposeUrl = `/api/admin/factory/case-studies/${CS}/propose-service`;
const promoteUrl = `/api/admin/factory/services/${SVC}/promote`;

let err: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  lookupGovContractsContainer.mockResolvedValue({ tenant: { id: 't1' } });
});
afterEach(() => err.mockRestore());

describe('POST propose-service', () => {
  it('201s a new growth service, passing the tenant and the acting admin', async () => {
    propose.mockResolvedValue({ service: { id: SVC, status: 'growth' }, existing: false, link: { id: 'l', state: 'confirmed', changed: true } });
    const res = await request(app).post(proposeUrl).set(AUTH).send({ name: 'Pricing Analytics', keywords: ['pricing'] });
    expect(res.status).toBe(201);
    expect(propose).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', caseStudyId: CS, actor: 'ali@colaberry.com', name: 'Pricing Analytics', keywords: ['pricing'], naicsCodes: undefined }));
  });

  it('200s with existing:true when the name already exists', async () => {
    propose.mockResolvedValue({ service: { id: SVC }, existing: true, link: { id: 'l', state: 'confirmed', changed: false } });
    const res = await request(app).post(proposeUrl).set(AUTH).send({ name: 'pricing analytics' });
    expect(res.status).toBe(200);
    expect(res.body.existing).toBe(true);
  });

  it('400s a bad id, a missing or too-short name, bad NAICS, and any attempt to set status/tenant', async () => {
    expect((await request(app).post('/api/admin/factory/case-studies/nope/propose-service').set(AUTH).send({ name: 'Xy' })).status).toBe(400);
    for (const body of [{}, { name: 'X' }, { name: 'Ok name', naicsCodes: ['54-1511'] }, { name: 'Ok name', status: 'active' }, { name: 'Ok name', tenant_id: 'x' }]) {
      expect((await request(app).post(proposeUrl).set(AUTH).send(body)).status).toBe(400);
    }
    expect(propose).not.toHaveBeenCalled();
  });

  it('maps a typed refusal to its status with a sentence, and hides an unexpected error', async () => {
    propose.mockRejectedValueOnce(new ServiceProposalError('ServiceRetired', 'A retired service is already named "X". Choose another name.', 409));
    const r1 = await request(app).post(proposeUrl).set(AUTH).send({ name: 'X name' });
    expect(r1.status).toBe(409);
    expect(r1.body).toEqual({ error: 'A retired service is already named "X". Choose another name.', errorClass: 'ServiceRetired' });
    propose.mockRejectedValueOnce(new Error('relation "service_offerings" does not exist'));
    const r2 = await request(app).post(proposeUrl).set(AUTH).send({ name: 'X name' });
    expect(r2.status).toBe(500);
    expect(JSON.stringify(r2.body)).not.toMatch(/relation/);
  });
});

describe('POST promote', () => {
  it('refuses with 409 and the plain sentence when there is no confirmed case study', async () => {
    promote.mockRejectedValue(new ServiceProposalError('PromotionRefused', PROMOTION_REFUSED_MESSAGE, 409));
    const res = await request(app).post(promoteUrl).set(AUTH);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(PROMOTION_REFUSED_MESSAGE);
  });

  it('promotes, passing the tenant and actor', async () => {
    promote.mockResolvedValue({ service: { id: SVC, status: 'active' }, promoted: true, confirmedCaseStudies: 1 });
    const res = await request(app).post(promoteUrl).set(AUTH);
    expect(res.status).toBe(200);
    expect(promote).toHaveBeenCalledWith({ tenantId: 't1', serviceId: SVC, actor: 'ali@colaberry.com' });
  });

  it('400s a bad id and 404s a service outside the workspace', async () => {
    expect((await request(app).post('/api/admin/factory/services/bad/promote').set(AUTH)).status).toBe(400);
    promote.mockRejectedValue(new ServiceProposalError('ServiceNotFound', 'That service was not found in this workspace.', 404));
    expect((await request(app).post(promoteUrl).set(AUTH)).status).toBe(404);
  });
});

describe('scope and auth', () => {
  it('503s both routes when the workspace cannot be resolved', async () => {
    lookupGovContractsContainer.mockResolvedValue(null);
    expect((await request(app).post(proposeUrl).set(AUTH).send({ name: 'Ok name' })).status).toBe(503);
    expect((await request(app).post(promoteUrl).set(AUTH)).status).toBe(503);
    expect(propose).not.toHaveBeenCalled();
    expect(promote).not.toHaveBeenCalled();
  });

  it('401s both routes without authentication', async () => {
    expect((await request(app).post(proposeUrl).send({ name: 'Ok name' })).status).toBe(401);
    expect((await request(app).post(promoteUrl)).status).toBe(401);
    expect(propose).not.toHaveBeenCalled();
  });

  it('every route declaration carries its own requireSection(program)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'serviceProposalRoutes.ts'), 'utf8');
    const declarations = src.match(/router\.(get|post|put|patch|delete)\([\s\S]*?async \(/g) ?? [];
    expect(declarations.length).toBe(2);
    expect(declarations.filter((d) => !d.includes("requireSection('program')"))).toEqual([]);
  });
});
