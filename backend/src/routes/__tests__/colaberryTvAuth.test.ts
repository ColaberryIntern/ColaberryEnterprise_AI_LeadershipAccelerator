// Campus v20 N3 (C134): the auth layer of both Colaberry TV routers, driven through real Express + the real middlewares.
// The portal routes need a participant token (401 without one); the admin routes need an admin token whose sections include
// 'campaigns' (401 without a token, 403 for a scoped role without campaigns). The service is mocked; colaberryTvRoutes.test covers it.
jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockListAll = jest.fn();
jest.mock('../../services/colaberryTv/tvService', () => ({ listAll: () => mockListAll(), listForViewer: jest.fn().mockResolvedValue([]) }));
jest.mock('../../services/campus/campusAudience', () => ({ campusAudienceFor: jest.fn().mockResolvedValue('member') }));
jest.mock('../../services/access/mgmtBridgeService', () => ({ getMgmtStatus: jest.fn().mockResolvedValue({ is_mgmt: false, role: null, label: null, sections: [] }) }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = ['colaberry', 'tv', 'secret'].join('-');
process.env.JWT_SECRET = SECRET;
const ID = '11111111-2222-4333-8444-000000000001';

function app(): express.Express {
  const prev = process.env.CAMPUS_ENABLED;
  process.env.CAMPUS_ENABLED = 'all';
  let portal: express.Router = express.Router();
  let admin: express.Router = express.Router();
  jest.isolateModules(() => {
    portal = require('../colaberryTvRoutes').default as express.Router;
    admin = require('../admin/colaberryTvAdminRoutes').default as express.Router;
  });
  if (prev === undefined) delete process.env.CAMPUS_ENABLED; else process.env.CAMPUS_ENABLED = prev;
  const a = express();
  a.use(express.json());
  a.use(portal);
  a.use(admin);
  return a;
}

const PORTAL: Array<[string, string]> = [
  ['get', '/api/portal/colaberry-tv'], ['get', '/api/portal/colaberry-tv/manage'], ['post', '/api/portal/colaberry-tv/manage'],
  ['put', '/api/portal/colaberry-tv/manage/order'], ['patch', `/api/portal/colaberry-tv/manage/${ID}`], ['delete', `/api/portal/colaberry-tv/manage/${ID}`],
];
const ADMIN: Array<[string, string]> = [
  ['get', '/api/admin/colaberry-tv'], ['post', '/api/admin/colaberry-tv'], ['put', '/api/admin/colaberry-tv/order'],
  ['patch', `/api/admin/colaberry-tv/${ID}`], ['delete', `/api/admin/colaberry-tv/${ID}`],
];
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

beforeEach(() => { mockListAll.mockReset(); mockListAll.mockResolvedValue([]); });

describe('portal routes', () => {
  it.each(PORTAL)('%s %s is 401 without a token and reads nothing', async (m, url) => {
    const r = await request(app())[m as Method](url);
    expect(r.status).toBe(401);
    expect(mockListAll).not.toHaveBeenCalled();
  });
  it.each(PORTAL.slice(1))('%s %s is 403 for a participant without campaigns (an explorer)', async (m, url) => {
    const t = jwt.sign({ sub: 'enr-7', email: 'ada@example.test', cohort_id: 'coh-1', role: 'participant' }, SECRET);
    const r = await request(app())[m as Method](url).set('Authorization', `Bearer ${t}`).send({});
    expect(r.status).toBe(403);
    expect(mockListAll).not.toHaveBeenCalled();
  });
  it('a read-only view-as token cannot write', async () => {
    const t = jwt.sign({ sub: 'enr-7', email: 'ada@example.test', cohort_id: 'coh-1', role: 'participant', read_only: true }, SECRET);
    expect((await request(app()).post('/api/portal/colaberry-tv/manage').set('Authorization', `Bearer ${t}`).send({ url: 'x' })).status).toBe(403);
  });
});

describe('admin routes', () => {
  it.each(ADMIN)('%s %s is 401 without a token', async (m, url) => {
    expect((await request(app())[m as Method](url)).status).toBe(401);
    expect(mockListAll).not.toHaveBeenCalled();
  });
  it.each(ADMIN)('%s %s is 403 for a scoped role without campaigns', async (m, url) => {
    const t = jwt.sign({ sub: 'enr-8', email: 'cur@example.test', role: 'admin', mgmt_role: 'curriculum' }, SECRET);
    expect((await request(app())[m as Method](url).set('Authorization', `Bearer ${t}`).send({})).status).toBe(403);
    expect(mockListAll).not.toHaveBeenCalled();
  });
  it('a participant token is not an admin token', async () => {
    const t = jwt.sign({ sub: 'enr-7', email: 'ada@example.test', cohort_id: 'coh-1', role: 'participant' }, SECRET);
    expect((await request(app()).get('/api/admin/colaberry-tv').set('Authorization', `Bearer ${t}`)).status).toBe(403);
  });
  it('a full admin reaches the playlist', async () => {
    const t = jwt.sign({ sub: 'adm-1', email: 'Ops@Example.test', role: 'admin' }, SECRET);
    const r = await request(app()).get('/api/admin/colaberry-tv').set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ videos: [] });
  });
});
