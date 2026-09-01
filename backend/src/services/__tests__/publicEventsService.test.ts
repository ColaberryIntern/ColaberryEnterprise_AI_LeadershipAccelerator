// Mock the CCPP driver, env, and the Postgres fallback model before importing.
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
  ccppRowToView, centralWallClockToInstant, withinDays, getNextPublicEvent,
  getUpcomingPublicEvents, isKnownPublicEvent, __resetPublicEventsCache,
  PUBLIC_EVENT_GROUP, annotateRegistration,
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
        ends_at: new Date('2026-07-16T23:30:00Z'),
        timezone: 'America/Chicago',
        registration_url: 'https://ev/123',
        meeting_link: null,
        image_url: null,
        signup_count: null,
        is_registered: false,
      });
    });

    it('coerces null description/url safely and stringifies the id', () => {
      const v = ccppRowToView({ EventId: 9 as any, Name: 'X Open House', Description: null, URL: null, StartDate: new Date('2026-08-01'), EndDate: null });
      expect(v.id).toBe('9');
      expect(v.description).toBeNull();
      expect(v.registration_url).toBeNull();
    });

    it('passes a real signup count through, and treats a missing one as unknown', () => {
      const base = ccppRow('7', 'X', '2026-09-01T10:00:00Z');
      expect(ccppRowToView({ ...base, SignupCount: 14 }).signup_count).toBe(14);
      // 0 is a REAL answer ("nobody yet") and must survive as 0, not become null.
      expect(ccppRowToView({ ...base, SignupCount: 0 }).signup_count).toBe(0);
      // Absent / null / non-numeric mean "not known" — null, never a fabricated 0.
      expect(ccppRowToView(base).signup_count).toBeNull();
      expect(ccppRowToView({ ...base, SignupCount: null }).signup_count).toBeNull();
      expect(ccppRowToView({ ...base, SignupCount: NaN }).signup_count).toBeNull();
    });

    it('defaults is_registered false — it is per-viewer, never from the shared cache', () => {
      expect(ccppRowToView(ccppRow('7', 'X', '2026-09-01T10:00:00Z')).is_registered).toBe(false);
    });

    it('carries the Eventbrite promo image through as image_url', () => {
      const url = 'https://img.evbuc.com/x?s=abc';
      const v = ccppRowToView({ ...ccppRow('7', 'AI Internship Presentation Event', '2026-09-01T10:00:00Z'), Logo_url: url });
      expect(v.image_url).toBe(url);
    });

    it('normalises a missing, null or blank Logo_url to null', () => {
      const base = ccppRow('7', 'X', '2026-09-01T10:00:00Z');
      // CCPP holds all three shapes; the UI does one truthiness check, so they
      // must collapse to null rather than reaching it as '' or undefined.
      expect(ccppRowToView(base).image_url).toBeNull();
      expect(ccppRowToView({ ...base, Logo_url: null }).image_url).toBeNull();
      expect(ccppRowToView({ ...base, Logo_url: '   ' }).image_url).toBeNull();
    });

    it('corrects ends_at as Central-as-UTC too, and leaves a null EndDate null', () => {
      const withEnd = ccppRowToView({ ...ccppRow('7', 'X', '2026-07-16T18:30:00Z'), EndDate: new Date('2026-07-16T20:00:00Z') });
      expect(withEnd.ends_at).toEqual(new Date('2026-07-17T01:00:00Z'));
      expect(ccppRowToView({ ...ccppRow('7', 'X', '2026-07-16T18:30:00Z'), EndDate: null }).ends_at).toBeNull();
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

    it('selects the promo image column the Events page renders', async () => {
      // Without Logo_url in the SELECT the page silently falls back to lettered
      // tiles for every card, which looks intentional rather than broken.
      const q = await runAndGetSql();
      expect(q).toMatch(/e\.Logo_url/);
    });

    it('counts signups by DISTINCT email, not attendee rows', async () => {
      // One Eventbrite order writes several attendee rows. The legacy training
      // site badges 14 for an event holding 30 rows, and that is the number
      // learners recognise — COUNT(*) would show 30 and read as inflated.
      const q = await runAndGetSql();
      expect(q).toMatch(/COUNT\(DISTINCT a2\.Email\)/);
      expect(q).toMatch(/EventBrite_EventAttendees/);
      // A correlated subquery, not a second top-level join, or the attendee rows
      // would multiply events and eat the TOP (@lim) budget.
      expect(q).not.toMatch(/FROM\s+EventBrite_Events\s+e\s+LEFT\s+JOIN\s+EventBrite_EventAttendees/i);
    });
  });

  // is_registered is per-person while the event list is a shared cross-viewer
  // cache. These tests exist mainly to keep those two facts from ever merging.
  describe('annotateRegistration (per-viewer)', () => {
    const view = (id: string): any => ({
      id, title: 'X', description: null, starts_at: new Date('2026-09-08T15:00:00Z'),
      ends_at: null, timezone: 'America/Chicago', registration_url: null,
      meeting_link: null, image_url: null, signup_count: null, is_registered: false,
    });

    it('marks only the events this email registered for', async () => {
      sqlMock.__request.query.mockResolvedValue({ recordset: [{ EventId: '2' }] });
      const out = await annotateRegistration([view('1'), view('2'), view('3')], 'a@b.com');
      expect(out.map((e) => e.is_registered)).toEqual([false, true, false]);
    });

    it('never mutates the caller\'s objects — they belong to the shared cache', async () => {
      // Mutating in place would publish one learner's registrations to every
      // other viewer served from the same cached array.
      sqlMock.__request.query.mockResolvedValue({ recordset: [{ EventId: '1' }] });
      const shared = [view('1')];
      const out = await annotateRegistration(shared, 'a@b.com');
      expect(out[0].is_registered).toBe(true);
      expect(shared[0].is_registered).toBe(false);
      expect(out[0]).not.toBe(shared[0]);
    });

    it('marks nothing, and issues no query, without an email', async () => {
      const out = await annotateRegistration([view('1')], null);
      expect(out[0].is_registered).toBe(false);
      expect(sqlMock.__request.query).not.toHaveBeenCalled();
    });

    it('binds event ids as parameters rather than interpolating them', async () => {
      sqlMock.__request.query.mockResolvedValue({ recordset: [] });
      await annotateRegistration([view('1'), view('2')], 'a@b.com');
      const q = String(sqlMock.__request.query.mock.calls[0][0]);
      expect(q).toMatch(/EventId IN \(@id0,@id1\)/);
      expect(sqlMock.__request.input).toHaveBeenCalledWith('id0', 'VarChar', '1');
      expect(sqlMock.__request.input).toHaveBeenCalledWith('email', 'VarChar', 'a@b.com');
    });

    it('lower-cases the email so casing cannot hide a registration', async () => {
      sqlMock.__request.query.mockResolvedValue({ recordset: [] });
      await annotateRegistration([view('1')], '  Ali@Colaberry.COM ');
      expect(sqlMock.__request.input).toHaveBeenCalledWith('email', 'VarChar', 'ali@colaberry.com');
    });

    it('fails SOFT when CCPP is down — nothing marked, calendar still renders', async () => {
      sqlMock.__request.query.mockRejectedValue(new Error('ECONNREFUSED'));
      const out = await annotateRegistration([view('1')], 'a@b.com');
      expect(out[0].is_registered).toBe(false);
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
