/**
 * Admin Gov-Contracts — the management-drivable proposal + copilot routes (Ali, 2026-11-02).
 *
 * These prove the ROUTE wiring: the `gov_contracts` section gate fronts every action (403 without it); a non-gov
 * or missing project is 404 (enumeration defense, same as the cockpit GET); the copilot answers from the SAME
 * projection with `viewerCanVerify=true` (management is the approver); and draft→accept both reach the shared
 * services with the admin's resolved identity and `canVerify=true`. The services/guards are unit-tested elsewhere.
 */
let sectionAllows = true;
let adminObj: any = { email: 'ali@colaberry.com' };
jest.mock('../../../middlewares/authMiddleware', () => ({
  requireSection: () => (req: any, res: any, next: any) => {
    if (sectionAllows) { req.admin = adminObj; next(); } else { res.status(403).json({ error: 'Forbidden' }); }
  },
  adminAllowedSections: () => ['program', 'gov_contracts'],
}));
let actorResult: any = { platformIdentityId: 'admin-1', email: 'ali@colaberry.com' };
jest.mock('../../../middlewares/govProjectAccess', () => ({ resolveGovProjectActor: async () => actorResult }));

const getStudentGovProjectView = jest.fn();
jest.mock('../../../services/factory/govProjectProjection', () => ({ getStudentGovProjectView: (...a: any[]) => getStudentGovProjectView(...a) }));
const answerCopilot = jest.fn();
jest.mock('../../../services/factory/govCopilot', () => ({ answerCopilot: (...a: any[]) => answerCopilot(...a) }));
const draftProposalDocument = jest.fn();
jest.mock('../../../services/factory/proposal/govProposalDocumentActions', () => ({ draftProposalDocument: (...a: any[]) => draftProposalDocument(...a) }));
const acceptProposalDocument = jest.fn();
const requestChangesProposalDocument = jest.fn();
const addProposalDocumentComment = jest.fn();
jest.mock('../../../services/factory/proposal/govProposalDocumentStore', () => ({
  acceptProposalDocument: (...a: any[]) => acceptProposalDocument(...a),
  requestChangesProposalDocument: (...a: any[]) => requestChangesProposalDocument(...a),
  addProposalDocumentComment: (...a: any[]) => addProposalDocumentComment(...a),
}));
jest.mock('../../../services/factory/govContractsList', () => ({ listGovContractsFor: jest.fn() }));

import express from 'express';
import request from 'supertest';
import router from '../govContractsRoutes';

const app = express();
app.use(express.json());
app.use(router);

const VIEW = { projectId: 'dp-A', name: 'Saratoga', status: 'discovery', tracks: [], requirements: [], requirementCounts: { total: 0, proposal: 0, build: 0 }, viewerCanVerify: true };

beforeEach(() => {
  jest.clearAllMocks();
  sectionAllows = true;
  adminObj = { email: 'ali@colaberry.com' };
  actorResult = { platformIdentityId: 'admin-1', email: 'ali@colaberry.com' };
  getStudentGovProjectView.mockResolvedValue(VIEW);
});

describe('admin gov-contracts: proposal + copilot (management-drivable)', () => {
  it('403 when the caller lacks the gov_contracts section — the projection is never consulted', async () => {
    sectionAllows = false;
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/copilot').send({ question: 'next?' });
    expect(res.status).toBe(403);
    expect(getStudentGovProjectView).not.toHaveBeenCalled();
  });

  it('404 for a non-gov / missing project (projection resolves null)', async () => {
    getStudentGovProjectView.mockResolvedValue(null);
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/documents/technical/draft').send({});
    expect(res.status).toBe(404);
    expect(draftProposalDocument).not.toHaveBeenCalled();
  });

  it('copilot answers from the projection, resolved with viewerCanVerify=true (management is the approver)', async () => {
    answerCopilot.mockReturnValue({ intent: 'next', answer: 'Draft the technical proposal.' });
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/copilot').send({ question: 'what next?' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ intent: 'next', answer: 'Draft the technical proposal.' });
    expect(getStudentGovProjectView).toHaveBeenCalledWith('dp-A', true, 'admin-1');
    expect(answerCopilot).toHaveBeenCalledWith(VIEW, 'what next?');
  });

  it('copilot requires a question (400 on blank)', async () => {
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/copilot').send({ question: '   ' });
    expect(res.status).toBe(400);
  });

  it('draft → accept: management drives the proposal document with canVerify=true and its own identity', async () => {
    draftProposalDocument.mockResolvedValue({ key: 'technical', status: 'drafted' });
    const d = await request(app).post('/api/admin/gov-contracts/dp-A/documents/technical/draft').send({});
    expect(d.status).toBe(200);
    expect(d.body).toEqual({ document: { key: 'technical', status: 'drafted' } });
    expect(draftProposalDocument).toHaveBeenCalledWith({ deliveryProjectId: 'dp-A', docKey: 'technical', identityId: 'admin-1', canVerify: true, manualHtml: null });

    acceptProposalDocument.mockResolvedValue({ key: 'technical', status: 'accepted' });
    const a = await request(app).post('/api/admin/gov-contracts/dp-A/documents/technical/accept').send({});
    expect(a.status).toBe(200);
    expect(a.body).toEqual({ document: { key: 'technical', status: 'accepted' } });
    expect(acceptProposalDocument).toHaveBeenCalledWith('dp-A', 'technical', 'admin-1');
  });

  it('a manual draft passes contentHtml through to the shared action', async () => {
    draftProposalDocument.mockResolvedValue({ key: 'technical', status: 'drafted' });
    await request(app).post('/api/admin/gov-contracts/dp-A/documents/technical/draft').send({ contentHtml: '<p>x</p>' });
    expect(draftProposalDocument).toHaveBeenCalledWith({ deliveryProjectId: 'dp-A', docKey: 'technical', identityId: 'admin-1', canVerify: true, manualHtml: '<p>x</p>' });
  });

  it('a ProposalDocumentError maps to its status code (already_accepted → 409)', async () => {
    acceptProposalDocument.mockRejectedValue(Object.assign(new Error('already accepted'), { name: 'ProposalDocumentError', reason: 'already_accepted' }));
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/documents/technical/accept').send({});
    expect(res.status).toBe(409);
  });

  it('comment + request-changes reach the store with the admin identity', async () => {
    addProposalDocumentComment.mockResolvedValue({ key: 'technical' });
    requestChangesProposalDocument.mockResolvedValue({ key: 'technical' });
    await request(app).post('/api/admin/gov-contracts/dp-A/documents/technical/comment').send({ body: 'nice' });
    expect(addProposalDocumentComment).toHaveBeenCalledWith('dp-A', 'technical', 'admin-1', 'nice');
    await request(app).post('/api/admin/gov-contracts/dp-A/documents/technical/request-changes').send({ note: 'fix it' });
    expect(requestChangesProposalDocument).toHaveBeenCalledWith('dp-A', 'technical', 'admin-1', 'fix it');
  });
});
