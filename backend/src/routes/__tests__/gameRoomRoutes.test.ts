// C10: the Game Room routes - validation, auth, the pilot gate, refusals, rate limits and validated answers. The service is mocked;
// gameRoomService.test covers the time and score rules.
jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockCalls: Array<[string, unknown[]]> = [];
let mockImpl: Record<string, (...a: unknown[]) => Promise<unknown>> = {};
const RUN = '11111111-1111-4111-8111-111111111111';
const gameErr = (cls: string) => Object.assign(new Error('refused: ' + cls), { name: 'GameRoomError', error_class: cls });
const defaults = (): Record<string, (...a: unknown[]) => Promise<unknown>> => ({
  timeFor: async () => ({ used_s: 60, cap_s: 900, left_s: 840, resets_at: '2026-10-20T05:00:00.000Z' }),
  startRun: async () => ({ run_id: RUN, left_s: 840 }),
  beat: async () => ({ left_s: 825 }),
  submitScore: async () => ({ score: 120, seconds_used: 30, replayed: false }),
  leaderboard: async () => ({ week_start: '2026-10-19', rows: [{ rank: 1, name: 'Alex', score: 500, you: true }] }),
});
jest.mock('../../services/gameRoom/gameRoomService', () => {
  const wrap = (name: string) => (...a: unknown[]) => { mockCalls.push([name, a]); return mockImpl[name](...a); };
  return { timeFor: wrap('timeFor'), startRun: wrap('startRun'), beat: wrap('beat'), submitScore: wrap('submitScore'), leaderboard: wrap('leaderboard') };
});

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { ParticipantPayload } from '../../middlewares/participantAuth';

const SECRET = ['game', 'room', 'secret'].join('-');
process.env.JWT_SECRET = SECRET;
const token = (extra: Partial<ParticipantPayload> = {}) => jwt.sign({ sub: 'enr-g', email: 'g@example.com', cohort_id: 'coh-1', role: 'participant', ...extra }, SECRET);
const auth = (t = token()) => ({ Authorization: `Bearer ${t}` });

