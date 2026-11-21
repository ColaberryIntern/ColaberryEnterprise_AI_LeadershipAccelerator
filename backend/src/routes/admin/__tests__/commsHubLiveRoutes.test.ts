jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks').envModuleMock({ jwtSecret: 'test-secret' }));
jest.mock('../../campusRoutes', () => ({ logFailure: jest.fn(), sendValidated: jest.fn() }));
jest.mock('../commsHubEventRoutes', () => ({ actorOf: () => ({ id: 'jackie-1', label: 'jackie' }) }));
jest.mock('../../../services/commsHub/live/livePanel', () => {
  class LivePanelError extends Error { constructor(m: string, public status: number, public reason: string) { super(m); } }
  return { LivePanelError, readLivePanel: jest.fn(), prepareLive: jest.fn(), runLiveCommand: jest.fn(), readIngest: jest.fn() };
});

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import router from '../commsHubLiveRoutes';
import * as panel from '../../../services/commsHub/live/livePanel';

/** CH5.2 Live panel routes: comms_hub holders only (the stream key never reaches anyone else), shapes, no-store. */
const verify = jwt.verify as unknown as jest.Mock;
const EVENT = '88888888-8888-4888-8888-888888888888';
const BASE = `/api/admin/comms-hub/events/${EVENT}/live`;
const app = express();
app.use(express.json());
app.use(router);
const as = (who: Record<string, unknown> = { role: 'admin', mgmt_role: 'community_organizer' }) => { verify.mockReturnValue(who); return { Authorization: 'Bearer t' }; };
const KEY = 'SECRET-STREAM-KEY-1234567890abcdef';
beforeEach(() => { jest.clearAllMocks(); });

it('every Live route refuses a staff role without the comms_hub section, and the ingest service is never called', async () => {
  const who = { role: 'admin', mgmt_role: 'revenue' };
  for (const c of [
    request(app).get(BASE).set(as(who)),
    request(app).post(`${BASE}/prepare`).set(as(who)).send({}),
    request(app).post(`${BASE}/command`).set(as(who)).send({ command: 'go_live', expected_version: 1 }),
    request(app).get(`${BASE}/ingest`).set(as(who)),
  ]) {
    const res = await c;
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain(KEY);
  }
  expect(panel.readIngest).not.toHaveBeenCalled();
  expect(panel.prepareLive).not.toHaveBeenCalled();
});

it('a holder gets the push details, marked no-store', async () => {
  (panel.readIngest as jest.Mock).mockResolvedValue({ rtmps_url: 'rtmps://live.cloudflare.com:443/live/', stream_key: KEY });
  const res = await request(app).get(`${BASE}/ingest`).set(as());
  expect(res.status).toBe(200);
  expect(res.body.stream_key).toBe(KEY);
  expect(res.headers['cache-control']).toBe('no-store');
});

it('the panel state never carries the key', async () => {
  (panel.readLivePanel as jest.Mock).mockResolvedValue({ input_configured: true, occurrence: null, commands: [], input_held_by: null });
  const res = await request(app).get(BASE).set(as());
  expect(res.status).toBe(200);
  expect(JSON.stringify(res.body)).not.toMatch(/stream_key|rtmps/);
});

it('commands are validated; refusals come back as their sentence and reason', async () => {
  expect((await request(app).post(`${BASE}/command`).set(as()).send({ command: 'enter_backstage', expected_version: 1 })).status).toBe(400);
  expect((await request(app).post(`${BASE}/command`).set(as()).send({ command: 'go_live' })).status).toBe(400);
  (panel.runLiveCommand as jest.Mock).mockRejectedValue(new panel.LivePanelError('"Weekly Live" is live on the stream right now.', 409, 'input_busy'));
  const res = await request(app).post(`${BASE}/command`).set(as()).send({ command: 'go_live', expected_version: 3 });
  expect([res.status, res.body]).toEqual([409, { error: '"Weekly Live" is live on the stream right now.', reason: 'input_busy' }]);
  expect(panel.runLiveCommand).toHaveBeenCalledWith(EVENT, 'go_live', 3, { id: 'jackie-1', label: 'jackie' });
});

it('prepare takes an optional date', async () => {
  (panel.prepareLive as jest.Mock).mockResolvedValue({ input_configured: true, occurrence: { id: 'o1' }, commands: [], input_held_by: null });
  expect((await request(app).post(`${BASE}/prepare`).set(as()).send({ starts_at: '2026-12-09T00:00:00.000Z' })).status).toBe(200);
  expect((panel.prepareLive as jest.Mock).mock.calls[0][1]).toEqual(new Date('2026-12-09T00:00:00.000Z'));
  expect((await request(app).post(`${BASE}/prepare`).set(as()).send({ starts_at: 'next tuesday' })).status).toBe(400);
});
