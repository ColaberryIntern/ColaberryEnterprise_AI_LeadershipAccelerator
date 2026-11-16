/**
 * govCompanyDossierRoutes — the tenant-wide Dossier portal API. requireSection is stubbed to a pass-through (the
 * section gate is proven elsewhere); the container resolver and the library service are mocked. These pin the tenant
 * resolution (503 when the workspace is unconfigured), the kind guard (400), the add/approve dispatch per kind, and
 * that writes never run without a resolved tenant.
 */
const lookupContainer = jest.fn();
const listCompanyLibrary = jest.fn();
const addCompanyFact = jest.fn();
const addCompanyReference = jest.fn();
const addCompanyPersonnel = jest.fn();
const approveCompanyFact = jest.fn();
const approveCompanyReference = jest.fn();
const approveCompanyPersonnel = jest.fn();

jest.mock('../../../middlewares/authMiddleware', () => ({ requireSection: () => (_req: any, _res: any, next: any) => next() }));
jest.mock('../../../scripts/lib/factoryDemoContainer', () => ({ lookupGovContractsContainer: (...a: any[]) => lookupContainer(...a) }));
jest.mock('../../../services/factory/proposal/govCompanyLibrary', () => ({
  listCompanyLibrary: (...a: any[]) => listCompanyLibrary(...a),
  addCompanyFact: (...a: any[]) => addCompanyFact(...a),
  addCompanyReference: (...a: any[]) => addCompanyReference(...a),
  addCompanyPersonnel: (...a: any[]) => addCompanyPersonnel(...a),
  approveCompanyFact: (...a: any[]) => approveCompanyFact(...a),
  approveCompanyReference: (...a: any[]) => approveCompanyReference(...a),
  approveCompanyPersonnel: (...a: any[]) => approveCompanyPersonnel(...a),
}));

import express, { type Express } from 'express';
import request from 'supertest';
import dossierRoutes from '../govCompanyDossierRoutes';

const TENANT = 'a1ccf4d3-74a3-4b98-b4dd-ba0087efd924';
const BASE = '/api/admin/factory/dossier/library';
let app: Express;

beforeEach(() => {
  jest.clearAllMocks();
  lookupContainer.mockResolvedValue({ tenant: { id: TENANT, name: 'refactored' } });
  app = express();
  app.use(express.json());
  app.use(dossierRoutes);
});

describe('GET dossier library', () => {
  it('returns the library scoped to the resolved tenant', async () => {
    listCompanyLibrary.mockResolvedValue({ facts: [{ id: 'f1' }], references: [], personnel: [] });
    const res = await request(app).get(BASE);
    expect(res.status).toBe(200);
    expect(res.body.facts).toHaveLength(1);
    expect(listCompanyLibrary).toHaveBeenCalledWith(TENANT);
  });

  it('503 when the workspace tenant cannot be resolved', async () => {
    lookupContainer.mockResolvedValue(null);
    const res = await request(app).get(BASE);
    expect(res.status).toBe(503);
    expect(listCompanyLibrary).not.toHaveBeenCalled();
  });
});

describe('POST add', () => {
  it('400 on an unknown kind, nothing written', async () => {
    const res = await request(app).post(`${BASE}/bogus`).send({ x: 1 });
    expect(res.status).toBe(400);
    expect(addCompanyFact).not.toHaveBeenCalled();
  });

  it('400 when a fact is missing its value', async () => {
    const res = await request(app).post(`${BASE}/fact`).send({ key: 'UEI' });
    expect(res.status).toBe(400);
    expect(addCompanyFact).not.toHaveBeenCalled();
  });

  it('adds a valid fact with its category', async () => {
    addCompanyFact.mockResolvedValue('f-new');
    const res = await request(app).post(`${BASE}/fact`).send({ key: 'UEI', value: 'ABC123', category: 'registrations' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, id: 'f-new' });
    expect(addCompanyFact).toHaveBeenCalledWith(TENANT, expect.objectContaining({ key: 'UEI', value: 'ABC123', category: 'registrations' }), null);
  });

  it('adds a reference with just a client', async () => {
    addCompanyReference.mockResolvedValue('r-new');
    const res = await request(app).post(`${BASE}/reference`).send({ client: 'City of Plano' });
    expect(res.status).toBe(200);
    expect(addCompanyReference).toHaveBeenCalledWith(TENANT, expect.objectContaining({ client: 'City of Plano' }), null);
  });
});

describe('POST approve', () => {
  it('approves a reference by id, tenant-scoped', async () => {
    const res = await request(app).post(`${BASE}/reference/r1/approve`).send({});
    expect(res.status).toBe(200);
    expect(approveCompanyReference).toHaveBeenCalledWith(TENANT, 'r1', null);
  });

  it('400 on an unknown kind for approve', async () => {
    const res = await request(app).post(`${BASE}/bogus/r1/approve`).send({});
    expect(res.status).toBe(400);
    expect(approveCompanyReference).not.toHaveBeenCalled();
  });
});
