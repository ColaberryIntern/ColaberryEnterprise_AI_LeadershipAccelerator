/**
 * The admin door: guarded, idempotent, and it resolves the enrolment the way the enquiry
 * path does - by the person's email - so an admin does not have to know a UUID to try it.
 *
 * REAL auth middleware, mocked models and service. What is being tested is the door, not the
 * pipeline behind it.
 */
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../../../config/env', () => ({
  env: { jwtSecret: 'test-secret', nodeEnv: 'test' },
}));
jest.mock('../../../services/aiEventService', () => ({
  emitAiEvent: jest.fn().mockResolvedValue(undefined),
}));

const mockRecordFindAll = jest.fn();
const mockRecordFindByPk = jest.fn();
const mockLeadFindAll = jest.fn();
const mockLeadFindByPk = jest.fn();
const mockEnrollmentFindAll = jest.fn();
const mockEnrollmentFindOne = jest.fn();
const mockEnrollmentFindByPk = jest.fn();
const mockStart = jest.fn();
const mockTurn = jest.fn();

jest.mock('../../../models/ProjectUnderstandingRecord', () => ({
  __esModule: true,
  default: {
    findAll: (...a: any[]) => mockRecordFindAll(...a),
    findByPk: (...a: any[]) => mockRecordFindByPk(...a),
  },
}));
jest.mock('../../../models', () => ({
  Lead: { findAll: (...a: any[]) => mockLeadFindAll(...a), findByPk: (...a: any[]) => mockLeadFindByPk(...a) },
  Enrollment: {
    findAll: (...a: any[]) => mockEnrollmentFindAll(...a),
    findOne: (...a: any[]) => mockEnrollmentFindOne(...a),
    findByPk: (...a: any[]) => mockEnrollmentFindByPk(...a),
  },
  CommunicationLog: { findOne: jest.fn() },
}));
jest.mock('../../../services/delivery/buildFromUnderstanding', () => ({
  startBuildFromUnderstanding: (...a: any[]) => mockStart(...a),
}));
jest.mock('../../../services/delivery/projectIntake', () => ({
  runIntakeTurn: (...a: any[]) => mockTurn(...a),
}));
// The voice door lives in the same file and is tested in flotationIntakeCallRoutes.test.ts;
// here it only needs to not drag the real database config in through its import.
jest.mock('../../../services/callbackRequestService', () => ({ requestInstantCallback: jest.fn() }));

import flotationIntakeRoutes from '../flotationIntakeRoutes';

const app = express();
app.use(express.json());
app.use(flotationIntakeRoutes);

const ADMIN = jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', role: 'admin' }, 'test-secret');
const REC = '11111111-1111-4111-8111-111111111111';
const ENR = '22222222-2222-4222-8222-222222222222';
const SESSION = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  jest.clearAllMocks();
  mockRecordFindAll.mockResolvedValue([]);
  mockLeadFindAll.mockResolvedValue([]);
  mockEnrollmentFindAll.mockResolvedValue([]);
  mockStart.mockResolvedValue({ ok: true, projectId: 'proj-1', correlationId: 'c', status: 'generating', reused: false, intake: { name: 'x', answers: [], dropped: [] } });
});

describe('auth', () => {
  it('refuses the list without a token', async () => {
    expect((await request(app).get('/api/admin/flotation/understandings')).status).toBe(401);
  });

  it('refuses a build without a token', async () => {
    expect((await request(app).post(`/api/admin/flotation/understandings/${REC}/build`).send({})).status).toBe(401);
    expect(mockStart).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/flotation/understandings', () => {
  it('joins the person and where their build would land, and says whether one exists', async () => {
    mockRecordFindAll.mockResolvedValue([
      { id: REC, title: 'Tool Loan Management System', source: 'chat', items: [1, 2, 3], confirmed_at: null, lead_id: 42, scope: { build: { project_id: 'proj-9', started_at: '2026-09-16T00:00:00Z' } } },
    ]);
    mockLeadFindAll.mockResolvedValue([{ id: 42, name: 'Marta', email: 'Marta@Northside.test', company: 'Northside' }]);
    mockEnrollmentFindAll.mockResolvedValue([{ id: ENR, email: 'marta@northside.test', tier: 'guest', cohort_id: 'cohort-p' }]);

    const res = await request(app).get('/api/admin/flotation/understandings').set('Authorization', `Bearer ${ADMIN}`);

    expect(res.status).toBe(200);
    expect(res.body.understandings[0]).toMatchObject({
      id: REC,
      items: 3,
      lead: { id: 42, email: 'Marta@Northside.test' },
      enrollment: { id: ENR, tier: 'guest' },
      build: { project_id: 'proj-9' },
    });
  });

  it('reads the hand-off from its own column first, and from the old scope key for older rows', async () => {
    mockRecordFindAll.mockResolvedValue([
      { id: 'new', title: 'New', source: 'chat', items: [], confirmed_at: null, lead_id: 1, build_handoff: { project_id: 'proj-col', started_at: 't1' }, scope: { version: 3 } },
      { id: 'old', title: 'Old', source: 'chat', items: [], confirmed_at: null, lead_id: 1, build_handoff: null, scope: { build: { project_id: 'proj-legacy', started_at: 't0' } } },
    ]);
    mockLeadFindAll.mockResolvedValue([{ id: 1, name: 'Marta', email: 'marta@northside.test', company: null }]);

    const res = await request(app).get('/api/admin/flotation/understandings').set('Authorization', `Bearer ${ADMIN}`);

    expect(res.body.understandings.map((u: any) => u.build.project_id)).toEqual(['proj-col', 'proj-legacy']);
  });

  it('lists only extracted understandings', async () => {
    await request(app).get('/api/admin/flotation/understandings').set('Authorization', `Bearer ${ADMIN}`);
    expect(mockRecordFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'extracted' } }));
  });
});

