/**
 * Tests for projectRoutes — POST /api/portal/project/cognitive/incidents/:id/dispatch.
 *
 * Covers the dispatch-idempotency fix: a double-click or client retry on the
 * manual incident-dispatch route must not re-send the incident email twice
 * within the 15-minute cooldown window.
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

import { getProjectByEnrollment } from '../../services/projectService';
import CognitiveIncident from '../../models/CognitiveIncident';
import IncidentDispatchLog from '../../models/IncidentDispatchLog';
import { fanOutIncident, persistDispatchLog } from '../../intelligence/systemStateEngine/incidents/incidentFanoutEngine';

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

beforeEach(() => {
  jest.clearAllMocks();
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
