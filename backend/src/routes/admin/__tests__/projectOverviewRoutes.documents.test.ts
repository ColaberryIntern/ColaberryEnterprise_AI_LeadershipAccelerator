/**
 * Admin project DOCUMENTS routes — list + file serving, with the enrollment-scoped allowlist proven in
 * the projectDocuments service. Here we prove the route wiring: requireAdmin gates it, a missing/non-
 * document piece is a 404 (never reaches the file sender), bad ids are 400, and a real document is
 * streamed through the shared artifact-file sender.
 */
let adminAllows = true;
jest.mock('../../../middlewares/authMiddleware', () => ({
  requireAdmin: (req: any, res: any, next: any) => {
    if (adminAllows) { req.admin = { email: 'ali@colaberry.com' }; next(); } else { res.status(403).json({ error: 'Forbidden' }); }
  },
}));

jest.mock('../../../services/projectDocuments', () => ({
  listProjectDocuments: jest.fn(),
  getProjectDocumentFile: jest.fn(),
}));
jest.mock('../../artifactFileResponses', () => ({
  sendArtifactFile: jest.fn((_req: any, res: any) => res.status(200).send('bytes')),
  logFailure: jest.fn(),
}));

// The router pulls other admin services at import; stub the heavy ones so importing it never touches a DB.
jest.mock('../../../services/projectDeliveryService', () => ({
  getProjectDelivery: jest.fn(), getProjectGantt: jest.fn(), getProjectEvidence: jest.fn(), getProjectArtifacts: jest.fn(),
}));
jest.mock('../../../services/enrollmentsWithoutProjects', () => ({ getEnrollmentsWithoutProjects: jest.fn() }));
jest.mock('../../../services/projectRepoResolver', () => ({ resolveProjectRepos: jest.fn() }));
jest.mock('../../../services/projects/projectAdminArchiveService', () => ({
  adminArchiveProject: jest.fn(), adminRestoreProject: jest.fn(), listArchivedProjects: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import router from '../projectOverviewRoutes';
import { listProjectDocuments as _list, getProjectDocumentFile as _get } from '../../../services/projectDocuments';
import { sendArtifactFile as _send } from '../../artifactFileResponses';

const listProjectDocuments = _list as jest.Mock;
const getProjectDocumentFile = _get as jest.Mock;
const sendArtifactFile = _send as jest.Mock;

const app = express();
app.use(express.json());
app.use(router);

const PID = '11111111-1111-1111-1111-111111111111';
const AID = '22222222-2222-2222-2222-222222222222';

beforeEach(() => { jest.clearAllMocks(); adminAllows = true; sendArtifactFile.mockImplementation((_req: any, res: any) => res.status(200).send('bytes')); });

describe('GET /api/admin/projects/:projectId/documents', () => {
  it('200 with the project\'s document list', async () => {
    listProjectDocuments.mockResolvedValue([{ id: AID, name: 'plan.pdf', title: 'plan.pdf', from: 'Lesson A', kind: 'pdf' }]);
    const res = await request(app).get(`/api/admin/projects/${PID}/documents`);
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
    expect(listProjectDocuments).toHaveBeenCalledWith(PID);
  });

  it('400 on a non-UUID projectId, service never called', async () => {
    const res = await request(app).get('/api/admin/projects/not-a-uuid/documents');
    expect(res.status).toBe(400);
    expect(listProjectDocuments).not.toHaveBeenCalled();
  });

  it('403 without admin; service never called', async () => {
    adminAllows = false;
    const res = await request(app).get(`/api/admin/projects/${PID}/documents`);
    expect(res.status).toBe(403);
    expect(listProjectDocuments).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/projects/:projectId/documents/:artifactId/file', () => {
  it('streams a document through the shared sender', async () => {
    getProjectDocumentFile.mockResolvedValue({ absPath: '/u/plan.pdf', name: 'plan.pdf', kind: 'pdf', contentType: 'application/pdf', title: 'plan.pdf' });
    const res = await request(app).get(`/api/admin/projects/${PID}/documents/${AID}/file`);
    expect(res.status).toBe(200);
    expect(getProjectDocumentFile).toHaveBeenCalledWith(PID, AID);
    expect(sendArtifactFile).toHaveBeenCalled();
  });

  it('404 when the piece is not a document of this project\'s enrollment (never sent)', async () => {
    getProjectDocumentFile.mockResolvedValue(null);
    const res = await request(app).get(`/api/admin/projects/${PID}/documents/${AID}/file`);
    expect(res.status).toBe(404);
    expect(sendArtifactFile).not.toHaveBeenCalled();
  });

  it('400 on a non-UUID artifactId, nothing fetched', async () => {
    const res = await request(app).get(`/api/admin/projects/${PID}/documents/not-a-uuid/file`);
    expect(res.status).toBe(400);
    expect(getProjectDocumentFile).not.toHaveBeenCalled();
  });

  it('403 without admin; nothing fetched', async () => {
    adminAllows = false;
    const res = await request(app).get(`/api/admin/projects/${PID}/documents/${AID}/file`);
    expect(res.status).toBe(403);
    expect(getProjectDocumentFile).not.toHaveBeenCalled();
  });
});
