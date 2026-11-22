jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks').envModuleMock({ jwtSecret: 'test-secret' }));
const mockList = jest.fn();
const mockSync = jest.fn();
const mockSet = jest.fn();
jest.mock('../../../services/commsHub/whatsapp/whatsappGroups', () => {
  class GroupNotFoundError extends Error { constructor() { super('That WhatsApp group is not in the hub.'); } }
  class GroupNotSendableError extends Error { constructor() { super('This group cannot be switched on: Only admins can post here, and the hub number is not an admin.'); } }
  return {
    GroupNotFoundError, GroupNotSendableError,
    listWhatsAppGroups: (...a: unknown[]) => mockList(...a), syncWhatsAppGroups: (...a: unknown[]) => mockSync(...a), setGroupEnabled: (...a: unknown[]) => mockSet(...a),
  };
});
jest.mock('../../../services/commsHub/whatsapp/whatsappStatus', () => ({ whatsappStatus: jest.fn() }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import router from '../commsHubWhatsAppRoutes';
import { GroupNotFoundError, GroupNotSendableError } from '../../../services/commsHub/whatsapp/whatsappGroups';
import { NotConnectedError, UnavailableError } from '../../../services/commsHub/whatsapp/provider';

/** CH10.2 the WhatsApp group routes: gated, validated, refusals in words, answers carry no provider ids. */
const verify = jwt.verify as unknown as jest.Mock;
const app = express();
app.use(express.json());
app.use(router);
const BASE = '/api/admin/comms-hub/whatsapp/groups';
const GID = '11111111-1111-4111-8111-111111111111';
const JACKIE = { role: 'admin', mgmt_role: 'community_organizer', sub: 'u-jackie', email: 'jackie@colaberry.com' };
const as = (who: Record<string, unknown> | null) => { verify.mockReturnValue(who); return who ? { Authorization: 'Bearer t' } : {}; };
const VIEW = { id: GID, name: 'Comms Hub test group', participants_count: 2, enabled: false, sendable: true, cant_send_reason: null, last_synced_at: '2026-11-21T22:00:00.000Z' };
let errSpy: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

it('401 with no token and 403 without the hub on all three routes; nothing is called', async () => {
  for (const [m, p] of [['get', BASE], ['post', `${BASE}/sync`], ['put', `${BASE}/${GID}`]] as const) {
    expect((await request(app)[m](p).send({ enabled: true })).status).toBe(401);
    expect((await request(app)[m](p).set(as({ role: 'admin', mgmt_role: 'support' })).send({ enabled: true })).status).toBe(403);
  }
  expect([mockList, mockSync, mockSet].map((f) => f.mock.calls.length)).toEqual([0, 0, 0]);
});

it('lists the groups field by field, not cached; an extra field from the service is dropped', async () => {
  mockList.mockResolvedValue([{ ...VIEW, provider_group_id: '120363000000000001@g.us' }]);
  const res = await request(app).get(BASE).set(as(JACKIE));
  expect([res.status, res.headers['cache-control']]).toEqual([200, 'no-store']);
  expect(res.body).toEqual({ groups: [VIEW] });
});

it('sync answers the counts and records who did it', async () => {
  mockSync.mockResolvedValue({ listed: 3, added: 3, left: 0 });
  const res = await request(app).post(`${BASE}/sync`).set(as(JACKIE));
  expect([res.status, res.body]).toEqual([200, { listed: 3, added: 3, left: 0 }]);
  expect(mockSync.mock.calls[0][0]).toMatchObject({ id: 'u-jackie' });
});

it('sync: not connected is 409 with the reason; WhatsApp not answering is 503; anything else 500', async () => {
  mockSync.mockRejectedValueOnce(new NotConnectedError('WhatsApp is switched off for the hub.', null));
  const a = await request(app).post(`${BASE}/sync`).set(as(JACKIE));
  expect([a.status, a.body.error, a.body.error_class]).toEqual([409, 'WhatsApp is switched off for the hub.', 'NotConnectedError']);
  mockSync.mockRejectedValueOnce(new UnavailableError());
  const b = await request(app).post(`${BASE}/sync`).set(as(JACKIE));
  expect([b.status, b.body.error_class]).toEqual([503, 'UpstreamUnavailable']);
  mockSync.mockRejectedValueOnce(new Error('boom'));
  expect((await request(app).post(`${BASE}/sync`).set(as(JACKIE))).status).toBe(500);
});

it('switching a group on: 200 with the group; bad id or body is 400; unknown 404; cannot-send 409', async () => {
  mockSet.mockResolvedValueOnce({ ...VIEW, enabled: true });
  const ok = await request(app).put(`${BASE}/${GID}`).set(as(JACKIE)).send({ enabled: true });
  expect([ok.status, ok.body.group.enabled]).toEqual([200, true]);
  expect(mockSet).toHaveBeenCalledWith(GID, true, expect.objectContaining({ id: 'u-jackie' }));
  for (const [path, body] of [[`${BASE}/abc`, { enabled: true }], [`${BASE}/${GID}`, { enabled: 'yes' }], [`${BASE}/${GID}`, { enabled: true, extra: 1 }], [`${BASE}/${GID}`, {}]] as const) {
    expect((await request(app).put(path).set(as(JACKIE)).send(body)).status).toBe(400);
  }
  mockSet.mockRejectedValueOnce(new GroupNotFoundError());
  expect((await request(app).put(`${BASE}/${GID}`).set(as(JACKIE)).send({ enabled: true })).status).toBe(404);
  mockSet.mockRejectedValueOnce(new GroupNotSendableError());
  const refused = await request(app).put(`${BASE}/${GID}`).set(as(JACKIE)).send({ enabled: true });
  expect([refused.status, refused.body.error_class]).toEqual([409, 'GroupNotSendable']);
  expect(mockSet).toHaveBeenCalledTimes(3);
});
