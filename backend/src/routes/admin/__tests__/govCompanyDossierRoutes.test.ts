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
const updateCompanyFact = jest.fn();

const ingestSourceDocument = jest.fn();
const listCompanyDocuments = jest.fn();
const approveSourceDocument = jest.fn();
const deleteSourceDocument = jest.fn();

jest.mock('../../../middlewares/authMiddleware', () => ({ requireSection: () => (_req: any, _res: any, next: any) => next() }));
jest.mock('../../../scripts/lib/factoryDemoContainer', () => ({ lookupGovContractsContainer: (...a: any[]) => lookupContainer(...a) }));
jest.mock('../../../services/factory/proposal/govProposalSources', () => ({
  ingestSourceDocument: (...a: any[]) => ingestSourceDocument(...a),
  listCompanyDocuments: (...a: any[]) => listCompanyDocuments(...a),
  approveSourceDocument: (...a: any[]) => approveSourceDocument(...a),
  deleteSourceDocument: (...a: any[]) => deleteSourceDocument(...a),
}));
jest.mock('../../../services/factory/proposal/govCompanyLibrary', () => ({
  listCompanyLibrary: (...a: any[]) => listCompanyLibrary(...a),
  addCompanyFact: (...a: any[]) => addCompanyFact(...a),
  addCompanyReference: (...a: any[]) => addCompanyReference(...a),
  addCompanyPersonnel: (...a: any[]) => addCompanyPersonnel(...a),
  approveCompanyFact: (...a: any[]) => approveCompanyFact(...a),
  approveCompanyReference: (...a: any[]) => approveCompanyReference(...a),
  approveCompanyPersonnel: (...a: any[]) => approveCompanyPersonnel(...a),
  updateCompanyFact: (...a: any[]) => updateCompanyFact(...a),
}));
const dbQuery = jest.fn();
const collectTenantNeeds = jest.fn();
const resolveProjectNeed = jest.fn();
const classifyNeedAsk = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: any[]) => dbQuery(...a) } }));
jest.mock('../../../services/factory/proposal/tenantNeeds', () => ({
  // groupTenantNeeds + needSubject are pure (over needGrouping), so keep them real; only the collector is mocked.
  ...jest.requireActual('../../../services/factory/proposal/tenantNeeds'),
  collectTenantNeeds: (...a: any[]) => collectTenantNeeds(...a),
}));
jest.mock('../../../services/factory/proposal/resolveProjectNeed', () => ({ resolveProjectNeed: (...a: any[]) => resolveProjectNeed(...a) }));
jest.mock('../../../services/factory/proposal/needClassifier', () => ({ classifyNeedAsk: (...a: any[]) => classifyNeedAsk(...a) }));

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

describe('POST fact update (edit a saved answer in place)', () => {
  it('updates a fact value, tenant-scoped, approval untouched', async () => {
    updateCompanyFact.mockResolvedValue(undefined);
    const res = await request(app).post(`${BASE}/fact/f1/update`).send({ value: 'corrected value', category: 'registrations' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, id: 'f1' });
    expect(updateCompanyFact).toHaveBeenCalledWith(TENANT, 'f1', expect.objectContaining({ value: 'corrected value', category: 'registrations' }), null);
  });

  it('400 when the edit has no value, nothing written', async () => {
    const res = await request(app).post(`${BASE}/fact/f1/update`).send({ value: '   ' });
    expect(res.status).toBe(400);
    expect(updateCompanyFact).not.toHaveBeenCalled();
  });

  it('503 when the workspace tenant cannot be resolved', async () => {
    lookupContainer.mockResolvedValue(null);
    const res = await request(app).post(`${BASE}/fact/f1/update`).send({ value: 'x' });
    expect(res.status).toBe(503);
    expect(updateCompanyFact).not.toHaveBeenCalled();
  });
});

const DOCS = '/api/admin/factory/dossier/documents';

