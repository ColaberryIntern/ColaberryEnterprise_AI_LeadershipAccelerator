jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../campusRoutes', () => ({
  sendValidated: (res: { json: (b: unknown) => unknown }, schema: { parse: (b: unknown) => unknown }, body: unknown) => res.json(schema.parse(body)),
  logFailure: jest.fn(),
}));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks').envModuleMock({ jwtSecret: 'test-secret' }));
jest.mock('../commsHubEventRoutes', () => ({ actorOf: (req: { admin?: { sub?: string; email?: string } }) => ({ id: req.admin?.sub ?? null, label: req.admin?.email ?? null }) }));
const mockBoard = jest.fn();
const mockPause = jest.fn();
const mockUpdate = jest.fn();
const mockRead = jest.fn();
const mockFeed = jest.fn();
jest.mock('../../../services/commsHub/board/messageBoard', () => ({ listBoard: (...a: unknown[]) => mockBoard(...a) }));
jest.mock('../../../services/commsHub/board/activityFeed', () => ({ activityFeed: (...a: unknown[]) => mockFeed(...a) }));
jest.mock('../../../services/commsHub/board/boardCounters', () => ({}));
jest.mock('../../../services/commsHub/board/hubSettings', () => {
  class SettingsInputError extends Error {}
  return { SettingsInputError, readHubSettings: (...a: unknown[]) => mockRead(...a), setSendingPaused: (...a: unknown[]) => mockPause(...a), updateHubSettings: (...a: unknown[]) => mockUpdate(...a) };
});

import jwt from 'jsonwebtoken';
import router from '../commsHubBoardRoutes';
import { SettingsInputError } from '../../../services/commsHub/board/hubSettings';

/** CH7.4 board, settings and activity routes: gated, Zod-first, plain errors, response shapes checked. */
const verify = jwt.verify as unknown as jest.Mock;
const ORGANIZER = { role: 'admin', mgmt_role: 'community_organizer', sub: 'u-jackie', email: 'jackie@colaberry.com' };
async function call(method: string, path: string, o: { body?: unknown; query?: Record<string, string>; who?: Record<string, unknown> | null } = {}) {
  const layer = (router as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  const req: any = { method: method.toUpperCase(), headers: o.who === null ? {} : { authorization: 'Bearer t' }, body: o.body, params: {}, query: o.query ?? {} };
  const res: any = { statusCode: 200, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
  verify.mockReturnValue(o.who ?? ORGANIZER);
  for (const s of layer.route.stack) { let go = false; await s.handle(req, res, () => { go = true; }); if (!go) break; }
  return res;
}
const SETTINGS = { sending_paused: true, quiet_hours: null, alert_recipients: [], test_cohort: null, updated_at: '2026-11-20T16:00:00.000Z' };
let errSpy: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

describe('auth', () => {
  it.each([
    ['get', '/api/admin/comms-hub/board'], ['get', '/api/admin/comms-hub/settings'], ['put', '/api/admin/comms-hub/settings'],
    ['post', '/api/admin/comms-hub/settings/pause'], ['get', '/api/admin/comms-hub/activity'],
  ])('%s %s refuses a caller with no token and one without the section', async (m, p) => {
    expect((await call(m, p, { who: null })).statusCode).toBe(401);
    expect((await call(m, p, { who: { role: 'admin', mgmt_role: 'sales' } })).statusCode).toBe(403);
    expect(mockBoard).not.toHaveBeenCalled(); expect(mockPause).not.toHaveBeenCalled(); expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('POST /settings/pause', () => {
  it('pauses as the signed-in person and answers with the settings', async () => {
    mockPause.mockResolvedValue(SETTINGS);
    const res = await call('post', '/api/admin/comms-hub/settings/pause', { body: { paused: true } });
    expect(res.body).toEqual(SETTINGS);
    expect(mockPause).toHaveBeenCalledWith(true, { id: 'u-jackie', label: 'jackie@colaberry.com' });
  });
  it.each([[{}], [{ paused: 'yes' }], [{ paused: true, extra: 1 }]])('a malformed body %j is a 400 and nothing changes', async (body) => {
    expect((await call('post', '/api/admin/comms-hub/settings/pause', { body })).statusCode).toBe(400);
    expect(mockPause).not.toHaveBeenCalled();
  });
});

describe('PUT /settings', () => {
  it('saves quiet hours, recipients and the test cohort', async () => {
    mockUpdate.mockResolvedValue(SETTINGS);
    const body = { quiet_hours: { start: '21:00', end: '08:00' }, alert_recipients: ['ops@colaberry.com'], test_cohort_id: '77777777-7777-4777-8777-777777777777' };
    expect((await call('put', '/api/admin/comms-hub/settings', { body })).statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(body, expect.objectContaining({ id: 'u-jackie' }));
  });
  it.each([
    [{ quiet_hours: { start: '9pm', end: '08:00' } }, /21:00/],
    [{ quiet_hours: { start: '08:00', end: '08:00' } }, /different start and end/],
    [{ alert_recipients: ['not an email'] }, /email address/],
    [{ alert_recipients: Array.from({ length: 11 }, (_, i) => `a${i}@x.com`) }, /Up to 10/],
    [{ sending_paused: true }, /./],
  ])('refuses %j with a sentence', async (body, words) => {
    const res = await call('put', '/api/admin/comms-hub/settings', { body });
    expect([res.statusCode, res.body.error]).toEqual([400, expect.stringMatching(words)]);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
  it('an unknown cohort is a 400 with the service sentence; a crash is a plain 500', async () => {
    mockUpdate.mockRejectedValueOnce(new SettingsInputError('That test cohort was not found.'));
    expect((await call('put', '/api/admin/comms-hub/settings', { body: { test_cohort_id: null } })).body.error).toBe('That test cohort was not found.');
    mockUpdate.mockRejectedValueOnce(new Error('pg down at 10.0.0.1'));
    const res = await call('put', '/api/admin/comms-hub/settings', { body: {} });
    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/pg down/);
  });
});

describe('GET /board and /activity', () => {
  it('passes the scope and filters through', async () => {
    mockBoard.mockResolvedValue([]);
    await call('get', '/api/admin/comms-hub/board', { query: { scope: 'history', status: 'failed,partially_failed', channel: 'in_app' } });
    expect(mockBoard).toHaveBeenCalledWith({ scope: 'history', status: ['failed', 'partially_failed'], channel: 'in_app', event_id: null, limit: undefined });
  });
  it.each([[{}], [{ scope: 'everything' }], [{ scope: 'schedule', event_id: 'nope' }], [{ scope: 'schedule', channel: 'sms' }]])('a bad query %j is a 400', async (query) => {
    expect((await call('get', '/api/admin/comms-hub/board', { query: query as Record<string, string> })).statusCode).toBe(400);
  });
  it('activity defaults to 20 rows and refuses a bad limit', async () => {
    mockFeed.mockResolvedValue([]);
    expect((await call('get', '/api/admin/comms-hub/activity')).body).toEqual({ activity: [] });
    expect(mockFeed).toHaveBeenCalledWith(20);
    expect((await call('get', '/api/admin/comms-hub/activity', { query: { limit: '0' } })).statusCode).toBe(400);
  });
});
