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
// v4 portal artifact-image route: mock the artifact model + the upload dir (set to a real temp dir in beforeAll so a
// member actually receives the bytes, while a wrong-project / missing id is 404).
const gbaFindByPk = jest.fn();
jest.mock('../../models/GovBuildArtifact', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => gbaFindByPk(...a) } }));
const mockUpload: { GOV_BUILD_ARTIFACT_DIR: string } = { GOV_BUILD_ARTIFACT_DIR: '' };
jest.mock('../../config/upload', () => mockUpload);
// Participant read-only qualification endpoints: the project's qualification record resolves the (tenant, canonical
// key, bidding entity); the SAME getDecoupledWorkspace the admin route calls builds the payload; the best-fit feed
// backs opportunity-detail. The award amount must be stripped for a participant.
const gqFindOne = jest.fn();
jest.mock('../../models/GovQualification', () => ({ __esModule: true, default: { findOne: (...a: any[]) => gqFindOne(...a) } }));
const getDecoupledWorkspace = jest.fn();
jest.mock('../../services/factory/govQualification', () => ({ getDecoupledWorkspace: (...a: any[]) => getDecoupledWorkspace(...a) }));
const fetchBestFitOpportunities = jest.fn();
jest.mock('../../services/factory/opportunities/oppPulseClient', () => ({ fetchBestFitOpportunities: (...a: any[]) => fetchBestFitOpportunities(...a) }));
// Read-only package-signatures mirror: the participant route LISTS signatures (never seeds/writes).
const listSignatures = jest.fn();
jest.mock('../../services/factory/proposal/govProposalSignatures', () => ({ listSignatures: (...a: any[]) => listSignatures(...a) }));
// Phase B intern-authoring services (dynamically imported inside the new author routes).
const applyHumanEdit = jest.fn();
jest.mock('../../services/factory/proposal/humanEdit', () => ({ applyHumanEdit: (...a: any[]) => applyHumanEdit(...a) }));
const saveSectionPlan = jest.fn();
jest.mock('../../services/factory/proposal/govProposalDocumentStore', () => ({ saveSectionPlan: (...a: any[]) => saveSectionPlan(...a) }));
const runProposalDocumentChecks = jest.fn();
jest.mock('../../services/factory/proposal/runProposalDocumentChecks', () => ({ runProposalDocumentChecks: (...a: any[]) => runProposalDocumentChecks(...a) }));
const recaptureStory = jest.fn();
jest.mock('../../services/factory/proposal/captureStoryArtifact', () => ({ recaptureStory: (...a: any[]) => recaptureStory(...a) }));
const insertArtifactFigure = jest.fn();
jest.mock('../../services/factory/proposal/insertArtifactFigure', () => ({ insertArtifactFigure: (...a: any[]) => insertArtifactFigure(...a) }));
const reanalyzeProposalBlueprint = jest.fn();
jest.mock('../../services/factory/proposal/reanalyzeProposalBlueprint', () => ({ reanalyzeProposalBlueprint: (...a: any[]) => reanalyzeProposalBlueprint(...a) }));
// Repo-file content endpoint: the lightweight connected-repo resolver (the deliverable allowlist) and the live
// raw-byte GitHub fetch are both mocked so the ROUTE's allowlist gating + headers are what gets proven.
const resolveConnectedRepo = jest.fn();
jest.mock('../../services/factory/govConnectedRepo', () => ({ resolveConnectedRepo: (...a: any[]) => resolveConnectedRepo(...a) }));
const fetchRepoFileRaw = jest.fn();
jest.mock('../../services/sbp/repoConnect/githubRepoClient', () => ({ fetchRepoFileRaw: (...a: any[]) => fetchRepoFileRaw(...a) }));

import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import nodePath from 'path';
import router from '../govProjectPortalRoutes';

const app = express();
app.use(express.json());
app.use(router);

