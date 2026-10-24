const query = jest.fn();
const close = jest.fn();
const sendPortalWelcome = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => query(...a), close: () => close() },
}));
jest.mock('../../models', () => ({ Enrollment: { findByPk: jest.fn() } }));
jest.mock('../../services/welcome/sendPortalWelcome', () => ({
  sendPortalWelcome: (...a: unknown[]) => sendPortalWelcome(...a),
}));
jest.mock('../../services/emailService', () => ({
  buildTrainingWelcomeHtml: () => '<html>preview</html>',
}));

import { signupDateRange } from '../sendStrandedFreeSignupWelcomes';

/**
 * Two things are pinned here, and the second one matters more than the first.
 *
 *  1. The roster's reported date span is MIN/MAX over the values, not the first and
 *     last rows. The query ends `ORDER BY lower(l.email), e.created_at DESC` because
 *     `DISTINCT ON` demands its key lead the sort, so row order is alphabetical by
 *     address and says nothing about dates. The 2026-10-24 run spanned four days and
 *     announced a ten-hour window.
 *
 *  2. IMPORTING THIS MODULE MUST NOT RUN IT. `main()` used to execute at module load.
 *     With SEND=1 in the environment, an import from a test would have mailed 142
 *     real people. The assertion below is the control for that guard: it is the
 *     reason this suite can exist at all.
 */

describe('importing the recovery script', () => {
  it('does NOT execute it: no query is issued on import', () => {
    // If `main()` ran at load, `findStranded` would already have called through.
    expect(query).not.toHaveBeenCalled();
    expect(sendPortalWelcome).not.toHaveBeenCalled();
  });
});

describe('signupDateRange', () => {
  it('reports the true span when rows are NOT in date order', () => {
    // Alphabetical by email, exactly as the query returns them. The earliest date
    // sits in the middle and the latest sits first - the shape that produced the
    // wrong output in production.
    const rows = [
      { created_at: new Date('2026-10-23T18:00:00Z') },
      { created_at: new Date('2026-10-21T06:00:00Z') },
      { created_at: new Date('2026-10-22T12:00:00Z') },
    ];

    const { first, last } = signupDateRange(rows);

    expect(first.toISOString()).toBe('2026-10-21T06:00:00.000Z');
    expect(last.toISOString()).toBe('2026-10-23T18:00:00.000Z');
  });

  it('is not satisfied by reading the ends, which is the defect it replaces', () => {
    const rows = [
      { created_at: new Date('2026-10-24T00:00:00Z') },
      { created_at: new Date('2026-10-20T00:00:00Z') },
    ];
    const { first, last } = signupDateRange(rows);

    // The naive version would have returned the 24th as `first` and the 20th as
    // `last` - a range running backwards.
    expect(first.getTime()).toBeLessThan(last.getTime());
    expect(first.toISOString()).toBe('2026-10-20T00:00:00.000Z');
  });

  it('handles a single row: first and last are the same instant', () => {
    const { first, last } = signupDateRange([{ created_at: new Date('2026-10-22T09:30:00Z') }]);
    expect(first.getTime()).toBe(last.getTime());
  });

  it('accepts string timestamps, which is what a raw query can hand back', () => {
    const { first, last } = signupDateRange([
      { created_at: '2026-10-23T18:00:00Z' },
      { created_at: '2026-10-21T06:00:00Z' },
    ]);
    expect(first.toISOString()).toBe('2026-10-21T06:00:00.000Z');
    expect(last.toISOString()).toBe('2026-10-23T18:00:00.000Z');
  });
});
