/**
 * The Command Center read API. The sample endpoint serves the day-one fixture (no DB); the contract
 * endpoint reconstructs a FactoryProject from the persisted doc_json subset + the track/requirement
 * rows, 404s when nothing is generated yet, and 400s a bad id. Every route is section-gated — asserted
 * both behaviourally (mocked guard) and at the source, since the route-auth lint is a required CI check.
 */
import fs from 'fs';
import path from 'path';

const requireSection = jest.fn(() => (req: any, _res: any, next: any) => { req.admin = { email: 'admin@test' }; next(); });
jest.mock('../../../middlewares/authMiddleware', () => ({ requireSection: (...a: any[]) => requireSection(...a) }));

const docFindAll = jest.fn();
const trackFindAll = jest.fn();
const reqFindAll = jest.fn();
const projectFindAll = jest.fn();
jest.mock('../../../models/ContractProcessDocument', () => ({ __esModule: true, default: { findAll: (...a: any[]) => docFindAll(...a) } }));
jest.mock('../../../models/ContractTrack', () => ({ __esModule: true, default: { findAll: (...a: any[]) => trackFindAll(...a) } }));
jest.mock('../../../models/ContractRequirement', () => ({ __esModule: true, default: { findAll: (...a: any[]) => reqFindAll(...a) } }));
const govProjFindOne = jest.fn();
const govProjCreate = jest.fn();
jest.mock('../../../models/DeliveryProject', () => ({ __esModule: true, default: { findAll: (...a: any[]) => projectFindAll(...a), findOne: (...a: any[]) => govProjFindOne(...a), create: (...a: any[]) => govProjCreate(...a) } }));

const fetchBestFitOpportunities = jest.fn();
jest.mock('../../../services/factory/opportunities/oppPulseClient', () => ({ fetchBestFitOpportunities: (...a: any[]) => fetchBestFitOpportunities(...a) }));
const backfillUnassessedContract = jest.fn();
jest.mock('../../../services/factory/factoryBackfill', () => ({ backfillUnassessedContract: (...a: any[]) => backfillUnassessedContract(...a) }));
const resolveGovContractsContainer = jest.fn();
jest.mock('../../../scripts/lib/factoryDemoContainer', () => ({ resolveGovContractsContainer: (...a: any[]) => resolveGovContractsContainer(...a) }));
const ingestProposal = jest.fn();
jest.mock('../../../services/factory/proposal/proposalIngest', () => ({ ingestProposal: (...a: any[]) => ingestProposal(...a) }));
const generateDecomposition = jest.fn();
jest.mock('../../../services/factory/factoryDecomposeRun', () => ({ generateDecomposition: (...a: any[]) => generateDecomposition(...a) }));

// Partial mocks: override the write functions but KEEP the real error classes (instanceof must work).
const approveProcessDocument = jest.fn();
jest.mock('../../../services/factory/factoryApproval', () => {
  const actual = jest.requireActual('../../../services/factory/factoryApproval');
  return { ...actual, approveProcessDocument: (...a: any[]) => approveProcessDocument(...a) };
});
const requestChanges = jest.fn();
jest.mock('../../../services/factory/factoryReview', () => {
  const actual = jest.requireActual('../../../services/factory/factoryReview');
  return { ...actual, requestChanges: (...a: any[]) => requestChanges(...a) };
});

import express from 'express';
import request from 'supertest';
import factoryRoutes, { toContractRequirement } from '../factoryRoutes';
import { buildSampleContractProject } from '../../../services/factory/sample/sampleContractProject';
import { ApprovalConflictError, ApprovalGateError } from '../../../services/factory/factoryApproval';

const app = express();
app.use(express.json());
app.use(factoryRoutes);

const s = buildSampleContractProject();
const UUID = '11111111-1111-4111-a111-111111111111'; // a valid RFC-4122 v4 uuid

beforeEach(() => jest.clearAllMocks());

