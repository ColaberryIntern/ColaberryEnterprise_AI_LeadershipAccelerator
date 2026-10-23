/**
 * govDeadline — the pure deadline helpers. `toIsoDate` normalizes a human date (ordinals, periods, slashes) to
 * YYYY-MM-DD using LOCAL calendar components (never toISOString, which would shift a date-only value a day back in
 * positive-offset timezones). `dossierDeadlineIso` picks the SUBMISSION deadline out of the dossier's detected
 * key-date lines (received/due, not questions) so a ZIP-uploaded pursuit — which has no OP close date — still gets
 * a countdown. Pure + total.
 */
import { toIsoDate, dossierDeadlineIso } from './govDeadline';

describe('toIsoDate', () => {
  it('parses human dates (ordinals, periods, slashes) to YYYY-MM-DD', () => {
    expect(toIsoDate('Nov. 6th, 2026')).toBe('2026-11-06');
    expect(toIsoDate('Oct. 23, 2026')).toBe('2026-10-23');
    expect(toIsoDate('03/15/2026')).toBe('2026-03-15');
  });
  it('is total — unparseable / empty / null yields null', () => {
    expect(toIsoDate('not a date')).toBeNull();
    expect(toIsoDate('')).toBeNull();
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate(undefined)).toBeNull();
  });
});

describe('dossierDeadlineIso', () => {
  it('picks the submission deadline (received-by) and skips the questions deadline', () => {
    const keyDates = [
      { date: 'Nov. 6th, 2026', text: 'material must be received by 5:00 p.m. MT/MDT on Friday, Nov. 6th, 2026.' },
      { date: 'Oct. 23, 2026', text: 'Questions Deadline Oct. 23, 2026 - (See E above)' },
    ];
    expect(dossierDeadlineIso(keyDates)).toBe('2026-11-06');
  });
  it('falls back to the first dated line when none says received/due', () => {
    expect(dossierDeadlineIso([{ date: 'Oct. 23, 2026', text: 'some date' }])).toBe('2026-10-23');
  });
  it('is total — empty / null / undated yields null', () => {
    expect(dossierDeadlineIso([])).toBeNull();
    expect(dossierDeadlineIso(null)).toBeNull();
    expect(dossierDeadlineIso([{ date: null, text: 'x' }])).toBeNull();
  });
});
