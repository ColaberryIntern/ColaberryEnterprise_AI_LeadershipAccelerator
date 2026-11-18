// Campus v20 N3 (C134): the auth layer of the Colaberry TV router, driven through real Express + the real middlewares.
//
// TV-2 removed the five /manage routes and the whole /api/admin/colaberry-tv router, so the cases that
// drove them are gone. Rather than just delete them, the removal is ASSERTED: each dead path must now be
// a 404, not a 401 or 403. A deleted test proves nothing; a 404 proves the route is not mounted. If one
// of them were ever remounted without its gate, these fail instead of quietly passing.
//
// The surviving live route is the learner's GET, which still needs a participant token.
jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockListForViewer = jest.fn();
jest.mock('../../services/colaberryTv/tvService', () => ({ listForViewer: (...a: unknown[]) => mockListForViewer(...a) }));
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
  jest.isolateModules(() => {
    portal = require('../colaberryTvRoutes').default as express.Router;
  });
  if (prev === undefined) delete process.env.CAMPUS_ENABLED; else process.env.CAMPUS_ENABLED = prev;
  const a = express();
  a.use(express.json());
  a.use(portal);
  return a;
}

/** Every path TV-2 removed. None of these may answer anything but 404. */
const REMOVED: Array<[string, string]> = [
  ['get', '/api/portal/colaberry-tv/manage'], ['post', '/api/portal/colaberry-tv/manage'],
  ['put', '/api/portal/colaberry-tv/manage/order'], ['patch', `/api/portal/colaberry-tv/manage/${ID}`],
  ['delete', `/api/portal/colaberry-tv/manage/${ID}`],
];
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

beforeEach(() => { mockListForViewer.mockReset(); mockListForViewer.mockResolvedValue([]); });

describe('the live learner route', () => {
  it('GET /api/portal/colaberry-tv is 401 without a token and reads nothing', async () => {
    const r = await request(app()).get('/api/portal/colaberry-tv');
    expect(r.status).toBe(401);
    expect(mockListForViewer).not.toHaveBeenCalled();
  });

  it('answers a participant, which is the case the 404s below must not have broken', async () => {
    // The point of pairing this with the removals: a trim that took the live route out too would
    // show up here as a 404, not as a silently smaller suite.
    const t = jwt.sign({ sub: 'enr-7', email: 'ada@example.test', cohort_id: 'coh-1', role: 'participant' }, SECRET);
    const r = await request(app()).get('/api/portal/colaberry-tv').set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ videos: [], can_manage: false });
    expect(mockListForViewer).toHaveBeenCalledTimes(1);
  });
});

describe('the manage surface TV-2 removed', () => {
  it.each(REMOVED)('%s %s is GONE (404), not merely unauthorised', async (m, url) => {
    // 401/403 here would mean the route still exists behind a gate. 404 means it does not exist.
    const r = await request(app())[m as Method](url).send({});
    expect(r.status).toBe(404);
  });

  it.each(REMOVED)('%s %s is 404 even WITH a valid participant token', async (m, url) => {
    // The stronger form: an authenticated staff-shaped caller cannot reach it either, so the
    // removal is the route being absent rather than the gate refusing.
    const t = jwt.sign({ sub: 'enr-7', email: 'ada@example.test', cohort_id: 'coh-1', role: 'participant' }, SECRET);
    const r = await request(app())[m as Method](url).set('Authorization', `Bearer ${t}`).send({});
    expect(r.status).toBe(404);
  });

  it('the admin router is gone from the tree entirely', () => {
    // It was mounted by adminRoutes.ts and is deleted, so requiring it must throw rather than
    // resolve to a stale build artefact.
    expect(() => require('../admin/colaberryTvAdminRoutes')).toThrow();
  });
});
