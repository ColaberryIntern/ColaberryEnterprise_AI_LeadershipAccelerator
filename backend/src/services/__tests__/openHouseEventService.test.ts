// Mock the CCPP driver, env, and the Postgres fallback model before importing.
// Same shape as publicEventsService.test.ts, deliberately: these two services
// read the same column and must agree about what it means.
jest.mock('mssql', () => {
  const request = { input: jest.fn().mockReturnThis(), query: jest.fn() };
  const pool = {
    connect: jest.fn().mockResolvedValue(undefined),
    request: jest.fn(() => request),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return { __esModule: true, ConnectionPool: jest.fn(() => pool), NVarChar: 'NVarChar', VarChar: 'VarChar', Int: 'Int', __pool: pool, __request: request };
});
jest.mock('../../config/env', () => ({
  env: { mssqlHost: 'h', mssqlPort: 1433, mssqlUser: 'u', mssqlPass: 'p', mssqlDatabase: 'CCPP' },
}));
jest.mock('../../models', () => ({ OpenHouseEvent: { findAll: jest.fn() } }));

import {
  ccppRowToOpenHouseInfo, getCurrentOpenHouseEvent, clearOpenHouseEventCache,
  CcppOpenHouseRow,
} from '../openHouseEventService';
import { ccppRowToView } from '../publicEventsService';

const sqlMock: any = require('mssql');

/**
 * A CCPP row. `start`/`end` are written the way the mssql driver hands them over:
 * the Central wall-clock digits carried in a Date whose UTC getters read them
 * back, i.e. 6:30 PM Central arrives as 18:30Z.
 */
const row = (over: Partial<CcppOpenHouseRow> = {}): CcppOpenHouseRow => ({
  EventId: '2004289439668',
  Name: 'Colaberry AI Systems Architect Accelerator Open House',
  StartDate: new Date('2026-11-19T18:30:00Z'),
  EndDate: new Date('2026-11-19T19:30:00Z'),
  Status: 'live',
  Is_free: 'true',
  Online_event: 'true',
  Capacity: 400,
  URL: 'https://www.eventbrite.com/e/x-2004289439668',
  EventSignups: 6,
  ...over,
});

describe('ccppRowToOpenHouseInfo — the six-hour defect', () => {
  it('reads a 6:30 PM Central winter event as 6:30 PM CT, not 12:30 PM', () => {
    const info = ccppRowToOpenHouseInfo(row());
    // CST is UTC-6, so 18:30 Central is 00:30Z the NEXT day.
    expect(info.starts_at).toBe('2026-11-20T00:30:00.000Z');
    expect(info.ends_at).toBe('2026-11-20T01:30:00.000Z');
    expect(info.time_label).toBe('6:30 PM CT');
    // The exact string production served on 2026-11-10. This is the regression.
    expect(info.time_label).not.toBe('12:30 PM CT');
  });

  it('keeps the date label on the event day, not pushed over midnight by the offset', () => {
    const info = ccppRowToOpenHouseInfo(row());
    expect(info.date_label).toBe('Thu, Nov 19, 2026');
    expect(info.timezone).toBe('America/Chicago');
  });

  it('handles the summer offset too — CDT is UTC-5, not UTC-6', () => {
    const info = ccppRowToOpenHouseInfo(row({
      StartDate: new Date('2026-07-16T18:30:00Z'),
      EndDate: new Date('2026-07-16T19:30:00Z'),
    }));
    expect(info.starts_at).toBe('2026-07-16T23:30:00.000Z');
    expect(info.time_label).toBe('6:30 PM CT');
    expect(info.date_label).toBe('Thu, Jul 16, 2026');
  });

  it('agrees with ccppRowToView about the same instant — the two public endpoints must not disagree', () => {
    // The actual production symptom was these two reporting different times for
    // one Eventbrite event id. Pin the agreement, not just each side's output.
    const r = row();
    const info = ccppRowToOpenHouseInfo(r);
    const view = ccppRowToView({
      EventId: r.EventId, Name: r.Name, Description: null, URL: r.URL,
      StartDate: r.StartDate, EndDate: r.EndDate,
    } as never);
    expect(info.starts_at).toBe(view.starts_at.toISOString());
  });
});

describe('ccppRowToOpenHouseInfo — the rest of the contract', () => {
  it('computes seats remaining and carries the Eventbrite link through', () => {
    const info = ccppRowToOpenHouseInfo(row());
    expect(info.capacity).toBe(400);
    expect(info.registered).toBe(6);
    expect(info.seats_remaining).toBe(394);
    expect(info.rsvp_url).toBe('https://www.eventbrite.com/e/x-2004289439668');
    expect(info.announced).toBe(true);
  });

  it('reports unknown capacity as null rather than inventing a number', () => {
    expect(ccppRowToOpenHouseInfo(row({ Capacity: null })).seats_remaining).toBeNull();
  });

  it('clamps an oversubscribed event at zero seats instead of going negative', () => {
    expect(ccppRowToOpenHouseInfo(row({ Capacity: 400, EventSignups: 425 })).seats_remaining).toBe(0);
  });

  it('treats a missing signup count as zero registered', () => {
    expect(ccppRowToOpenHouseInfo(row({ EventSignups: null })).registered).toBe(0);
  });

  it('omits ends_at when CCPP has no end date', () => {
    expect(ccppRowToOpenHouseInfo(row({ EndDate: null })).ends_at).toBeUndefined();
  });

  it('labels the price without ever using the banned word', () => {
    // 40 TAC 807.172(d): a career school may not advertise "free" without
    // written TWC approval, which we do not have.
    expect(ccppRowToOpenHouseInfo(row({ Is_free: 'true' })).price_label).toBe('No card needed');
    expect(ccppRowToOpenHouseInfo(row({ Is_free: 'false' })).price_label).toBe('Paid');
    expect(ccppRowToOpenHouseInfo(row({ Is_free: null })).price_label).toBe('Paid');
  });

  it('describes the format from the online flag', () => {
    expect(ccppRowToOpenHouseInfo(row({ Online_event: 'true' })).format_label).toBe('Live online event');
    expect(ccppRowToOpenHouseInfo(row({ Online_event: null })).format_label).toBe('In person');
  });
});

describe('getCurrentOpenHouseEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearOpenHouseEventCache();
  });

  it('compares StartDate against Central now, not UTC now', async () => {
    sqlMock.__request.query.mockResolvedValue({ recordset: [row()] });
    await getCurrentOpenHouseEvent({ force: true });
    const text: string = sqlMock.__request.query.mock.calls[0][0];
    // Both sides of the comparison must be in the Central frame. Comparing the
    // Central column to UTC-now retired the event six hours before it started.
    expect(text).toContain("AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time'");
    expect(text).not.toMatch(/StartDate\s*>=?\s*GETUTCDATE\(\)/);
  });

  it('answers announced:false when nothing upcoming is live', async () => {
    sqlMock.__request.query.mockResolvedValue({ recordset: [] });
    const info = await getCurrentOpenHouseEvent({ force: true });
    expect(info).toEqual({ announced: false });
  });

  it('serves the cached answer until it is cleared', async () => {
    sqlMock.__request.query.mockResolvedValue({ recordset: [row()] });
    await getCurrentOpenHouseEvent({ force: true });
    await getCurrentOpenHouseEvent();
    expect(sqlMock.__request.query).toHaveBeenCalledTimes(1);
    clearOpenHouseEventCache();
    await getCurrentOpenHouseEvent();
    expect(sqlMock.__request.query).toHaveBeenCalledTimes(2);
  });

  it('closes the pool even when the query throws', async () => {
    sqlMock.__request.query.mockRejectedValue(new Error('CCPP down'));
    await expect(getCurrentOpenHouseEvent({ force: true })).rejects.toThrow('CCPP down');
    expect(sqlMock.__pool.close).toHaveBeenCalled();
  });
});