describe('company documents (tenant-wide, project_id NULL)', () => {
  it('lists the tenant company documents', async () => {
    listCompanyDocuments.mockResolvedValue([{ id: 'd1', name: 'cap.pdf', status: 'ready', approved: true, chunk_count: 3, embedded_count: 3, truncated: false, created_at: null }]);
    const res = await request(app).get(DOCS);
    expect(res.status).toBe(200);
    expect(res.body.documents[0]).toMatchObject({ id: 'd1', name: 'cap.pdf', chunkCount: 3 });
    expect(listCompanyDocuments).toHaveBeenCalledWith(TENANT);
  });

  it('ingests an uploaded .pdf as a tenant-wide document (project_id null)', async () => {
    ingestSourceDocument.mockResolvedValue({ documentId: 'd-new', chunkCount: 2, embeddedCount: 2, truncated: false, status: 'ready' });
    const res = await request(app).post(DOCS).attach('file', Buffer.from('%PDF-1.4 hello'), 'capability.pdf');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, documentId: 'd-new' });
    expect(ingestSourceDocument).toHaveBeenCalledWith(null, TENANT, expect.objectContaining({ name: 'capability.pdf' }), null);
  });

  it('rejects a disallowed extension before ingest', async () => {
    const res = await request(app).post(DOCS).attach('file', Buffer.from('x'), 'malware.exe');
    expect(res.status).toBe(400);
    expect(ingestSourceDocument).not.toHaveBeenCalled();
  });

  it('approves and deletes a company document', async () => {
    approveSourceDocument.mockResolvedValue({ id: 'd1', approved: true });
    deleteSourceDocument.mockResolvedValue(true);
    const ap = await request(app).post(`${DOCS}/d1/approve`).send({});
    expect(ap.status).toBe(200);
    expect(approveSourceDocument).toHaveBeenCalledWith('d1', null, true);
    const del = await request(app).delete(`${DOCS}/d1`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });
  });
});

