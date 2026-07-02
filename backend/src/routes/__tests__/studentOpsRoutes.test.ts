/**
 * Tests for studentOpsRoutes.
 *
 * Coverage:
 *   - Pure functions: classify, scoreRequirement, buildPrompt
 *   - Route: GET /my-queue  (happy + no-project + DB failure)
 *   - Route: GET /run-my-day (happy + limit clamping)
 *   - Route: GET /metrics/today (happy + no-project)
 *   - Route: POST /decide  (happy + invalid input + not-found)
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

jest.mock('../../models/RequirementsMap', () => {
  const mock = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
  };
  return { __esModule: true, default: mock };
});

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { classify, scoreRequirement, buildPrompt } from '../studentOpsRoutes';
import { getProjectByEnrollment } from '../../services/projectService';
import RequirementsMap from '../../models/RequirementsMap';

const mockGetProject = getProjectByEnrollment as jest.Mock;
const mockFindAll = (RequirementsMap as any).findAll as jest.Mock;
const mockFindOne = (RequirementsMap as any).findOne as jest.Mock;
const mockCount = (RequirementsMap as any).count as jest.Mock;

const PROJECT = { id: 'project-uuid-001' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Valid UUID v4 used as a stable test fixture throughout this file.
const REQ_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const makeReq = (overrides: Partial<any> = {}) => ({
  id: REQ_UUID,
  project_id: PROJECT.id,
  requirement_key: 'AUTH.001',
  requirement_text: 'Implement JWT authentication',
  status: 'unmatched',
  updated_at: new Date('2026-06-01T00:00:00Z'),
  github_file_paths: [],
  ...overrides,
});

const buildApp = async () => {
  const app = express();
  app.use(express.json());
  const mod = await import('../studentOpsRoutes');
  app.use(mod.default);
  return app;
};

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe('classify()', () => {
  it('returns deploy for docker-related text', () => {
    expect(classify('Set up Docker container').cat).toBe('deploy');
  });

  it('returns integrate for API/webhook text', () => {
    expect(classify('Wire up GitHub webhook').cat).toBe('integrate');
  });

  it('returns test for testing text', () => {
    expect(classify('Write jest coverage').cat).toBe('test');
  });

  it('returns default for unrecognised text', () => {
    expect(classify('General requirement with no keywords').cat).toBe('default');
    expect(classify('General requirement with no keywords').bonus).toBe(0);
  });

  it('matches on requirement_key prefix too', () => {
    expect(classify('DEPLOY.001 something').cat).toBe('deploy');
  });
});

describe('scoreRequirement()', () => {
  it('scores an unmatched requirement above a matched one', () => {
    const unmatched = makeReq({ status: 'unmatched', updated_at: new Date() });
    const matched   = makeReq({ status: 'matched',   updated_at: new Date() });
    const { urgency: uScore } = scoreRequirement(unmatched as any);
    const { urgency: mScore } = scoreRequirement(matched   as any);
    expect(uScore).toBeGreaterThan(mScore);
  });

  it('caps at 100 for a very stale, unmatched, high-keyword task', () => {
    const req = makeReq({
      status: 'unmatched',
      requirement_key: 'DEPLOY.001',
      requirement_text: 'Deploy docker infrastructure to production VPS',
      updated_at: new Date(Date.now() - 30 * 86400000), // 30 days stale
    });
    const { urgency } = scoreRequirement(req as any);
    expect(urgency).toBeLessThanOrEqual(100);
    expect(urgency).toBeGreaterThanOrEqual(60);
  });

  it('returns the correct category with the text', () => {
    // "service" in the text would match the build pattern first; use a text
    // that only triggers the test pattern.
    const req = makeReq({ requirement_text: 'Write jest coverage and playwright specs' });
    const { cat } = scoreRequirement(req as any);
    expect(cat).toBe('test');
  });

  it('uses base 10 for unknown status values', () => {
    const req = makeReq({ status: 'something_unknown', updated_at: new Date() });
    const { urgency } = scoreRequirement(req as any);
    expect(urgency).toBeGreaterThanOrEqual(10);
  });
});

describe('buildPrompt()', () => {
  it('returns a non-empty string for each category', () => {
    const categories = ['build', 'integrate', 'deploy', 'test', 'design', 'default'] as const;
    for (const cat of categories) {
      const prompt = buildPrompt('Implement user login', cat);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(10);
    }
  });

  it('escapes double-quotes in the requirement text', () => {
    const prompt = buildPrompt('Build a "secure" auth flow', 'build');
    expect(prompt).not.toContain('"secure"');
    expect(prompt).toContain('\\"secure\\"');
  });
});

// ---------------------------------------------------------------------------
// Route tests
// ---------------------------------------------------------------------------

describe('GET /api/portal/student-ops/my-queue', () => {
  let app: express.Express;
  beforeAll(async () => { app = await buildApp(); });
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with scored items when project and requirements exist', async () => {
    mockGetProject.mockResolvedValue(PROJECT);
    mockFindAll.mockResolvedValue([
      makeReq({ status: 'unmatched', requirement_text: 'Authenticate users' }),
      makeReq({ id: 'req-002', requirement_key: 'DATA.001', status: 'partial', requirement_text: 'Store user profiles' }),
    ]);

    const res = await request(app)
      .get('/api/portal/student-ops/my-queue')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toHaveProperty('urgency_score');
    expect(res.body.items[0]).toHaveProperty('claude_code_prompt');
    expect(res.body.items[0].rank).toBe(1);
    expect(res.body.total).toBe(2);
    expect(res.body.project_id).toBe(PROJECT.id);
  });

  it('returns empty queue when student has no project', async () => {
    mockGetProject.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/portal/student-ops/my-queue')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.project_id).toBeNull();
  });

  it('sorts items by urgency_score descending', async () => {
    mockGetProject.mockResolvedValue(PROJECT);
    mockFindAll.mockResolvedValue([
      makeReq({ status: 'matched',   id: 'req-low',  requirement_text: 'low priority task', updated_at: new Date() }),
      makeReq({ status: 'unmatched', id: 'req-high', requirement_text: 'high priority task', updated_at: new Date(Date.now() - 20 * 86400000) }),
    ]);

    const res = await request(app)
      .get('/api/portal/student-ops/my-queue')
      .set('Authorization', 'Bearer fake-token');

    const scores = res.body.items.map((i: any) => i.urgency_score);
    expect(scores[0]).toBeGreaterThanOrEqual(scores[1]);
  });

  it('returns 500 when RequirementsMap.findAll throws', async () => {
    mockGetProject.mockResolvedValue(PROJECT);
    mockFindAll.mockRejectedValue(new Error('DB connection lost'));

    const res = await request(app)
      .get('/api/portal/student-ops/my-queue')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /api/portal/student-ops/run-my-day', () => {
  let app: express.Express;
  beforeAll(async () => { app = await buildApp(); });
  beforeEach(() => jest.clearAllMocks());

  it('returns top 5 tasks by default', async () => {
    mockGetProject.mockResolvedValue(PROJECT);
    const reqs = Array.from({ length: 8 }, (_, i) =>
      makeReq({ id: `req-${i}`, requirement_key: `AUTH.00${i}`, status: 'unmatched' })
    );
    mockFindAll.mockResolvedValue(reqs);

    const res = await request(app)
      .get('/api/portal/student-ops/run-my-day')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(5);
    expect(res.body.tasks[0].rank).toBe(1);
  });

  it('respects the ?limit query param', async () => {
    mockGetProject.mockResolvedValue(PROJECT);
    const reqs = Array.from({ length: 10 }, (_, i) =>
      makeReq({ id: `req-${i}`, requirement_key: `AUTH.00${i}`, status: 'unmatched' })
    );
    mockFindAll.mockResolvedValue(reqs);

    const res = await request(app)
      .get('/api/portal/student-ops/run-my-day?limit=3')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(3);
  });

  it('clamps limit to 1 minimum', async () => {
    mockGetProject.mockResolvedValue(PROJECT);
    mockFindAll.mockResolvedValue([makeReq()]);

    const res = await request(app)
      .get('/api/portal/student-ops/run-my-day?limit=0')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
  });

  it('returns empty when no project', async () => {
    mockGetProject.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/portal/student-ops/run-my-day')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.tasks).toEqual([]);
  });
});

describe('GET /api/portal/student-ops/metrics/today', () => {
  let app: express.Express;
  beforeAll(async () => { app = await buildApp(); });
  beforeEach(() => jest.clearAllMocks());

  it('returns correct metrics shape', async () => {
    mockGetProject.mockResolvedValue(PROJECT);
    // count() called 3 times: completedToday, totalActive, completedEver
    mockCount
      .mockResolvedValueOnce(2)  // completedToday
      .mockResolvedValueOnce(10) // totalActive
      .mockResolvedValueOnce(3); // completedEver

    const res = await request(app)
      .get('/api/portal/student-ops/metrics/today')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.tasks_completed_today).toBe(2);
    expect(res.body.total_active).toBe(10);
    expect(res.body.tasks_remaining).toBe(7); // 10 - 3
    expect(res.body.completion_pct).toBe(30); // round(3/10 * 100)
    expect(res.body.project_id).toBe(PROJECT.id);
    expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns zero metrics when no project', async () => {
    mockGetProject.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/portal/student-ops/metrics/today')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.completion_pct).toBe(0);
    expect(res.body.project_id).toBeNull();
  });

  it('returns 0 completion_pct when total_active is 0 (avoids divide-by-zero)', async () => {
    mockGetProject.mockResolvedValue(PROJECT);
    mockCount
      .mockResolvedValueOnce(0)  // completedToday
      .mockResolvedValueOnce(0)  // totalActive
      .mockResolvedValueOnce(0); // completedEver

    const res = await request(app)
      .get('/api/portal/student-ops/metrics/today')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.completion_pct).toBe(0);
    expect(res.body.tasks_remaining).toBe(0);
  });
});

describe('POST /api/portal/student-ops/decide', () => {
  let app: express.Express;
  beforeAll(async () => { app = await buildApp(); });
  beforeEach(() => jest.clearAllMocks());

  it('marks requirement as verified on decision=done', async () => {
    mockGetProject.mockResolvedValue(PROJECT);
    const mockRow = { id: REQ_UUID, status: 'verified', update: jest.fn().mockImplementation(function(this: any, data: any) { this.status = data.status; return Promise.resolve(); }) };
    mockFindOne.mockResolvedValue(mockRow);

    const res = await request(app)
      .post('/api/portal/student-ops/decide')
      .set('Authorization', 'Bearer fake-token')
      .send({ requirement_id: REQ_UUID, decision: 'done' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockRow.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'verified' }));
  });

  it('resets to unmatched on decision=flag_blocker', async () => {
    mockGetProject.mockResolvedValue(PROJECT);
    const mockRow = { id: REQ_UUID, status: 'unmatched', update: jest.fn().mockResolvedValue(undefined) };
    mockFindOne.mockResolvedValue(mockRow);

    const res = await request(app)
      .post('/api/portal/student-ops/decide')
      .set('Authorization', 'Bearer fake-token')
      .send({ requirement_id: REQ_UUID, decision: 'flag_blocker', note: 'Stuck on OAuth' });

    expect(res.status).toBe(200);
    expect(mockRow.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'unmatched', verification_notes: 'Stuck on OAuth' }));
  });

  it('returns 400 for invalid decision value', async () => {
    const res = await request(app)
      .post('/api/portal/student-ops/decide')
      .set('Authorization', 'Bearer fake-token')
      .send({ requirement_id: REQ_UUID, decision: 'invalid_value' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 for non-UUID requirement_id', async () => {
    const res = await request(app)
      .post('/api/portal/student-ops/decide')
      .set('Authorization', 'Bearer fake-token')
      .send({ requirement_id: 'not-a-uuid', decision: 'done' });

    expect(res.status).toBe(400);
  });

  it('returns 404 when requirement does not belong to student project', async () => {
    mockGetProject.mockResolvedValue(PROJECT);
    mockFindOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/portal/student-ops/decide')
      .set('Authorization', 'Bearer fake-token')
      .send({ requirement_id: REQ_UUID, decision: 'done' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Requirement not found');
  });

  it('returns 404 when student has no active project', async () => {
    mockGetProject.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/portal/student-ops/decide')
      .set('Authorization', 'Bearer fake-token')
      .send({ requirement_id: REQ_UUID, decision: 'done' });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/portal/student-ops/decisions (admin-mirrored path)', () => {
  let app: express.Express;
  beforeAll(async () => { app = await buildApp(); });
  beforeEach(() => jest.clearAllMocks());

  it('accepts the same schema as /decide and returns 200', async () => {
    mockGetProject.mockResolvedValue(PROJECT);
    const mockRow = { id: REQ_UUID, status: 'verified', update: jest.fn().mockResolvedValue(undefined) };
    mockFindOne.mockResolvedValue(mockRow);

    const res = await request(app)
      .post('/api/portal/student-ops/decisions')
      .set('Authorization', 'Bearer fake-token')
      .send({ requirement_id: REQ_UUID, decision: 'done' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
