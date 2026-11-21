// The CCPP driver, env, the Postgres model and database are mocked; publicEventsService itself is real,
// so the hub list is proven against the same mapping and the same "public event" rule as /portal/events.
jest.mock('mssql', () => {
  const request = { input: jest.fn().mockReturnThis(), query: jest.fn() };
  const pool = { connect: jest.fn().mockResolvedValue(undefined), request: jest.fn(() => request), close: jest.fn().mockResolvedValue(undefined) };
  return { __esModule: true, ConnectionPool: jest.fn(() => pool), NVarChar: 'NVarChar', VarChar: 'VarChar', Int: 'Int', __pool: pool, __request: request };
});
const mockEnv: Record<string, unknown> = { mssqlHost: 'h', mssqlPort: 1433, mssqlUser: 'u', mssqlPass: 'p', mssqlDatabase: 'CCPP' };
jest.mock('../../../../config/env', () => ({ env: mockEnv }));
jest.mock('../../../../models', () => ({ OpenHouseEvent: { findAll: jest.fn() } }));
const mockPgQuery = jest.fn();
jest.mock('../../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockPgQuery(...a) } }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { listEventbriteEvents, clearEventbriteCache } from '../eventbriteEvents';
import { activeSource, ccppSource, eventsQuery, fixtureSource, NotConfiguredError, LIST_LIMIT, PAST_DAYS, UPCOMING_DAYS } from '../eventbriteSource';
import { PUBLIC_EVENT_GROUP } from '../../../publicEventsService';

/**
 * CH9.2 the Events tab's "From Eventbrite" list. Read-only from CCPP; the same public-event rule
 * and the same registered count as /portal/events; a failure is never shown as "no events"; and
 * the e2e fixture can never stand in for Eventbrite in production.
 */
const sqlMock: any = require('mssql');
// CCPP stores Central wall-clock; the driver hands 6:30 PM Central over as 18:30Z.
const row = (id: string, name: string, start: string, status = 'live', extra: Record<string, unknown> = {}) => ({
  EventId: id, Name: name, Description: 'd', URL: `https://www.eventbrite.com/e/x-${id}`, StartDate: new Date(start), EndDate: null,
  Logo_url: ' https://img/x.png ', SignupCount: 14, Status: status, ...extra,
});
let errSpy: jest.SpyInstance; let logSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  clearEventbriteCache();
  mockEnv.mssqlHost = 'h'; mockEnv.mssqlUser = 'u';
  mockPgQuery.mockResolvedValue([]); // nobody registered on our own site
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => { errSpy.mockRestore(); logSpy.mockRestore(); });

