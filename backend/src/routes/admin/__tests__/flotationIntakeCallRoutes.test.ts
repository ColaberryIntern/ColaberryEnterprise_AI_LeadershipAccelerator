/**
 * The admin's voice door: it places the SAME call a prospect gets, stamped with the student.
 *
 * REAL auth middleware, mocked models and the callback service. What is under test is that
 * this route hands `requestInstantCallback` exactly what the public routing action hands
 * it - brand, identity, consent - plus the one thing only the admin knows: whose project
 * this is. And that the status endpoint tells the page the truth about where the call got
 * to, from the log rows the call and the webhook leave behind.
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

const mockRecordFindOne = jest.fn();
const mockEnrollmentFindByPk = jest.fn();
const mockCommFindOne = jest.fn();
const mockCallback = jest.fn();

jest.mock('../../../models/ProjectUnderstandingRecord', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findByPk: jest.fn(), findOne: (...a: any[]) => mockRecordFindOne(...a) },
}));
jest.mock('../../../models', () => ({
  Lead: { findAll: jest.fn(), findByPk: jest.fn() },
  Enrollment: { findAll: jest.fn(), findOne: jest.fn(), findByPk: (...a: any[]) => mockEnrollmentFindByPk(...a) },
  CommunicationLog: { findOne: (...a: any[]) => mockCommFindOne(...a) },
}));
jest.mock('../../../services/delivery/buildFromUnderstanding', () => ({ startBuildFromUnderstanding: jest.fn() }));
jest.mock('../../../services/delivery/projectIntake', () => ({ runIntakeTurn: jest.fn() }));
jest.mock('../../../services/callbackRequestService', () => ({
  requestInstantCallback: (...a: any[]) => mockCallback(...a),
}));

import flotationIntakeRoutes from '../flotationIntakeRoutes';

const app = express();
app.use(express.json());
app.use(flotationIntakeRoutes);

const ADMIN = jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', role: 'admin' }, 'test-secret');
const ENR = '22222222-2222-4222-8222-222222222222';
const STUDENT = { id: ENR, full_name: 'Marta Okafor', company: 'Northside Repair Cafe', email: 'Marta@Northside.test' };

beforeEach(() => {
  jest.clearAllMocks();
  mockEnrollmentFindByPk.mockResolvedValue(STUDENT);
  mockCallback.mockResolvedValue({ status: 'call_initiated', lead_id: 42, call_id: 'call_1', deduped: false });
});

describe('POST /api/admin/flotation/intake/call', () => {
  const body = { enrollment_id: ENR, phone: '+1 555 012 3456', idea: 'We track tool loans on paper.' };

  it('refuses without a token, and dials nothing', async () => {
    const res = await request(app).post('/api/admin/flotation/intake/call').send(body);
    expect(res.status).toBe(401);
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it("places the prospect's call - same brand, same identity fields, same consent - stamped with the student", async () => {
    const res = await request(app).post('/api/admin/flotation/intake/call').set('Authorization', `Bearer ${ADMIN}`).send(body);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'call_initiated', call_id: 'call_1', lead_id: 42 });
    expect(res.body.correlation_id).toMatch(/^[0-9a-f-]{36}$/);

    expect(mockCallback).toHaveBeenCalledTimes(1);
    const [payload, correlationId, options] = mockCallback.mock.calls[0];
    expect(payload).toEqual({
      name: 'Marta Okafor',
      email: 'marta@northside.test',
      phone: '+1 555 012 3456',
      source: 'ai-flotation',
      company: 'Northside Repair Cafe',
      message: 'We track tool loans on paper.',
      consent_contact: true,
    });
    expect(correlationId).toBe(res.body.correlation_id);
    expect(options).toEqual({ enrollmentId: ENR, requestedBy: 'admin' });
  });

  it('a second request inside the window is one call, reported as such', async () => {
    mockCallback.mockResolvedValue({ status: 'deduplicated', lead_id: 42, call_id: 'call_1', deduped: true });
    const res = await request(app).post('/api/admin/flotation/intake/call').set('Authorization', `Bearer ${ADMIN}`).send(body);
    expect(res.status).toBe(200);
    expect(res.body.deduped).toBe(true);
  });

  it('a skipped call is not a success - 409 with the reason', async () => {
    mockCallback.mockResolvedValue({ status: 'skipped', lead_id: 42, call_id: null, deduped: false, reason: 'voice_not_configured' });
    const res = await request(app).post('/api/admin/flotation/intake/call').set('Authorization', `Bearer ${ADMIN}`).send(body);
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('voice_not_configured');
  });

  it('an upstream failure is 502 with the reason', async () => {
    mockCallback.mockResolvedValue({ status: 'failed', lead_id: 42, call_id: null, deduped: false, reason: 'synthflow 503' });
    const res = await request(app).post('/api/admin/flotation/intake/call').set('Authorization', `Bearer ${ADMIN}`).send(body);
    expect(res.status).toBe(502);
    expect(res.body.reason).toBe('synthflow 503');
  });

  it('404s an unknown student before dialling', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(null);
    const res = await request(app).post('/api/admin/flotation/intake/call').set('Authorization', `Bearer ${ADMIN}`).send(body);
    expect(res.status).toBe(404);
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('refuses a student with no email - the call is keyed on one', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({ ...STUDENT, email: null });
    const res = await request(app).post('/api/admin/flotation/intake/call').set('Authorization', `Bearer ${ADMIN}`).send(body);
    expect(res.status).toBe(409);
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it.each([
    ['a short phone', { enrollment_id: ENR, phone: '123' }],
    ['no phone', { enrollment_id: ENR }],
    ['a non-uuid enrolment', { enrollment_id: 'enr', phone: '+1 555 012 3456' }],
    ['an over-long idea', { enrollment_id: ENR, phone: '+1 555 012 3456', idea: 'x'.repeat(5001) }],
  ])('400s %s at the boundary', async (_name, bad) => {
    const res = await request(app).post('/api/admin/flotation/intake/call').set('Authorization', `Bearer ${ADMIN}`).send(bad);
    expect(res.status).toBe(400);
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('answers a thrown service with a plain sentence, not the stack', async () => {
    mockCallback.mockRejectedValue(new Error('ECONNRESET synthflow'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(app).post('/api/admin/flotation/intake/call').set('Authorization', `Bearer ${ADMIN}`).send(body);
    expect(res.status).toBe(500);
    expect(res.body.error).not.toContain('ECONNRESET');
    errSpy.mockRestore();
  });
});

describe('GET /api/admin/flotation/intake/call/:callId - where the call has got to', () => {
  it('refuses without a token', async () => {
    expect((await request(app).get('/api/admin/flotation/intake/call/call_1')).status).toBe(401);
  });

  it('404s a call it has no record of', async () => {
    mockCommFindOne.mockResolvedValue(null);
    const res = await request(app).get('/api/admin/flotation/intake/call/call_1').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(404);
  });

  it('ringing: placed, no transcript, nothing written up yet', async () => {
    mockCommFindOne.mockResolvedValue({ status: 'sent', provider_response: null });
    mockRecordFindOne.mockResolvedValue(null);

    const res = await request(app).get('/api/admin/flotation/intake/call/call_1').set('Authorization', `Bearer ${ADMIN}`);

    expect(mockCommFindOne).toHaveBeenCalledWith({ where: { provider: 'synthflow', provider_message_id: 'call_1' } });
    expect(res.body).toEqual({
      call: { status: 'sent', duration: null, has_transcript: false, end_reason: null },
      understanding: null,
      build: null,
    });
  });

  it('ended, written up and building: the whole story from the rows the pipeline left', async () => {
    mockCommFindOne.mockResolvedValue({
      status: 'delivered',
      provider_response: { duration: 312, transcript: 'Agent: ...', end_call_reason: 'completed' },
    });
    mockRecordFindOne.mockResolvedValue({
      id: 'rec-1', status: 'extracted', title: 'Tool Loan Management', items: [1, 2, 3, 4],
      scope: { build: { project_id: 'proj-9', started_at: '2026-09-16T21:00:00Z' } },
    });

    const res = await request(app).get('/api/admin/flotation/intake/call/call_1').set('Authorization', `Bearer ${ADMIN}`);

    expect(mockRecordFindOne).toHaveBeenCalledWith({ where: { source: 'voice_transcript', source_ref: 'call_1' } });
    expect(res.body).toEqual({
      call: { status: 'delivered', duration: 312, has_transcript: true, end_reason: 'completed' },
      understanding: { id: 'rec-1', status: 'extracted', title: 'Tool Loan Management', items: 4 },
      build: { project_id: 'proj-9', started_at: '2026-09-16T21:00:00Z' },
    });
  });

  it('a call that did not complete says so, with no write-up to show', async () => {
    mockCommFindOne.mockResolvedValue({ status: 'failed', provider_response: { end_call_reason: 'no-answer', transcript: '' } });
    mockRecordFindOne.mockResolvedValue(null);
    const res = await request(app).get('/api/admin/flotation/intake/call/call_1').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.body.call).toEqual({ status: 'failed', duration: null, has_transcript: false, end_reason: 'no-answer' });
    expect(res.body.understanding).toBeNull();
  });

  it('bounds the call id', async () => {
    const res = await request(app).get(`/api/admin/flotation/intake/call/${'x'.repeat(129)}`).set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(400);
    expect(mockCommFindOne).not.toHaveBeenCalled();
  });
});