describe('GET /api/admin/factory/sample — the day-one fixture', () => {
  it('serves the sample view, flagged isSample, gate clean, no persisted approval, without touching the DB', async () => {
    const res = await request(app).get('/api/admin/factory/sample');
    expect(res.status).toBe(200);
    expect(res.body.isSample).toBe(true);
    expect(res.body.contractName).toBe('AI Government Contract Finder');
    expect(res.body.gate.ok).toBe(true);
    expect(res.body.approval).toBeNull();
    expect(docFindAll).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/factory/contract/:deliveryProjectId', () => {
  it('404s when no decomposition has been generated for the contract', async () => {
    docFindAll.mockResolvedValue([]);
    const res = await request(app).get(`/api/admin/factory/contract/${UUID}`);
    expect(res.status).toBe(404);
    expect(reqFindAll).not.toHaveBeenCalled(); // short-circuits before loading siblings
  });

  it('400s an invalid (non-uuid) delivery project id', async () => {
    const res = await request(app).get('/api/admin/factory/contract/not-a-uuid');
    expect(res.status).toBe(400);
    expect(docFindAll).not.toHaveBeenCalled();
  });

  it('reconstructs a full FactoryProject from doc_json + tracks + requirements, with the approval state', async () => {
    docFindAll.mockResolvedValue([
      {
        track_type: 'solution_build', version: 2,
        doc_json: {
          processes: s.processes, roles: s.roles, tasks: s.tasks, assignments: s.assignments,
          transitions: s.transitions, allocation: s.allocation, role_map: s.role_map, source_blocks: s.source_blocks,
        },
        status: 'documented', approval_level: 'documented', enrichment_status: 'partial', content_sha256: 'hash123',
      },
    ]);
    trackFindAll.mockResolvedValue(s.tracks); // already track-shaped
    reqFindAll.mockResolvedValue(s.requirements.map((r) => ({ ...r, canonical_req_id: r.id }))); // DB row uses canonical_req_id

    const res = await request(app).get(`/api/admin/factory/contract/${UUID}`);
    expect(res.status).toBe(200);
    expect(res.body.isSample).toBe(false);
    expect(res.body.deliveryProjectId).toBe(UUID);
    expect(res.body.gate.ok).toBe(true);                 // the sample subset is gate-clean
    expect(res.body.compliance).toHaveLength(4);          // requirements reconstructed from the rows
    expect(res.body.allocation).toHaveLength(4);
    expect(res.body.approval).toEqual({
      status: 'documented', level: 'documented', version: 2, trackType: 'solution_build', enrichmentStatus: 'partial', contentHash: 'hash123',
    });
  });
});

describe('POST /api/admin/factory/contract/:id/approve', () => {
  const body = { trackType: 'solution_build', expectedVersion: 1, level: 'documented', enrichmentStatus: 'partial' };

  it('approves and returns the dto; approvedBy + revisionId come from the token/params, not the body', async () => {
    approveProcessDocument.mockResolvedValue({ id: 'doc-2', version: 2, status: 'documented' });
    const res = await request(app).post(`/api/admin/factory/contract/${UUID}/approve`).send(body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ version: 2, status: 'documented' });
    const arg = approveProcessDocument.mock.calls[0][0];
    expect(arg.approvedBy).toBe('admin@test');            // from the JWT, never the body
    expect(arg.revisionId).toBe(`${UUID}:solution_build:1`);
    expect(arg.level).toBe('documented');
  });

  it('maps a stale expected_version to 409 with currentVersion', async () => {
    approveProcessDocument.mockRejectedValue(new ApprovalConflictError(5));
    const res = await request(app).post(`/api/admin/factory/contract/${UUID}/approve`).send(body);
    expect(res.status).toBe(409);
    expect(res.body.currentVersion).toBe(5);
  });

  it('maps a gate-blocked document to 422 with the issues', async () => {
    approveProcessDocument.mockRejectedValue(new ApprovalGateError([{ code: 'PERFORMER', message: 'x', severity: 'error' }]));
    const res = await request(app).post(`/api/admin/factory/contract/${UUID}/approve`).send(body);
    expect(res.status).toBe(422);
    expect(res.body.issues[0].code).toBe('PERFORMER');
  });

  it('maps no-document to 404 and an illegal transition to 409', async () => {
    approveProcessDocument.mockRejectedValueOnce(new Error('no process document to approve'));
    let res = await request(app).post(`/api/admin/factory/contract/${UUID}/approve`).send(body);
    expect(res.status).toBe(404);
    approveProcessDocument.mockRejectedValueOnce(new Error('illegal approval transition draft -> full'));
    res = await request(app).post(`/api/admin/factory/contract/${UUID}/approve`).send(body);
    expect(res.status).toBe(409);
  });

  it('400s a bad body (missing level) without calling the engine', async () => {
    const res = await request(app).post(`/api/admin/factory/contract/${UUID}/approve`).send({ trackType: 'x', expectedVersion: 1, enrichmentStatus: 'partial' });
    expect(res.status).toBe(400);
    expect(approveProcessDocument).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/factory/contract/:id/request-changes', () => {
  it('records a change request (201) with requestedBy from the token', async () => {
    requestChanges.mockResolvedValue({ id: 'rev-1', decision: 'changes_requested' });
    const res = await request(app).post(`/api/admin/factory/contract/${UUID}/request-changes`).send({ trackType: 'solution_build', reviewedVersion: 1, reason: 'tighten the oversight' });
    expect(res.status).toBe(201);
    expect(requestChanges.mock.calls[0][0].requestedBy).toBe('admin@test');
  });

  it('400s a blank reason (Zod) and records nothing', async () => {
    const res = await request(app).post(`/api/admin/factory/contract/${UUID}/request-changes`).send({ trackType: 'solution_build', reviewedVersion: 1, reason: '' });
    expect(res.status).toBe(400);
    expect(requestChanges).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/factory/contracts', () => {
  it('lists projects with a persisted decomposition, latest per project, with names', async () => {
    docFindAll.mockResolvedValue([
      { delivery_project_id: 'dp-1', track_type: 'solution_build', version: 2, status: 'documented' },
      { delivery_project_id: 'dp-1', track_type: 'proposal', version: 1, status: 'draft' },
      { delivery_project_id: 'dp-2', track_type: 'solution_build', version: 1, status: 'draft' },
    ]);
    projectFindAll.mockResolvedValue([{ id: 'dp-1', name: 'Contract A' }, { id: 'dp-2', name: 'Contract B' }]);
    const res = await request(app).get('/api/admin/factory/contracts');
    expect(res.status).toBe(200);
    expect(res.body.contracts).toHaveLength(2); // one row per project (latest)
    expect(res.body.contracts.find((c: any) => c.deliveryProjectId === 'dp-1')).toMatchObject({ name: 'Contract A', version: 2 });
  });
});

describe('GET /api/admin/factory/opportunities', () => {
  it('returns the best-fit feed from the client (source + snapshotDate passthrough)', async () => {
    fetchBestFitOpportunities.mockResolvedValue({
      opportunities: [{ uuid: 'u1', title: 'A', agency: 'X', closeDate: null, fitScore: 70, estimatedValue: 100, sourceUrl: null }],
      source: 'snapshot', snapshotDate: '2026-06-08',
    });
    const res = await request(app).get('/api/admin/factory/opportunities');
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('snapshot');
    expect(res.body.snapshotDate).toBe('2026-06-08');
    expect(res.body.opportunities).toHaveLength(1);
  });
});

describe('POST /api/admin/factory/opportunities/:uuid/start — create the contract + open it', () => {
  const uuid = '2e287828-9040-4948-98fe-a0250a5d66a5';
  const container = { brandId: 'b1', org: { id: 'org-1' }, engagement: { id: 'eng-1', tenant_id: 'ten-1' } };

  it('creates a government_public_sector contract (slug gov-<uuid>) + backfills, returns 201', async () => {
    resolveGovContractsContainer.mockResolvedValue(container);
    govProjFindOne.mockResolvedValue(null);
    govProjCreate.mockResolvedValue({ id: 'dp-gov-1' });
    const res = await request(app).post(`/api/admin/factory/opportunities/${uuid}/start`).send({ title: 'Agenda RFP', agency: 'Harris County' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ deliveryProjectId: 'dp-gov-1', created: true });
    expect(govProjCreate.mock.calls[0][0]).toMatchObject({ slug: `gov-${uuid}`, project_class: 'government_public_sector', name: 'Agenda RFP' });
    expect(backfillUnassessedContract).toHaveBeenCalledWith('dp-gov-1');
  });

  it('is idempotent: an existing gov-<uuid> project is reused (200, no create) and still backfills', async () => {
    resolveGovContractsContainer.mockResolvedValue(container);
    govProjFindOne.mockResolvedValue({ id: 'dp-gov-1' });
    const res = await request(app).post(`/api/admin/factory/opportunities/${uuid}/start`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deliveryProjectId: 'dp-gov-1', created: false });
    expect(govProjCreate).not.toHaveBeenCalled();
    expect(backfillUnassessedContract).toHaveBeenCalledWith('dp-gov-1');
  });

  it('400s an invalid opportunity id (never creates)', async () => {
    const res = await request(app).post('/api/admin/factory/opportunities/not-a-uuid/start').send({});
    expect(res.status).toBe(400);
    expect(govProjCreate).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/factory/contract/:id/ingest-proposal — upload the solicitation zip', () => {
  it('ingests a .zip and returns the counts (200)', async () => {
    ingestProposal.mockResolvedValue({ requirements: 3, blocks: 5, fileName: 'RFP.zip' });
    const res = await request(app)
      .post(`/api/admin/factory/contract/${UUID}/ingest-proposal`)
      .attach('proposal', Buffer.from('PK fake zip bytes'), 'RFP.zip');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requirements: 3, blocks: 5, fileName: 'RFP.zip' });
    expect(ingestProposal.mock.calls[0][0]).toBe(UUID);
  });

  it('rejects a non-zip file (400, never ingests)', async () => {
    const res = await request(app)
      .post(`/api/admin/factory/contract/${UUID}/ingest-proposal`)
      .attach('proposal', Buffer.from('x'), 'RFP.pdf');
    expect(res.status).toBe(400);
    expect(ingestProposal).not.toHaveBeenCalled();
  });

  it('rejects a missing file (400)', async () => {
    const res = await request(app).post(`/api/admin/factory/contract/${UUID}/ingest-proposal`);
    expect(res.status).toBe(400);
    expect(ingestProposal).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/factory/contract/:id/generate — run the generation engine', () => {
  it('returns 200 accepted when the decomposition is gate-clean', async () => {
    generateDecomposition.mockResolvedValue({ status: 'generated', errorCount: 0 });
    const res = await request(app).post(`/api/admin/factory/contract/${UUID}/generate`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accepted: true, errorCount: 0 });
    expect(generateDecomposition).toHaveBeenCalledWith(UUID);
  });

  it('returns 422 with the issue count when the result is gate-dirty (never a fake pass)', async () => {
    generateDecomposition.mockResolvedValue({ status: 'rejected', errorCount: 2, issues: [{ code: 'START' }, { code: 'END' }] });
    const res = await request(app).post(`/api/admin/factory/contract/${UUID}/generate`);
    expect(res.status).toBe(422);
    expect(res.body.errorCount).toBe(2);
    expect(Array.isArray(res.body.issues)).toBe(true);
  });

  it('returns 409 when the generation engine is off', async () => {
    generateDecomposition.mockResolvedValue({ status: 'disabled' });
    const res = await request(app).post(`/api/admin/factory/contract/${UUID}/generate`);
    expect(res.status).toBe(409);
    expect(res.body.generationDisabled).toBe(true);
  });

  it('400s an invalid delivery project id (never generates)', async () => {
    const res = await request(app).post('/api/admin/factory/contract/not-a-uuid/generate');
    expect(res.status).toBe(400);
    expect(generateDecomposition).not.toHaveBeenCalled();
  });
});

describe('route-auth — every route is section-gated (required CI lint)', () => {
  it('the source guards every route with requireSection(\'program\')', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'factoryRoutes.ts'), 'utf8');
    const guards = src.match(/requireSection\('program'\)/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(9); // sample, contract, contracts, approve, request-changes, opportunities, start, ingest-proposal, generate
  });
});

describe('toContractRequirement — evidence honesty (Phase 6)', () => {
  const base = { canonical_req_id: 'REQ-1', statement: 'x', tracks: ['proposal'] };

  it("maps a null/unknown evidence_state to 'unassessed', never 'planned'", () => {
    expect(toContractRequirement({ ...base, evidence_state: null }).evidence_state).toBe('unassessed');
    expect(toContractRequirement({ ...base }).evidence_state).toBe('unassessed'); // undefined → unassessed
  });

  it("passes an explicit evidence_state through unchanged (incl. 'unassessed')", () => {
    expect(toContractRequirement({ ...base, evidence_state: 'unassessed' }).evidence_state).toBe('unassessed');
    expect(toContractRequirement({ ...base, evidence_state: 'demonstrated' }).evidence_state).toBe('demonstrated');
    expect(toContractRequirement({ ...base, evidence_state: 'planned' }).evidence_state).toBe('planned');
  });
});