const SAFE_VIEW = { projectId: 'dp-A', name: 'TxDOT Claims Search', status: 'discovery', tracks: [], requirements: [], requirementCounts: { total: 0, proposal: 0, build: 0 } };

beforeEach(() => { jest.clearAllMocks(); guardAllows = true; ctxIdentity = null; actorResult = { platformIdentityId: 'id-1', email: 'student@test' }; getStudentGovProjectView.mockResolvedValue(SAFE_VIEW); });

describe('GET /api/portal/gov-projects/:projectId/cockpit-full (the SAME admin cockpit, read-only parity, member-gated)', () => {
  it('a MEMBER gets the cockpit built with viewerCanVerify=true AND redactAdminOnly=true, with the award stripped', async () => {
    getStudentGovProjectView.mockResolvedValue({ ...SAFE_VIEW, estimatedValue: 482000, source: { estimatedValue: 482000 } });
    const res = await request(app).get('/api/portal/gov-projects/dp-A/cockpit-full');
    expect(res.status).toBe(200);
    // the SAME builder: reviewer/pricing PANELS on (viewerCanVerify=true), admin-only SUBSTANCE redacted (redactAdminOnly=true)
    expect(getStudentGovProjectView).toHaveBeenCalledWith('dp-A', true, null, true);
    expect(res.body.project).toBeTruthy();
    expect(res.body.project.estimatedValue).toBeNull();        // award stripped at the boundary
    expect(res.body.project.source.estimatedValue).toBeNull();
  });

  it('a NON-MEMBER is 404 — the builder is never called (guard denies first)', async () => {
    guardAllows = false;
    const res = await request(app).get('/api/portal/gov-projects/dp-A/cockpit-full');
    expect(res.status).toBe(404);
    expect(getStudentGovProjectView).not.toHaveBeenCalled();
  });

  it('a null projection (the id is not a non-archived gov project) is 404', async () => {
    getStudentGovProjectView.mockResolvedValue(null);
    const res = await request(app).get('/api/portal/gov-projects/dp-A/cockpit-full');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/portal/gov-projects/:projectId/package/signatures (read-only signature status, member-gated)', () => {
  it('a MEMBER gets the signature status list, read-only (lists, never seeds/writes)', async () => {
    listSignatures.mockResolvedValue([{ formKey: 'hsp', signerRole: 'Authorized signatory', status: 'unsigned', required: true, hasFile: false }]);
    const res = await request(app).get('/api/portal/gov-projects/dp-A/package/signatures');
    expect(res.status).toBe(200);
    expect(res.body.signatures[0].formKey).toBe('hsp');
    expect(listSignatures).toHaveBeenCalledWith('dp-A');
  });

  it('a NON-MEMBER is 404 — listSignatures is never called (guard denies first)', async () => {
    guardAllows = false;
    const res = await request(app).get('/api/portal/gov-projects/dp-A/package/signatures');
    expect(res.status).toBe(404);
    expect(listSignatures).not.toHaveBeenCalled();
  });
});

describe('GET /api/portal/gov-projects/:projectId/qualification (the REAL admin workspace, read-only, member-gated)', () => {
  beforeEach(() => {
    gqFindOne.mockResolvedValue({ get: () => ({ tenant_id: 't1', canonical_opportunity_id: 'gws-abc', bidding_entity: 'colaberry' }) });
    getDecoupledWorkspace.mockResolvedValue({ canonicalOpportunityId: 'gws-abc', evaluation: { evals: [{ id: 'REQ-001', blocking: true }] }, source: { estimatedValue: 500000, deadline: null } });
  });

  it('a MEMBER gets the SAME builder output as admin, with the award amount stripped', async () => {
    const res = await request(app).get('/api/portal/gov-projects/dp-A/qualification');
    expect(res.status).toBe(200);
    expect(getDecoupledWorkspace).toHaveBeenCalledWith('t1', 'gws-abc', 'colaberry'); // the identical admin builder
    expect(res.body.evaluation.evals[0].id).toBe('REQ-001'); // same requirement data the admin renders
    expect(res.body.source.estimatedValue).toBeNull(); // award/estimated value NEVER reaches a participant
  });

  it('a NON-MEMBER is 404 — the builder is never called (guard denies first)', async () => {
    guardAllows = false;
    const res = await request(app).get('/api/portal/gov-projects/dp-OTHER/qualification');
    expect(res.status).toBe(404);
    expect(getDecoupledWorkspace).not.toHaveBeenCalled();
  });

  it('a project with no qualification yet is 404 — the builder is never called', async () => {
    gqFindOne.mockResolvedValue(null);
    const res = await request(app).get('/api/portal/gov-projects/dp-A/qualification');
    expect(res.status).toBe(404);
    expect(getDecoupledWorkspace).not.toHaveBeenCalled();
  });
});

describe('GET /api/portal/gov-projects/:projectId/opportunity-detail (estimatedValue nulled)', () => {
  beforeEach(() => {
    gqFindOne.mockResolvedValue({ get: () => ({ tenant_id: 't1', canonical_opportunity_id: 'opp-1', bidding_entity: 'colaberry' }) });
    fetchBestFitOpportunities.mockResolvedValue({ opportunities: [{ uuid: 'opp-1', estimatedValue: 750000, title: 'X', agency: 'TxDOT' }], source: 'live', snapshotDate: null });
  });

  it('a MEMBER gets the opportunity detail with estimatedValue FORCED null (other fields intact)', async () => {
    const res = await request(app).get('/api/portal/gov-projects/dp-A/opportunity-detail');
    expect(res.status).toBe(200);
    expect(res.body.opportunity.title).toBe('X');
    expect(res.body.opportunity.estimatedValue).toBeNull();
  });

  it('a decoupled key with no matching feed row ⇒ opportunity null (no award figure)', async () => {
    fetchBestFitOpportunities.mockResolvedValue({ opportunities: [], source: 'snapshot', snapshotDate: null });
    const res = await request(app).get('/api/portal/gov-projects/dp-A/opportunity-detail');
    expect(res.status).toBe(200);
    expect(res.body.opportunity).toBeNull();
  });

  it('a NON-MEMBER is 404 — the feed is never consulted', async () => {
    guardAllows = false;
    const res = await request(app).get('/api/portal/gov-projects/dp-OTHER/opportunity-detail');
    expect(res.status).toBe(404);
    expect(fetchBestFitOpportunities).not.toHaveBeenCalled();
  });
});

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

describe('POST /api/portal/gov-projects/:projectId/copilot (project copilot)', () => {
  it('a member asks a question: 200 with a classified, grounded answer from the SAME student-safe projection', async () => {
    const res = await request(app).post('/api/portal/gov-projects/dp-A/copilot').send({ question: 'what should I do next?' });
    expect(res.status).toBe(200);
    expect(res.body.intent).toBe('next');
    expect(typeof res.body.answer).toBe('string');
    expect(res.body.answer.length).toBeGreaterThan(0);
    // The copilot is grounded in the SAME projection the page renders (its own trust boundary) — the viewer's
    // identity threads through (null here, from the mocked ctx).
    expect(getStudentGovProjectView).toHaveBeenCalledWith('dp-A', false, null);
  });

  it('an empty question is 400 — the projection is never consulted', async () => {
    const res = await request(app).post('/api/portal/gov-projects/dp-A/copilot').send({ question: '   ' });
    expect(res.status).toBe(400);
    expect(getStudentGovProjectView).not.toHaveBeenCalled();
  });

  it('a NON-MEMBER is 404 (the guard denies first) — the projection is never consulted', async () => {
    guardAllows = false;
    const res = await request(app).post('/api/portal/gov-projects/dp-OTHER/copilot').send({ question: 'next?' });
    expect(res.status).toBe(404);
    expect(getStudentGovProjectView).not.toHaveBeenCalled();
  });

  it('a member on a non-gov / archived project (projection null) is 404', async () => {
    getStudentGovProjectView.mockResolvedValue(null);
    const res = await request(app).post('/api/portal/gov-projects/dp-A/copilot').send({ question: 'next?' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/portal/gov-projects/:projectId/artifacts/:artifactId/image (member thumbnail)', () => {
  let tmpDir = '';
  beforeAll(() => {
    tmpDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'gps-art-'));
    fs.writeFileSync(nodePath.join(tmpDir, 'cap.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]));
    mockUpload.GOV_BUILD_ARTIFACT_DIR = tmpDir;
  });
  afterAll(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ } });

  it('a MEMBER receives the captured PNG (the artifact belongs to THIS project) — bytes streamed from the upload dir', async () => {
    gbaFindByPk.mockResolvedValue({ id: 'a1', delivery_project_id: 'dp-A', file_path: '/wherever/cap.png' });
    const res = await request(app).get('/api/portal/gov-projects/dp-A/artifacts/a1/image');
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toMatch(/image\/png/);
    expect(gbaFindByPk).toHaveBeenCalledWith('a1'); // only the basename of file_path is ever used (no path traversal)
  });

  it('a MEMBER requesting an artifact that belongs to ANOTHER project is 404 (project scope, not just membership)', async () => {
    gbaFindByPk.mockResolvedValue({ id: 'a1', delivery_project_id: 'dp-OTHER', file_path: '/wherever/cap.png' });
    const res = await request(app).get('/api/portal/gov-projects/dp-A/artifacts/a1/image');
    expect(res.status).toBe(404);
  });

  it('a MEMBER requesting a missing artifact id is 404', async () => {
    gbaFindByPk.mockResolvedValue(null);
    const res = await request(app).get('/api/portal/gov-projects/dp-A/artifacts/nope/image');
    expect(res.status).toBe(404);
  });

  it('a NON-MEMBER is 404 (the guard denies first) — the artifact is never looked up', async () => {
    guardAllows = false;
    const res = await request(app).get('/api/portal/gov-projects/dp-OTHER/artifacts/a1/image');
    expect(res.status).toBe(404);
    expect(gbaFindByPk).not.toHaveBeenCalled();
  });
});

// ── Phase B: intern authoring routes — EDIT-share gated, author-safe only; approvals/export stay management ───────
describe('intern authoring routes (B.9) — EDIT share lets the intern author + run checks, never approve/export', () => {
  const EDIT_VIEW = { ...SAFE_VIEW, proposal: { level: 'edit', canComment: true, canEdit: true, responses: [] }, proposalDocuments: [{ key: 'technical' }] };
  const NOEDIT_VIEW = { ...SAFE_VIEW, proposal: { level: 'view', canComment: false, canEdit: false, responses: [] }, proposalDocuments: [{ key: 'technical' }] };
  beforeEach(() => { ctxIdentity = 'id-1'; getStudentGovProjectView.mockResolvedValue(EDIT_VIEW); });

  it('edit: an EDIT-shared intern saves a human version via applyHumanEdit (author, canVerify:false)', async () => {
    applyHumanEdit.mockResolvedValue({ ok: true });
    const res = await request(app).post('/api/portal/gov-projects/dp-A/documents/technical/edit').send({ contentHtml: '<p>x</p>' });
    expect(res.status).toBe(200);
    expect(applyHumanEdit).toHaveBeenCalledWith('dp-A', 'technical', '<p>x</p>', { identityId: 'id-1', canVerify: false });
  });

  it('edit: a member WITHOUT an edit share is 403 and the service is never called', async () => {
    getStudentGovProjectView.mockResolvedValue(NOEDIT_VIEW);
    const res = await request(app).post('/api/portal/gov-projects/dp-A/documents/technical/edit').send({ contentHtml: '<p>x</p>' });
    expect(res.status).toBe(403);
    expect(applyHumanEdit).not.toHaveBeenCalled();
  });

  it('edit: a NON-member is 404 (guard denies first)', async () => {
    guardAllows = false;
    const res = await request(app).post('/api/portal/gov-projects/dp-OTHER/documents/technical/edit').send({ contentHtml: '<p>x</p>' });
    expect(res.status).toBe(404);
    expect(applyHumanEdit).not.toHaveBeenCalled();
  });

  it('edit: a doc NOT in the caller projection (e.g. pricing) is 404', async () => {
    const res = await request(app).post('/api/portal/gov-projects/dp-A/documents/pricing/edit').send({ contentHtml: '<p>x</p>' });
    expect(res.status).toBe(404);
    expect(applyHumanEdit).not.toHaveBeenCalled();
  });

  it('run-checks: an EDIT-shared intern scores the version (200), and 409 when none is drafted', async () => {
    runProposalDocumentChecks.mockResolvedValueOnce({ scores: {} });
    let res = await request(app).post('/api/portal/gov-projects/dp-A/documents/technical/run-checks').send({});
    expect(res.status).toBe(200);
    runProposalDocumentChecks.mockResolvedValueOnce(null);
    res = await request(app).post('/api/portal/gov-projects/dp-A/documents/technical/run-checks').send({});
    expect(res.status).toBe(409);
  });

  it('section plan: an EDIT-shared intern saves it via saveSectionPlan', async () => {
    saveSectionPlan.mockResolvedValue({ key: 'technical' });
    const res = await request(app).put('/api/portal/gov-projects/dp-A/documents/technical/sections/s1/plan').send({ hotButton: 'h' });
    expect(res.status).toBe(200);
    expect(saveSectionPlan).toHaveBeenCalledWith('dp-A', 'technical', 's1', expect.objectContaining({ hotButton: 'h' }), 'id-1');
  });

  it('recapture: an EDIT-shared intern recaptures a story', async () => {
    recaptureStory.mockResolvedValue({ captured: true });
    const res = await request(app).post('/api/portal/gov-projects/dp-A/stories/STORY-1/recapture').send({});
    expect(res.status).toBe(200);
    expect(recaptureStory).toHaveBeenCalledWith('dp-A', 'STORY-1');
  });

  it('insert-figure: an EDIT-shared intern inserts a captured artifact', async () => {
    insertArtifactFigure.mockResolvedValue({ key: 'technical' });
    const res = await request(app).post('/api/portal/gov-projects/dp-A/documents/technical/insert-figure').send({ artifactId: 'a1' });
    expect(res.status).toBe(200);
    expect(insertArtifactFigure).toHaveBeenCalledWith('dp-A', 'technical', 'a1', 'id-1');
  });

  it('blueprint reanalyze: an EDIT-shared intern re-reads the stored ZIP', async () => {
    reanalyzeProposalBlueprint.mockResolvedValue({ ok: true });
    const res = await request(app).post('/api/portal/gov-projects/dp-A/blueprint/reanalyze').send({});
    expect(res.status).toBe(200);
    expect(reanalyzeProposalBlueprint).toHaveBeenCalledWith('dp-A', 'id-1');
  });

  it('THE BOUNDARY: no participant path to gate decisions, Gold, Export/assemble, signature upload or due-date', async () => {
    const gate = await request(app).post('/api/portal/gov-projects/dp-A/documents/technical/gates/gold').send({ decision: 'approve' });
    const gold = await request(app).post('/api/portal/gov-projects/dp-A/gold').send({});
    const assemble = await request(app).post('/api/portal/gov-projects/dp-A/package/assemble').send({});
    const sign = await request(app).post('/api/portal/gov-projects/dp-A/package/signatures/execution').send({});
    const due = await request(app).post('/api/portal/gov-projects/dp-A/due-date').send({});
    for (const r of [gate, gold, assemble, sign, due]) expect(r.status).toBe(404); // no such participant route exists
  });
});

describe('GET /api/portal/gov-projects/:projectId/repo-file (live deliverable content, allowlist-gated)', () => {
  const REPO = {
    owner: 'ColaberryIntern', name: 'crash', url: 'u',
    files: ['docs/plan.pdf', 'server/auth.js', 'README.md'],
    fileCount: 3, syncedAt: null,
    deliverables: [
      { path: 'docs/plan.pdf', name: 'plan.pdf', kind: 'pdf' },
      { path: 'README.md', name: 'README.md', kind: 'text' },
    ],
  };
  beforeEach(() => {
    resolveConnectedRepo.mockResolvedValue(REPO);
    fetchRepoFileRaw.mockResolvedValue(Buffer.from('%PDF-1.4 bytes'));
  });

  it('serves a deliverable: 200, pdf inline, nosniff, fetched by owner/name/path', async () => {
    const res = await request(app).get('/api/portal/gov-projects/dp-A/repo-file').query({ path: 'docs/plan.pdf' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('inline');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(fetchRepoFileRaw).toHaveBeenCalledWith('ColaberryIntern', 'crash', 'docs/plan.pdf');
  });

  it('a text deliverable is served as an attachment (never renders on our origin)', async () => {
    fetchRepoFileRaw.mockResolvedValue(Buffer.from('# Readme'));
    const res = await request(app).get('/api/portal/gov-projects/dp-A/repo-file').query({ path: 'README.md' });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('?download=1 forces a pdf to attachment', async () => {
    const res = await request(app).get('/api/portal/gov-projects/dp-A/repo-file').query({ path: 'docs/plan.pdf', download: '1' });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  it('a source/secret path that exists but is NOT a deliverable -> 403, never fetched', async () => {
    const res = await request(app).get('/api/portal/gov-projects/dp-A/repo-file').query({ path: 'server/auth.js' });
    expect(res.status).toBe(403);
    expect(fetchRepoFileRaw).not.toHaveBeenCalled();
  });

  it('a path NOT in the synced tree (traversal/guess) -> 404, never fetched', async () => {
    const res = await request(app).get('/api/portal/gov-projects/dp-A/repo-file').query({ path: '../../etc/passwd' });
    expect(res.status).toBe(404);
    expect(fetchRepoFileRaw).not.toHaveBeenCalled();
  });

  it('no connected repo -> 404', async () => {
    resolveConnectedRepo.mockResolvedValue(null);
    const res = await request(app).get('/api/portal/gov-projects/dp-A/repo-file').query({ path: 'docs/plan.pdf' });
    expect(res.status).toBe(404);
  });

  it('a non-member is 404 by the guard; the repo is never resolved', async () => {
    guardAllows = false;
    const res = await request(app).get('/api/portal/gov-projects/dp-A/repo-file').query({ path: 'docs/plan.pdf' });
    expect(res.status).toBe(404);
    expect(resolveConnectedRepo).not.toHaveBeenCalled();
  });

  it('missing path param -> 400', async () => {
    const res = await request(app).get('/api/portal/gov-projects/dp-A/repo-file');
    expect(res.status).toBe(400);
  });

  it('the file is gone from the repo (fetch returns null) -> 404', async () => {
    fetchRepoFileRaw.mockResolvedValue(null);
    const res = await request(app).get('/api/portal/gov-projects/dp-A/repo-file').query({ path: 'docs/plan.pdf' });
    expect(res.status).toBe(404);
  });

  it('an upstream GitHub failure -> 502, generic, no token/secret in the body', async () => {
    fetchRepoFileRaw.mockRejectedValue(new Error('UpstreamTimeout: GitHub did not answer'));
    const res = await request(app).get('/api/portal/gov-projects/dp-A/repo-file').query({ path: 'docs/plan.pdf' });
    expect(res.status).toBe(502);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/token|secret|Bearer/i);
  });
});
