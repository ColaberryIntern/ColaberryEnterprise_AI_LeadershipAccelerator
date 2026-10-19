/**
 * C10 play-time math: credit only from the server clock, at most 30 s per gap, never past 900 s a day, never negative, never after
 * the run's Central day; resets at midnight Central; the leaderboard week starts Monday Central.
 */
import { creditFor, runExpired, resetsAt, centralWeekStart, DAILY_CAP_S, MAX_GAP_CREDIT_S } from '../gameRoomTime';

const T = (iso: string) => Date.parse(iso);
// 2026-10-19 is a Monday; Central is CDT (UTC-5) until 2026-11-01.
const NOON_CT = T('2026-10-19T17:00:00Z');

describe('creditFor', () => {
  it('credits the measured gap, capped at 30 s', () => {
    expect(creditFor({ nowMs: NOON_CT, lastBeatMs: NOON_CT - 15000, usedTodayS: 0, runDate: '2026-10-19' })).toBe(15);
    expect(creditFor({ nowMs: NOON_CT, lastBeatMs: NOON_CT - 300000, usedTodayS: 0, runDate: '2026-10-19' })).toBe(MAX_GAP_CREDIT_S);
  });
  it('never past what is left today, and nothing at the cap', () => {
    expect(creditFor({ nowMs: NOON_CT, lastBeatMs: NOON_CT - 25000, usedTodayS: DAILY_CAP_S - 20, runDate: '2026-10-19' })).toBe(20);
    expect(creditFor({ nowMs: NOON_CT, lastBeatMs: NOON_CT - 25000, usedTodayS: DAILY_CAP_S, runDate: '2026-10-19' })).toBe(0);
    expect(creditFor({ nowMs: NOON_CT, lastBeatMs: NOON_CT - 25000, usedTodayS: DAILY_CAP_S + 50, runDate: '2026-10-19' })).toBe(0);
  });
  it('a clock that went backwards credits nothing (never negative)', () => {
    expect(creditFor({ nowMs: NOON_CT, lastBeatMs: NOON_CT + 60000, usedTodayS: 0, runDate: '2026-10-19' })).toBe(0);
  });
  it('a run from yesterday earns nothing today', () => {
    expect(creditFor({ nowMs: NOON_CT, lastBeatMs: NOON_CT - 10000, usedTodayS: 0, runDate: '2026-10-18' })).toBe(0);
  });
  it('a run started at 23:59:50 CT earns at most 10 s that day and nothing after midnight', () => {
    const start = T('2026-10-20T04:59:50Z'); // 23:59:50 CDT on the 19th
    expect(creditFor({ nowMs: T('2026-10-20T04:59:59Z'), lastBeatMs: start, usedTodayS: 0, runDate: '2026-10-19' })).toBe(9);
    expect(creditFor({ nowMs: T('2026-10-20T05:00:20Z'), lastBeatMs: T('2026-10-20T04:59:59Z'), usedTodayS: 9, runDate: '2026-10-19' })).toBe(0);
  });
});

describe('runExpired', () => {
  it('flips exactly at midnight Central (23:59:59 vs 00:00:00 CT)', () => {
    expect(runExpired(T('2026-10-20T04:59:59Z'), '2026-10-19')).toBe(false);
    expect(runExpired(T('2026-10-20T05:00:00Z'), '2026-10-19')).toBe(true);
  });
});

describe('resetsAt', () => {
  it('is the next midnight Central (CDT)', () => {
    expect(resetsAt(NOON_CT).toISOString()).toBe('2026-10-20T05:00:00.000Z');
    expect(resetsAt(T('2026-10-20T04:59:59Z')).toISOString()).toBe('2026-10-20T05:00:00.000Z');
  });
  it('handles the fall-back day (midnight after 1 Nov is CST, UTC-6)', () => {
    expect(resetsAt(T('2026-11-01T18:00:00Z')).toISOString()).toBe('2026-11-02T06:00:00.000Z');
  });
  it('handles the spring-forward day (midnight after 8 Mar 2026 is CDT)', () => {
    expect(resetsAt(T('2026-03-08T18:00:00Z')).toISOString()).toBe('2026-03-09T05:00:00.000Z');
  });
});

describe('centralWeekStart', () => {
  it('is the Monday of the current Central week', () => {
    expect(centralWeekStart(NOON_CT)).toBe('2026-10-19'); // Monday
    expect(centralWeekStart(T('2026-10-25T20:00:00Z'))).toBe('2026-10-19'); // Sunday afternoon CT
    expect(centralWeekStart(T('2026-10-26T04:59:59Z'))).toBe('2026-10-19'); // Sunday 23:59:59 CT
    expect(centralWeekStart(T('2026-10-26T05:00:00Z'))).toBe('2026-10-26'); // Monday 00:00 CT
  });
});
