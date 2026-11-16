jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockEnabled = jest.fn();
jest.mock('../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: (...a: unknown[]) => mockEnabled(...a) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => true }));
const mockLoad = jest.fn();
jest.mock('../../services/careerPrep/prepData', () => ({ loadPrepData: (...a: unknown[]) => mockLoad(...a) }));

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
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  a.use(require('../careerPrepRoutes').default);
  return a;
}

beforeEach(() => { mockEnabled.mockReset().mockResolvedValue(true); mockLoad.mockReset().mockResolvedValue(data()); });

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
