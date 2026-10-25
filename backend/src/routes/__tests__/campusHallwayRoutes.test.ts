// C29: GET /api/portal/campus/hallway - auth, the pilot gate, the response contract, the token-only identity and fail-closed 500.
// The hallway service is mocked; campusHallway.test covers what it reads.
jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
type Ctx = { enrollmentId: string; cohortId: string; isAdmin: boolean };
let mockHallway: (ctx: Ctx) => Promise<unknown> = async () => ({ rooms: [], bookings: [], reese_id: null });
const mockCalls: Ctx[] = [];
jest.mock('../../services/campus/campusHallway', () => ({ getHallway: (ctx: Ctx) => { mockCalls.push(ctx); return mockHallway(ctx); } }));
jest.mock('../campusRoutes', () => ({
  sendValidated: (res: { json: (b: unknown) => void }, schema: { parse: (b: unknown) => unknown }, body: unknown) => { schema.parse(body); res.json(body); },
  logFailure: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { ParticipantPayload } from '../../middlewares/participantAuth';

const SECRET = ['campus', 'hallway', 'secret'].join('-');
process.env.JWT_SECRET = SECRET;
const URL = '/api/portal/campus/hallway';
const token = (extra: Partial<ParticipantPayload> = {}) => jwt.sign({ sub: 'enr-7', email: 'ada@example.test', cohort_id: 'coh-1', role: 'participant', ...extra }, SECRET);

function buildApp(campus: string | undefined = 'all', rooms = 'true'): express.Express {
  const prev = process.env.CAMPUS_ENABLED;
  const prevRooms = process.env.COMMUNITY_ROOMS_ENABLED;
  if (campus === undefined) delete process.env.CAMPUS_ENABLED; else process.env.CAMPUS_ENABLED = campus;
  process.env.COMMUNITY_ROOMS_ENABLED = rooms;
  let router: express.Router = express.Router();
  jest.isolateModules(() => { router = require('../campusHallwayRoutes').default as express.Router; });
  if (prev === undefined) delete process.env.CAMPUS_ENABLED; else process.env.CAMPUS_ENABLED = prev;
  if (prevRooms === undefined) delete process.env.COMMUNITY_ROOMS_ENABLED; else process.env.COMMUNITY_ROOMS_ENABLED = prevRooms;
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

const ROOM = { room_id: 'r1', name: 'Week 1 study group', sub: 'Cohort study', emoji: '📚', privacy: 'cohort', mine: false, inside_count: 3,
  inside: [{ enrollment_id: 'e2', display_name: 'Grace H', avatar_url: null, friend: true }] };
const BOOKING = { booking_id: 'b1', room_id: 'r2', title: 'Pair on STORY-001', start_at: '2026-10-27T15:00:00.000Z', end_at: null, state: 'scheduled', hosting: true };

beforeAll(() => { buildApp(); }, 120_000);
beforeEach(() => { mockCalls.length = 0; mockHallway = async () => ({ rooms: [ROOM], bookings: [BOOKING], reese_id: 'reese-1' }); });

it('401 without a token, and nothing is read', async () => {
  expect((await request(buildApp()).get(URL)).status).toBe(401);
  expect(mockCalls).toHaveLength(0);
});

it('403 CampusNotEnabled outside the pilot', async () => {
  const res = await request(buildApp('off')).get(URL).set('Authorization', `Bearer ${token()}`);
  expect(res.status).toBe(403);
  expect(res.body.error_class).toBe('CampusNotEnabled');
  expect(mockCalls).toHaveLength(0);
});

it('404 RoomsDisabled when the Community Rooms API is dark (the doors would have nothing to open)', async () => {
  const res = await request(buildApp('all', 'false')).get(URL).set('Authorization', `Bearer ${token()}`);
  expect(res.status).toBe(404);
  expect(res.body.error_class).toBe('RoomsDisabled');
  expect(mockCalls).toHaveLength(0);
});

it('200 with the contract shape; the viewer is the TOKEN enrollment and cohort only (a query cannot name someone else)', async () => {
  const res = await request(buildApp()).get(`${URL}?enrollment_id=someone-else`).set('Authorization', `Bearer ${token()}`);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ rooms: [ROOM], bookings: [BOOKING], reese_id: 'reese-1' });
  expect(mockCalls).toEqual([{ enrollmentId: 'enr-7', cohortId: 'coh-1', isAdmin: false }]);
});

it('a read-only "view as" token may read it (GET only)', async () => {
  const res = await request(buildApp()).get(URL).set('Authorization', `Bearer ${token({ read_only: true, impersonated_by: 'admin-1' })}`);
  expect(res.status).toBe(200);
});

it('a storage failure answers 500 HallwayUnavailable (never an empty hallway)', async () => {
  mockHallway = async () => { throw new Error('db down'); };
  const res = await request(buildApp()).get(URL).set('Authorization', `Bearer ${token()}`);
  expect(res.status).toBe(500);
  expect(res.body).toEqual({ error: 'Could not load the meeting rooms', error_class: 'HallwayUnavailable' });
});

it('a body that breaks the contract (more than four named people) is not sent as 200', async () => {
  mockHallway = async () => ({ rooms: [{ ...ROOM, inside: Array(5).fill(ROOM.inside[0]) }], bookings: [], reese_id: null });
  expect((await request(buildApp()).get(URL).set('Authorization', `Bearer ${token()}`)).status).toBe(500);
});

it('writes are not routes here (creating and booking use the Community Rooms endpoints)', async () => {
  expect((await request(buildApp()).post(URL).set('Authorization', `Bearer ${token()}`).send({})).status).toBe(404);
});
