/**
 * Admin Gov-Contracts — the U1 read-model routes (review-run status, version content, questions, section plan). Proves
 * the HTTP contract: the run cycle returns a runId and 409s when a run is already active; the poll returns the run or
 * 404; the questions list returns; the section plan is reviewer-gated and 404s a missing section; version content
 * 404s when absent. Services are unit-tested elsewhere; this is the wiring.
 */
let sectionAllows = true;
jest.mock('../../../middlewares/authMiddleware', () => ({
  requireSection: () => (req: any, res: any, next: any) => { if (sectionAllows) { req.admin = { email: 'ali@colaberry.com' }; next(); } else { res.status(403).json({ error: 'Forbidden' }); } },
  adminAllowedSections: () => ['gov_contracts'],
}));
jest.mock('../../../middlewares/govProjectAccess', () => ({ resolveGovProjectActor: async () => ({ platformIdentityId: 'admin-1', email: 'ali@colaberry.com' }) }));
const getStudentGovProjectView = jest.fn();
jest.mock('../../../services/factory/govProjectProjection', () => ({ getStudentGovProjectView: (...a: any[]) => getStudentGovProjectView(...a) }));
jest.mock('../../../config/upload', () => ({ signedDocumentUpload: { single: () => (_q: any, _s: any, n: any) => n() }, GOV_BUILD_ARTIFACT_DIR: '/tmp/gov-artifacts' }));
jest.mock('../../../services/factory/govContractsList', () => ({ listGovContractsFor: jest.fn() }));

const docIdFor = jest.fn();
const getDocumentVersionContent = jest.fn();
jest.mock('../../../services/factory/proposal/govProposalReviewStore', () => ({
  docIdFor: (...a: any[]) => docIdFor(...a), getDocumentVersionContent: (...a: any[]) => getDocumentVersionContent(...a),
}));
const activeRunForDoc = jest.fn();
const createRun = jest.fn();
const getRun = jest.fn();
const updateRun = jest.fn();
jest.mock('../../../services/factory/proposal/govProposalReviewRunStore', () => ({
  activeRunForDoc: (...a: any[]) => activeRunForDoc(...a), createRun: (...a: any[]) => createRun(...a),
  getRun: (...a: any[]) => getRun(...a), updateRun: (...a: any[]) => updateRun(...a),
}));
const runReviewCycle = jest.fn();
jest.mock('../../../services/factory/proposal/runReviewCycle', () => ({ runReviewCycle: (...a: any[]) => runReviewCycle(...a) }));
const listOpenQuestions = jest.fn();
jest.mock('../../../services/factory/proposal/govProposalGaps', () => ({ listOpenQuestions: (...a: any[]) => listOpenQuestions(...a), decodeQuestionKey: (k: string) => Buffer.from(String(k), 'base64url').toString('utf8') || null }));
const loadProposalActivity = jest.fn();
jest.mock('../../../services/factory/proposal/proposalActivity', () => ({ loadProposalActivity: (...a: any[]) => loadProposalActivity(...a) }));
const saveSectionPlan = jest.fn();
jest.mock('../../../services/factory/proposal/govProposalDocumentStore', () => ({ saveSectionPlan: (...a: any[]) => saveSectionPlan(...a) }));

import express from 'express';
import request from 'supertest';
import router from '../govContractsRoutes';

const app = express();
app.use(express.json());
app.use(router);
const err = (name: string, reason: string) => Object.assign(new Error(reason), { name, reason });

beforeEach(() => {
  jest.clearAllMocks();
  sectionAllows = true;
  getStudentGovProjectView.mockResolvedValue({ projectId: 'dp-A', viewerCanVerify: true, proposalDocuments: [] });
  docIdFor.mockResolvedValue('doc-1');
  runReviewCycle.mockResolvedValue({ iterations: 1, stoppedBecause: 'passed', finalPasses: true });
});

