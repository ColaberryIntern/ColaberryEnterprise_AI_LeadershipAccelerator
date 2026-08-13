/**
 * Pins the shared admin/ProofDesk/Workforce OS Central-time formatter. Ali flagged
 * live that ticket timestamps rendered in whatever timezone the browser happened to
 * be in, with no indication a conversion had (or hadn't) happened — these tests hold
 * the fix: DST-aware conversion via Intl's own timezone database, always labeled
 * CST/CDT, never a hardcoded fixed offset.
 */

import { fmtCentralDateTime, fmtCentralTime, fmtCentralDate } from '../centralTime';

describe('fmtCentralDateTime', () => {
  it('renders a UTC instant as a labeled Central date+time', () => {
    // 2026-08-12T15:00:00Z is 10:00 AM Central during CDT (UTC-5).
    expect(fmtCentralDateTime('2026-08-12T15:00:00Z')).toBe('Aug 12, 10:00 AM CDT');
  });

  it('accepts a real Date object, not just an ISO string', () => {
    expect(fmtCentralDateTime(new Date('2026-08-12T15:00:00Z'))).toBe('Aug 12, 10:00 AM CDT');
  });

  it('is DST-aware across the 2026 spring-forward boundary (Mar 8)', () => {
    expect(fmtCentralDateTime('2026-03-08T07:59:00Z')).toBe('Mar 8, 1:59 AM CST');
    expect(fmtCentralDateTime('2026-03-08T08:00:00Z')).toBe('Mar 8, 3:00 AM CDT');
  });

  it('is DST-aware across the 2026 fall-back boundary (Nov 1)', () => {
    expect(fmtCentralDateTime('2026-11-01T06:59:00Z')).toBe('Nov 1, 1:59 AM CDT');
    expect(fmtCentralDateTime('2026-11-01T07:00:00Z')).toBe('Nov 1, 1:00 AM CST');
  });

  it('returns "" for null/undefined/unparseable input rather than throwing', () => {
    expect(fmtCentralDateTime(null)).toBe('');
    expect(fmtCentralDateTime(undefined)).toBe('');
    expect(fmtCentralDateTime('not-a-date')).toBe('');
  });
});

describe('fmtCentralTime', () => {
  it('renders just the labeled time, no date', () => {
    expect(fmtCentralTime('2026-08-12T15:00:00Z')).toBe('10:00 AM CDT');
  });

  it('follows the same DST boundary as fmtCentralDateTime', () => {
    expect(fmtCentralTime('2026-11-01T07:00:00Z')).toBe('1:00 AM CST');
  });

  it('returns "" for invalid input', () => {
    expect(fmtCentralTime('garbage')).toBe('');
  });
});

describe('fmtCentralDate', () => {
  it('renders just the Central calendar date, no time or zone label', () => {
    expect(fmtCentralDate('2026-08-12T15:00:00Z')).toBe('Aug 12');
  });

  it('returns "" for invalid input', () => {
    expect(fmtCentralDate(null)).toBe('');
  });
});
