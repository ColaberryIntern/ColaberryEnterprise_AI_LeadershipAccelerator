jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockEnabled = jest.fn();
jest.mock('../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: (...a: unknown[]) => mockEnabled(...a) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => true }));
const mockLoad = jest.fn();
jest.mock('../../services/careerPrep/prepData', () => ({ loadPrepData: (...a: unknown[]) => mockLoad(...a) }));
jest.mock('../../services/careerPrep/interviews', () => ({ linkHireInterviews: jest.fn(async () => 0), addInterview: jest.fn(), createPractice: jest.fn() }));
const mockAsk = jest.fn();
jest.mock('../../services/careerPrep/coraService', () => ({ askCora: (...a: unknown[]) => mockAsk(...a) }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = ['career', 'prep', 'cora'].join('-');
process.env.JWT_SECRET = SECRET;
const URL = '/api/portal/career-prep/cora';
const OTHER = '22222222-2222-4222-8222-222222222222';
const token = (extra: Record<string, unknown> = {}) => `Bearer ${jwt.sign({ sub: 'enr-ali', cohort_id: 'coh-1', role: 'participant', ...extra }, SECRET)}`;

function app(): express.Express {
  const a = express();
  a.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  a.use(require('../careerPrepRoutes').default);
  return a;
}

beforeEach(() => {
  mockEnabled.mockReset().mockResolvedValue(true);
  mockLoad.mockReset().mockResolvedValue({ enrollmentId: 'enr-ali', firstName: 'Ali', observations: [], sourceRefs: [], sessions: [], trend: [], interviews: [] });
  mockAsk.mockReset().mockResolvedValue({ messages: ['Start with your opening.'], grounded: true, unavailable: false });
});

describe('POST /api/portal/career-prep/cora', () => {
  it('401s without a token', async () => {
    expect((await request(app()).post(URL).send({ message: 'hi' })).status).toBe(401);
  });
  it('404s when Career Prep is off, without asking anyone', async () => {
    mockEnabled.mockResolvedValue(false);
    expect((await request(app()).post(URL).set('Authorization', token()).send({ message: 'hi' })).status).toBe(404);
    expect(mockAsk).not.toHaveBeenCalled();
  });
  it.each([[{}], [{ message: '   ' }], [{ message: 'x'.repeat(2001) }], [{ message: 'hi', enrollmentId: OTHER }], [{ message: 'hi', interviewId: 'abc' }]])('400s %j', async (body) => {
    expect((await request(app()).post(URL).set('Authorization', token()).send(body)).status).toBe(400);
  });
  it('404s an interview that is not this student\'s', async () => {
    expect((await request(app()).post(URL).set('Authorization', token()).send({ message: 'hi', interviewId: OTHER })).status).toBe(404);
  });
  it('answers from this student\'s own data only', async () => {
    const res = await request(app()).post(URL).set('Authorization', token()).send({ message: 'What should I work on?' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ messages: ['Start with your opening.'], cards: [] });
    expect(mockLoad).toHaveBeenCalledWith('enr-ali', expect.any(Date));
  });
  it('gives suggestion cards when Cora cannot answer', async () => {
    mockAsk.mockResolvedValue({ messages: ['I could not answer that just now.'], grounded: true, unavailable: true });
    const res = await request(app()).post(URL).set('Authorization', token()).send({ message: 'hi' });
    expect(res.body.cards.length).toBeGreaterThan(0);
    expect(res.body.cards[0]).toMatchObject({ id: 'suggest:plan', title: 'Suggest a plan' });
  });

  it('refuses a read-only view-as token', async () => {
    const res = await request(app()).post(URL).set('Authorization', token({ read_only: true, impersonated_by: 'admin-1' })).send({ message: 'hi' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockAsk).not.toHaveBeenCalled();
  });
});
