jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockEnabled = jest.fn();
jest.mock('../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: (...a: unknown[]) => mockEnabled(...a) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => true }));
jest.mock('../../services/careerPrep/interviews', () => ({ linkHireInterviews: jest.fn(async () => 0), addInterview: jest.fn(), createPractice: jest.fn() }));
const mockCreate = jest.fn();
const mockActive = jest.fn();
jest.mock('../../services/careerPrep/plans', () => {
  class NotYoursError extends Error {}
  return { createPlan: (...a: unknown[]) => mockCreate(...a), activePlan: (...a: unknown[]) => mockActive(...a), NotYoursError };
});

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = ['career', 'prep', 'plan'].join('-');
process.env.JWT_SECRET = SECRET;
const URL = '/api/portal/career-prep/plans';
const I1 = '11111111-1111-4111-8111-111111111111';
const token = (extra: Record<string, unknown> = {}) => `Bearer ${jwt.sign({ sub: 'enr-ali', cohort_id: 'coh-1', role: 'participant', ...extra }, SECRET)}`;

function app(): express.Express {
  const a = express();
  a.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  a.use(require('../careerPrepRoutes').default);
  return a;
}
beforeEach(() => { mockEnabled.mockReset().mockResolvedValue(true); mockCreate.mockReset(); mockActive.mockReset(); });

describe('POST /api/portal/career-prep/plans', () => {
  it('401s without a token and 404s with Career Prep off', async () => {
    expect((await request(app()).post(URL).send({ interviewId: I1, kind: 'days' })).status).toBe(401);
    mockEnabled.mockResolvedValue(false);
    expect((await request(app()).post(URL).set('Authorization', token()).send({ interviewId: I1, kind: 'days' })).status).toBe(404);
  });
  it.each([[{ interviewId: 'x', kind: 'days' }], [{ interviewId: I1, kind: 'weekly' }], [{ interviewId: I1, kind: 'custom', minutes: 30 }], [{ interviewId: I1, kind: 'days', days: [] }]])('400s %j', async (body) => {
    expect((await request(app()).post(URL).set('Authorization', token()).send(body)).status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
  it('builds for the signed-in student only', async () => {
    mockCreate.mockResolvedValue({ id: 'pl1', interviewId: I1, plan: { kind: 'days', minutes: 20, days: [] } });
    const res = await request(app()).post(URL).set('Authorization', token()).send({ interviewId: I1, kind: 'days' });
    expect(res.status).toBe(201);
    expect(mockCreate.mock.calls[0][0]).toBe('enr-ali');
  });
  it('404s an interview that is not theirs', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NotYoursError } = require('../../services/careerPrep/plans');
    mockCreate.mockRejectedValue(new NotYoursError());
    expect((await request(app()).post(URL).set('Authorization', token()).send({ interviewId: I1, kind: 'days' })).status).toBe(404);
  });
  it('refuses a read-only view-as token', async () => {
    expect((await request(app()).post(URL).set('Authorization', token({ read_only: true, impersonated_by: 'a' })).send({ interviewId: I1, kind: 'days' })).status).toBeGreaterThanOrEqual(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('GET /api/portal/career-prep/plans', () => {
  it('returns the active plan or null, for this student', async () => {
    mockActive.mockResolvedValue(null);
    const res = await request(app()).get(`${URL}?interviewId=${I1}`).set('Authorization', token());
    expect(res.body).toEqual({ plan: null });
    expect(mockActive).toHaveBeenCalledWith('enr-ali', I1);
  });
  it('400s without a valid interview id', async () => {
    expect((await request(app()).get(URL).set('Authorization', token())).status).toBe(400);
  });
});