describe('GET dossier needs (Needs across contracts)', () => {
  const ENGAGEMENT = 'e2222222-74a3-4b98-b4dd-ba0087efd924';
  beforeEach(() => {
    lookupContainer.mockResolvedValue({ tenant: { id: TENANT, name: 'refactored' }, org: { id: 'o1' }, engagement: { id: ENGAGEMENT } });
  });

  it('collects needs across the tenant gov bids, scoped to the engagement delivery projects', async () => {
    dbQuery.mockResolvedValue([{ id: 'p1', name: 'Harris County' }, { id: 'p2', name: 'Dallas ISD' }]);
    collectTenantNeeds.mockResolvedValue([{ key: 'reference:1', kind: 'record', ask: 'Add a reference', blocking: 'fatal', projects: [{ projectId: 'p1', projectName: 'Harris County' }] }]);
    const res = await request(app).get('/api/admin/factory/dossier/needs');
    expect(res.status).toBe(200);
    expect(res.body.needs).toHaveLength(1);
    // delivery projects are scoped to tenant + gov engagement
    const [, opts] = dbQuery.mock.calls[0];
    expect(opts.bind).toEqual([TENANT, ENGAGEMENT]);
    expect(collectTenantNeeds).toHaveBeenCalledWith([{ projectId: 'p1', projectName: 'Harris County' }, { projectId: 'p2', projectName: 'Dallas ISD' }]);
  });

  it('503s when the gov workspace is unconfigured', async () => {
    lookupContainer.mockResolvedValue(null);
    const res = await request(app).get('/api/admin/factory/dossier/needs');
    expect(res.status).toBe(503);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it('500s (not a throw) when the collect fails', async () => {
    dbQuery.mockResolvedValue([{ id: 'p1', name: 'Harris County' }]);
    collectTenantNeeds.mockRejectedValue(new Error('db down'));
    const res = await request(app).get('/api/admin/factory/dossier/needs');
    expect(res.status).toBe(500);
  });
});

describe('POST dossier needs fill (group fill)', () => {
  beforeEach(() => {
    lookupContainer.mockResolvedValue({ tenant: { id: TENANT }, engagement: { id: 'e1' } });
    dbQuery.mockResolvedValue([{ id: 'p1', name: 'Harris County' }, { id: 'p2', name: 'Dallas ISD' }]);
    resolveProjectNeed.mockResolvedValue({ status: 200, body: {} });
  });

  it('fills a fact group by resolving each concept value across the bids that ask it', async () => {
    collectTenantNeeds.mockResolvedValue([
      { key: 'fact:due_date', kind: 'fact', ask: 'What is the due date for the submission?', blocking: 'fatal', projects: [{ projectId: 'p1', projectName: 'Harris County' }] },
      { key: 'fact:client', kind: 'fact', ask: 'client name', blocking: 'score', projects: [{ projectId: 'p2', projectName: 'Dallas ISD' }] },
    ]);
    const res = await request(app).post('/api/admin/factory/dossier/needs/fill')
      .send({ groupSlug: 'solicitation', subject: 'general', values: { due_date: '2026-12-11', client: 'City of Dallas' } });
    expect(res.status).toBe(200);
    expect(resolveProjectNeed).toHaveBeenCalledWith('p1', 'fact:due_date', { value: '2026-12-11' }, expect.objectContaining({ canApprove: true }));
    expect(resolveProjectNeed).toHaveBeenCalledWith('p2', 'fact:client', { value: 'City of Dallas' }, expect.anything());
    expect(res.body.resolved).toBe(2);
  });

  it('fills a record group with one reference (propagation clears its twins)', async () => {
    collectTenantNeeds.mockResolvedValue([
      { key: 'reference:slot1', kind: 'record', recordType: 'reference', ask: 'Add a past-performance reference', subject: 'reporting', blocking: 'fatal', projects: [{ projectId: 'p1', projectName: 'Harris' }, { projectId: 'p2', projectName: 'Dallas' }] },
    ]);
    const res = await request(app).post('/api/admin/factory/dossier/needs/fill')
      .send({ groupSlug: 'past_performance', subject: 'reporting', record: { client: 'City Reporting', scope: 'BI dashboard' } });
    expect(res.status).toBe(200);
    expect(resolveProjectNeed).toHaveBeenCalledWith('p1', 'reference:slot1', { record: { client: 'City Reporting', scope: 'BI dashboard' } }, expect.anything());
  });

  it('400s when a record group is filled without a record object', async () => {
    collectTenantNeeds.mockResolvedValue([
      { key: 'reference:slot1', kind: 'record', recordType: 'reference', ask: 'Add a past-performance reference', subject: 'reporting', blocking: 'fatal', projects: [{ projectId: 'p1', projectName: 'Harris' }] },
    ]);
    const res = await request(app).post('/api/admin/factory/dossier/needs/fill')
      .send({ groupSlug: 'past_performance', subject: 'reporting', values: {} });
    expect(res.status).toBe(400);
    expect(resolveProjectNeed).not.toHaveBeenCalled();
  });

  it('400s on a malformed body', async () => {
    const res = await request(app).post('/api/admin/factory/dossier/needs/fill').send({ subject: 'general' });
    expect(res.status).toBe(400);
  });
});

describe('dossier categories', () => {
  beforeEach(() => { lookupContainer.mockResolvedValue({ tenant: { id: TENANT }, engagement: { id: 'e1' } }); });

  it('GET returns the built-in groups plus pending tenant categories', async () => {
    dbQuery
      .mockResolvedValueOnce([]) // active tenant rows (listRequirementCategories)
      .mockResolvedValueOnce([{ slug: 'cmmc', label: 'CMMC attestation', kind: 'fact', subject: 'security', status: 'pending', source: 'ai', confidence: 0.8, example_ask: 'provide your CMMC level' }]); // pending
    const res = await request(app).get('/api/admin/factory/dossier/categories');
    expect(res.status).toBe(200);
    expect(res.body.active.map((c: any) => c.slug)).toContain('past_performance');
    expect(res.body.pending).toHaveLength(1);
    expect(res.body.pending[0].slug).toBe('cmmc');
  });

  it('suggest classifies ungrouped needs and proposes a new category', async () => {
    dbQuery.mockImplementation((sql: string) => {
      if (/FROM delivery_projects/.test(sql)) return Promise.resolve([{ id: 'p1', name: 'X' }]);
      if (/INSERT INTO gov_requirement_categories/.test(sql)) return Promise.resolve([[], 1]);
      return Promise.resolve([]); // pending list
    });
    collectTenantNeeds.mockResolvedValue([{ key: 'fact:weird', kind: 'fact', ask: 'Provide your CMMC level', blocking: 'score', projects: [{ projectId: 'p1', projectName: 'X' }] }]);
    classifyNeedAsk.mockResolvedValue({ groupSlug: 'cmmc', subject: 'security', confidence: 0.8, newCategory: { slug: 'cmmc', label: 'CMMC attestation', kind: 'fact' } });
    const res = await request(app).post('/api/admin/factory/dossier/categories/suggest').send({});
    expect(res.status).toBe(200);
    expect(classifyNeedAsk).toHaveBeenCalledWith('Provide your CMMC level');
    expect(res.body.proposed).toBe(1);
  });

  it('activate issues a scoped update', async () => {
    dbQuery.mockResolvedValue([[], 1]);
    const res = await request(app).post('/api/admin/factory/dossier/categories/cmmc/activate').send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
