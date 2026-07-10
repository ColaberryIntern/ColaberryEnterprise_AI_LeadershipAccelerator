/**
 * Launch-date contract.
 *
 * The AI Systems Architect Accelerator has three dated milestones:
 *   - platform launch (site + Open House go-live / first paid enrollment): 2026-07-16
 *   - program launch  (Cohort 1 orientation / kickoff):                    2026-07-23
 *   - first teaching class (task-scheduling / feasibility anchor):          2026-07-27
 *
 * The daily Launch PMO report surfaces both the platform and program
 * countdowns in its header/subject, while feasibility scoring stays anchored to
 * targetLaunchDate (first class). This test locks the values so a silent edit to
 * launchPmoTeam.js fails loudly, and proves the date formatter used to render
 * both countdowns.
 *
 * Both modules under test are plain JS (no I/O), so they unit-test without
 * Basecamp.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const { LAUNCH } = require('../../scripts/lib/launchPmoTeam');
const { shortDate } = require('../../scripts/lib/launchPmoDailyUpdate');

describe('LAUNCH date config', () => {
  it('exposes the platform launch date (Jul 16)', () => {
    expect(LAUNCH.platformLaunchDate).toBe('2026-07-16');
  });

  it('exposes the program launch / orientation date (Jul 23)', () => {
    expect(LAUNCH.programLaunchDate).toBe('2026-07-23');
  });

  it('keeps the feasibility anchor at the first teaching class (Jul 27)', () => {
    expect(LAUNCH.targetLaunchDate).toBe('2026-07-27');
  });

  it('orders platform launch < program launch < first class', () => {
    expect(LAUNCH.platformLaunchDate < LAUNCH.programLaunchDate).toBe(true);
    expect(LAUNCH.programLaunchDate < LAUNCH.targetLaunchDate).toBe(true);
  });
});

describe('shortDate (ISO -> "Mon D")', () => {
  it('formats the platform and program launch dates', () => {
    expect(shortDate('2026-07-16')).toBe('Jul 16');
    expect(shortDate('2026-07-23')).toBe('Jul 23');
  });

  it('is timezone-stable (no Date parsing, so no UTC/local day drift)', () => {
    expect(shortDate('2026-01-01')).toBe('Jan 1');
    expect(shortDate('2026-12-31')).toBe('Dec 31');
  });

  it('returns the raw input for malformed values instead of throwing', () => {
    expect(shortDate('')).toBe('');
    expect(shortDate('not-a-date')).toBe('not-a-date');
    expect(shortDate('2026-13-40')).toBe('2026-13-40');
  });
});
