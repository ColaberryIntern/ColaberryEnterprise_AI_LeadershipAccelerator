jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockEnabled = jest.fn();
jest.mock('../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: (...a: unknown[]) => mockEnabled(...a) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => true }));
jest.mock('../../services/careerPrep/interviews', () => ({ linkHireInterviews: jest.fn(async () => 0), addInterview: jest.fn(), createPractice: jest.fn() }));
const mockCreate = jest.fn();
const mockEnqueue = jest.fn();
const mockGet = jest.fn();
const mockCount = jest.fn();
jest.mock('../../services/careerPrep/attempts', () => ({
  createAttempt: (...a: unknown[]) => mockCreate(...a), enqueueAttempt: (...a: unknown[]) => mockEnqueue(...a), getAttempt: (...a: unknown[]) => mockGet(...a),
  readAloudCount: (...a: unknown[]) => mockCount(...a),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = ['career', 'prep', 'attempt'].join('-');
process.env.JWT_SECRET = SECRET;
const S1 = '22222222-2222-4222-8222-222222222222';
const A1 = '33333333-3333-4333-8333-333333333333';
const URL = `/api/portal/career-prep/sessions/${S1}/attempts`;
const token = (extra: Record<string, unknown> = {}) => `Bearer ${jwt.sign({ sub: 'enr-ali', cohort_id: 'coh-1', role: 'participant', ...extra }, SECRET)}`;
const video = Buffer.from('fake-webm-bytes');
// Loaded lazily: importing the sessions module up top would read the app config before JWT_SECRET is set.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const notFound = () => { const { NotFoundError } = require('../../services/careerPrep/sessions'); return new NotFoundError(); };

function app(): express.Express {
  const a = express();
  a.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  a.use(require('../careerPrepRoutes').default);
  return a;
}
const upload = (t = token()) => request(app()).post(URL).set('Authorization', t).field('segmentIndex', '2').field('clientKey', 'key-12345678').attach('video', video, { filename: 'try.webm', contentType: 'video/webm' });

beforeEach(() => { mockEnabled.mockReset().mockResolvedValue(true); mockCreate.mockReset(); mockEnqueue.mockReset(); mockGet.mockReset(); mockCount.mockReset().mockResolvedValue(0); });

describe('POST /sessions/:id/attempts', () => {
  it('401s without a token and 404s with Career Prep off', async () => {
    expect((await request(app()).post(URL).attach('video', video, 'try.webm')).status).toBe(401);
    mockEnabled.mockResolvedValue(false);
    expect((await upload()).status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });
  it('202s a new attempt and queues it for scoring, for the signed-in student', async () => {
    mockCreate.mockResolvedValue({ attempt: { id: A1, status: 'pending', result: null, errorClass: null }, created: true });
    const res = await upload();
    expect(res.status).toBe(202);
    expect(mockCreate).toHaveBeenCalledWith('enr-ali', S1, 2, 'key-12345678', undefined);
    expect(mockEnqueue.mock.calls[0].slice(0, 2)).toEqual([A1, 'enr-ali']);
    expect(mockEnqueue.mock.calls[0][3]).toEqual({}); // a Try answer: no read-aloud line
  });
  it('200s a retried upload (same client key) without scoring it again', async () => {
    mockCreate.mockResolvedValue({ attempt: { id: A1, status: 'done', result: null, errorClass: null }, created: false });
    expect((await upload()).status).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
  it('400s a file that is not a video, and a missing file or bad key', async () => {
    const notVideo = await request(app()).post(URL).set('Authorization', token()).field('segmentIndex', '0').field('clientKey', 'key-12345678').attach('video', video, { filename: 'notes.txt', contentType: 'text/plain' });
    expect(notVideo.status).toBe(400);
    expect((await request(app()).post(URL).set('Authorization', token()).field('segmentIndex', '0').field('clientKey', 'key-12345678')).status).toBe(400);
    const badKey = await request(app()).post(URL).set('Authorization', token()).field('segmentIndex', '0').field('clientKey', 'x').attach('video', video, { filename: 'try.webm', contentType: 'video/webm' });
    expect(badKey.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
  it("404s a session that is not this student's", async () => {
    mockCreate.mockRejectedValue(notFound());
    expect((await upload()).status).toBe(404);
  });
  it('refuses a read-only view-as token', async () => {
    expect((await upload(token({ read_only: true, impersonated_by: 'a' }))).status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('CP5.8 the read-aloud warm-up (audio, with a line id)', () => {
  const audio = (lineId: string, contentType = 'audio/webm') => request(app()).post(URL).set('Authorization', token()).field('segmentIndex', '0').field('clientKey', 'key-ra-12345678').field('lineId', lineId).attach('video', video, { filename: 'read.webm', contentType });
  it('accepts an audio recording with a known line, and queues it scored as a read-aloud of THAT line', async () => {
    mockCreate.mockResolvedValue({ attempt: { id: A1, status: 'pending', result: null, errorClass: null }, created: true });
    const res = await audio('ra-02');
    expect(res.status).toBe(202);
    expect(mockCreate).toHaveBeenCalledWith('enr-ali', S1, 0, 'key-ra-12345678', 'ra-02');
    expect(mockEnqueue.mock.calls[0][3]).toEqual({ readAloudLine: expect.objectContaining({ id: 'ra-02' }) });
  });
  it('400s an unknown or malformed line id', async () => {
    expect((await audio('ra-99')).status).toBe(400);
    expect((await audio('ra-x1')).status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
  it('400s AUDIO sent without a line id: a normal Try answer must be a video', async () => {
    const noLine = await request(app()).post(URL).set('Authorization', token()).field('segmentIndex', '2').field('clientKey', 'key-ra-12345678').attach('video', video, { filename: 'try.webm', contentType: 'audio/webm' });
    expect(noLine.status).toBe(400);
    expect(noLine.body.error).toMatch(/video/);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
  it('GET /read-aloud/line gives the next line in rotation for the signed-in student; 401 without a token, 404 with Career Prep off', async () => {
    mockCount.mockResolvedValue(9);
    const res = await request(app()).get('/api/portal/career-prep/read-aloud/line').set('Authorization', token());
    expect(res.status).toBe(200);
    expect(res.body.line.id).toBe('ra-02');
    expect(mockCount).toHaveBeenCalledWith('enr-ali');
    expect((await request(app()).get('/api/portal/career-prep/read-aloud/line')).status).toBe(401);
    mockEnabled.mockResolvedValue(false);
    expect((await request(app()).get('/api/portal/career-prep/read-aloud/line').set('Authorization', token())).status).toBe(404);
  });
});

describe('GET /sessions/:id/attempts/:attemptId', () => {
  it('returns the score for this student, 404 otherwise', async () => {
    mockGet.mockResolvedValueOnce({ id: A1, status: 'done', result: { seconds: 30, scores: [], notes: [] }, errorClass: null });
    const res = await request(app()).get(`${URL}/${A1}`).set('Authorization', token());
    expect(res.body.attempt.status).toBe('done');
    expect(mockGet).toHaveBeenCalledWith('enr-ali', S1, A1);
    mockGet.mockRejectedValueOnce(notFound());
    expect((await request(app()).get(`${URL}/${A1}`).set('Authorization', token())).status).toBe(404);
  });
});

describe('an upload over the limit', () => {
  it('413s with a readable message, and the real limit is 100 MB for one file', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { guardUpload } = require('../../controllers/careerPrepAttemptController');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const multer = require('multer');
    const tiny = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4, files: 1 } });
    const a = express();
    a.post('/up', guardUpload(tiny.single('video')), (_req: express.Request, res: express.Response) => { res.status(202).json({}); });
    const res = await request(a).post('/up').attach('video', video, { filename: 'try.webm', contentType: 'video/webm' });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('That recording is too large. Keep an answer under 100 MB.');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PREP_ATTEMPT_MAX_BYTES } = require('../../config/prepAttemptUpload');
    expect(PREP_ATTEMPT_MAX_BYTES).toBe(100 * 1024 * 1024);
  });
});

describe('the upload path has its own nginx body-size rule', () => {
  it('nginx.conf raises the cap for the attempts path to 100m', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const conf = require('fs').readFileSync(require('path').join(__dirname, '..', '..', '..', '..', 'nginx', 'nginx.conf'), 'utf8') as string;
    const block = /location ~ "\^\/api\/portal\/career-prep\/sessions\/\[0-9a-fA-F-\]\+\/attempts\$" \{([\s\S]*?)\n    \}/.exec(conf);
    expect(block?.[1]).toContain('client_max_body_size 100m;');
  });
});
