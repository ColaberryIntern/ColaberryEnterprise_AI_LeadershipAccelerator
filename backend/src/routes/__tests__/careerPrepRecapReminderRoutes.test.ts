jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockEnabled = jest.fn();
jest.mock('../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: (...a: unknown[]) => mockEnabled(...a) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => true }));
jest.mock('../../services/careerPrep/interviews', () => ({ linkHireInterviews: jest.fn(async () => 0), addInterview: jest.fn(), createPractice: jest.fn() }));
const mockUpdate = jest.fn();
jest.mock('../../services/careerPrep/sessions', () => {
  class NotFoundError extends Error {}
  return { startSession: jest.fn(), updateSession: (...a: unknown[]) => mockUpdate(...a), currentSession: jest.fn(), NotFoundError };
});
const mockRecap = jest.fn();
jest.mock('../../services/careerPrep/recap', () => ({ sessionRecap: (...a: unknown[]) => mockRecap(...a) }));
const mockSchedule = jest.fn();
const mockList = jest.fn();
jest.mock('../../services/careerPrep/reminders', () => ({ scheduleReminder: (...a: unknown[]) => mockSchedule(...a), listReminders: (...a: unknown[]) => mockList(...a) }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = ['career', 'prep', 'recap'].join('-');
process.env.JWT_SECRET = SECRET;
const P1 = '11111111-1111-4111-8111-111111111111';
const S1 = '22222222-2222-4222-8222-222222222222';
const token = (extra: Record<string, unknown> = {}) => `Bearer ${jwt.sign({ sub: 'enr-ali', cohort_id: 'coh-1', role: 'participant', ...extra }, SECRET)}`;
const session = (status: string) => ({ id: S1, planId: P1, status, startedAt: '2026-11-16T17:50:00.000Z', secondsActive: 600, segments: [] });
const recap = { status: 'finished', minutes: 10, attempts: 1, skills: [{ key: 'pace_clarity', label: 'Pace and clarity', before: 48, after: 57 }], streak: 2 };
// Loaded lazily: these modules read the app config, which must see JWT_SECRET first.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const notFound = () => { const { NotFoundError } = require('../../services/careerPrep/sessions'); return new NotFoundError(); };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tooLate = () => { const { TooLateError } = require('../../services/careerPrep/reminderTime'); return new TooLateError(); };

function app(): express.Express {
  const a = express();
  a.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  a.use(require('../careerPrepRoutes').default);
  return a;
}
const patch = (action: string) => request(app()).patch(`/api/portal/career-prep/sessions/${S1}`).set('Authorization', token()).send({ action, secondsActive: 600 });
const remind = (body: Record<string, unknown>, t = token()) => request(app()).post('/api/portal/career-prep/reminders').set('Authorization', t).send(body);

beforeEach(() => {
  mockEnabled.mockReset().mockResolvedValue(true); mockUpdate.mockReset(); mockRecap.mockReset(); mockSchedule.mockReset(); mockList.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('PATCH /sessions/:id: the recap (CP4.5)', () => {
  it('finishing returns the session AND the recap, built for the signed-in student', async () => {
    mockUpdate.mockResolvedValue(session('finished'));
    mockRecap.mockResolvedValue(recap);
    const res = await patch('finish');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ session: session('finished'), recap });
    expect(mockRecap).toHaveBeenCalledWith('enr-ali', session('finished'));
  });
  it('ending also recaps; a part marked done does not', async () => {
    mockUpdate.mockResolvedValueOnce(session('ended')).mockResolvedValueOnce(session('running'));
    mockRecap.mockResolvedValue({ ...recap, status: 'ended' });
    expect((await patch('end')).body.recap.status).toBe('ended');
    const done = await request(app()).patch(`/api/portal/career-prep/sessions/${S1}`).set('Authorization', token()).send({ action: 'segment_done', segmentIndex: 0, secondsActive: 60 });
    expect(done.body.recap).toBeUndefined();
    expect(mockRecap).toHaveBeenCalledTimes(1);
  });
  it('a recap that fails never loses the session: 200 with the session and no recap', async () => {
    mockUpdate.mockResolvedValue(session('finished'));
    mockRecap.mockRejectedValue(new Error('db down'));
    const res = await patch('finish');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ session: session('finished') });
  });
});

describe('POST /reminders (CP4.5)', () => {
  const view = { id: 'r1', kind: 'tonight', sendAt: '2026-11-17T00:00:00.000Z', status: 'pending' };
  it('201 for a new reminder, 200 when it already exists (asked twice = one)', async () => {
    mockSchedule.mockResolvedValueOnce({ reminder: view, created: true }).mockResolvedValueOnce({ reminder: view, created: false });
    expect((await remind({ kind: 'tonight', planId: P1 })).status).toBe(201);
    expect((await remind({ kind: 'tonight', planId: P1 })).status).toBe(200);
    expect(mockSchedule).toHaveBeenCalledWith('enr-ali', 'tonight', { planId: P1 });
  });
  it('400s a bad body: unknown kind, both refs, or neither', async () => {
    expect((await remind({ kind: 'later', planId: P1 })).status).toBe(400);
    expect((await remind({ kind: 'tomorrow', planId: P1, sessionId: S1 })).status).toBe(400);
    expect((await remind({ kind: 'tomorrow' })).status).toBe(400);
    expect(mockSchedule).not.toHaveBeenCalled();
  });
  it("404s another student's plan or session; 409s tonight after 6:00 PM", async () => {
    mockSchedule.mockRejectedValueOnce(notFound()).mockRejectedValueOnce(tooLate());
    expect((await remind({ kind: 'tomorrow', sessionId: S1 })).status).toBe(404);
    const late = await remind({ kind: 'tonight', planId: P1 });
    expect(late.status).toBe(409);
    expect(late.body.error).toContain('Same time tomorrow');
  });
  it('401 without a token, 404 with Career Prep off, 403 for a read-only view-as token', async () => {
    expect((await request(app()).post('/api/portal/career-prep/reminders').send({ kind: 'tonight', planId: P1 })).status).toBe(401);
    expect((await remind({ kind: 'tonight', planId: P1 }, token({ read_only: true, impersonated_by: 'a' }))).status).toBe(403);
    mockEnabled.mockResolvedValue(false);
    expect((await remind({ kind: 'tonight', planId: P1 })).status).toBe(404);
    expect(mockSchedule).not.toHaveBeenCalled();
  });
  it('GET lists the signed-in student\'s reminders', async () => {
    mockList.mockResolvedValue([view]);
    const res = await request(app()).get('/api/portal/career-prep/reminders').set('Authorization', token());
    expect(res.body).toEqual({ reminders: [view] });
    expect(mockList).toHaveBeenCalledWith('enr-ali');
  });
});