describe('the SQL for each window (pure)', () => {
  it('upcoming is the /portal/events rule: live, from now through the window, public, soonest first', () => {
    const s = eventsQuery('upcoming');
    expect(s).toMatch(/e\.Status = 'live' AND e\.StartDate > /);
    expect(s).toMatch(/DATEADD\(day, @days,/);
    expect(s).toMatch(/g\.GroupName = @group/);
    expect(s).toMatch(/ORDER BY e\.StartDate ASC/);
    expect(s).toMatch(/TOP \(@lim\)/);
  });
  it('past is started or finished, inside the window, and never deleted, canceled or a draft', () => {
    const s = eventsQuery('past');
    expect(s).toMatch(/e\.Status IN \('live', 'started', 'completed', 'ended'\)/);
    expect(s).not.toMatch(/deleted|canceled|draft/);
    expect(s).toMatch(/DATEADD\(day, -@days,/);
    expect(s).toMatch(/ORDER BY e\.StartDate DESC/);
  });
});

describe('ccppSource binds every value as a parameter', () => {
  it.each([['upcoming', UPCOMING_DAYS], ['past', PAST_DAYS]] as const)('%s binds days, the limit and the group', async (w, days) => {
    sqlMock.__request.query.mockResolvedValue({ recordset: [] });
    await ccppSource.listEvents(w);
    expect(sqlMock.__request.input).toHaveBeenCalledWith('days', 'Int', days);
    expect(sqlMock.__request.input).toHaveBeenCalledWith('lim', 'Int', LIST_LIMIT);
    expect(sqlMock.__request.input).toHaveBeenCalledWith('group', 'NVarChar', PUBLIC_EVENT_GROUP);
    expect(sqlMock.__pool.close).toHaveBeenCalled();
  });
  it('no MSSQL settings is NotConfiguredError, and no connection is attempted', async () => {
    mockEnv.mssqlHost = '';
    await expect(ccppSource.listEvents('upcoming')).rejects.toBeInstanceOf(NotConfiguredError);
    expect(sqlMock.ConnectionPool).not.toHaveBeenCalled();
  });
});

describe('listEventbriteEvents', () => {
  it('maps each event with Central time corrected, the image trimmed and the portal count', async () => {
    sqlMock.__request.query.mockResolvedValue({ recordset: [row('1234567890', 'AI Open House', '2026-12-03T18:30:00Z')] });
    const list = await listEventbriteEvents('upcoming');
    expect(list.status).toBe('ok');
    expect(list.events).toEqual([{
      ccpp_event_id: '1234567890', title: 'AI Open House',
      starts_at: '2026-12-04T00:30:00.000Z', // 6:30 PM CST
      ends_at: null, registration_url: 'https://www.eventbrite.com/e/x-1234567890', image_url: 'https://img/x.png',
      registered: 14, eventbrite_status: 'live',
    }]);
  });
  it('the registered count includes people who signed up on our site, as /portal/events does', async () => {
    sqlMock.__request.query
      .mockResolvedValueOnce({ recordset: [row('777', 'Open House', '2026-12-03T18:30:00Z', 'live', { SignupCount: 2 })] })
      .mockResolvedValueOnce({ recordset: [{ Email: 'a@x.test' }, { Email: "'b@x.test'," }] }); // the Eventbrite roster
    mockPgQuery.mockResolvedValue([{ event_id: '777', email_lower: 'c@x.test' }, { event_id: '777', email_lower: 'a@x.test' }]);
    expect((await listEventbriteEvents('upcoming')).events[0].registered).toBe(3);
  });
  it('an unknown count stays unknown, never 0', async () => {
    sqlMock.__request.query.mockResolvedValue({ recordset: [row('5', 'Talk', '2026-12-03T18:30:00Z', 'live', { SignupCount: null })] });
    expect((await listEventbriteEvents('upcoming')).events[0].registered).toBeNull();
  });
  it('a CCPP failure is "unavailable" with no rows, logged with its class, and not cached', async () => {
    sqlMock.__request.query.mockRejectedValueOnce(new Error('Connection lost - read ECONNRESET'));
    const list = await listEventbriteEvents('upcoming');
    expect(list).toMatchObject({ status: 'unavailable', events: [] });
    const line = JSON.parse(errSpy.mock.calls[0][0]);
    expect([line.event, line.error_class]).toEqual(['comms_hub_eventbrite_list_failed', 'UpstreamUnavailable']);
    sqlMock.__request.query.mockResolvedValueOnce({ recordset: [row('9', 'Back', '2026-12-03T18:30:00Z')] });
    expect((await listEventbriteEvents('upcoming')).status).toBe('ok');
  });
  it('no CCPP settings is "not_configured", not "no events"', async () => {
    mockEnv.mssqlUser = '';
    expect(await listEventbriteEvents('past')).toMatchObject({ status: 'not_configured', window: 'past', events: [] });
  });
  it('boundaries: none, and the full 100', async () => {
    sqlMock.__request.query.mockResolvedValueOnce({ recordset: [] });
    expect(await listEventbriteEvents('upcoming')).toMatchObject({ status: 'ok', events: [] });
    clearEventbriteCache();
    const hundred = Array.from({ length: 100 }, (_x, i) => row(String(1000 + i), `E${i}`, '2026-12-03T18:30:00Z'));
    sqlMock.__request.query.mockResolvedValueOnce({ recordset: hundred });
    expect((await listEventbriteEvents('upcoming')).events).toHaveLength(100);
  });
  it('is cached for two minutes per window: a second read inside it gives the same answer without a query', async () => {
    let t = 1_000_000;
    sqlMock.__request.query.mockResolvedValue({ recordset: [row('1', 'A', '2026-12-03T18:30:00Z')] });
    const a = await listEventbriteEvents('upcoming', { now: () => t });
    t += 60_000;
    const b = await listEventbriteEvents('upcoming', { now: () => t });
    expect(b).toEqual(a);
    expect(sqlMock.ConnectionPool).toHaveBeenCalledTimes(1);
    t += 61_000;
    await listEventbriteEvents('upcoming', { now: () => t });
    expect(sqlMock.ConnectionPool).toHaveBeenCalledTimes(2);
  });
});

describe('the e2e fixture never stands in for Eventbrite in production', () => {
  const file = path.join(os.tmpdir(), `ch92-fixture-${process.pid}.json`);
  beforeAll(() => fs.writeFileSync(file, JSON.stringify({ events: [
    { EventId: '42', Name: '[fixture] Talk', Description: null, URL: null, StartDate: '2026-12-03T18:30:00Z', Status: 'live', SignupCount: 3 },
    { EventId: '41', Name: '[fixture] Past talk', Description: null, URL: null, StartDate: '2026-11-03T18:30:00Z', Status: 'completed', window: 'past' },
  ] })));
  afterAll(() => fs.rmSync(file, { force: true }));

  it('production ignores COMMS_HUB_EVENTBRITE_FIXTURE and reads CCPP', () => {
    expect(activeSource({ NODE_ENV: 'production', COMMS_HUB_EVENTBRITE_FIXTURE: file }).kind).toBe('ccpp');
  });
  it('development with the variable reads the fixture; without it, CCPP', () => {
    expect(activeSource({ NODE_ENV: 'development', COMMS_HUB_EVENTBRITE_FIXTURE: file }).kind).toBe('fixture');
    expect(activeSource({ NODE_ENV: 'development' }).kind).toBe('ccpp');
  });
  it('the fixture splits rows by window and parses the dates', async () => {
    const up = await fixtureSource(file).listEvents('upcoming');
    const past = await fixtureSource(file).listEvents('past');
    expect([up.map((r) => r.EventId), past.map((r) => r.EventId)]).toEqual([['42'], ['41']]);
    expect(up[0].StartDate).toBeInstanceOf(Date);
    const list = await listEventbriteEvents('upcoming', { source: fixtureSource(file) });
    expect(list.events[0]).toMatchObject({ ccpp_event_id: '42', registered: 3, starts_at: '2026-12-04T00:30:00.000Z' });
  });
});
