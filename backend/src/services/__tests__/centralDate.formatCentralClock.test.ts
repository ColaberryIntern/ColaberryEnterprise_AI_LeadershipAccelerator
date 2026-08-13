/**
 * Pins the session-time label that goes out in reminder emails.
 *
 * The original defect: buildSessionReminderHtml appended a literal " ET" to the
 * raw stored string, so a 6:30 PM Central class was announced to students and
 * staff as "18:30:00 ET". Reported 2026-08-11. These tests hold both halves of
 * the fix — the clock is formatted, and the zone label is derived from the
 * session's own date so it survives the DST boundary.
 */

import { formatCentralClock } from '../centralDate';

describe('formatCentralClock', () => {
  it('renders the stored 24h wall-clock as a 12-hour Central time', () => {
    // The exact case from the reported email: Session 6, 2026-08-10, "18:30:00".
    expect(formatCentralClock('2026-08-10', '18:30:00')).toBe('6:30 PM CDT');
  });

  it('says CDT in summer and CST in winter for the same wall-clock', () => {
    expect(formatCentralClock('2026-07-15', '18:30:00')).toBe('6:30 PM CDT');
    expect(formatCentralClock('2026-01-15', '18:30:00')).toBe('6:30 PM CST');
  });

  it('never emits an Eastern label', () => {
    for (const date of ['2026-01-15', '2026-06-15', '2026-08-10', '2026-11-20']) {
      expect(formatCentralClock(date, '18:30:00')).not.toMatch(/E[SD]?T/);
    }
  });

  it('accepts the 12-hour shapes older cohort rows use', () => {
    expect(formatCentralClock('2026-08-10', '1:00 PM')).toBe('1:00 PM CDT');
    expect(formatCentralClock('2026-08-10', '10:00 AM')).toBe('10:00 AM CDT');
  });

  it('handles the noon and midnight boundaries', () => {
    expect(formatCentralClock('2026-08-10', '12:00 PM')).toBe('12:00 PM CDT');
    expect(formatCentralClock('2026-08-10', '00:00:00')).toBe('12:00 AM CDT');
  });

  it('falls back to the raw value rather than inventing a time', () => {
    // Must NOT inherit convertTo24h's '10:00' scheduling default — announcing a
    // confident-but-wrong "10:00 AM" is the worst possible failure for a label.
    expect(formatCentralClock('2026-08-10', 'not-a-time')).toBe('not-a-time');
    expect(formatCentralClock('2026-08-10', 'TBD')).toBe('TBD');
    expect(formatCentralClock('', '18:30:00')).toBe('18:30:00');
    expect(formatCentralClock('2026-08-10', '')).toBe('');
  });

  it('is stable across the DST transition days themselves', () => {
    // 2026 US DST: begins Mar 8, ends Nov 1. An evening class on each side.
    expect(formatCentralClock('2026-03-08', '18:30:00')).toBe('6:30 PM CDT');
    expect(formatCentralClock('2026-11-01', '18:30:00')).toBe('6:30 PM CST');
  });
});