describe('review-cycle start (B.5)', () => {
  it('200 returns a runId and starts the cycle when no run is active', async () => {
    activeRunForDoc.mockResolvedValue(null);
    createRun.mockResolvedValue({ id: 'run-7' });
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/documents/technical/review-cycle').send({ maxIterations: 2 });
    expect(res.status).toBe(200);
    expect(res.body.runId).toBe('run-7');
    expect(createRun).toHaveBeenCalledWith('doc-1');
  });
  it('409 when a run is already active for the document', async () => {
    activeRunForDoc.mockResolvedValue({ id: 'run-existing', status: 'running' });
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/documents/technical/review-cycle').send({});
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('run_active');
    expect(createRun).not.toHaveBeenCalled();
  });
  it('404 when the document does not exist', async () => {
    docIdFor.mockResolvedValue(null);
    expect((await request(app).post('/api/admin/gov-contracts/dp-A/documents/nope/review-cycle').send({})).status).toBe(404);
  });
});

describe('review-cycle poll (B.5)', () => {
  it('200 returns the run', async () => {
    getRun.mockResolvedValue({ id: 'run-7', status: 'running', iterations: 1 });
    const res = await request(app).get('/api/admin/gov-contracts/dp-A/review-cycle/run-7');
    expect(res.status).toBe(200);
    expect(res.body.run.status).toBe('running');
  });
  it('404 for an unknown run', async () => {
    getRun.mockResolvedValue(null);
    expect((await request(app).get('/api/admin/gov-contracts/dp-A/review-cycle/nope')).status).toBe(404);
  });
});

describe('questions list (B.3)', () => {
  it('200 returns the open questions', async () => {
    listOpenQuestions.mockResolvedValue([{ key: 'k1', question: 'DUNS?', why: null, documentKeys: ['reps_certs'], suggestions: [] }]);
    const res = await request(app).get('/api/admin/gov-contracts/dp-A/questions?status=open');
    expect(res.status).toBe(200);
    expect(res.body.questions[0].question).toBe('DUNS?');
  });
});

describe('activity feed (B.4)', () => {
  it('200 returns the activity', async () => {
    loadProposalActivity.mockResolvedValue([{ kind: 'version', at: '2026-11-05T00:00:00.000Z', summary: 'Agent version 1' }]);
    const res = await request(app).get('/api/admin/gov-contracts/dp-A/activity?limit=10');
    expect(res.status).toBe(200);
    expect(res.body.activity[0].kind).toBe('version');
    expect(loadProposalActivity).toHaveBeenCalledWith('dp-A', 10);
  });
});

describe('section plan (B.7)', () => {
  it('200 saves the plan (reviewer)', async () => {
    saveSectionPlan.mockResolvedValue({ key: 'technical' });
    const res = await request(app).put('/api/admin/gov-contracts/dp-A/documents/technical/sections/REQ-1/plan').send({ hotButton: 'cost', feature: 'f', benefit: 'b', proof: 'p', discriminator: 'd' });
    expect(res.status).toBe(200);
    expect(saveSectionPlan).toHaveBeenCalledWith('dp-A', 'technical', 'REQ-1', { hotButton: 'cost', feature: 'f', benefit: 'b', proof: 'p', discriminator: 'd' }, 'admin-1');
  });
  it('404 when the section is not on the document', async () => {
    saveSectionPlan.mockRejectedValue(err('ProposalDocumentError', 'not_found'));
    expect((await request(app).put('/api/admin/gov-contracts/dp-A/documents/technical/sections/GONE/plan').send({})).status).toBe(404);
  });
  it('401 without a reviewer identity', async () => {
    saveSectionPlan.mockRejectedValue(err('ProposalDocumentError', 'no_reviewer'));
    expect((await request(app).put('/api/admin/gov-contracts/dp-A/documents/technical/sections/REQ-1/plan').send({})).status).toBe(401);
  });
});

describe('version content (B.2)', () => {
  it('200 returns the stored content', async () => {
    getDocumentVersionContent.mockResolvedValue({ contentHtml: '<p>x</p>', sections: [], figures: [] });
    const res = await request(app).get('/api/admin/gov-contracts/dp-A/documents/technical/versions/v1');
    expect(res.status).toBe(200);
    expect(res.body.contentHtml).toBe('<p>x</p>');
  });
  it('404 when the version is absent', async () => {
    getDocumentVersionContent.mockResolvedValue(null);
    expect((await request(app).get('/api/admin/gov-contracts/dp-A/documents/technical/versions/nope')).status).toBe(404);
  });
});