describe('POST /api/admin/flotation/understandings/:id/build', () => {
  it('starts the build on the enrolment given', async () => {
    const res = await request(app)
      .post(`/api/admin/flotation/understandings/${REC}/build`)
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ enrollment_id: ENR });

    expect(res.status).toBe(202);
    expect(mockStart).toHaveBeenCalledWith({ recordId: REC, enrollmentId: ENR, requireConfirmed: false });
  });

  it('finds the enrolment by the lead\'s email when none is given - the way the enquiry path does', async () => {
    mockRecordFindByPk.mockResolvedValue({ id: REC, lead_id: 42 });
    mockLeadFindByPk.mockResolvedValue({ id: 42, email: 'Marta@Northside.test' });
    mockEnrollmentFindOne.mockResolvedValue({ id: ENR });

    const res = await request(app).post(`/api/admin/flotation/understandings/${REC}/build`).set('Authorization', `Bearer ${ADMIN}`).send({});

    expect(res.status).toBe(202);
    expect(mockEnrollmentFindOne).toHaveBeenCalledWith({ where: { email: 'marta@northside.test' } });
    expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ enrollmentId: ENR }));
  });

  it('says plainly when there is nowhere for the build to land', async () => {
    mockRecordFindByPk.mockResolvedValue({ id: REC, lead_id: 42 });
    mockLeadFindByPk.mockResolvedValue({ id: 42, email: 'nobody@x.test' });
    mockEnrollmentFindOne.mockResolvedValue(null);

    const res = await request(app).post(`/api/admin/flotation/understandings/${REC}/build`).set('Authorization', `Bearer ${ADMIN}`).send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/no enrolment/);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('answers a repeat with 200 and the earlier project, not a second build', async () => {
    mockStart.mockResolvedValue({ ok: true, projectId: 'proj-earlier', correlationId: 'c', status: 'already_started', reused: true, intake: { name: 'x', answers: [], dropped: [] } });

    const res = await request(app).post(`/api/admin/flotation/understandings/${REC}/build`).set('Authorization', `Bearer ${ADMIN}`).send({ enrollment_id: ENR });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reused: true, projectId: 'proj-earlier' });
  });

  it('passes the §17 insistence through, and maps the refusal to 409', async () => {
    mockStart.mockResolvedValue({ ok: false, reason: 'not_confirmed', error: 'not confirmed' });

    const res = await request(app).post(`/api/admin/flotation/understandings/${REC}/build`).set('Authorization', `Bearer ${ADMIN}`).send({ enrollment_id: ENR, require_confirmed: true });

    expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ requireConfirmed: true }));
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('not_confirmed');
  });

  it('rejects a malformed enrollment id before touching anything', async () => {
    const res = await request(app).post(`/api/admin/flotation/understandings/${REC}/build`).set('Authorization', `Bearer ${ADMIN}`).send({ enrollment_id: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(mockStart).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/flotation/intake/turn - the interview, from the management side', () => {
  const turns = [{ role: 'user', text: 'We run a repair cafe and track loans on paper.' }];

  beforeEach(() => {
    mockEnrollmentFindByPk.mockResolvedValue({ id: ENR, full_name: 'Marta Okafor', company: 'Northside Repair Cafe', email: 'marta@northside.test' });
    mockTurn.mockResolvedValue({ done: false, message: 'Who runs the desk?', exchanges: 1 });
  });

  it('refuses without a token', async () => {
    const res = await request(app).post('/api/admin/flotation/intake/turn').send({ enrollment_id: ENR, session_id: SESSION, turns });
    expect(res.status).toBe(401);
    expect(mockTurn).not.toHaveBeenCalled();
  });

  it('runs the ONE intake for the named student, addressed by their name', async () => {
    const res = await request(app).post('/api/admin/flotation/intake/turn').set('Authorization', `Bearer ${ADMIN}`).send({ enrollment_id: ENR, session_id: SESSION, turns });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ done: false, message: 'Who runs the desk?', exchanges: 1 });
    expect(mockTurn).toHaveBeenCalledWith({
      turns,
      facts: { name: 'Marta Okafor', company: 'Northside Repair Cafe', role: null },
      sourceRef: `admin:${SESSION}`,
      leadId: null,
      buildFor: { kind: 'enrollment', enrollmentId: ENR },
    });
  });

  it('passes the finished result through untouched, project and all', async () => {
    mockTurn.mockResolvedValue({ done: true, message: 'Thanks.', understanding: 'created', understanding_id: REC, build: { started: true, project_id: 'proj-1' } });

    const res = await request(app).post('/api/admin/flotation/intake/turn').set('Authorization', `Bearer ${ADMIN}`).send({ enrollment_id: ENR, session_id: SESSION, turns });

    expect(res.status).toBe(200);
    expect(res.body.build).toEqual({ started: true, project_id: 'proj-1' });
  });

  it('404s an unknown student before running anything', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(null);
    const res = await request(app).post('/api/admin/flotation/intake/turn').set('Authorization', `Bearer ${ADMIN}`).send({ enrollment_id: ENR, session_id: SESSION, turns });
    expect(res.status).toBe(404);
    expect(mockTurn).not.toHaveBeenCalled();
  });

  it.each([
    ['no turns', { enrollment_id: ENR, session_id: SESSION, turns: [] }],
    ['a bad role', { enrollment_id: ENR, session_id: SESSION, turns: [{ role: 'system', text: 'x' }] }],
    ['an over-long turn', { enrollment_id: ENR, session_id: SESSION, turns: [{ role: 'user', text: 'x'.repeat(4001) }] }],
    ['a non-uuid session', { enrollment_id: ENR, session_id: 'sess-1', turns }],
    ['no enrolment', { session_id: SESSION, turns }],
  ])('400s %s at the boundary', async (_name, body) => {
    const res = await request(app).post('/api/admin/flotation/intake/turn').set('Authorization', `Bearer ${ADMIN}`).send(body);
    expect(res.status).toBe(400);
    expect(mockTurn).not.toHaveBeenCalled();
  });

  it('answers a thrown intake with a plain sentence, not the stack', async () => {
    mockTurn.mockRejectedValue(new Error('ECONNRESET upstream'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(app).post('/api/admin/flotation/intake/turn').set('Authorization', `Bearer ${ADMIN}`).send({ enrollment_id: ENR, session_id: SESSION, turns });
    expect(res.status).toBe(500);
    expect(res.body.error).not.toContain('ECONNRESET');
    errSpy.mockRestore();
  });
});

describe('GET /api/admin/flotation/intake/enrollments - finding the student', () => {
  it('needs at least two characters, so a keystroke does not scan the table', async () => {
    const res = await request(app).get('/api/admin/flotation/intake/enrollments?q=m').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(200);
    expect(res.body.enrollments).toEqual([]);
    expect(mockEnrollmentFindAll).not.toHaveBeenCalled();
  });

  it('matches name or email, case-insensitively, and returns what the picker needs', async () => {
    mockEnrollmentFindAll.mockResolvedValue([{ id: ENR, full_name: 'Marta Okafor', email: 'marta@northside.test', tier: 'guest', cohort_id: 'c1', password_hash: 'never' }]);

    const res = await request(app).get('/api/admin/flotation/intake/enrollments?q=MARTA').set('Authorization', `Bearer ${ADMIN}`);

    expect(res.status).toBe(200);
    expect(res.body.enrollments).toEqual([{ id: ENR, full_name: 'Marta Okafor', email: 'marta@northside.test', tier: 'guest', cohort_id: 'c1' }]);
    const where = mockEnrollmentFindAll.mock.calls[0][0].where;
    const branches = Object.getOwnPropertySymbols(where).map((sym) => (where as any)[sym])[0];
    expect(branches).toHaveLength(2);
    const pattern = (o: any) => Object.getOwnPropertySymbols(o).map((sym) => o[sym])[0];
    expect(pattern(branches[0].email)).toBe('%marta%');
    expect(pattern(branches[1].full_name)).toBe('%marta%');
  });

  it('refuses without a token', async () => {
    expect((await request(app).get('/api/admin/flotation/intake/enrollments?q=marta')).status).toBe(401);
  });
});
