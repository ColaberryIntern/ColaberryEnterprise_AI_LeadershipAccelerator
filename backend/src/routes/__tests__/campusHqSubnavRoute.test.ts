// C92: GET /api/portal/campus/hq-subnav - auth, the campus gate, the response contract and the failure path. getHqSubnav is
// mocked; services/campus/__tests__/hqSubnav.test covers the per-section gating and the fail-soft lists.
jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
let mockSubnav: (id: string, email: string) => Promise<unknown> = async () => ({ gov: [{ key: 'g1' }], agents: [] });
const mockCalls: Array<[string, string]> = [];
jest.mock('../../services/campus/hqSubnav', () => ({
  getHqSubnav: (id: string, email: string) => { mockCalls.push([id, email]); return mockSubnav(id, email); },
}));
jest.mock('../../services/campus/campusAudience', () => ({ campusAudienceFor: jest.fn() }));
jest.mock('../../services/campus/campusTourHandoff', () => ({ requestTourHandoff: jest.fn() }));
jest.mock('../../services/campus/campusPresenceService', () => ({ touchCampusArea: jest.fn(), getCampusPresence: jest.fn() }));
jest.mock('../../services/campus/campusStaffDesks', () => ({ getStaffDesks: jest.fn() }));
jest.mock('../../services/campus/campusWave', () => ({ waveAt: jest.fn() }));
jest.mock('../../services/campus/campusRoomBuilding', () => ({ roomBuildingFor: async () => null }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { ParticipantPayload } from '../../middlewares/participantAuth';

const SECRET = ['campus', 'subnav', 'secret'].join('-');
process.env.JWT_SECRET = SECRET;
const URL = '/api/portal/campus/hq-subnav';
const token = (extra: Partial<ParticipantPayload> = {}) => jwt.sign({ sub: 'enr-9', email: 'ali@colaberry.com', cohort_id: 'coh-1', role: 'participant', ...extra }, SECRET);

function buildApp(campus = 'all'): express.Express {
  const prev = process.env.CAMPUS_ENABLED;
  process.env.CAMPUS_ENABLED = campus;
  let router: express.Router = express.Router();
  jest.isolateModules(() => { router = require('../campusRoutes').default as express.Router; });
  if (prev === undefined) delete process.env.CAMPUS_ENABLED; else process.env.CAMPUS_ENABLED = prev;
  const app = express();
  app.use(router);
  return app;
}

beforeAll(() => { buildApp(); }, 120_000);
beforeEach(() => { mockSubnav = async () => ({ gov: [{ key: 'g1' }], agents: [] }); mockCalls.length = 0; });
let errSpy: jest.SpyInstance;
beforeEach(() => { errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

describe('GET /api/portal/campus/hq-subnav', () => {
  it('serves the lists for the signed-in person (their enrollment and email)', async () => {
    const res = await request(buildApp()).get(URL).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ gov: [{ key: 'g1' }], agents: [] });
    expect(mockCalls).toEqual([['enr-9', 'ali@colaberry.com']]);
  });
  it('no token: 401, and the lists are never read', async () => {
    expect((await request(buildApp()).get(URL)).status).toBe(401);
    expect(mockCalls).toHaveLength(0);
  });
  it('campus off for the account: 403 CampusNotEnabled', async () => {
    const res = await request(buildApp('off')).get(URL).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(403);
    expect(res.body.error_class).toBe('CampusNotEnabled');
    expect(mockCalls).toHaveLength(0);
  });
  it('the service throws: 500 with a stable class, no internals', async () => {
    mockSubnav = async () => { throw new TypeError('db down'); };
    const res = await request(buildApp()).get(URL).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not load the building sub-lists', error_class: 'CampusHqSubnavUnavailable' });
  });
});
