/**
 * The student gov-project route: a member reaches their assigned project (200, student-safe body); a non-member
 * is 404 (the guard's enumeration defense), and the projection is never even consulted for them. The guard and
 * the projection are unit-tested elsewhere; here we prove the ROUTE wires them in the right order.
 */
jest.mock('../../middlewares/participantAuth', () => ({
  requireParticipant: (req: any, _res: any, next: any) => { req.participant = { email: 'student@test', sub: 's1', role: 'participant' }; next(); },
}));
let guardAllows = true;
let ctxIdentity: string | null = null; // the deliveryContext identity the guard attaches (null keeps the GET test's null thread)
let actorResult: any = { platformIdentityId: 'id-1', email: 'student@test' };
jest.mock('../../middlewares/govProjectAccess', () => ({
  // Mirrors the real guard's contract: on allow, attach ctx + next(); on deny, 404 (non-member) — never 200.
  requireGovProjectAccess: () => (req: any, res: any, next: any) => {
    if (guardAllows) { req.deliveryContext = { platformIdentityId: ctxIdentity, roles: ['associate_builder'] }; next(); }
    else { res.status(404).json({ error: 'Not found' }); }
  },
  resolveGovProjectActor: async () => actorResult,
}));
const getStudentGovProjectView = jest.fn();
jest.mock('../../services/factory/govProjectProjection', () => ({ getStudentGovProjectView: (...a: any[]) => getStudentGovProjectView(...a) }));
const saveProposalResponse = jest.fn();
const resolveProposalGap = jest.fn();
class ResponseError extends Error { reason: string; constructor(message: string, reason: string) { super(message); this.name = 'ResponseError'; this.reason = reason; } }
jest.mock('../../services/factory/govProposalResponse', () => ({
  saveProposalResponse: (...a: any[]) => saveProposalResponse(...a),
  resolveProposalGap: (...a: any[]) => resolveProposalGap(...a),
  ResponseError,
}));
const dpmFindAll = jest.fn();
jest.mock('../../models/DeliveryProjectMember', () => ({ __esModule: true, default: { findAll: (...a: any[]) => dpmFindAll(...a) } }));
const dpFindAll = jest.fn();
jest.mock('../../models/DeliveryProject', () => ({ __esModule: true, default: { findAll: (...a: any[]) => dpFindAll(...a) } }));

import express from 'express';
import request from 'supertest';
import router from '../govProjectPortalRoutes';

const app = express();
app.use(express.json());
app.use(router);

const SAFE_VIEW = { projectId: 'dp-A', name: 'TxDOT Claims Search', status: 'discovery', tracks: [], requirements: [], requirementCounts: { total: 0, proposal: 0, build: 0 } };

beforeEach(() => { jest.clearAllMocks(); guardAllows = true; ctxIdentity = null; actorResult = { platformIdentityId: 'id-1', email: 'student@test' }; getStudentGovProjectView.mockResolvedValue(SAFE_VIEW); });

const editProposalView = (responses: any[] = [{ requirementId: 'REQ-001', statement: 'x', status: 'unanswered', content: '', openGapCount: 0 }]) =>
  ({ ...SAFE_VIEW, proposal: { level: 'edit', canComment: true, canEdit: true, responses } });

describe('GET /api/portal/gov-projects/:projectId', () => {
  it('a MEMBER reaches their assigned project: 200 with the student-safe projection', async () => {
    const res = await request(app).get('/api/portal/gov-projects/dp-A');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ project: SAFE_VIEW });
    // The route threads the viewer's own verify capability (P3-T3) + their identity (P6, for the proposal share
    // level). The mocked ctx has no platformIdentityId, so identity threads as null.
    expect(getStudentGovProjectView).toHaveBeenCalledWith('dp-A', false, null);
  });

  it('a NON-MEMBER is 404 — and the projection is NEVER consulted (guard denies first)', async () => {
    guardAllows = false;
    const res = await request(app).get('/api/portal/gov-projects/dp-OTHER');
    expect(res.status).toBe(404);
    expect(getStudentGovProjectView).not.toHaveBeenCalled();
  });

  it('a member on a non-gov / archived project (projection null) is 404', async () => {
    getStudentGovProjectView.mockResolvedValue(null);
    const res = await request(app).get('/api/portal/gov-projects/dp-A');
    expect(res.status).toBe(404);
  });

  it('a projection failure is a 500, not a leak', async () => {
    getStudentGovProjectView.mockRejectedValue(new Error('db down'));
    const res = await request(app).get('/api/portal/gov-projects/dp-A');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not load the project.' });
  });
});

describe('GET /api/portal/gov-projects (list my assigned gov projects)', () => {
  it('lists only the caller\'s active gov memberships — a non-gov project is filtered out', async () => {
    dpmFindAll.mockResolvedValue([{ delivery_project_id: 'dp-A' }, { delivery_project_id: 'dp-STD' }]);
    dpFindAll.mockResolvedValue([
      { id: 'dp-A', name: 'TxDOT Claims Search', status: 'discovery', project_class: 'government_public_sector', archived_at: null },
      { id: 'dp-STD', name: 'A standard project', status: 'active', project_class: 'standard', archived_at: null },
    ]);
    const res = await request(app).get('/api/portal/gov-projects');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ projects: [{ projectId: 'dp-A', name: 'TxDOT Claims Search', status: 'discovery' }] });
    expect(dpmFindAll).toHaveBeenCalledWith({ where: { platform_identity_id: 'id-1', status: 'active' } });
  });

  it('an archived gov project is filtered out', async () => {
    dpmFindAll.mockResolvedValue([{ delivery_project_id: 'dp-A' }]);
    dpFindAll.mockResolvedValue([{ id: 'dp-A', name: 'X', status: 'discovery', project_class: 'government_public_sector', archived_at: new Date() }]);
    const res = await request(app).get('/api/portal/gov-projects');
    expect(res.body).toEqual({ projects: [] });
  });

  it('no resolvable identity ⇒ empty list, and the DB is never queried', async () => {
    actorResult = null;
    const res = await request(app).get('/api/portal/gov-projects');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ projects: [] });
    expect(dpmFindAll).not.toHaveBeenCalled();
  });

  it('no memberships ⇒ empty list without a project lookup', async () => {
    dpmFindAll.mockResolvedValue([]);
    const res = await request(app).get('/api/portal/gov-projects');
    expect(res.body).toEqual({ projects: [] });
    expect(dpFindAll).not.toHaveBeenCalled();
  });
});

