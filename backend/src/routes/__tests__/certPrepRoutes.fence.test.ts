/**
 * `/api/portal/cert-prep` — proving the Week 7 fence at the HTTP boundary.
 *
 * WHY THIS SUITE EXISTS. The acceptance criterion is not "the availability
 * service returns false for week 6" — that is already unit-tested. It is
 * "weeks 1-6 cannot start or access Cert Prep activity through UI **or direct
 * API**". Those are different claims: a fence enforced in a service that some
 * route forgets to call is not a fence. So this suite builds a real Express app
 * with the REAL router, the REAL `requireParticipant`, and the REAL availability
 * service, and mocks only the DATA underneath them.
 *
 * Mocking the availability service itself would make the suite assert on its own
 * stub. What is stubbed is the enrollment's cohort start date — the input the
 * real rule reads — so the rule under test is the shipped one.
 *
 * The second thing proved here is answer protection at the wire. A unit test can
 * show `toSafeItem` omits `correct_keys`; only an HTTP test can show the bytes
 * that actually reach a browser do not contain the answer key.
 */
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-secret-cert-prep-fence';

const WEEK6_ENROLLMENT = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const WEEK9_ENROLLMENT = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const OTHER_ENROLLMENT = 'cccccccc-3333-4333-8333-cccccccccccc';

// Cohort start dates chosen against a frozen "now" of 2026-08-20:
//   started 2026-07-13 -> day 38 -> week 6   (fence CLOSED)
//   started 2026-06-15 -> day 66 -> week 10  (fence OPEN)
const COHORTS: Record<string, { id: string; start_date: string }> = {
  'cohort-week6': { id: 'cohort-week6', start_date: '2026-07-13' },
  'cohort-week9': { id: 'cohort-week9', start_date: '2026-06-15' },
};
const ENROLLMENTS: Record<string, { id: string; cohort_id: string }> = {
  [WEEK6_ENROLLMENT]: { id: WEEK6_ENROLLMENT, cohort_id: 'cohort-week6' },
  [WEEK9_ENROLLMENT]: { id: WEEK9_ENROLLMENT, cohort_id: 'cohort-week9' },
  [OTHER_ENROLLMENT]: { id: OTHER_ENROLLMENT, cohort_id: 'cohort-week9' },
};

const mockEnv = {
  jwtSecret: JWT_SECRET,
  nodeEnv: 'test',
  certPrepEnabled: true,
  contentPageGateEnabled: false,
};
jest.mock('../../config/env', () => ({ __esModule: true, env: mockEnv }));

// The current track row, read by the availability service via raw SQL.
jest.mock('../../config/database', () => ({
  sequelize: {
    query: jest.fn().mockResolvedValue([[{ track_id: 'ccar-f', availability_start_week: 7 }]]),
  },
}));

jest.mock('../../models/Enrollment', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(async (id: string) => (ENROLLMENTS as any)[id] ?? null) },
}));
jest.mock('../../models/Cohort', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(async (id: string) => (COHORTS as any)[id] ?? null) },
}));

// A single approved question, so a week-9 student can actually start something.
const REVISION = {
  question_key: 'A1', revision: 1, blueprint_version: '1.0-2026-07', domain_id: 'D1',
  objective_id: 'D1.2', stem: 'Why isolate a subagent context?',
  options: [{ key: 'A', text: 'Parallelism' }, { key: 'B', text: 'Context isolation' }],
  select_count: 1, difficulty: 'medium', review_status: 'approved',
  active_from: null, active_to: null,
  correct_keys: ['B'],
  rationale: 'ISOLATION_RATIONALE_SENTINEL',
  distractor_rationales: { A: 'DISTRACTOR_SENTINEL' },
};

jest.mock('../../models/CertQuestionRevision', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async () => [REVISION]),
    findOne: jest.fn(async () => REVISION),
  },
}));
jest.mock('../../models/CertQuestion', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async () => [{ question_key: 'A1', provenance: 'colaberry_authored', is_retired: false }]),
    findOrCreate: jest.fn(),
  },
}));
jest.mock('../../models/CertTrack', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(async () => ({
      track_id: 'ccar-f', display_name: 'Claude Certified Architect – Foundations',
      issuer: 'Anthropic', blueprint_version: '1.0-2026-07', blueprint_source: 'official',
      exam_item_count: 60, exam_duration_minutes: 120, passing_scaled_score: 720,
    })),
    findOrCreate: jest.fn(),
  },
}));
jest.mock('../../models/CertDomain', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async () => [{
      domain_id: 'D1', label: 'Agentic Architecture & Orchestration', description: null,
      weight_pct: 27, weight_source: 'official', display_order: 1,
      objectives: [{ objective_id: 'D1.2', label: 'Orchestrate multi-agent systems' }],
    }]),
    findOrCreate: jest.fn(),
  },
}));

