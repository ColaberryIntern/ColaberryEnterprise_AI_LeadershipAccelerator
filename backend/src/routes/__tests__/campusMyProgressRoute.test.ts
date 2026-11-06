// C120: GET /api/portal/campus/my-progress - auth, gating, the enrollment from the token only, the strict response contract
// (privacy included) and the failure classes. The service is mocked; myProgressModel/Service tests cover the content.
jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
jest.mock('../../services/campus/campusLookService', () => ({ getLook: jest.fn(), setLook: jest.fn(), looksFor: async () => new Map() }));
jest.mock('../../services/campus/campusAudience', () => ({ campusAudienceFor: jest.fn() }));
jest.mock('../../services/campus/campusTourHandoff', () => ({ requestTourHandoff: jest.fn() }));
jest.mock('../../services/campus/campusPresenceService', () => ({ touchCampusArea: jest.fn(), getCampusPresence: jest.fn() }));
jest.mock('../../services/campus/campusStaffDesks', () => ({ getStaffDesks: jest.fn() }));
jest.mock('../../services/campus/campusWave', () => ({ waveAt: jest.fn() }));
jest.mock('../../services/campus/campusRoomBuilding', () => ({ roomBuildingFor: async () => null }));

const PAYLOAD = {
  firstName: 'Ali', week: { current: 1, total: 12, cohortName: 'Cohort 12', cardsDoneThisWeek: 1, cardsThisWeek: 4 },
  points: { total: 1379, level: 4, levelName: 'AI Enabled II', builder: 93, learning: 130, community: 35 },
  latestWin: { title: 'Prompt patterns lab', date: '2026-11-04T15:00:00.000Z' },
  milestones: { earned: [], next: { key: 'project_complete', label: 'First build complete', detail: 'Every story of a published build verified' } },
  background: { title: 'Director', company: 'Acme', industry: 'Logistics', years: '14', skills: ['SQL'], education: 'MBA · Rice University' },
  goal: 'Lead an AI program', hasResume: true,
};
let mockGet: (id: string) => Promise<unknown> = async () => PAYLOAD;
const mockCalls: string[] = [];
jest.mock('../../services/campus/myProgressService', () => ({
  getMyProgress: (id: string) => { mockCalls.push(id); return mockGet(id); },
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { ParticipantPayload } from '../../middlewares/participantAuth';

const SECRET = ['campus', 'progress', 'secret'].join('-');
process.env.JWT_SECRET = SECRET;
const URL = '/api/portal/campus/my-progress';
const token = (extra: Partial<ParticipantPayload> = {}) => jwt.sign({ sub: 'enr-9', email: 'l@example.com', cohort_id: 'coh-1', role: 'participant', ...extra }, SECRET);

function buildApp(campus = 'all'): express.Express {
  const prev = process.env.CAMPUS_ENABLED;
  process.env.CAMPUS_ENABLED = campus;
  let router: express.Router = express.Router();
  jest.isolateModules(() => { router = require('../campusRoutes').default as express.Router; });
  if (prev === undefined) delete process.env.CAMPUS_ENABLED; else process.env.CAMPUS_ENABLED = prev;
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}
const get = (app: express.Express, t: string | null = token()) => (t ? request(app).get(URL).set('Authorization', `Bearer ${t}`) : request(app).get(URL));

beforeAll(() => { buildApp(); }, 120_000);
let errSpy: jest.SpyInstance;
beforeEach(() => { mockGet = async () => PAYLOAD; mockCalls.length = 0; errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

it('returns the validated payload for the TOKEN enrollment', async () => {
  const res = await get(buildApp());
  expect(res.status).toBe(200);
  expect(res.body).toEqual(PAYLOAD);
  expect(mockCalls).toEqual(['enr-9']);
});

it('ignores any enrollment in the query string', async () => {
  const res = await request(buildApp()).get(`${URL}?enrollment_id=someone-else`).set('Authorization', `Bearer ${token()}`);
  expect(res.status).toBe(200);
  expect(mockCalls).toEqual(['enr-9']);
});

it('no resume and no cohort: the nulls pass the contract', async () => {
  mockGet = async () => ({ ...PAYLOAD, week: null, background: null, goal: null, hasResume: false, latestWin: null });
  const res = await get(buildApp());
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ week: null, background: null, hasResume: false });
});

it('a "view as" read-only token may read (a GET)', async () => {
  expect((await get(buildApp(), token({ read_only: true, impersonated_by: 'admin-1' }))).status).toBe(200);
});

it('401 without a token, nothing read', async () => {
  expect((await get(buildApp(), null)).status).toBe(401);
  expect(mockCalls).toEqual([]);
});

it('403 when the campus is off, nothing read', async () => {
  const res = await get(buildApp('off'));
  expect(res.status).toBe(403);
  expect(res.body.error_class).toBe('CampusNotEnabled');
  expect(mockCalls).toEqual([]);
});

it('404 when the token enrollment no longer exists', async () => {
  mockGet = async () => { throw Object.assign(new Error('No enrollment'), { name: 'MyProgressError', error_class: 'EnrollmentNotFound' }); };
  const res = await get(buildApp());
  expect(res.status).toBe(404);
  expect(res.body.error_class).toBe('EnrollmentNotFound');
});

it('500 with a generic message on a DB error, logged with its error class', async () => {
  mockGet = async () => { throw Object.assign(new Error('connection refused 10.0.0.5'), { name: 'SequelizeConnectionError' }); };
  const res = await get(buildApp());
  expect(res.status).toBe(500);
  expect(res.body).toEqual({ error: 'Could not load your progress', error_class: 'MyProgressUnavailable' });
  const logged = JSON.parse(String(errSpy.mock.calls[0][0]));
  expect(logged).toMatchObject({ event: 'campus_my_progress_failed', error_class: 'SequelizeConnectionError' });
});

it('privacy is a contract: a background carrying phone, location or full_name fails (500, not sent)', async () => {
  for (const extra of [{ phone: '555' }, { location: 'Dallas' }, { full_name: 'Jordan' }]) {
    mockGet = async () => ({ ...PAYLOAD, background: { ...PAYLOAD.background, ...extra } });
    const res = await get(buildApp());
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/555|Dallas|Jordan/);
  }
});
