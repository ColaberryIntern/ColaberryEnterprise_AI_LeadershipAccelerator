jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockEnabled = jest.fn();
jest.mock('../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: (...a: unknown[]) => mockEnabled(...a) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => true }));
const mockLoad = jest.fn();
jest.mock('../../services/careerPrep/prepData', () => ({ loadPrepData: (...a: unknown[]) => mockLoad(...a) }));
const mockLink = jest.fn();
const mockAdd = jest.fn();
const mockPractice = jest.fn();
jest.mock('../../services/careerPrep/interviews', () => ({
  linkHireInterviews: (...a: unknown[]) => mockLink(...a), addInterview: (...a: unknown[]) => mockAdd(...a), createPractice: (...a: unknown[]) => mockPractice(...a),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = ['career', 'prep', 'read'].join('-');
process.env.JWT_SECRET = SECRET;
const I1 = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const token = (sub = 'enr-ali') => `Bearer ${jwt.sign({ sub, cohort_id: 'coh-1', role: 'participant' }, SECRET)}`;
const data = () => ({
  enrollmentId: 'enr-ali', firstName: 'Ali', observations: [], sourceRefs: [], sessions: [], trend: [],
  interviews: [{ id: I1, source: 'real', company: 'Acme', role: 'AI Engineer', type: 'technical', startsAt: new Date(Date.now() + 86_400_000), targetReadiness: null, practiceUntil: null }],
});

function app(): express.Express {
  const a = express();
  a.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  a.use(require('../careerPrepRoutes').default);
  return a;
}

beforeEach(() => {
  mockEnabled.mockReset().mockResolvedValue(true);
  mockLoad.mockReset().mockResolvedValue(data());
  mockLink.mockReset().mockResolvedValue(0);
  mockAdd.mockReset();
  mockPractice.mockReset();
});

describe('reads link real Hire interviews first', () => {
  it('links before loading, and a link failure never blocks the read', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockLink.mockRejectedValue(new Error('db'));
    const res = await request(app()).get('/api/portal/career-prep/summary').set('Authorization', token());
    expect(res.status).toBe(200);
    expect(mockLink).toHaveBeenCalledWith('enr-ali');
  });
});

describe('POST /api/portal/career-prep/interviews', () => {
  const url = '/api/portal/career-prep/interviews';
  const add = { mode: 'add', company: 'Acme', role: 'AI Engineer', type: 'technical', startsAt: '2026-11-19T20:00:00Z', jdText: 'x' };

  it('401s without a token', async () => {
    expect((await request(app()).post(url).send(add)).status).toBe(401);
  });

  it('refuses a read-only "view as member" token (no writes while viewing as a student)', async () => {
    const ro = 'Bearer ' + jwt.sign({ sub: 'enr-ali', cohort_id: 'coh-1', role: 'participant', read_only: true, impersonated_by: 'admin-1' }, SECRET);
    const res = await request(app()).post(url).set('Authorization', ro).send(add);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('404s when Career Prep is off', async () => {
    mockEnabled.mockResolvedValue(false);
    expect((await request(app()).post(url).set('Authorization', token()).send(add)).status).toBe(404);
  });

  it.each([
    ['an unknown mode', { mode: 'real', company: 'A', role: 'R', type: 'technical' }],
    ['a bad type', { ...add, type: 'panel' }],
    ['an empty company', { ...add, company: '  ' }],
    ['a non-ISO date', { ...add, startsAt: 'Thursday' }],
    ['an extra field (another student id)', { ...add, enrollmentId: 'enr-2' }],
  ])('400s %s', async (_n, body) => {
    expect((await request(app()).post(url).set('Authorization', token()).send(body)).status).toBe(400);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('adds an interview for the signed-in student only', async () => {
    mockAdd.mockResolvedValue({ id: 'i9', questions: null });
    const res = await request(app()).post(url).set('Authorization', token()).send(add);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'i9', source: 'added', questions: null });
    expect(mockAdd.mock.calls[0][0]).toBe('enr-ali');
  });

  it('creates a practice interview', async () => {
    mockPractice.mockResolvedValue({ id: 'p9', practiceUntil: '2026-11-19' });
    const res = await request(app()).post(url).set('Authorization', token()).send({ mode: 'practice', role: 'AI Engineer', type: 'behavioral' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'p9', source: 'practice', practiceUntil: '2026-11-19' });
  });

  it('500s plainly when the save fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockAdd.mockRejectedValue(new Error('db'));
    expect((await request(app()).post(url).set('Authorization', token()).send(add)).body.error).toBe('Could not save the interview.');
  });
});

describe.each(['/api/portal/career-prep/summary', '/api/portal/career-prep/dashboard'])('GET %s', (url) => {
  it('401s without a token', async () => {
    expect((await request(app()).get(url)).status).toBe(401);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('404s when Career Prep is off for this student, without reading their data', async () => {
    mockEnabled.mockResolvedValue(false);
    expect((await request(app()).get(url).set('Authorization', token())).status).toBe(404);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('reads only the signed-in student, from the token', async () => {
    const res = await request(app()).get(url).set('Authorization', token());
    expect(res.status).toBe(200);
    expect(mockLoad).toHaveBeenCalledWith('enr-ali', expect.any(Date));
  });

  it('500s with a plain message when the data read fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockLoad.mockRejectedValue(new Error('db down'));
    const res = await request(app()).get(url).set('Authorization', token());
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Could not load Career Prep.');
  });
});

describe('GET /api/portal/career-prep/dashboard?interviewId=', () => {
  const url = '/api/portal/career-prep/dashboard';
  it('400s a malformed interview id', async () => {
    expect((await request(app()).get(`${url}?interviewId=abc`).set('Authorization', token())).status).toBe(400);
  });
  it('400s an unknown query field', async () => {
    expect((await request(app()).get(`${url}?studentId=${OTHER}`).set('Authorization', token())).status).toBe(400);
  });
  it('404s an interview that is not this student\'s (existence never leaks)', async () => {
    expect((await request(app()).get(`${url}?interviewId=${OTHER}`).set('Authorization', token())).status).toBe(404);
  });
  it('anchors on the student\'s own interview', async () => {
    const res = await request(app()).get(`${url}?interviewId=${I1}`).set('Authorization', token());
    expect(res.status).toBe(200);
    expect(res.body.anchorId).toBe(I1);
  });
});
