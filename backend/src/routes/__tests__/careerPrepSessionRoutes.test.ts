jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockEnabled = jest.fn();
jest.mock('../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: (...a: unknown[]) => mockEnabled(...a) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => true }));
jest.mock('../../services/careerPrep/interviews', () => ({ linkHireInterviews: jest.fn(async () => 0), addInterview: jest.fn(), createPractice: jest.fn() }));
const mockStart = jest.fn();
const mockUpdate = jest.fn();
const mockCurrent = jest.fn();
jest.mock('../../services/careerPrep/sessions', () => {
  class NotFoundError extends Error {}
  return { startSession: (...a: unknown[]) => mockStart(...a), updateSession: (...a: unknown[]) => mockUpdate(...a), currentSession: (...a: unknown[]) => mockCurrent(...a), NotFoundError };
});

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = ['career', 'prep', 'session'].join('-');
process.env.JWT_SECRET = SECRET;
const P1 = '11111111-1111-4111-8111-111111111111';
const S1 = '22222222-2222-4222-8222-222222222222';
const token = (extra: Record<string, unknown> = {}) => `Bearer ${jwt.sign({ sub: 'enr-ali', cohort_id: 'coh-1', role: 'participant', ...extra }, SECRET)}`;
const session = { id: S1, planId: P1, status: 'running', startedAt: '2026-11-16T17:50:00.000Z', secondsActive: 0, segments: [] };

function app(): express.Express {
  const a = express();
  a.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  a.use(require('../careerPrepRoutes').default);
  return a;
}
beforeEach(() => { mockEnabled.mockReset().mockResolvedValue(true); mockStart.mockReset(); mockUpdate.mockReset(); mockCurrent.mockReset(); });

describe('POST /api/portal/career-prep/sessions', () => {
  it('401s without a token and 404s with Career Prep off', async () => {
    expect((await request(app()).post('/api/portal/career-prep/sessions').send({ planId: P1 })).status).toBe(401);
    mockEnabled.mockResolvedValue(false);
    expect((await request(app()).post('/api/portal/career-prep/sessions').set('Authorization', token()).send({ planId: P1 })).status).toBe(404);
  });
  it('201 for a new session, 200 when it resumes today\'s, always for the signed-in student', async () => {
    mockStart.mockResolvedValueOnce({ session, resumed: false }).mockResolvedValueOnce({ session, resumed: true });
    expect((await request(app()).post('/api/portal/career-prep/sessions').set('Authorization', token()).send({ planId: P1 })).status).toBe(201);
    expect((await request(app()).post('/api/portal/career-prep/sessions').set('Authorization', token()).send({ planId: P1 })).status).toBe(200);
    expect(mockStart.mock.calls[0][0]).toBe('enr-ali');
  });
  it('404s a plan that is not theirs and 400s a bad body', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NotFoundError } = require('../../services/careerPrep/sessions');
    mockStart.mockRejectedValue(new NotFoundError());
    expect((await request(app()).post('/api/portal/career-prep/sessions').set('Authorization', token()).send({ planId: P1 })).status).toBe(404);
    expect((await request(app()).post('/api/portal/career-prep/sessions').set('Authorization', token()).send({ planId: 'x' })).status).toBe(400);
  });
  it('refuses a read-only view-as token', async () => {
    expect((await request(app()).post('/api/portal/career-prep/sessions').set('Authorization', token({ read_only: true, impersonated_by: 'a' })).send({ planId: P1 })).status).toBeGreaterThanOrEqual(400);
    expect(mockStart).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/portal/career-prep/sessions/:id', () => {
  const url = `/api/portal/career-prep/sessions/${S1}`;
  it.each([
    [{ action: 'segment_done', secondsActive: 10 }],
    [{ action: 'skip', secondsActive: 10 }],
    [{ action: 'pause', secondsActive: -1 }],
    [{ action: 'pause', secondsActive: 10, enrollmentId: 'enr-2' }],
  ])('400s %j', async (body) => {
    expect((await request(app()).patch(url).set('Authorization', token()).send(body)).status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
  it('applies an update for the signed-in student', async () => {
    mockUpdate.mockResolvedValue({ ...session, status: 'paused' });
    const res = await request(app()).patch(url).set('Authorization', token()).send({ action: 'pause', secondsActive: 60 });
    expect(res.body.session.status).toBe('paused');
    expect(mockUpdate.mock.calls[0].slice(0, 3)).toEqual(['enr-ali', S1, { action: 'pause', secondsActive: 60 }]);
  });
  it('404s another student\'s session, and 500s plainly when the save fails', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NotFoundError } = require('../../services/careerPrep/sessions');
    mockUpdate.mockRejectedValueOnce(new NotFoundError());
    expect((await request(app()).patch(url).set('Authorization', token()).send({ action: 'pause', secondsActive: 1 })).status).toBe(404);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockUpdate.mockRejectedValueOnce(new Error('db'));
    const res = await request(app()).patch(url).set('Authorization', token()).send({ action: 'pause', secondsActive: 1 });
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Your practice is not lost');
  });
});

describe('GET /api/portal/career-prep/sessions/current', () => {
  it('returns the open session or null', async () => {
    mockCurrent.mockResolvedValue(null);
    const res = await request(app()).get(`/api/portal/career-prep/sessions/current?planId=${P1}`).set('Authorization', token());
    expect(res.body).toEqual({ session: null });
    expect(mockCurrent).toHaveBeenCalledWith('enr-ali', P1);
  });
});
