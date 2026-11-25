jest.mock('../../services/weeklyLive/recap/recapStore');
jest.mock('../../services/liveChat/liveChatStore', () => ({ listMessages: jest.fn() }));

import express from 'express';
import request from 'supertest';
import router from '../weeklyLiveRecapRoutes';
import * as store from '../../services/weeklyLive/recap/recapStore';
import { listMessages } from '../../services/liveChat/liveChatStore';
import { mintOptOutToken, mintRecapToken } from '../../services/weeklyLive/recap/recapToken';
import { WEEKLY_LIVE_RECAP_DDL } from '../../db/ensureWeeklyLiveRecapSchema';

/**
 * Weekly Live recap routes (WL1.2, WL1.4): admin routes refuse unauthenticated callers; the public
 * recap route validates its input and only returns the class chat for a valid personal token; the
 * opt-out records once and a replay is harmless.
 */
const SID = '5b8a95b7-1a88-42d5-b257-fd786d071f6e';
const m = store as jest.Mocked<typeof store>;
const chat = listMessages as jest.Mock;
const summary = { headline: 'It Works While You Sleep', intro: '', ideas: [{ icon: '', title: 'One skill, one job', text: '' }], steps: [], quote: '', homework: '' };
const app = express(); app.use(express.json()); app.use(router);

beforeEach(() => {
  jest.resetAllMocks();
  m.getSession.mockResolvedValue({ id: SID, title: 'Weekly Live Ep 2', session_date: '2026-11-30', start_time: '18:30', kit_config_json: null, description: null });
  m.getRecap.mockResolvedValue({ session_id: SID, summary, next_event_url: 'https://www.eventbrite.com/e/1', test_sent_at: null } as never);
  m.addOptOut.mockResolvedValue(undefined);
  chat.mockResolvedValue([{ id: 'c1', kind: 'attendee', display_name: 'Ana', content: 'hello', reply_to: null, created_at: '2026-12-01T00:00:00Z' }]);
});

describe('admin recap routes', () => {
  it.each([
    ['get', `/api/admin/live/sessions/${SID}/recap`],
    ['put', `/api/admin/live/sessions/${SID}/recap`],
    ['post', `/api/admin/live/sessions/${SID}/recap/draft`],
    ['post', `/api/admin/live/sessions/${SID}/recap/send`],
  ])('%s %s refuses an unauthenticated caller', async (method, path) => {
    const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method](path).send({ mode: 'send' });
    expect(res.status).toBe(401);
    expect(m.upsertRecap).not.toHaveBeenCalled();
  });
  it('refuses a forged admin token', async () => {
    const res = await request(app).get(`/api/admin/live/sessions/${SID}/recap`).set('Authorization', 'Bearer forged.token.value');
    expect([401, 403]).toContain(res.status);
  });
});

describe('public recap route', () => {
  it('a valid personal token returns the overview and the chat', async () => {
    const res = await request(app).get(`/api/live/recap/${SID}`).query({ t: mintRecapToken(SID, 'g1') });
    expect(res.status).toBe(200);
    expect(res.body.summary.headline).toBe('It Works While You Sleep');
    expect(res.body.personal).toBe(true);
    expect(res.body.chat).toEqual([{ id: 'c1', kind: 'attendee', name: 'Ana', content: 'hello', at: '2026-12-01T00:00:00Z' }]);
  });
  it('no token or a token for another class returns the overview without the chat', async () => {
    const none = await request(app).get(`/api/live/recap/${SID}`);
    expect(none.body.chat).toBeNull();
    const other = await request(app).get(`/api/live/recap/${SID}`).query({ t: mintRecapToken('22222222-2222-4222-8222-222222222222', 'g1') });
    expect(other.body.chat).toBeNull();
    expect(chat).not.toHaveBeenCalled();
  });
  it('malformed id is 404, a class without a recap is 404', async () => {
    expect((await request(app).get('/api/live/recap/not-a-uuid')).status).toBe(404);
    m.getRecap.mockResolvedValue(null);
    expect((await request(app).get(`/api/live/recap/${SID}`)).status).toBe(404);
  });
});

describe('recap opt-out', () => {
  it('records once per valid link; a replay is still a 200 and the table key makes it a no-op', async () => {
    const t = mintOptOutToken('ana@x.com');
    const a = await request(app).get('/api/live/recap/unsubscribe').query({ t });
    const b = await request(app).get('/api/live/recap/unsubscribe').query({ t });
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(m.addOptOut).toHaveBeenCalledWith('ana@x.com');
    expect(a.text).toContain('You will not get class recaps anymore');
  });
  it('a bad token is a 400 page and records nothing', async () => {
    const res = await request(app).get('/api/live/recap/unsubscribe').query({ t: 'garbage' });
    expect(res.status).toBe(400);
    expect(m.addOptOut).not.toHaveBeenCalled();
  });
});

describe('recap schema', () => {
  it('is additive only and keyed for idempotency', () => {
    const ddl = WEEKLY_LIVE_RECAP_DDL.join('\n');
    expect(ddl).not.toMatch(/\b(DROP|RENAME|ALTER\s+COLUMN)\b/i);
    expect(ddl).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_live_recap_sends ON weekly_live_recap_sends \(session_id, email_lower\)/);
    expect(WEEKLY_LIVE_RECAP_DDL.every((s) => /IF NOT EXISTS/.test(s))).toBe(true);
    expect(ddl).toMatch(/email_lower VARCHAR\(254\) PRIMARY KEY/);
  });
});
