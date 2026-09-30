import { recordingOverlapsWindow } from '../zoomService';

/**
 * Regression: the Week 2 Build Day incident (2026-08-06).
 *
 * A 6:30-8:30pm CT class. Zoom held SIX recording instances for the meeting.
 * The old selector took the first match by meeting id, so it stored a
 * 5-minute, 0.8MB pre-class test start and served that to students as the
 * class; the real 93MB + 178MB recordings were never ingested.
 *
 * The fixtures below are the REAL instances pulled from the Zoom API for
 * meeting 89023454835, not invented ones — including the awkward
 * 23:00:57 -> 23:01:25 start, which is the reason bare interval overlap is
 * insufficient and a minimum-overlap floor is required.
 */

// Class window in UTC: 6:30-8:30pm America/Chicago on 2026-08-06 (CDT, UTC-5).
const WINDOW_START = new Date('2026-08-06T23:30:00Z');
const WINDOW_END = new Date('2026-08-07T01:30:00Z');

const inst = (start: string, end: string) => ({ startedAt: new Date(start), endedAt: new Date(end) });

const REAL_INSTANCES = {
  test527pm: inst('2026-08-06T22:27:28Z', '2026-08-06T22:32:06Z'), //   5 min, 0.8MB  <- wrongly ingested
  test532pm: inst('2026-08-06T22:32:27Z', '2026-08-06T22:33:46Z'), //   1 min, 0.2MB
  test538pm: inst('2026-08-06T22:38:00Z', '2026-08-06T22:38:16Z'), //  16 sec, 0.1MB
  test600pm: inst('2026-08-06T23:00:57Z', '2026-08-06T23:01:25Z'), //  28 sec, 0.1MB  <- the tricky one
  classPart1: inst('2026-08-06T23:16:25Z', '2026-08-07T00:27:00Z'), // 71 min,  93MB
  classPart2: inst('2026-08-07T00:30:04Z', '2026-08-07T01:53:27Z'), // 83 min, 178MB
};

describe('recordingOverlapsWindow — against the real Week 2 Build Day data', () => {
  it('selects exactly the two real class parts and rejects all four test starts', () => {
    const selected = Object.entries(REAL_INSTANCES)
      .filter(([, i]) => recordingOverlapsWindow(i, WINDOW_START, WINDOW_END))
      .map(([name]) => name);

    expect(selected).toEqual(['classPart1', 'classPart2']);
  });

  it('keeps a part that STARTED before the scheduled class start', () => {
    // Part 1 began 14 minutes early. A "starts inside the window" rule would
    // have thrown away the first half of the class.
    expect(REAL_INSTANCES.classPart1.startedAt.getTime()).toBeLessThan(WINDOW_START.getTime());
    expect(recordingOverlapsWindow(REAL_INSTANCES.classPart1, WINDOW_START, WINDOW_END)).toBe(true);
  });

  it('keeps a part that ran past the scheduled class end', () => {
    // Part 2 ended 23 minutes late, after a mid-class restart at the break.
    expect(REAL_INSTANCES.classPart2.endedAt.getTime()).toBeGreaterThan(WINDOW_END.getTime());
    expect(recordingOverlapsWindow(REAL_INSTANCES.classPart2, WINDOW_START, WINDOW_END)).toBe(true);
  });

  it('rejects the 28-second start that BARE interval overlap would wrongly accept', () => {
    // 23:00:57 -> 23:01:25 touches a 30-minute-padded window (from 23:00:00),
    // so an "any overlap at all" rule selects it. The minimum-overlap floor is
    // the thing that excludes it. This is the case that makes the floor
    // necessary rather than decorative.
    const touchesPaddedWindow =
      REAL_INSTANCES.test600pm.endedAt.getTime() >= WINDOW_START.getTime() - 30 * 60 * 1000;
    expect(touchesPaddedWindow).toBe(true);

    expect(recordingOverlapsWindow(REAL_INSTANCES.test600pm, WINDOW_START, WINDOW_END)).toBe(false);
  });

  it('rejects the 5-minute pre-class test that was actually served to students', () => {
    expect(recordingOverlapsWindow(REAL_INSTANCES.test527pm, WINDOW_START, WINDOW_END)).toBe(false);
  });
});

describe('recordingOverlapsWindow — boundaries', () => {
  it('excludes an instance with no timing rather than guessing it belongs', () => {
    expect(recordingOverlapsWindow({ startedAt: null, endedAt: null }, WINDOW_START, WINDOW_END)).toBe(false);
    expect(recordingOverlapsWindow({ startedAt: undefined, endedAt: undefined }, WINDOW_START, WINDOW_END)).toBe(false);
  });

  it('treats a missing end as a zero-length instant, which cannot clear the floor', () => {
    expect(recordingOverlapsWindow(
      { startedAt: new Date('2026-08-07T00:00:00Z'), endedAt: null }, WINDOW_START, WINDOW_END,
    )).toBe(false);
  });

  it('accepts an instance sitting wholly inside the class window', () => {
    expect(recordingOverlapsWindow(
      inst('2026-08-06T23:40:00Z', '2026-08-07T01:00:00Z'), WINDOW_START, WINDOW_END,
    )).toBe(true);
  });

  it('rejects a long recording from a different day entirely', () => {
    expect(recordingOverlapsWindow(
      inst('2026-08-04T23:30:00Z', '2026-08-05T01:30:00Z'), WINDOW_START, WINDOW_END,
    )).toBe(false);
  });

  it('honours an explicit minOverlapMs override', () => {
    // The 28-second start clears a 10-second floor but not the 10-minute default.
    expect(recordingOverlapsWindow(
      REAL_INSTANCES.test600pm, WINDOW_START, WINDOW_END, { minOverlapMs: 10 * 1000 },
    )).toBe(true);
  });
});
