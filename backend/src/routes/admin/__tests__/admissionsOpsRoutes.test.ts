jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks').envModuleMock({ jwtSecret: 'test-secret' }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import router from '../admissionsOpsRoutes';
import { TodayPayload } from '../../../services/admissionsOps/todaySchema';
import * as fixture from '../../../services/admissionsOps/todayFixture';

/**
 * AO2.1 GET /api/admin/admissions-ops/today through real Express routing: who may, the validated shape, and the
 * failure path. (The section gate in front of every admin router is covered by mgmtSectionGate.admissionsOps.test.ts;
 * this proves the route also refuses on its own.)
 */
const verify = jwt.verify as unknown as jest.Mock;
const app = express();
app.use(router);
const PATH = '/api/admin/admissions-ops/today';
const as = (who: Record<string, unknown> | null) => { verify.mockReturnValue(who); return who ? { Authorization: 'Bearer t' } : {}; };
let errSpy: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => { errSpy.mockRestore(); jest.restoreAllMocks(); });

describe('AO2.1 GET /api/admin/admissions-ops/today', () => {
  it('owner gets 200 with a payload that satisfies the contract and is labelled sample', async () => {
    const res = await request(app).get(PATH).set(as({ role: 'admin', mgmt_role: 'owner', sub: 'u-ali' }));
    expect(res.status).toBe(200);
    expect(TodayPayload.safeParse(res.body).success).toBe(true);
    expect(res.body.sample).toBe(true);
  });

  it('Taiwo with the extra section gets 200', async () => {
    const res = await request(app).get(PATH).set(as({ role: 'admin', mgmt_role: 'lead_intake', mgmt_extra_sections: ['agents', 'admissions_ops'] }));
    expect(res.status).toBe(200);
  });

  it('a scoped identity without the section gets 403; Dhee\'s admissions role gets 403', async () => {
    expect((await request(app).get(PATH).set(as({ role: 'admin', mgmt_role: 'lead_intake', mgmt_extra_sections: ['agents'] }))).status).toBe(403);
    expect((await request(app).get(PATH).set(as({ role: 'admin', mgmt_role: 'admissions' }))).status).toBe(403);
  });

  it('no token gets 401', async () => {
    expect((await request(app).get(PATH).set(as(null))).status).toBe(401);
  });

  it('AO2.2 GET .../agent/manifest: 16 screens for a holder of the section, 403 without it', async () => {
    const ok = await request(app).get('/api/admin/admissions-ops/agent/manifest').set(as({ role: 'admin', mgmt_role: 'owner' }));
    expect(ok.status).toBe(200);
    expect(ok.body.screens).toHaveLength(16);
    expect(ok.body.screens[0].actions.length).toBeGreaterThan(0);
    const denied = await request(app).get('/api/admin/admissions-ops/agent/manifest').set(as({ role: 'admin', mgmt_role: 'lead_intake', mgmt_extra_sections: ['agents'] }));
    expect(denied.status).toBe(403);
  });

  it('a builder failure is logged with its error class and returns 500 without leaking internals', async () => {
    jest.spyOn(fixture, 'buildTodaySample').mockImplementation(() => { throw new RangeError('clock out of range'); });
    const res = await request(app).get(PATH).set(as({ role: 'admin', mgmt_role: 'owner' }));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not load Today.' });
    expect(errSpy.mock.calls.map((c) => String(c[0])).join(' ')).toMatch(/admissions_ops_today_failed.*RangeError/);
  });
});
