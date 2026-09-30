import { cleanEventbriteValue } from '../../utils/eventbriteSanitize';

/**
 * The THIRD reader of CCPP's corrupt `EventBrite_EventAttendees.Email`, and the
 * only one that WRITES.
 *
 * `publicEventsService` was fixed first (the Events page badge), then
 * `openHouseOnboardingService` (the Today RSVP banner) — which had been left
 * behind, so production disagreed with itself: one surface said "You are
 * registered" while the other asked the same person to RSVP for the same event.
 *
 * This one is different in kind. It does not fail to match; it PERSISTS. An
 * uncleaned value becomes a lead whose address every future send bounces off,
 * and which deduplicates as a different person from that learner's clean record.
 *
 * MEASURED ON PRODUCTION 2026-09-02, before the fix:
 *
 *   255 leads with a leading quote AND a trailing comma — all source `open_house`
 *   e.g. `'a.mutai@yahoo.com',`
 *
 * The old guard was `.trim().toLowerCase()` then `.filter(e => e.includes('@'))`.
 * Neither strips a delimiter, and `'a@b.com',` does contain an '@' — so the
 * corruption passed straight through a check that looked like validation.
 */

/** The filter the sync now applies. Kept in step with the service deliberately. */
const ACCEPTS = (email: string) => /^[^\s'",]+@[^\s'",]+\.[^\s'",]+$/.test(email);

describe('the corrupt form is cleaned, not merely trimmed', () => {
  it.each([
    ["'a.mutai@yahoo.com',", 'a.mutai@yahoo.com'],
    ["'01kburgess@gmail.com',", '01kburgess@gmail.com'],
    ["'5csskvyv62@privaterelay.appleid.com',", '5csskvyv62@privaterelay.appleid.com'],
  ])('%s -> %s', (raw, expected) => {
    expect(cleanEventbriteValue(raw).toLowerCase()).toBe(expected);
  });

  it('leaves a clean address untouched', () => {
    // 73,161 of 99,338 attendee rows are already clean. Recovering the corrupt
    // ones must not damage these.
    expect(cleanEventbriteValue('someone@example.com')).toBe('someone@example.com');
  });

  it('is what `.trim().toLowerCase()` was NOT', () => {
    // The precise reason 255 bad leads exist: trim removes whitespace, not
    // quotes or commas.
    const raw = "'a@b.com',";
    expect(raw.trim().toLowerCase()).toBe("'a@b.com',");
    expect(cleanEventbriteValue(raw).toLowerCase()).toBe('a@b.com');
  });
});

describe('the guard actually rejects what the old one accepted', () => {
  it('REJECTS the wrapped form — the old .includes("@") did not', () => {
    // This single assertion is the whole defect. `'a@b.com',` contains an '@',
    // so the previous filter waved it through into the leads table.
    expect("'a@b.com',".includes('@')).toBe(true);
    expect(ACCEPTS("'a@b.com',")).toBe(false);
  });

  it('accepts a normal address', () => {
    expect(ACCEPTS('a.mutai@yahoo.com')).toBe(true);
    expect(ACCEPTS('5csskvyv62@privaterelay.appleid.com')).toBe(true);
  });

  it.each(['', 'no-at-sign', 'a@b', 'a@ b.com', "a@b.com'", 'a@b.com,'])(
    'rejects %p',
    (bad) => {
      // `a@b` has no dot; the last two carry a stray delimiter that would have
      // survived a naive strip of only the LEADING quote.
      expect(ACCEPTS(bad)).toBe(false);
    },
  );

  it('accepts every corrupt production sample once cleaned', () => {
    for (const raw of ["'a.mutai@yahoo.com',", "'01kburgess@gmail.com',"]) {
      expect(ACCEPTS(cleanEventbriteValue(raw).toLowerCase())).toBe(true);
    }
  });
});

describe('it uses the shared sanitiser, not a local copy', () => {
  it('imports cleanEventbriteValue', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'eventbriteOpenHouseSyncService.ts'),
      'utf8',
    );
    // Three readers of one corrupt column. The first two disagreed with each
    // other until they were pointed at one implementation; a fourth local strip
    // here would restart that.
    expect(src).toContain("from '../utils/eventbriteSanitize'");
    expect(src).toContain('cleanEventbriteValue(row.email)');
    expect(src).not.toContain("String(row.email || '').trim().toLowerCase()");
  });
});
