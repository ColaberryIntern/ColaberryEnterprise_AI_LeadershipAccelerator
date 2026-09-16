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
const mockStart = jest.fn();

jest.mock('../../../models/ProjectUnderstandingRecord', () => ({
  __esModule: true,
  default: {
    findAll: (...a: any[]) => mockRecordFindAll(...a),
    findByPk: (...a: any[]) => mockRecordFindByPk(...a),
  },
}));
jest.mock('../../../models', () => ({
  Lead: { findAll: (...a: any[]) => mockLeadFindAll(...a), findByPk: (...a: any[]) => mockLeadFindByPk(...a) },
  Enrollment: { findAll: (...a: any[]) => mockEnrollmentFindAll(...a), findOne: (...a: any[]) => mockEnrollmentFindOne(...a) },
}));
jest.mock('../../../services/delivery/buildFromUnderstanding', () => ({
  startBuildFromUnderstanding: (...a: any[]) => mockStart(...a),
}));

import flotationIntakeRoutes from '../flotationIntakeRoutes';

const app = express();
app.use(express.json());
app.use(flotationIntakeRoutes);

const ADMIN = jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', role: 'admin' }, 'test-secret');
const REC = '11111111-1111-4111-8111-111111111111';
const ENR = '22222222-2222-4222-8222-222222222222';

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
