jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks').envModuleMock({ jwtSecret: 'test-secret' }));
jest.mock('../commsHubEventRoutes', () => ({ actorOf: (req: { admin?: { sub?: string; email?: string } }) => ({ id: req.admin?.sub ?? null, label: req.admin?.email ?? null }) }));
jest.mock('../../../services/commsHub/eventbrite/eventbriteEvents', () => ({ listEventbriteEvents: jest.fn() }));
jest.mock('../../../services/commsHub/eventbrite/adoption', () => ({ adoptedIds: jest.fn(async () => new Map()), syncAdoptedEventsIfDue: jest.fn(async () => null) }));
const mockList = jest.fn();
jest.mock('../../../services/commsHub/eventbrite/registrants', () => {
  class RegistrantsNotFound extends Error { constructor() { super('That event is not on the public Eventbrite list.'); } }
  return { RegistrantsNotFound, listRegistrants: (...a: unknown[]) => mockList(...a) };
});
const mockActivity = jest.fn();
jest.mock('../../../services/commsHub/activityLog', () => ({ logActivity: (...a: unknown[]) => mockActivity(...a) }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import router from '../commsHubEventbriteRoutes';
import { RegistrantsNotFound } from '../../../services/commsHub/eventbrite/registrants';
import { MGMT_ROLES, roleCanAccessSection } from '../../../services/access/mgmtRoles';

/**
 * CH9.3 the registrants routes, through real Express routing (so `/registrants.csv` is proven to be
 * its own route): who can reach them, a digits-only id, no phones on screen, no-store, the download's
 * headers, and an audit row for every view and download that names the event and never a person.
 */
const verify = jwt.verify as unknown as jest.Mock;
const app = express();
app.use(router);
const BASE = '/api/admin/comms-hub/eventbrite-events';
const JACKIE = { role: 'admin', mgmt_role: 'community_organizer', sub: 'u-jackie', email: 'jackie@colaberry.com' };
const LIST = {
  event: { ccpp_event_id: '777', title: 'AI Open House', starts_at: '2026-12-04T00:30:00.000Z' },
  eventbrite: 'ok',
  rows: [{ name: 'Ada Lovelace', email: 'ada@x.test', phone: '+1 214 555 0100', registered_at: '2026-11-09T18:00:00.000Z', sources: ['eventbrite'], has_account: true }],
};
const as = (who: Record<string, unknown> | null) => { verify.mockReturnValue(who); return who ? { Authorization: 'Bearer t' } : {}; };
let errSpy: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); mockList.mockResolvedValue(LIST); mockActivity.mockResolvedValue(undefined); errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

describe('who can reach the registrants (names, emails, phones)', () => {
  it('every role that holds comms_hub passes; every role without it is refused; a legacy admin with no role passes', async () => {
    const reached: string[] = [];
    for (const role of MGMT_ROLES) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get(`${BASE}/777/registrants`).set(as({ role: 'admin', mgmt_role: role }));
      expect(res.status).toBe(roleCanAccessSection(role, 'comms_hub') ? 200 : 403);
      if (res.status === 200) reached.push(role);
    }
    // Stated, not derived: widening registrant access (names, emails, phones) to another role must fail
    // this test, not pass it silently. Owner, admin and community_organizer hold the hub by role.
    expect(reached.sort()).toEqual(['admin', 'community_organizer', 'owner']);
    expect(MGMT_ROLES.filter((r) => roleCanAccessSection(r, 'comms_hub')).sort()).toEqual(['admin', 'community_organizer', 'owner']);
    // Beyond the roles: a legacy admin with no mgmt_role (every section), and anyone granted the hub as
    // an extra section (Taiwo: lead_intake + comms_hub). Without the grant, lead_intake is refused.
    expect((await request(app).get(`${BASE}/777/registrants`).set(as({ role: 'admin' }))).status).toBe(200);
    expect((await request(app).get(`${BASE}/777/registrants`).set(as({ role: 'admin', mgmt_role: 'lead_intake', mgmt_extra_sections: ['agents', 'comms_hub'] }))).status).toBe(200);
    expect((await request(app).get(`${BASE}/777/registrants`).set(as({ role: 'admin', mgmt_role: 'lead_intake', mgmt_extra_sections: ['agents'] }))).status).toBe(403);
    for (const refused of ['marketing', 'revenue', 'support', 'mentor', 'executive']) {
      // eslint-disable-next-line no-await-in-loop
      expect((await request(app).get(`${BASE}/777/registrants.csv`).set(as({ role: 'admin', mgmt_role: refused }))).status).toBe(403);
    }
  });
  it('no token is 401 on both routes and nothing is read', async () => {
    expect((await request(app).get(`${BASE}/777/registrants`)).status).toBe(401);
    expect((await request(app).get(`${BASE}/777/registrants.csv`)).status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe('the id', () => {
  it.each(['1;DROP', 'abc', '12345678901234567890123', '-1'])('%j is a 400 and nothing is read', async (id) => {
    const res = await request(app).get(`${BASE}/${encodeURIComponent(id)}/registrants`).set(as(JACKIE));
    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });
  it('an event that is not public is a 404 and no audit row is written', async () => {
    mockList.mockRejectedValue(new RegistrantsNotFound());
    const res = await request(app).get(`${BASE}/999/registrants`).set(as(JACKIE));
    expect([res.status, res.body.error_class]).toEqual([404, 'NotFound']);
    expect(mockActivity).not.toHaveBeenCalled();
  });
  it('a load failure is a 500 with its class, logged', async () => {
    mockList.mockRejectedValue(new Error('relation "open_house_registrations" does not exist'));
    const res = await request(app).get(`${BASE}/777/registrants.csv`).set(as(JACKIE));
    expect([res.status, res.body.error_class]).toEqual([500, 'RegistrantsLoadFailed']);
    expect(errSpy).toHaveBeenCalled();
  });
});

describe('viewing', () => {
  it('answers the list without phone numbers, not cached, and logs who looked at which event with the row count only', async () => {
    const res = await request(app).get(`${BASE}/777/registrants`).set(as(JACKIE));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.count).toBe(1);
    expect(res.body.rows[0]).toEqual({ name: 'Ada Lovelace', email: 'ada@x.test', registered_at: '2026-11-09T18:00:00.000Z', sources: ['eventbrite'], has_account: true });
    expect(JSON.stringify(res.body)).not.toContain('555');
    expect(mockList).toHaveBeenCalledWith('777');
    expect(mockActivity).toHaveBeenCalledWith({ id: 'u-jackie', label: 'jackie@colaberry.com' }, 'registrants.viewed', 'eventbrite_event', null,
      { ccpp_event_id: '777', title: 'AI Open House', rows: 1, eventbrite: 'ok' });
    expect(JSON.stringify(mockActivity.mock.calls)).not.toContain('ada@x.test');
  });
  it('an audit-log failure is logged, not swallowed, and the answer still goes', async () => {
    mockActivity.mockRejectedValue(new Error('pool exhausted'));
    expect((await request(app).get(`${BASE}/777/registrants`).set(as(JACKIE))).status).toBe(200);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('comms_hub_registrants_audit_failed');
  });
});

describe('downloading', () => {
  it('sends a CSV attachment with the phone, not cached, and logs the download', async () => {
    const res = await request(app).get(`${BASE}/777/registrants.csv`).set(as(JACKIE));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="registrants-ai-open-house-2026-12-03.csv"');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).toContain('Name,Email,Phone,Registered (Central),Source,Has platform account');
    expect(res.text).toContain("Ada Lovelace,ada@x.test,'+1 214 555 0100,");
    expect(mockActivity.mock.calls[0][1]).toBe('registrants.exported');
    expect(JSON.stringify(mockActivity.mock.calls)).not.toContain('ada@x.test');
  });
  it('/registrants.csv is its own route, not /registrants with the id read as "777.csv"', async () => {
    await request(app).get(`${BASE}/777/registrants.csv`).set(as(JACKIE));
    expect(mockList).toHaveBeenCalledWith('777');
  });
});
