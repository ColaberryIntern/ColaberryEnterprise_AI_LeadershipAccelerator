// C7: POST /api/portal/campus/tour/complete - routing, gating and validation only. The handoff service and the audience rule are
// mocked; campusTourHandoff.test and campusTourIdempotency.test cover the writer side.
jest.mock('../../middlewares/authFailureLog', () => ({
  logAuthFailure: jest.fn(),
  describeCaller: () => ({ forwarded_for: null, user_agent: null }),
}));
let mockAudience: () => Promise<string> = () => Promise.resolve('explorer');
let mockHandoffCalls: string[] = [];
let mockHandoffResult: { handoff: boolean; reason: string } = { handoff: true, reason: 'created' };
jest.mock('../../services/campus/campusAudience', () => ({ campusAudienceFor: () => mockAudience() }));
jest.mock('../../services/campus/campusLookService', () => ({ getLook: jest.fn(), setLook: jest.fn(), looksFor: jest.fn(async () => new Map()) }));
jest.mock('../../services/campus/campusTourHandoff', () => ({
  requestTourHandoff: (id: string) => { mockHandoffCalls.push(id); return Promise.resolve(mockHandoffResult); },
}));
jest.mock('../../services/campus/campusPresenceService', () => ({ touchCampusArea: jest.fn(), getCampusPresence: jest.fn() }));
jest.mock('../../services/campus/campusStaffDesks', () => ({ getStaffDesks: jest.fn() }));
jest.mock('../../services/campus/campusWave', () => ({ waveAt: jest.fn() }));
jest.mock('../../services/campus/campusRoomBuilding', () => ({ roomBuildingFor: async () => null }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { ParticipantPayload } from '../../middlewares/participantAuth';

const SECRET = ['campus', 'tour', 'secret'].join('-');
process.env.JWT_SECRET = SECRET;
const URL = '/api/portal/campus/tour/complete';
const token = (extra: Partial<ParticipantPayload> = {}) =>
  jwt.sign({ sub: 'enr-7', email: 'explorer@example.com', cohort_id: 'coh-1', role: 'participant', ...extra }, SECRET);

function buildApp(campus: string | undefined = 'all'): express.Express {
  const prev = process.env.CAMPUS_ENABLED;
  if (campus === undefined) delete process.env.CAMPUS_ENABLED; else process.env.CAMPUS_ENABLED = campus;
  let router: express.Router = express.Router();
  jest.isolateModules(() => { router = require('../campusRoutes').default as express.Router; });
  if (prev === undefined) delete process.env.CAMPUS_ENABLED; else process.env.CAMPUS_ENABLED = prev;
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

beforeAll(() => { buildApp(); }, 120_000);
beforeEach(() => { mockAudience = () => Promise.resolve('explorer'); mockHandoffCalls = []; mockHandoffResult = { handoff: true, reason: 'created' }; });

const post = (app: express.Express, body: unknown, t = token()) => request(app).post(URL).set('Authorization', `Bearer ${t}`).send(body as object);

describe('POST /api/portal/campus/tour/complete', () => {
  it('an Explorer on the pilot gets the service answer, keyed on the token enrollment', async () => {
    const res = await post(buildApp(), { tour: 'explorer' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ handoff: true, reason: 'created' });
    expect(mockHandoffCalls).toEqual(['enr-7']);
  });

  it('passes a handoff:false answer through unchanged', async () => {
    mockHandoffResult = { handoff: false, reason: 'disabled' };
    const res = await post(buildApp(), { tour: 'explorer' });
    expect(res.body).toEqual({ handoff: false, reason: 'disabled' });
  });

  it.each([
    ['no body', undefined],
    ['another tour', { tour: 'member' }],
    ['an extra key', { tour: 'explorer', enrollment_id: 'someone-else' }],
  ])('400 for %s, nothing written', async (_n, body) => {
    const res = await post(buildApp(), body);
    expect(res.status).toBe(400);
    expect(mockHandoffCalls).toEqual([]);
  });

  it('401 without a token', async () => {
    const res = await request(buildApp()).post(URL).send({ tour: 'explorer' });
    expect(res.status).toBe(401);
    expect(mockHandoffCalls).toEqual([]);
  });

  it('403 when the campus is off for this account', async () => {
    const res = await post(buildApp('off'), { tour: 'explorer' });
    expect(res.status).toBe(403);
    expect(res.body.error_class).toBe('CampusNotEnabled');
    expect(mockHandoffCalls).toEqual([]);
  });

  it.each(['member', 'business', 'staff'])('403 NotExplorer for a %s account', async (aud) => {
    mockAudience = () => Promise.resolve(aud);
    const res = await post(buildApp(), { tour: 'explorer' });
    expect(res.status).toBe(403);
    expect(res.body.error_class).toBe('NotExplorer');
    expect(mockHandoffCalls).toEqual([]);
  });

  it('500 and nothing written when the audience lookup fails', async () => {
    mockAudience = () => Promise.reject(new Error('db down'));
    const res = await post(buildApp(), { tour: 'explorer' });
    expect(res.status).toBe(500);
    expect(res.body.error_class).toBe('CampusAudienceUnavailable');
    expect(mockHandoffCalls).toEqual([]);
  });

  it('403 for a read-only "view as" token, nothing written', async () => {
    const res = await post(buildApp(), { tour: 'explorer' }, token({ read_only: true, impersonated_by: 'admin-1' }));
    expect(res.status).toBe(403);
    expect(mockHandoffCalls).toEqual([]);
  });
});
