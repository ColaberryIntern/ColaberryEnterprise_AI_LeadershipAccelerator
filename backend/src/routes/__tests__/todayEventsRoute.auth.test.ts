/**
 * C107: POST /api/portal/runtime/today/events is a learner-only route. Two halves, because mounting the 1,552-line
 * participant router here would drag in most of the backend:
 *   1. the router registers the path behind requireParticipant (read from source, so a refactor that drops the
 *      middleware fails here), and
 *   2. the REAL requireParticipant in front of the REAL handler: no token or a bad token is 401 and writes nothing,
 *      a "view as" token is refused, and only a learner token records, for that learner.
 */
import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = 'test-secret-today-events';
jest.mock('../../config/env', () => ({ __esModule: true, env: { jwtSecret: 'test-secret-today-events', todayFeedV2Enabled: true } }));
const mockRecord = jest.fn();
jest.mock('../../services/timeline/todayCardEvents', () => ({
  recordTodayCardEvents: (...a: unknown[]) => mockRecord(...a),
  MAX_EVENTS_PER_CALL: 30,
}));
jest.mock('../../services/timeline/todayFeedComposer', () => ({ getTodayPage: jest.fn(), recordTodayInteraction: jest.fn() }));

// eslint-disable-next-line import/first
import { requireParticipant } from '../../middlewares/participantAuth';
// eslint-disable-next-line import/first
import { handleTodayEvents } from '../../controllers/todayController';

const ROUTE = '/api/portal/runtime/today/events';
const body = { events: [{ ref: 'card:4f1c', event: 'seen', source: 'feed' }] };
const token = (extra: Record<string, unknown> = {}) =>
  jwt.sign({ sub: 'enr-1', email: 'a@example.com', cohort_id: 'c1', role: 'participant', ...extra }, SECRET);

const app = express();
app.use(express.json());
app.post(ROUTE, requireParticipant, handleTodayEvents);

beforeEach(() => { mockRecord.mockReset().mockResolvedValue(1); });

it('is registered behind requireParticipant in the participant router', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'participantRoutes.ts'), 'utf8');
  expect(src).toContain(`router.post('${ROUTE}', requireParticipant, handleTodayEvents);`);
});

it('no token: 401, nothing recorded', async () => {
  const res = await request(app).post(ROUTE).send(body);
  expect(res.status).toBe(401);
  expect(mockRecord).not.toHaveBeenCalled();
});

it('a token signed with another secret: 401, nothing recorded', async () => {
  const forged = jwt.sign({ sub: 'enr-1', role: 'participant' }, 'not-the-secret');
  const res = await request(app).post(ROUTE).set('Authorization', `Bearer ${forged}`).send(body);
  expect(res.status).toBe(401);
  expect(mockRecord).not.toHaveBeenCalled();
});

it('a non-learner token: 403, nothing recorded', async () => {
  const res = await request(app).post(ROUTE).set('Authorization', `Bearer ${token({ role: 'admin' })}`).send(body);
  expect(res.status).toBe(403);
  expect(mockRecord).not.toHaveBeenCalled();
});

it('a read-only "view as" token: refused, nothing recorded', async () => {
  const res = await request(app).post(ROUTE).set('Authorization', `Bearer ${token({ read_only: true })}`).send(body);
  expect(res.status).toBe(403);
  expect(mockRecord).not.toHaveBeenCalled();
});

it('a learner token: recorded for the learner in the token, never one named in the body', async () => {
  const res = await request(app).post(ROUTE).set('Authorization', `Bearer ${token()}`).send(body);
  expect(res.status).toBe(200);
  expect(mockRecord).toHaveBeenCalledWith('enr-1', body.events);
});
