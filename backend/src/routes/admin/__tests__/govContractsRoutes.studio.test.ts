/**
 * Admin Gov-Contracts — the Proposal Studio P2–P6 routes (blueprint, gates, artifacts, package). Proves the ROUTE
 * wiring: the `gov_contracts` section gate fronts every action (403 without it); a non-gov/missing project is 404;
 * and each service error class maps to the right status — a missing solicitation bundle is 409, a Gold
 * separation-of-duties violation is 403, an out-of-order gate is 409, and a blocked package export is 409. The
 * services + their guards are unit-tested elsewhere; this is the HTTP contract.
 */
let sectionAllows = true;
let adminObj: any = { email: 'ali@colaberry.com' };
jest.mock('../../../middlewares/authMiddleware', () => ({
  requireSection: () => (req: any, res: any, next: any) => { if (sectionAllows) { req.admin = adminObj; next(); } else { res.status(403).json({ error: 'Forbidden' }); } },
  adminAllowedSections: () => ['gov_contracts'],
}));
jest.mock('../../../middlewares/govProjectAccess', () => ({ resolveGovProjectActor: async () => ({ platformIdentityId: 'admin-1', email: 'ali@colaberry.com' }) }));
const getStudentGovProjectView = jest.fn();
jest.mock('../../../services/factory/govProjectProjection', () => ({ getStudentGovProjectView: (...a: any[]) => getStudentGovProjectView(...a) }));
jest.mock('../../../config/upload', () => ({ signedDocumentUpload: { single: () => (_q: any, _s: any, n: any) => n() }, GOV_BUILD_ARTIFACT_DIR: '/tmp/gov-artifacts' }));
jest.mock('../../../services/factory/govContractsList', () => ({ listGovContractsFor: jest.fn() }));

const reanalyzeProposalBlueprint = jest.fn();
jest.mock('../../../services/factory/proposal/reanalyzeProposalBlueprint', () => ({ reanalyzeProposalBlueprint: (...a: any[]) => reanalyzeProposalBlueprint(...a) }));
const docIdFor = jest.fn();
const decideGate = jest.fn();
jest.mock('../../../services/factory/proposal/govProposalReviewStore', () => ({
  docIdFor: (...a: any[]) => docIdFor(...a), decideGate: (...a: any[]) => decideGate(...a),
  listDocumentVersions: jest.fn(async () => []), listGateReviews: jest.fn(async () => []), diffVersions: jest.fn(async () => []),
}));
const assembleProposalPackage = jest.fn();
jest.mock('../../../services/factory/proposal/buildProposalPackage', () => ({ assembleProposalPackage: (...a: any[]) => assembleProposalPackage(...a) }));
const artifactFindByPk = jest.fn();
jest.mock('../../../models/GovBuildArtifact', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => artifactFindByPk(...a) } }));

import express from 'express';
import request from 'supertest';
import router from '../govContractsRoutes';

const app = express();
app.use(express.json());
app.use(router);
const VIEW = { projectId: 'dp-A', name: 'Saratoga', viewerCanVerify: true };
const err = (name: string, reason: string) => Object.assign(new Error(reason), { name, reason });

beforeEach(() => { jest.clearAllMocks(); sectionAllows = true; getStudentGovProjectView.mockResolvedValue(VIEW); });

describe('blueprint/reanalyze', () => {
  it('403 without the section (service never called)', async () => {
    sectionAllows = false;
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/blueprint/reanalyze').send({});
    expect(res.status).toBe(403);
    expect(reanalyzeProposalBlueprint).not.toHaveBeenCalled();
  });
  it('404 for a non-gov / missing project', async () => {
    getStudentGovProjectView.mockResolvedValue(null);
    expect((await request(app).post('/api/admin/gov-contracts/dp-A/blueprint/reanalyze').send({})).status).toBe(404);
  });
  it('409 when the stored solicitation bundle is missing', async () => {
    reanalyzeProposalBlueprint.mockRejectedValue(err('BlueprintReanalysisError', 'bundle_missing'));
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/blueprint/reanalyze').send({});
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('bundle_missing');
  });
  it('200 returns the new version + diff', async () => {
    reanalyzeProposalBlueprint.mockResolvedValue({ version: 2, blueprint: {}, diff: { summary: [] }, documentCount: 5 });
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/blueprint/reanalyze').send({});
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
    expect(reanalyzeProposalBlueprint).toHaveBeenCalledWith('dp-A', 'admin-1');
  });
});

describe('gate decide', () => {
  beforeEach(() => docIdFor.mockResolvedValue('doc-1'));
  it('400 on an unknown gate', async () => {
    expect((await request(app).post('/api/admin/gov-contracts/dp-A/documents/technical/gates/purple').send({ decision: 'approve' })).status).toBe(400);
  });
  it('400 on an invalid decision', async () => {
    expect((await request(app).post('/api/admin/gov-contracts/dp-A/documents/technical/gates/gold').send({ decision: 'maybe' })).status).toBe(400);
  });
  it('403 on a Gold separation-of-duties violation', async () => {
    decideGate.mockRejectedValue(err('ProposalReviewError', 'separation_of_duties'));
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/documents/technical/gates/gold').send({ decision: 'approve' });
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('separation_of_duties');
  });
  it('409 when a gate is approved out of order', async () => {
    decideGate.mockRejectedValue(err('ProposalReviewError', 'gate_order'));
    expect((await request(app).post('/api/admin/gov-contracts/dp-A/documents/technical/gates/gold').send({ decision: 'approve' })).status).toBe(409);
  });
  it('200 records a valid decision', async () => {
    decideGate.mockResolvedValue([{ gate: 'pink', status: 'approved' }]);
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/documents/technical/gates/pink').send({ decision: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.gates[0].status).toBe('approved');
  });
});

describe('artifact image', () => {
  it('404 when the artifact is not this project\'s', async () => {
    artifactFindByPk.mockResolvedValue({ id: 'a1', delivery_project_id: 'OTHER', file_path: 'x.png' });
    expect((await request(app).get('/api/admin/gov-contracts/dp-A/artifacts/a1/image')).status).toBe(404);
  });
});

describe('package assemble', () => {
  it('409 with the blocking reasons when not ready', async () => {
    assembleProposalPackage.mockResolvedValue({ ok: false, blocking: ['gold_gate_unapproved:technical'] });
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/package/assemble').send({});
    expect(res.status).toBe(409);
    expect(res.body.blocking).toContain('gold_gate_unapproved:technical');
  });
  it('200 with the manifest when ready', async () => {
    assembleProposalPackage.mockResolvedValue({ ok: true, blocking: [], manifest: { fileCount: 3, items: [] }, rendered: 2 });
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/package/assemble').send({});
    expect(res.status).toBe(200);
    expect(res.body.manifest.fileCount).toBe(3);
  });
});