function buildApp(campus = 'all'): express.Express {
  const prev = process.env.CAMPUS_ENABLED;
  process.env.CAMPUS_ENABLED = campus;
  let router: express.Router = express.Router();
  jest.isolateModules(() => { router = require('../gameRoomRoutes').default as express.Router; });
  if (prev === undefined) delete process.env.CAMPUS_ENABLED; else process.env.CAMPUS_ENABLED = prev;
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

beforeAll(() => { buildApp(); }, 120_000);
let errSpy: jest.SpyInstance;
beforeEach(() => { mockCalls.length = 0; mockImpl = defaults(); errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

describe('happy paths: the token identity, validated answers', () => {
  it('GET /time', async () => {
    const res = await request(buildApp()).get('/api/portal/game-room/time').set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ used_s: 60, cap_s: 900, left_s: 840, resets_at: '2026-10-20T05:00:00.000Z' });
    expect(mockCalls[0]).toEqual(['timeFor', ['enr-g']]);
  });
  it('POST /start passes the game and the token cohort', async () => {
    const res = await request(buildApp()).post('/api/portal/game-room/start').set(auth()).send({ game: 'byte-chase' });
    expect(res.status).toBe(200);
    expect(mockCalls[0]).toEqual(['startRun', ['enr-g', 'coh-1', 'byte-chase']]);
  });
  it('POST /beat and /scores', async () => {
    const app = buildApp();
    expect((await request(app).post('/api/portal/game-room/beat').set(auth()).send({ run_id: RUN })).body).toEqual({ left_s: 825 });
    expect((await request(app).post('/api/portal/game-room/scores').set(auth()).send({ run_id: RUN, score: 120 })).body).toEqual({ score: 120, seconds_used: 30, replayed: false });
  });
  it('GET /scores?game= with no cohort passes null', async () => {
    const res = await request(buildApp()).get('/api/portal/game-room/scores?game=bug-breaker').set(auth(token({ cohort_id: null as unknown as string })));
    expect(res.status).toBe(200);
    expect(mockCalls[0]).toEqual(['leaderboard', ['enr-g', null, 'bug-breaker']]);
  });
});

describe('refusals', () => {
  it.each([
    ['start: unknown game', '/start', { game: 'pac' }],
    ['start: an extra key', '/start', { game: 'byte-chase', seconds: 900 }],
    ['beat: a client duration field', '/beat', { run_id: RUN, elapsed_s: 30 }],
    ['beat: not a uuid', '/beat', { run_id: 'x' }],
    ['scores: a fraction', '/scores', { run_id: RUN, score: 1.5 }],
    ['scores: negative', '/scores', { run_id: RUN, score: -1 }],
  ])('400 for %s, the service is never called', async (_n, path, body) => {
    const res = await request(buildApp()).post('/api/portal/game-room' + path).set(auth()).send(body);
    expect(res.status).toBe(400);
    expect(mockCalls).toEqual([]);
  });
  it('400 for a board query without a known game', async () => {
    expect((await request(buildApp()).get('/api/portal/game-room/scores?game=pac').set(auth())).status).toBe(400);
  });
  it('401 without a token', async () => {
    expect((await request(buildApp()).get('/api/portal/game-room/time')).status).toBe(401);
  });
  it('403 CampusNotEnabled when the campus is off for this account', async () => {
    const res = await request(buildApp('off')).post('/api/portal/game-room/start').set(auth()).send({ game: 'byte-chase' });
    expect(res.status).toBe(403);
    expect(res.body.error_class).toBe('CampusNotEnabled');
    expect(mockCalls).toEqual([]);
  });
  it('403 for a read-only "view as" token on a POST', async () => {
    const res = await request(buildApp()).post('/api/portal/game-room/start').set(auth(token({ read_only: true, impersonated_by: 'admin-1' }))).send({ game: 'byte-chase' });
    expect(res.status).toBe(403);
    expect(mockCalls).toEqual([]);
  });
  it.each([['CapReached', 403], ['RunExpired', 403], ['RunNotFound', 404], ['RunClosed', 409], ['ScoreRejected', 400]])('service %s -> %i with its class', async (cls, status) => {
    mockImpl.beat = async () => { throw gameErr(cls); };
    const res = await request(buildApp()).post('/api/portal/game-room/beat').set(auth()).send({ run_id: RUN });
    expect(res.status).toBe(status);
    expect(res.body.error_class).toBe(cls);
  });
  it('500 GameRoomUnavailable when the database fails, logged with the error class', async () => {
    mockImpl.beat = async () => { throw Object.assign(new Error('connection lost'), { name: 'SequelizeConnectionError' }); };
    const res = await request(buildApp()).post('/api/portal/game-room/beat').set(auth()).send({ run_id: RUN });
    expect(res.status).toBe(500);
    expect(res.body.error_class).toBe('GameRoomUnavailable');
    expect(JSON.parse(String(errSpy.mock.calls[0][0]))).toMatchObject({ event: 'game_room_beat_failed', error_class: 'SequelizeConnectionError' });
  });
});

describe('rate limits (per participant)', () => {
  it('the 11th start in a minute is 429 RateLimited; another learner is not affected', async () => {
    const app = buildApp();
    for (let i = 0; i < 10; i++) expect((await request(app).post('/api/portal/game-room/start').set(auth()).send({ game: 'byte-chase' })).status).toBe(200);
    const over = await request(app).post('/api/portal/game-room/start').set(auth()).send({ game: 'byte-chase' });
    expect(over.status).toBe(429);
    expect(over.body.error_class).toBe('RateLimited');
    const other = await request(app).post('/api/portal/game-room/start').set(auth(token({ sub: 'enr-other' }))).send({ game: 'byte-chase' });
    expect(other.status).toBe(200);
  });
  it('beats allow 30 a minute (two per 15 s beat is plenty); the 31st is 429', async () => {
    const app = buildApp();
    for (let i = 0; i < 30; i++) expect((await request(app).post('/api/portal/game-room/beat').set(auth()).send({ run_id: RUN })).status).toBe(200);
    expect((await request(app).post('/api/portal/game-room/beat').set(auth()).send({ run_id: RUN })).status).toBe(429);
  });
});
