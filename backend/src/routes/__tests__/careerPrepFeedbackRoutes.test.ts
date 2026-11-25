jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockEnabled = jest.fn();
jest.mock('../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: (...a: unknown[]) => mockEnabled(...a) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => true }));
const mockSubmit = jest.fn();
const mockList = jest.fn();
const mockSeen = jest.fn();
jest.mock('../../services/careerPrep/feedback', () => ({
  FEEDBACK_KINDS: ['broken', 'confusing', 'idea', 'works'],
  submitFeedback: (...a: unknown[]) => mockSubmit(...a), listFeedback: (...a: unknown[]) => mockList(...a), markRepliesSeen: (...a: unknown[]) => mockSeen(...a),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = ['career', 'prep', 'feedback'].join('-');
process.env.JWT_SECRET = SECRET;
const bearer = (sub: string) => `Bearer ${jwt.sign({ sub, cohort_id: 'c', role: 'participant' }, SECRET)}`;
const PATH = '/api/portal/career-prep/feedback';
const body = { clientKey: 'fb-12345678', kind: 'idea', message: 'Add a timer', context: { pageUrl: '/p', tab: 'session', browser: 'x', viewport: '1x1', errors: [], failedRequests: [] } };
function app(): express.Express {
  const a = express();
  a.use(express.json({ limit: '5mb' }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  a.use(require('../careerPrepRoutes').default);
  return a;
}
// A student per test: the limiter counts per student across the file.
let n = 0;
let me = '';
const post = (b: unknown, sub = me) => request(app()).post(PATH).set('Authorization', bearer(sub)).send(b as object);

beforeEach(() => {
  n += 1; me = `enr-${n}`;
  mockEnabled.mockReset().mockResolvedValue(true); mockSubmit.mockReset().mockResolvedValue({ item: { id: 'f1' }, created: true });
  mockList.mockReset().mockResolvedValue([]); mockSeen.mockReset().mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it('saves for the signed-in student; 201 new, 200 for a retry', async () => {
  expect((await post(body)).status).toBe(201);
  expect(mockSubmit).toHaveBeenCalledWith(me, expect.objectContaining({ kind: 'idea', message: 'Add a timer', screenshot: null }));
  mockSubmit.mockResolvedValue({ item: { id: 'f1' }, created: false });
  expect((await post(body)).status).toBe(200);
});
it('decodes a picture and refuses one that is not a picture', async () => {
  const data = Buffer.from('x').toString('base64');
  expect((await post({ ...body, screenshot: `data:image/png;base64,${data}` })).status).toBe(201);
  expect(mockSubmit.mock.calls[0][1].screenshot.filename).toBe('screenshot.png');
  expect((await post({ ...body, screenshot: `data:text/html;base64,${data}` })).status).toBe(400);
});
it.each([
  ['no words', { ...body, message: '  hi ' }], ['unknown kind', { ...body, kind: 'rant' }], ['an enrollment in the body', { ...body, enrollmentId: 'other' }],
  ['too long', { ...body, message: 'x'.repeat(4001) }], ['a short key', { ...body, clientKey: 'x' }], ['no context', { ...body, context: undefined }],
])('400 for %s', async (_n, b) => {
  expect((await post(b)).status).toBe(400);
  expect(mockSubmit).not.toHaveBeenCalled();
});
it('401 signed out; 404 when Career Prep is off; on every route', async () => {
  expect((await request(app()).post(PATH).send(body)).status).toBe(401);
  expect((await request(app()).get(PATH)).status).toBe(401);
  expect((await request(app()).post(`${PATH}/seen`)).status).toBe(401);
  mockEnabled.mockResolvedValue(false);
  expect((await post(body)).status).toBe(404);
  expect((await request(app()).get(PATH).set('Authorization', bearer(me))).status).toBe(404);
  expect((await request(app()).post(`${PATH}/seen`).set('Authorization', bearer(me))).status).toBe(404);
});
it('lists and marks seen for the signed-in student only', async () => {
  await request(app()).get(PATH).set('Authorization', bearer(me));
  await request(app()).post(`${PATH}/seen`).set('Authorization', bearer(me));
  expect(mockList).toHaveBeenCalledWith(me);
  expect(mockSeen).toHaveBeenCalledWith(me);
});
it('a failed save is a 500 that leaks nothing', async () => {
  mockSubmit.mockRejectedValue(new Error('secret db detail'));
  const r = await post(body);
  expect(r.status).toBe(500);
  expect(JSON.stringify(r.body)).not.toContain('secret');
});
it('a student is limited, and another student is not held back by it', async () => {
  let last = 0;
  for (let i = 0; i < 21; i += 1) last = (await post(body, 'enr-flood')).status;
  expect(last).toBe(429);
  expect((await post(body, 'enr-other')).status).toBe(201);
});