describe('POST /api/portal/gov-projects/:projectId/proposal/:requirementId (intern authoring)', () => {
  beforeEach(() => { ctxIdentity = 'id-1'; }); // the guard resolves this intern's identity on this project

  it('an EDIT-shared member saves a response: 200, and the author id is the GUARD identity, never the body', async () => {
    getStudentGovProjectView.mockResolvedValue(editProposalView());
    saveProposalResponse.mockResolvedValue({ requirementId: 'REQ-001', status: 'draft', content: 'our answer' });
    const res = await request(app).post('/api/portal/gov-projects/dp-A/proposal/REQ-001').send({ content: 'our answer', authoredByIdentityId: 'HACK' });
    expect(res.status).toBe(200);
    expect(saveProposalResponse).toHaveBeenCalledWith({ deliveryProjectId: 'dp-A', requirementId: 'REQ-001', content: 'our answer', authoredByIdentityId: 'id-1' });
  });

  it('a VIEW/COMMENT member (no edit share) is 403 — nothing is written', async () => {
    getStudentGovProjectView.mockResolvedValue({ ...SAFE_VIEW, proposal: { level: 'comment', canComment: true, canEdit: false, responses: [{ requirementId: 'REQ-001', statement: 'x', status: 'unanswered', content: '', openGapCount: 0 }] } });
    const res = await request(app).post('/api/portal/gov-projects/dp-A/proposal/REQ-001').send({ content: 'x' });
    expect(res.status).toBe(403);
    expect(saveProposalResponse).not.toHaveBeenCalled();
  });

  it('a requirement the projection does not expose (e.g. a pricing slot) is 404 — nothing is written', async () => {
    getStudentGovProjectView.mockResolvedValue(editProposalView()); // responses expose only REQ-001
    const res = await request(app).post('/api/portal/gov-projects/dp-A/proposal/REQ-PRICING').send({ content: 'x' });
    expect(res.status).toBe(404);
    expect(saveProposalResponse).not.toHaveBeenCalled();
  });

  it('a NON-MEMBER is 404 (the guard denies first) — the projection is never consulted', async () => {
    guardAllows = false;
    const res = await request(app).post('/api/portal/gov-projects/dp-OTHER/proposal/REQ-001').send({ content: 'x' });
    expect(res.status).toBe(404);
    expect(getStudentGovProjectView).not.toHaveBeenCalled();
    expect(saveProposalResponse).not.toHaveBeenCalled();
  });
});

describe('POST /api/portal/gov-projects/:projectId/proposal/:requirementId/gaps/:gapId (intern gap resolution)', () => {
  beforeEach(() => { ctxIdentity = 'id-1'; });
  const withGap = () => editProposalView([{ requirementId: 'REQ-001', statement: 'x', status: 'draft', content: 'c', openGapCount: 1, gaps: [{ id: 'g1', question: 'q', suggestions: [], resolution: 'open' }] }]);

  it('an EDIT-shared member resolves a gap: 200, resolveProposalGap called with the ids', async () => {
    getStudentGovProjectView.mockResolvedValue(withGap());
    resolveProposalGap.mockResolvedValue({ requirementId: 'REQ-001', status: 'draft' });
    const res = await request(app).post('/api/portal/gov-projects/dp-A/proposal/REQ-001/gaps/g1').send({ resolution: 'answered', answer: 'yes' });
    expect(res.status).toBe(200);
    expect(resolveProposalGap).toHaveBeenCalledWith({ deliveryProjectId: 'dp-A', requirementId: 'REQ-001', gapId: 'g1', resolution: 'answered', answer: 'yes' });
  });

  it('maps a ResponseError to its status (empty_answer → 422)', async () => {
    getStudentGovProjectView.mockResolvedValue(withGap());
    resolveProposalGap.mockRejectedValue(new ResponseError('An answered gap needs an answer.', 'empty_answer'));
    const res = await request(app).post('/api/portal/gov-projects/dp-A/proposal/REQ-001/gaps/g1').send({ resolution: 'answered', answer: '' });
    expect(res.status).toBe(422);
    expect(res.body.reason).toBe('empty_answer');
  });

  it('a non-edit member is 403 — nothing is written', async () => {
    getStudentGovProjectView.mockResolvedValue({ ...SAFE_VIEW, proposal: { level: 'view', canComment: false, canEdit: false, responses: [{ requirementId: 'REQ-001', statement: 'x', status: 'draft', content: 'c', openGapCount: 0 }] } });
    const res = await request(app).post('/api/portal/gov-projects/dp-A/proposal/REQ-001/gaps/g1').send({ resolution: 'filler' });
    expect(res.status).toBe(403);
    expect(resolveProposalGap).not.toHaveBeenCalled();
  });
});
