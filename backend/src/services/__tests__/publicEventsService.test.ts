// Mock the CCPP driver, env, and the Postgres fallback model before importing.
jest.mock('mssql', () => {
  const request = { input: jest.fn().mockReturnThis(), query: jest.fn() };
  const pool = {
    connect: jest.fn().mockResolvedValue(undefined),
    request: jest.fn(() => request),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return { __esModule: true, ConnectionPool: jest.fn(() => pool), NVarChar: 'NVarChar', Int: 'Int', __pool: pool, __request: request };
});
jest.mock('../../config/env', () => ({
  env: { mssqlHost: 'h', mssqlPort: 1433, mssqlUser: 'u', mssqlPass: 'p', mssqlDatabase: 'CCPP' },
}));
jest.mock('../../models', () => ({ OpenHouseEvent: { findAll: jest.fn() } }));

import {
  ccppRowToView, centralWallClockToInstant, withinDays, getNextPublicEvent,
  getUpcomingPublicEvents, isKnownPublicEvent, __resetPublicEventsCache,
  PUBLIC_EVENT_GROUP,
} from '../publicEventsService';
import { OpenHouseEvent } from '../../models';

const sqlMock: any = require('mssql');

const ccppRow = (id: string, name: string, start: string) => ({
  EventId: id, Name: name, Description: 'd', URL: `https://ev/${id}`,
  StartDate: new Date(start), EndDate: new Date(start),
});

describe('publicEventsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetPublicEventsCache();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => (console.error as jest.Mock).mockRestore());

  describe('ccppRowToView (pure)', () => {
    it('maps a CCPP row onto the OpenHouseView contract, correcting Central-as-UTC times', () => {
      // CCPP stores 18:30 (6:30 PM Central); the driver hands it to us as 18:30Z.
      // In July (CDT, UTC-5) the true instant is 23:30Z.
      const v = ccppRowToView(ccppRow('123', 'Colaberry Accelerator Open House', '2026-07-16T18:30:00Z'));
      expect(v).toEqual({
        id: '123',
        title: 'Colaberry Accelerator Open House',
        description: 'd',
        starts_at: new Date('2026-07-16T23:30:00Z'),
        timezone: 'America/Chicago',
        registration_url: 'https://ev/123',
        meeting_link: null,
      });
    });

    it('coerces null description/url safely and stringifies the id', () => {
      const v = ccppRowToView({ EventId: 9 as any, Name: 'X Open House', Description: null, URL: null, StartDate: new Date('2026-08-01'), EndDate: null });
      expect(v.id).toBe('9');
      expect(v.description).toBeNull();
      expect(v.registration_url).toBeNull();
    });
  });

  describe('centralWallClockToInstant (pure, DST-aware)', () => {
    it('reads a summer wall-clock as CDT (UTC-5): 18:30 -> 23:30Z', () => {
      expect(centralWallClockToInstant(new Date('2026-07-16T18:30:00Z')).toISOString()).toBe('2026-07-16T23:30:00.000Z');
    });
    it('reads a winter wall-clock as CST (UTC-6): 18:30 -> 00:30Z next day', () => {
      expect(centralWallClockToInstant(new Date('2026-01-15T18:30:00Z')).toISOString()).toBe('2026-01-16T00:30:00.000Z');
    });
  });

  describe('withinDays (pure)', () => {
    const now = new Date('2026-07-12T00:00:00Z').getTime();
    const mk = (id: string, start: string): any => ({ id, starts_at: new Date(start) });

    it('keeps events inside the window and drops those beyond it', () => {
      const events = [mk('a', '2026-07-16T00:00:00Z'), mk('b', '2026-09-01T00:00:00Z')];
      expect(withinDays(events, now, 30).map((e) => e.id)).toEqual(['a']);
    });

    it('drops past events (boundary: strictly after now)', () => {
      const events = [mk('past', '2026-07-01T00:00:00Z'), mk('soon', '2026-07-20T00:00:00Z')];
      expect(withinDays(events, now, 30).map((e) => e.id)).toEqual(['soon']);
    });

    it('returns empty for an empty input', () => {
      expect(withinDays([], now, 30)).toEqual([]);
    });
  });

  describe('CCPP-backed reads', () => {
    it('returns the soonest event and serves repeat calls from cache (one query)', async () => {
      sqlMock.__request.query.mockResolvedValue({ recordset: [
        ccppRow('1', 'A Open House', '2026-07-16T18:30:00Z'),
        ccppRow('2', 'B Open House', '2026-08-20T18:30:00Z'),
      ]});
      const next = await getNextPublicEvent();
      expect(next!.id).toBe('1');
      await getNextPublicEvent();
      expect(sqlMock.__request.query).toHaveBeenCalledTimes(1);
    });

    it('filters the cached set to the calendar window', async () => {
      const now = new Date('2026-07-12T00:00:00Z').getTime();
      sqlMock.__request.query.mockResolvedValue({ recordset: [
        ccppRow('1', 'A Open House', '2026-07-16T18:30:00Z'),
        ccppRow('2', 'B Open House', '2026-09-01T18:30:00Z'),
      ]});
      const evs = await getUpcomingPublicEvents(30, now);
      expect(evs.map((e) => e.id)).toEqual(['1']);
    });

    it('getNextPublicEvent prefers the Open House over a sooner non-open-house event', async () => {
      sqlMock.__request.query.mockResolvedValue({ recordset: [
        ccppRow('1', 'SQL After Dark', '2026-07-13T21:00:00Z'),
        ccppRow('2', 'Accelerator Open House', '2026-07-16T18:30:00Z'),
      ]});
      expect((await getNextPublicEvent())!.id).toBe('2');
    });

    it('getNextPublicEvent falls back to the soonest event when no Open House', async () => {
      sqlMock.__request.query.mockResolvedValue({ recordset: [
        ccppRow('1', 'SQL After Dark', '2026-07-13T21:00:00Z'),
        ccppRow('2', 'Interview Prep', '2026-07-14T22:00:00Z'),
      ]});
      expect((await getNextPublicEvent())!.id).toBe('1');
    });

    it('validates ids with isKnownPublicEvent', async () => {
      sqlMock.__request.query.mockResolvedValue({ recordset: [ccppRow('42', 'X Open House', '2026-07-16T18:30:00Z')] });
      expect(await isKnownPublicEvent('42')).toBe(true);
      expect(await isKnownPublicEvent('nope')).toBe(false);
    });
  });

  // The portal's visibility rule lives entirely in this SQL, so assert the SQL —
  // a recordset-only test passes just as happily against a WHERE that hides
  // everything. Regression guard for the AI-track events (AI Internship
  // Presentation et al.) that the old name-only allowlist silently dropped.
  describe('visibility rule: the CCPP Registration label', () => {
    const runAndGetSql = async (): Promise<string> => {
      sqlMock.__request.query.mockResolvedValue({ recordset: [] });
      await getUpcomingPublicEvents(30);
      return String(sqlMock.__request.query.mock.calls[0][0]);
    };

    it('selects events carrying the Registration event-group label', async () => {
      const q = await runAndGetSql();
      expect(q).toMatch(/EventBrite_EventAccess/);
      expect(q).toMatch(/EventBrite_EventGroups/);
      expect(q).toMatch(/a\.IsActive\s*=\s*1/);
      expect(q).toMatch(/g\.GroupName\s*=\s*@group/);
      // Bound as a parameter, never interpolated into the statement text.
      expect(sqlMock.__request.input).toHaveBeenCalledWith('group', 'NVarChar', PUBLIC_EVENT_GROUP);
      expect(PUBLIC_EVENT_GROUP).toBe('Registration');
      expect(q).not.toContain(`'${PUBLIC_EVENT_GROUP}'`);
    });

    it('matches the label with EXISTS so multi-group events are not duplicated', async () => {
      const q = await runAndGetSql();
      expect(q).toMatch(/EXISTS\s*\(/);
      // A top-level join onto EventBrite_EventAccess would emit one row per
      // active group and eat the TOP (@lim) budget with duplicates.
      expect(q).not.toMatch(/FROM\s+EventBrite_Events\s+e\s+INNER\s+JOIN\s+EventBrite_EventAccess/i);
    });

    it("still OR's the deprecated name fallback for occurrences CCPP left unlabelled", async () => {
      const q = await runAndGetSql();
      expect(q).toMatch(/OR\s+e\.Name LIKE '%Open House%'/);
      expect(q).toMatch(/e\.Name LIKE '%Financial Literacy%'/);
    });

    it('keeps the live-status and forward-window guards', async () => {
      const q = await runAndGetSql();
      expect(q).toMatch(/e\.Status = 'live'/);
      expect(q).toMatch(/e\.StartDate > GETUTCDATE\(\)/);
    });
  });

  describe('failure path: CCPP unavailable', () => {
    it('falls back to the Postgres open_house_events table', async () => {
      sqlMock.__request.query.mockRejectedValue(new Error('ECONNREFUSED'));
      (OpenHouseEvent.findAll as jest.Mock).mockResolvedValue([
        // Far-future date so the fallback's future-filter never drops it as time passes.
        { id: 'pg-1', title: 'Seeded OH', description: null, starts_at: new Date('2099-01-01T18:30:00Z'), timezone: 'America/Chicago', registration_url: null, meeting_link: null },
      ]);
      const next = await getNextPublicEvent();
      expect(next!.id).toBe('pg-1');
      expect(OpenHouseEvent.findAll).toHaveBeenCalled();
    });

    it('returns null/empty (never throws) when CCPP and Postgres both fail', async () => {
      sqlMock.__request.query.mockRejectedValue(new Error('mssql down'));
      (OpenHouseEvent.findAll as jest.Mock).mockRejectedValue(new Error('pg down'));
      expect(await getNextPublicEvent()).toBeNull();
      __resetPublicEventsCache();
      expect(await getUpcomingPublicEvents(30)).toEqual([]);
    });
  });
});