const createdSessions: any[] = [];
jest.mock('../../models/CertSession', () => ({
  __esModule: true,
  default: {
    create: jest.fn(async (attrs: any) => {
      const row = { ...attrs, id: 'session-1', save: jest.fn() };
      createdSessions.push(row);
      return row;
    }),
    findByPk: jest.fn(async (id: string) => createdSessions.find((s) => s.id === id) ?? null),
    findOne: jest.fn(async () => null),
    findAll: jest.fn(async () => []),
    count: jest.fn(async () => 0),
  },
}));
jest.mock('../../models/CertResponse', () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => []), findOrCreate: jest.fn(async () => [{ save: jest.fn() }, true]) },
}));
jest.mock('../../models/CertEvidenceMapping', () => ({ __esModule: true, default: { findAll: jest.fn(async () => []) } }));
jest.mock('../../models/CertReadinessSnapshot', () => ({
  __esModule: true,
  default: { create: jest.fn(async (a: any) => a), findAll: jest.fn(async () => []) },
}));
jest.mock('../../services/pointsService', () => ({
  award: jest.fn(async () => ({ awarded: true, points: 5 })),
  sumPointsTodayByEventTypes: jest.fn(async () => 0),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const certPrepRoutes = require('../certPrepRoutes').default;

const app = express();
app.use(express.json());
app.use(certPrepRoutes);

const tokenFor = (enrollmentId: string) =>
  jwt.sign({ sub: enrollmentId, email: 's@test.com', cohort_id: 'c1', role: 'participant' }, JWT_SECRET);

const get = (path: string, enrollmentId: string) =>
  request(app).get(path).set('Authorization', `Bearer ${tokenFor(enrollmentId)}`);
const post = (path: string, enrollmentId: string, body: any = {}) =>
  request(app).post(path).set('Authorization', `Bearer ${tokenFor(enrollmentId)}`).send(body);

beforeAll(() => {
  // Freeze time so "which week is this cohort in" is deterministic.
  jest.useFakeTimers().setSystemTime(new Date('2026-08-20T12:00:00Z'));
});
afterAll(() => jest.useRealTimers());
beforeEach(() => { createdSessions.length = 0; mockEnv.certPrepEnabled = true; });

describe('the fence, through the API', () => {
  it('WEEK 6: cannot START a session — refused with 403, nothing created', async () => {
    const res = await post('/api/portal/cert-prep/sessions', WEEK6_ENROLLMENT, { mode: 'practice' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CERT_PREP_NOT_AVAILABLE');
    expect(createdSessions).toHaveLength(0);
  });

  it('WEEK 6: cannot read the domain map', async () => {
    const res = await get('/api/portal/cert-prep/domains', WEEK6_ENROLLMENT);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CERT_PREP_NOT_AVAILABLE');
  });

  it('WEEK 6: the availability endpoint answers honestly instead of 404ing', async () => {
    // The UI must be able to say "Cert Prep begins in Week 7" rather than
    // pretending the feature does not exist.
    const res = await get('/api/portal/cert-prep', WEEK6_ENROLLMENT);
    expect(res.status).toBe(200);
    expect(res.body.availability).toMatchObject({
      available: false,
      reason: 'before_start_week',
      programWeek: 6,
      startWeek: 7,
    });
    expect(res.body.readiness).toBeNull();
  });

  it('WEEK 9: can start a session', async () => {
    const res = await post('/api/portal/cert-prep/sessions', WEEK9_ENROLLMENT, { mode: 'practice' });
    expect(res.status).toBe(201);
    expect(createdSessions).toHaveLength(1);
    expect(res.body.session.status).toBe('in_progress');
  });

  it('WEEK 9: can read the domain map, with official weights', async () => {
    const res = await get('/api/portal/cert-prep/domains', WEEK9_ENROLLMENT);
    expect(res.status).toBe(200);
    expect(res.body.domains[0]).toMatchObject({ domain_id: 'D1', weight_pct: 27, weight_source: 'official' });
    expect(res.body.track.blueprint_source).toBe('official');
  });
});

describe('answer protection at the wire', () => {
  it('a started session carries NO answer key, rationale or distractor text', async () => {
    const res = await post('/api/portal/cert-prep/sessions', WEEK9_ENROLLMENT, { mode: 'practice' });
    expect(res.status).toBe(201);

    const wire = JSON.stringify(res.body);
    expect(wire).not.toContain('ISOLATION_RATIONALE_SENTINEL');
    expect(wire).not.toContain('DISTRACTOR_SENTINEL');
    expect(wire).not.toContain('correct_keys');

    // and the item is still usable: stem and options are present
    expect(res.body.items[0]).toMatchObject({ question_key: 'A1', select_count: 1 });
    expect(res.body.items[0].options).toHaveLength(2);
  });

  it('the rationale appears only AFTER the answer is submitted', async () => {
    const started = await post('/api/portal/cert-prep/sessions', WEEK9_ENROLLMENT, { mode: 'practice' });
    const sessionId = started.body.session.id;

    const answered = await post(
      `/api/portal/cert-prep/sessions/${sessionId}/responses`,
      WEEK9_ENROLLMENT,
      { question_key: 'A1', selected_keys: ['B'] },
    );
    expect(answered.status).toBe(200);
    expect(answered.body.is_correct).toBe(true);
    expect(answered.body.rationale).toBe('ISOLATION_RATIONALE_SENTINEL');
  });

  it('correctness is computed server-side — a client claiming it was right is ignored', async () => {
    const started = await post('/api/portal/cert-prep/sessions', WEEK9_ENROLLMENT, { mode: 'practice' });
    const sessionId = started.body.session.id;

    const answered = await post(
      `/api/portal/cert-prep/sessions/${sessionId}/responses`,
      WEEK9_ENROLLMENT,
      { question_key: 'A1', selected_keys: ['A'], is_correct: true, scaled_score: 1000 } as any,
    );
    expect(answered.status).toBe(200);
    expect(answered.body.is_correct).toBe(false); // 'A' is wrong, whatever the client said
  });
});

describe('authorization and isolation', () => {
  it('unauthenticated requests are refused', async () => {
    expect((await request(app).get('/api/portal/cert-prep')).status).toBe(401);
    expect((await request(app).post('/api/portal/cert-prep/sessions').send({ mode: 'mock' })).status).toBe(401);
  });

  it('a student cannot touch another student’s session', async () => {
    const started = await post('/api/portal/cert-prep/sessions', WEEK9_ENROLLMENT, { mode: 'practice' });
    const sessionId = started.body.session.id;

    const res = await get(`/api/portal/cert-prep/sessions/${sessionId}`, OTHER_ENROLLMENT);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CERT_SESSION_NOT_FOUND');
  });
});

describe('the feature flag', () => {
  it('every route 404s when CERT_PREP_ENABLED is off, even for an eligible student', async () => {
    mockEnv.certPrepEnabled = false;
    expect((await get('/api/portal/cert-prep', WEEK9_ENROLLMENT)).status).toBe(404);
    expect((await get('/api/portal/cert-prep/domains', WEEK9_ENROLLMENT)).status).toBe(404);
    expect((await post('/api/portal/cert-prep/sessions', WEEK9_ENROLLMENT, { mode: 'mock' })).status).toBe(404);
    expect(createdSessions).toHaveLength(0);
  });
});

describe('request validation', () => {
  it('rejects an unknown mode rather than defaulting to one', async () => {
    const res = await post('/api/portal/cert-prep/sessions', WEEK9_ENROLLMENT, { mode: 'freestyle' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CERT_BAD_REQUEST');
  });

  it('rejects a submission with no question key', async () => {
    const started = await post('/api/portal/cert-prep/sessions', WEEK9_ENROLLMENT, { mode: 'practice' });
    const res = await post(
      `/api/portal/cert-prep/sessions/${started.body.session.id}/responses`,
      WEEK9_ENROLLMENT,
      { selected_keys: ['A'] },
    );
    expect(res.status).toBe(400);
  });
});
