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
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { createProjectForEnrollment } from '../../services/projectService';

const mockCreateProject = createProjectForEnrollment as jest.Mock;

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
