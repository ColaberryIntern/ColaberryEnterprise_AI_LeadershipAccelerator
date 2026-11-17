jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockEnabled = jest.fn();
jest.mock('../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: (...a: unknown[]) => mockEnabled(...a) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => true }));
jest.mock('../../services/careerPrep/interviews', () => ({ linkHireInterviews: jest.fn(async () => 0), addInterview: jest.fn(), createPractice: jest.fn() }));
const mockSources = jest.fn();
jest.mock('../../services/careerPrep/skillSources', () => ({ skillSources: (...a: unknown[]) => mockSources(...a) }));
const mockSave = jest.fn();
const mockDelete = jest.fn();
const mockList = jest.fn();
const mockResolve = jest.fn();
const mockPublic = jest.fn();
jest.mock('../../services/careerPrep/savedAnswers', () => {
  const actual = jest.requireActual('../../services/careerPrep/savedAnswers');
  return {
    ...actual,
    saveAnswer: (...a: unknown[]) => mockSave(...a), deleteAnswer: (...a: unknown[]) => mockDelete(...a),
    listSavedAnswers: (...a: unknown[]) => mockList(...a), resolveAnswerFile: (...a: unknown[]) => mockResolve(...a),
    setShowPublic: (...a: unknown[]) => mockPublic(...a),
  };
});

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = ['career', 'prep', 'answers'].join('-');
process.env.JWT_SECRET = SECRET;
const A1 = '33333333-3333-4333-8333-333333333333';
const token = (extra: Record<string, unknown> = {}) => `Bearer ${jwt.sign({ sub: 'enr-ali', cohort_id: 'coh-1', role: 'participant', ...extra }, SECRET)}`;
function app(): express.Express {
  const a = express();
  a.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  a.use(require('../careerPrepRoutes').default);
  return a;
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sa = () => require('../../services/careerPrep/savedAnswers');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const notFound = () => { const { NotFoundError } = require('../../services/careerPrep/sessions'); return new NotFoundError(); };

beforeEach(() => { mockEnabled.mockReset().mockResolvedValue(true); [mockSources, mockSave, mockDelete, mockList, mockResolve, mockPublic].forEach((m) => m.mockReset()); });

describe('GET /skills/:key/sources', () => {
  const url = '/api/portal/career-prep/skills/pace_clarity/sources?source=video';
  it('401 without a token, 404 with Career Prep off, 400 for an unknown skill or source', async () => {
    expect((await request(app()).get(url)).status).toBe(401);
    mockEnabled.mockResolvedValueOnce(false);
    expect((await request(app()).get(url).set('Authorization', token())).status).toBe(404);
    expect((await request(app()).get('/api/portal/career-prep/skills/eye_contact/sources?source=video').set('Authorization', token())).status).toBe(400);
    expect((await request(app()).get('/api/portal/career-prep/skills/pace_clarity/sources?source=email').set('Authorization', token())).status).toBe(400);
    expect(mockSources).not.toHaveBeenCalled();
  });
  it("returns the signed-in student's results only", async () => {
    mockSources.mockResolvedValue([{ at: 'x', value: 31.5, kind: 'intro_video', label: 'Your intro video' }]);
    const res = await request(app()).get(url).set('Authorization', token());
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(mockSources.mock.calls[0].slice(0, 3)).toEqual(['enr-ali', 'pace_clarity', 'video']);
  });
});

describe('save and delete a Try answer', () => {
  const url = `/api/portal/career-prep/attempts/${A1}/save`;
  it('saves for the signed-in student (201), with the question asked', async () => {
    mockSave.mockResolvedValue({ attemptId: A1 });
    const res = await request(app()).post(url).set('Authorization', token()).send({ question: 'Tell me about a project.' });
    expect(res.status).toBe(201);
    expect(mockSave).toHaveBeenCalledWith('enr-ali', A1, 'Tell me about a project.');
  });
  it('answers 404 / 409 / 410 for not yours / not scored / gone, and refuses view-as', async () => {
    mockSave.mockRejectedValueOnce(notFound());
    expect((await request(app()).post(url).set('Authorization', token()).send({})).status).toBe(404);
    mockSave.mockRejectedValueOnce(new (sa().NotSaveableError)());
    expect((await request(app()).post(url).set('Authorization', token()).send({})).status).toBe(409);
    mockSave.mockRejectedValueOnce(new (sa().RecordingGoneError)());
    expect((await request(app()).post(url).set('Authorization', token()).send({})).status).toBe(410);
    expect((await request(app()).post(url).set('Authorization', token({ read_only: true, impersonated_by: 'a' })).send({})).status).toBe(403);
  });
  it('400s a bad id or an unexpected field', async () => {
    expect((await request(app()).post('/api/portal/career-prep/attempts/nope/save').set('Authorization', token()).send({})).status).toBe(400);
    expect((await request(app()).post(url).set('Authorization', token()).send({ enrollmentId: 'x' })).status).toBe(400);
    expect(mockSave).not.toHaveBeenCalled();
  });
  it('deletes for the signed-in student', async () => {
    mockDelete.mockResolvedValue(undefined);
    expect((await request(app()).delete(url).set('Authorization', token())).status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith('enr-ali', A1);
  });
  it('lists only the signed-in student\'s saved answers', async () => {
    mockList.mockResolvedValue([]);
    expect((await request(app()).get('/api/portal/career-prep/answers').set('Authorization', token())).status).toBe(200);
    expect(mockList).toHaveBeenCalledWith('enr-ali');
  });
});

describe('GET /answer-video/:assetId/:kind', () => {
  it('404s anything the signed token does not open, and never caches', async () => {
    mockResolve.mockResolvedValue(null);
    const res = await request(app()).get('/api/portal/career-prep/answer-video/abcdefabcdefabcdefabcdef/stream');
    expect(res.status).toBe(404);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('PUT /attempts/:attemptId/public (R1.2, the second opt-in)', () => {
  const url = `/api/portal/career-prep/attempts/${A1}/public`;
  it('401 without a token, 404 with Career Prep off, 403 for view-as', async () => {
    expect((await request(app()).put(url).send({ on: true })).status).toBe(401);
    mockEnabled.mockResolvedValueOnce(false);
    expect((await request(app()).put(url).set('Authorization', token()).send({ on: true })).status).toBe(404);
    expect((await request(app()).put(url).set('Authorization', token({ read_only: true, impersonated_by: 'a' })).send({ on: true })).status).toBe(403);
    expect(mockPublic).not.toHaveBeenCalled();
  });
  it('flips it for the signed-in student only, either way', async () => {
    mockPublic.mockResolvedValue({ attemptId: A1, showPublic: true });
    const res = await request(app()).put(url).set('Authorization', token()).send({ on: true });
    expect(res.status).toBe(200);
    expect(res.body.answer.showPublic).toBe(true);
    expect(mockPublic).toHaveBeenCalledWith('enr-ali', A1, true);
    await request(app()).put(url).set('Authorization', token()).send({ on: false });
    expect(mockPublic).toHaveBeenLastCalledWith('enr-ali', A1, false);
  });
  it("404s an answer that is not this student's saved answer", async () => {
    mockPublic.mockRejectedValueOnce(notFound());
    expect((await request(app()).put(url).set('Authorization', token()).send({ on: true })).status).toBe(404);
  });
  it('400s a bad id, a missing or non-boolean on, or an unexpected field', async () => {
    expect((await request(app()).put('/api/portal/career-prep/attempts/nope/public').set('Authorization', token()).send({ on: true })).status).toBe(400);
    expect((await request(app()).put(url).set('Authorization', token()).send({})).status).toBe(400);
    expect((await request(app()).put(url).set('Authorization', token()).send({ on: 'yes' })).status).toBe(400);
    expect((await request(app()).put(url).set('Authorization', token()).send({ on: true, enrollmentId: 'x' })).status).toBe(400);
    expect(mockPublic).not.toHaveBeenCalled();
  });
});
