// C23 WP-9: GET /api/portal/campus/team - auth, the campus gate, the response contract and the failure path. teamSummaryFor is
// mocked; services/campus/__tests__/campusTeam.test covers the company and team-size rules.
jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
let mockSummary: (id: string) => Promise<unknown> = async () => ({ company: 'Acme Logistics', team_size: 9 });
const mockCalls: string[] = [];
jest.mock('../../services/campus/campusTeam', () => ({
  teamSummaryFor: (id: string) => { mockCalls.push(id); return mockSummary(id); },
  teamEnrollmentIdsFor: jest.fn(),
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

const SECRET = ['campus', 'team', 'secret'].join('-');
process.env.JWT_SECRET = SECRET;
const URL = '/api/portal/campus/team';
const token = (extra: Partial<ParticipantPayload> = {}) => jwt.sign({ sub: 'enr-7', email: 'partner@example.com', cohort_id: 'coh-1', role: 'participant', ...extra }, SECRET);

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
beforeEach(() => { mockSummary = async () => ({ company: 'Acme Logistics', team_size: 9 }); mockCalls.length = 0; });
let errSpy: jest.SpyInstance;
beforeEach(() => { errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

describe('GET /api/portal/campus/team', () => {
  it('serves the company and team size for the signed-in person', async () => {
    const res = await request(buildApp()).get(URL).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ company: 'Acme Logistics', team_size: 9 });
    expect(mockCalls).toEqual(['enr-7']);
  });
  it('someone who manages nothing: company null, team 0', async () => {
    mockSummary = async () => ({ company: null, team_size: 0 });
    const res = await request(buildApp()).get(URL).set('Authorization', `Bearer ${token()}`);
    expect(res.body).toEqual({ company: null, team_size: 0 });
  });
  it('no token: 401, and the team is never read', async () => {
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
    mockSummary = async () => { throw new TypeError('db down'); };
    const res = await request(buildApp()).get(URL).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not load your team', error_class: 'CampusTeamUnavailable' });
  });
});
