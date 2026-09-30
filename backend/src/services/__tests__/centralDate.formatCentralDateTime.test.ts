/**
 * Pins formatCentralDateTime — the shared formatter that fixed a real defect: a
 * generated ticket summary embedding a raw, unlabeled UTC timestamp
 * ("...at 2026-08-12 15:00.") straight into AI-generated prose (see
 * summaryGeneratorService.ts). These tests hold both halves: the instant is
 * converted to Central, and the CST/CDT label is derived from the date itself
 * (never hardcoded), so it survives the DST boundary the way formatCentralClock's
 * tests already prove for wall-clock class times.
 */

import { formatCentralDateTime } from '../centralDate';

describe('formatCentralDateTime', () => {
  it('renders a UTC instant as a labeled Central date+time', () => {
    // 2026-08-12T15:00:00Z is 10:00 AM Central during CDT (UTC-5).
    expect(formatCentralDateTime('2026-08-12T15:00:00Z')).toBe('Aug 12, 10:00 AM CDT');
  });

  it('accepts a real Date object, not just an ISO string', () => {
    expect(formatCentralDateTime(new Date('2026-08-12T15:00:00Z'))).toBe('Aug 12, 10:00 AM CDT');
  });

  it('is DST-aware across the 2026 spring-forward boundary (Mar 8)', () => {
    // 07:59Z on 2026-03-08 is still CST (UTC-6) -> 1:59 AM. 08:00Z is CDT (UTC-5,
    // clocks jumped forward at 2:00 AM local) -> 3:00 AM. This is the exact
    // instant-based DST case a naive fixed-offset formatter gets wrong.
    expect(formatCentralDateTime('2026-03-08T07:59:00Z')).toBe('Mar 8, 1:59 AM CST');
    expect(formatCentralDateTime('2026-03-08T08:00:00Z')).toBe('Mar 8, 3:00 AM CDT');
  });

  it('is DST-aware across the 2026 fall-back boundary (Nov 1)', () => {
    // 06:59Z on 2026-11-01 is still CDT (UTC-5) -> 1:59 AM. 07:00Z is CST
    // (UTC-6, clocks fell back at 2:00 AM local) -> 1:00 AM.
    expect(formatCentralDateTime('2026-11-01T06:59:00Z')).toBe('Nov 1, 1:59 AM CDT');
    expect(formatCentralDateTime('2026-11-01T07:00:00Z')).toBe('Nov 1, 1:00 AM CST');
  });

  it('never emits a raw unlabeled YYYY-MM-DD HH:mm pattern', () => {
    for (const iso of ['2026-01-15T12:00:00Z', '2026-08-12T15:00:00Z', '2026-11-01T07:00:00Z']) {
      const result = formatCentralDateTime(iso);
      expect(result).not.toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
      expect(result).toMatch(/CST|CDT/);
    }
  });

  it('degrades honestly on null/invalid input rather than throwing or emitting "Invalid Date"', () => {
    expect(formatCentralDateTime(null)).toBe('an unknown time');
    expect(formatCentralDateTime(undefined)).toBe('an unknown time');
    expect(formatCentralDateTime('not-a-date')).toBe('an unknown time');
  });
});
