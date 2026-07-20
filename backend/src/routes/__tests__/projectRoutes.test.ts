/**
 * Tests for projectRoutes — PATCH /api/portal/project/name.
 *
 * Covers the wizard resume-on-reload fix: step 0 of the project builder
 * must persist a project row + name immediately, before requirements exist.
 */
import express from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that load the mocked modules
// ---------------------------------------------------------------------------

jest.mock('../../middlewares/participantAuth', () => ({
  requireParticipant: (req: any, _res: any, next: any) => {
    req.participant = {
      sub: 'enrollment-test-uuid',
      email: 'student@test.com',
      cohort_id: 'cohort-1',
      role: 'participant',
    };
    next();
  },
}));

jest.mock('../../services/projectService', () => ({
  createProjectForEnrollment: jest.fn(),
  getProjectByEnrollment: jest.fn(),
}));

jest.mock('../../models/CognitiveIncident', () => ({ findByPk: jest.fn() }));
jest.mock('../../models/IncidentDispatchLog', () => ({ findOne: jest.fn() }));
jest.mock('../../intelligence/systemStateEngine/incidents/incidentFanoutEngine', () => ({
  fanOutIncident: jest.fn(),
  persistDispatchLog: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { createProjectForEnrollment, getProjectByEnrollment } from '../../services/projectService';
import CognitiveIncident from '../../models/CognitiveIncident';
import IncidentDispatchLog from '../../models/IncidentDispatchLog';
import { fanOutIncident, persistDispatchLog } from '../../intelligence/systemStateEngine/incidents/incidentFanoutEngine';

const mockCreateProject = createProjectForEnrollment as jest.Mock;
const mockGetProject = getProjectByEnrollment as jest.Mock;
const mockFindIncident = CognitiveIncident.findByPk as jest.Mock;
const mockFindDispatchLog = IncidentDispatchLog.findOne as jest.Mock;
const mockFanOutIncident = fanOutIncident as jest.Mock;
const mockPersistDispatchLog = persistDispatchLog as jest.Mock;

const buildApp = async () => {
  const app = express();
  app.use(express.json());
  const mod = await import('../projectRoutes');
  app.use(mod.default);
  return app;
};

const makeProject = (overrides: Partial<any> = {}) => ({
  id: 'project-uuid-001',
  name: null,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PATCH /api/portal/project/name', () => {
  it('creates/loads the project, saves the trimmed name, and returns it', async () => {
    const project = makeProject();
    mockCreateProject.mockResolvedValue(project);
    const app = await buildApp();

    const res = await request(app)
      .patch('/api/portal/project/name')
      .send({ name: '  My Capstone  ' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'project-uuid-001', name: 'My Capstone' });
    expect(mockCreateProject).toHaveBeenCalledWith('enrollment-test-uuid');
    expect(project.save).toHaveBeenCalledTimes(1);
  });

  it('returns 500 without leaking internals when the service throws', async () => {
    mockCreateProject.mockRejectedValue(new Error('DB connection lost'));
    const app = await buildApp();

    const res = await request(app)
      .patch('/api/portal/project/name')
      .send({ name: 'My Capstone' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to save project name' });
  });

  it('returns 400 for an empty name', async () => {
    const app = await buildApp();

    const res = await request(app)
      .patch('/api/portal/project/name')
      .send({ name: '   ' });

    expect(res.status).toBe(400);
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('returns 400 for a name over 80 characters', async () => {
    const app = await buildApp();

    const res = await request(app)
      .patch('/api/portal/project/name')
      .send({ name: 'x'.repeat(81) });

    expect(res.status).toBe(400);
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('returns 400 when name is missing', async () => {
    const app = await buildApp();

    const res = await request(app)
      .patch('/api/portal/project/name')
      .send({});

    expect(res.status).toBe(400);
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('is idempotent: running twice with the same name updates the same project once each time, never creating a second project', async () => {
    const project = makeProject();
    mockCreateProject.mockResolvedValue(project);
    const app = await buildApp();

    const first = await request(app).patch('/api/portal/project/name').send({ name: 'My Capstone' });
    const second = await request(app).patch('/api/portal/project/name').send({ name: 'My Capstone' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body).toEqual(second.body);
    expect(mockCreateProject).toHaveBeenCalledTimes(2);
    expect(mockCreateProject).toHaveBeenNthCalledWith(1, 'enrollment-test-uuid');
    expect(mockCreateProject).toHaveBeenNthCalledWith(2, 'enrollment-test-uuid');
    expect(project.save).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/portal/project/cognitive/incidents/:id/dispatch', () => {
  const project = { id: 'project-uuid-001' };
  const incident = {
    id: 'incident-1',
    project_id: 'project-uuid-001',
    type: 'anomaly',
    severity: 'error',
    state: 'open',
    affected_routes: ['/foo'],
    cognition_impact: 'high',
    recommended_actions: ['check logs'],
    opened_at: new Date('2026-07-20T00:00:00Z'),
    occurrence_count: 1,
    metadata: {},
  };

  beforeEach(() => {
    mockGetProject.mockResolvedValue(project);
    mockFindIncident.mockResolvedValue(incident);
    mockFindDispatchLog.mockResolvedValue(null);
    mockFanOutIncident.mockResolvedValue({
      incident_id: 'incident-1', attempted_subscribers: ['cognitive-incident-email'],
      outcomes: [{ subscriber_id: 'cognitive-incident-email', status: 'succeeded' }],
      succeeded: 1, failed: 0, skipped: 0, elapsed_ms: 5,
    });
  });

  it('happy path: no prior dispatch — fans out and persists a dispatch log', async () => {
    const app = await buildApp();

    const res = await request(app).post('/api/portal/project/cognitive/incidents/incident-1/dispatch');

    expect(res.status).toBe(200);
    expect(res.body.succeeded).toBe(1);
    expect(mockFanOutIncident).toHaveBeenCalledTimes(1);
    expect(mockPersistDispatchLog).toHaveBeenCalledTimes(1);
  });

  it('boundary: a dispatch already logged within the cooldown window is not repeated (idempotency)', async () => {
    mockFindDispatchLog.mockResolvedValue({
      dispatched_at: new Date(Date.now() - 60 * 1000), // 1 minute ago, inside the 15-minute cooldown
      attempted_subscribers: ['cognitive-incident-email'],
      outcomes: [{ subscriber_id: 'cognitive-incident-email', status: 'succeeded' }],
      succeeded: 1,
      failed: 0,
    });
    const app = await buildApp();

    const res = await request(app).post('/api/portal/project/cognitive/incidents/incident-1/dispatch');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ deduped: true, succeeded: 1 }));
    expect(mockFanOutIncident).not.toHaveBeenCalled();
    expect(mockPersistDispatchLog).not.toHaveBeenCalled();
  });

  it('boundary: a prior dispatch outside the cooldown window fans out again', async () => {
    mockFindDispatchLog.mockResolvedValue({
      dispatched_at: new Date(Date.now() - 20 * 60 * 1000), // 20 minutes ago, past the 15-minute cooldown
      attempted_subscribers: ['cognitive-incident-email'],
      outcomes: [],
      succeeded: 1,
      failed: 0,
    });
    const app = await buildApp();

    const res = await request(app).post('/api/portal/project/cognitive/incidents/incident-1/dispatch');

    expect(res.status).toBe(200);
    expect(res.body.deduped).toBeUndefined();
    expect(mockFanOutIncident).toHaveBeenCalledTimes(1);
  });

  it('failure path: incident not found returns 404 without dispatching', async () => {
    mockFindIncident.mockResolvedValue(null);
    const app = await buildApp();

    const res = await request(app).post('/api/portal/project/cognitive/incidents/incident-1/dispatch');

    expect(res.status).toBe(404);
    expect(mockFanOutIncident).not.toHaveBeenCalled();
  });

  it('failure path: an incident belonging to another project returns 403 without dispatching', async () => {
    mockFindIncident.mockResolvedValue({ ...incident, project_id: 'someone-elses-project' });
    const app = await buildApp();

    const res = await request(app).post('/api/portal/project/cognitive/incidents/incident-1/dispatch');

    expect(res.status).toBe(403);
    expect(mockFanOutIncident).not.toHaveBeenCalled();
  });
});
