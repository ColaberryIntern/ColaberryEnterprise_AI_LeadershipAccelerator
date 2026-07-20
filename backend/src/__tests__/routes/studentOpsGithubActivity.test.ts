/**
 * GET /api/portal/student-ops/github-activity
 * Route-level test: mounts studentOpsRoutes with a stubbed participant and
 * mocked models — no real DB or JWT involved.
 */

jest.mock('../../middlewares/participantAuth', () => ({
  requireParticipant: (req: any, _res: any, next: any) => {
    req.participant = { sub: 'enrollment-1', email: 'student@example.com', cohort_id: 'cohort-1', role: 'participant' };
    next();
  },
}));

jest.mock('../../services/projectService', () => ({
  getProjectByEnrollment: jest.fn(),
}));

jest.mock('../../models/RequirementsMap', () => ({
  findAll: jest.fn(),
  findOne: jest.fn(),
}));

jest.mock('../../services/students/studentPromptService', () => ({
  generateStudentPrompt: jest.fn(() => 'stub-prompt'),
}));

jest.mock('../../models', () => ({
  GitHubConnection: { findOne: jest.fn() },
  StudentGithubActivity: { findOne: jest.fn() },
}));

import express from 'express';
import request from 'supertest';
import studentOpsRouter from '../../routes/studentOpsRoutes';
import { GitHubConnection, StudentGithubActivity } from '../../models';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(studentOpsRouter);
  return app;
}

describe('GET /api/portal/student-ops/github-activity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns commit/PR/star data when a repo is connected and synced (happy path)', async () => {
    (GitHubConnection.findOne as jest.Mock).mockResolvedValue({
      repo_owner: 'kes', repo_name: 'accelerator-project', repo_url: 'https://github.com/kes/accelerator-project',
    });
    (StudentGithubActivity.findOne as jest.Mock).mockResolvedValue({
      commits_last_7d: 12,
      open_prs: 2,
      total_stars: 5,
      contribution_graph_json: [{ date: '2026-07-19', count: 3 }],
      synced_at: new Date('2026-07-20T02:15:00Z'),
    });

    const res = await request(buildApp()).get('/api/portal/student-ops/github-activity');

    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.repo_url).toBe('https://github.com/kes/accelerator-project');
    expect(res.body.commits_last_7d).toBe(12);
    expect(res.body.open_prs).toBe(2);
    expect(res.body.total_stars).toBe(5);
    expect(res.body.contribution_graph).toEqual([{ date: '2026-07-19', count: 3 }]);
    expect(res.body.synced_at).toBe('2026-07-20T02:15:00.000Z');
  });

  it('returns connected:false with zeroed fields when no repo is linked yet (boundary)', async () => {
    (GitHubConnection.findOne as jest.Mock).mockResolvedValue(null);
    (StudentGithubActivity.findOne as jest.Mock).mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/portal/student-ops/github-activity');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      connected: false,
      repo_url: null,
      commits_last_7d: 0,
      open_prs: 0,
      total_stars: 0,
      contribution_graph: [],
      synced_at: null,
    });
  });

  it('treats an authorized-but-repo-not-yet-linked connection as not connected (boundary)', async () => {
    (GitHubConnection.findOne as jest.Mock).mockResolvedValue({ repo_owner: null, repo_name: null, repo_url: null });
    (StudentGithubActivity.findOne as jest.Mock).mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/portal/student-ops/github-activity');

    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
  });

  it('returns 500 with a generic error body when the database call fails (failure path)', async () => {
    (GitHubConnection.findOne as jest.Mock).mockRejectedValue(new Error('connection refused'));
    (StudentGithubActivity.findOne as jest.Mock).mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/portal/student-ops/github-activity');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to load GitHub activity' });
  });
});
