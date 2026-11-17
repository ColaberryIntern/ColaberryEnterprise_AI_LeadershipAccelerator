/**
 * When a batch's orientation is (C10.18).
 *
 * The load-bearing assertion is the production table below: the convention reproduces four of the
 * five stored `start_date` values exactly, and disagrees only with November 2026 — the batch that
 * is open right now and the one row known to be wrong. That agreement is what makes deriving the
 * date safe rather than a second opinion, so it is pinned here as data and not left in a comment.
 *
 * Pure module, so no mocks at all. A mocked clock or a mocked row would only prove the mock.
 */
import {
  DEFAULT_ORIENTATION_TIME,
  FIRST_SESSION_EXCEPTIONS,
  firstSessionDateFor,
  formatClockTime,
  formatOrientationDate,
  isOpenHouseCadenceDate,
  orientationDateFor,
  orientationOf,
  orientationTimeOf,
} from '../../services/batch/batchOrientation';

/** The five accelerator rows in production, measured 2026-11-08. */
const PROD_BATCHES = [
  { name: 'Cohort - November 2026', batch_month: '2026-11', start_date: '2026-11-12', expected: '2026-12-07', agrees: false },
  { name: 'Cohort - December 2026', batch_month: '2026-12', start_date: '2027-01-04', expected: '2027-01-04', agrees: true },
  { name: 'Cohort - January 2027', batch_month: '2027-01', start_date: '2027-02-01', expected: '2027-02-01', agrees: true },
  { name: 'Cohort - February 2027', batch_month: '2027-02', start_date: '2027-03-01', expected: '2027-03-01', agrees: true },
  { name: 'Cohort - March 2027', batch_month: '2027-03', start_date: '2027-04-05', expected: '2027-04-05', agrees: true },
];

const row = (over: Record<string, unknown> = {}) => ({
  id: 'c-nov',
  name: 'Cohort - November 2026',
  cohort_type: 'accelerator',
  settings_json: { batch_month: '2026-11', schedule: { start_time: '18:30', end_time: '20:00' } },
  ...over,
});

describe('orientationDateFor — the first Monday of the month after the batch', () => {
  it.each(PROD_BATCHES)('$name resolves to $expected', ({ batch_month, expected }) => {
    expect(orientationDateFor(batch_month)).toBe(expected);
  });

  it('agrees with the stored start_date on four of the five production rows, and not on November', () => {
    // This is the evidence that the convention IS the rule and November is the defect, rather
    // than the convention being my invention. If a future row disagrees, this count moves and
    // somebody has to look at why.
    const agreeing = PROD_BATCHES.filter((b) => orientationDateFor(b.batch_month) === b.start_date);
    expect(agreeing).toHaveLength(4);
    const disagreeing = PROD_BATCHES.filter((b) => orientationDateFor(b.batch_month) !== b.start_date);
    expect(disagreeing.map((b) => b.batch_month)).toEqual(['2026-11']);
  });

  it('rolls December into the next January without special-casing the year', () => {
    expect(orientationDateFor('2026-12')).toBe('2027-01-04');
    expect(orientationDateFor('2027-12')).toBe('2028-01-03');
  });

  it('returns the 1st when the 1st is itself a Monday', () => {
    // 2027-02-01 and 2027-03-01 are both Mondays in production; the loop must not skip a week.
    expect(orientationDateFor('2027-01')).toBe('2027-02-01');
    expect(orientationDateFor('2027-02')).toBe('2027-03-01');
  });

  it('covers every month of a year without a gap or a repeat', () => {
    const dates = Array.from({ length: 12 }, (_, i) => orientationDateFor(`2027-${String(i + 1).padStart(2, '0')}`));
    expect(dates.every((d) => typeof d === 'string')).toBe(true);
    expect(new Set(dates).size).toBe(12);
    // Every answer is a Monday, which is the only property that actually matters.
    for (const d of dates) {
      expect(new Date(`${d}T00:00:00Z`).getUTCDay()).toBe(1);
    }
  });

  it('rejects a malformed month rather than guessing one', () => {
    for (const bad of ['2026-13', '2026-00', '2026-1', '26-01', '', '   ', 'November', null, undefined]) {
      expect(orientationDateFor(bad as any)).toBeNull();
    }
  });
});

describe('orientationTimeOf — the row owns its evening slot', () => {
  it('reads the time the row actually stores', () => {
    expect(orientationTimeOf(row())).toBe('18:30');
    expect(orientationTimeOf(row({ settings_json: { batch_month: '2026-11', schedule: { start_time: '19:00' } } }))).toBe('19:00');
  });

  it('falls back to the documented slot when the row has no readable time', () => {
    const cases = [
      row({ settings_json: null }),
      row({ settings_json: {} }),
      row({ settings_json: { schedule: {} } }),
      row({ settings_json: { schedule: { start_time: '' } } }),
      row({ settings_json: { schedule: { start_time: '25:00' } } }),
      row({ settings_json: { schedule: { start_time: '6:30pm' } } }),
      row({ settings_json: { schedule: { start_time: 1830 } } }),
    ];
    for (const c of cases) expect(orientationTimeOf(c as any)).toBe(DEFAULT_ORIENTATION_TIME);
    expect(DEFAULT_ORIENTATION_TIME).toBe('18:30');
  });
});

describe('formatting, because this text goes in front of a paying member', () => {
  it('prints the date the way a person reads it', () => {
    expect(formatOrientationDate('2026-12-07')).toBe('Monday, December 7, 2026');
    expect(formatOrientationDate('2027-01-04')).toBe('Monday, January 4, 2027');
  });

  it('converts a 24-hour time, including the two cases a naive modulo gets wrong', () => {
    expect(formatClockTime('18:30')).toBe('6:30 PM');
    expect(formatClockTime('09:05')).toBe('9:05 AM');
    expect(formatClockTime('12:00')).toBe('12:00 PM');
    expect(formatClockTime('00:30')).toBe('12:30 AM');
  });

  it('a malformed time degrades to the documented slot rather than printing nonsense', () => {
    expect(formatClockTime('nope')).toBe('6:30 PM');
    expect(formatClockTime('')).toBe('6:30 PM');
  });

  it('rejects a malformed date rather than printing "Invalid Date"', () => {
    for (const bad of ['2026-12', '07-12-2026', '', 'tomorrow', null, undefined]) {
      expect(formatOrientationDate(bad as any)).toBeNull();
    }
  });
});

describe('the first-session exception table, empty since 2026-11-16', () => {
  it('is empty, so every batch follows the convention', () => {
    expect(Object.keys(FIRST_SESSION_EXCEPTIONS)).toEqual([]);
  });

  it('November 2026 gets the first Monday, 7 December, on every clock', () => {
    // It used to answer 2026-11-12 up to the 12th and Thursday 2026-12-03 from the 13th on. The
    // 3rd is an Open House and the 12th is long past, so the entry was deleted, not re-dated.
    for (const today of ['2026-11-01', '2026-11-12', '2026-11-13', '2026-11-30', '2027-06-01']) {
      expect(firstSessionDateFor('2026-11', today)).toBe('2026-12-07');
    }
    for (const today of [undefined, null, '', 'today', '2026/11/09']) {
      expect(firstSessionDateFor('2026-11', today as any)).toBe('2026-12-07');
    }
  });

  it('no other batch is touched, whatever the date', () => {
    for (const today of ['2026-11-09', '2026-11-12', '2026-12-15']) {
      expect(firstSessionDateFor('2026-12', today)).toBe('2027-01-04');
      expect(firstSessionDateFor('2027-01', today)).toBe('2027-02-01');
    }
  });

  it('orientationOf now labels November as a Monday', () => {
    const nov = { id: 'c', name: 'Cohort - November 2026', cohort_type: 'accelerator' } as any;
    expect(orientationOf(nov, '2026-11-09')!.label).toBe('Monday, December 7, 2026 at 6:30 PM CT');
    expect(orientationOf(nov)!.date).toBe('2026-12-07');
  });
});

describe('isOpenHouseCadenceDate — the guard that would have caught 3 December', () => {
  // SELF-TESTS FIRST. A guard nobody has seen fail is a guard that may be passing because it is
  // blind, so these fire it on the exact date that shipped the collision before anything is
  // allowed to depend on it.
  it('FIRES on 2026-12-03, the date this change exists to undo', () => {
    expect(isOpenHouseCadenceDate('2026-12-03')).toBe(true);
  });

  it('fires on every first and third Thursday on the published calendar', () => {
    // Read off the live Eventbrite rows and the Open House cadence: 1st and 3rd Thursday, 6:30 CT.
    for (const d of [
      '2026-11-19', '2026-12-03', '2026-12-17', '2027-01-07', '2027-01-21', '2027-02-04',
      '2027-02-18', '2027-03-04', '2027-03-18', '2027-04-01', '2027-04-15',
    ]) {
      expect({ d, open: isOpenHouseCadenceDate(d) }).toEqual({ d, open: true });
    }
  });

  it('does not fire on a second, fourth or fifth Thursday', () => {
    for (const d of ['2026-12-10', '2026-12-24', '2026-12-31', '2027-01-14', '2027-01-28']) {
      expect({ d, open: isOpenHouseCadenceDate(d) }).toEqual({ d, open: false });
    }
  });

  it('refuses a malformed or impossible date rather than guessing', () => {
    // 2026-02-31 matters: Date.UTC rolls it into March, and a rolled date would be judged against
    // the wrong month's Thursdays.
    for (const d of ['', 'today', '2026-12-3', '2026/12/03', null, undefined, '2026-02-31']) {
      expect(isOpenHouseCadenceDate(d as any)).toBe(false);
    }
  });

  it('THE RATCHET: no exception entry may sit on the Open House cadence', () => {
    // Written over the table rather than over a known month, so it keeps guarding entries that do
    // not exist yet. Vacuous while the table is empty; the next test proves it can fail.
    for (const [month, exception] of Object.entries(FIRST_SESSION_EXCEPTIONS)) {
      for (const field of ['date', 'through', 'thereafter'] as const) {
        const date = exception[field];
        expect({ month, field, date, collides: isOpenHouseCadenceDate(date) })
          .toEqual({ month, field, date, collides: false });
      }
    }
  });

  it('and the ratchet really would have rejected the entry that was withdrawn', () => {
    // The deleted November 2026 entry, verbatim. Without this the loop above could pass forever on
    // an empty table while being incapable of catching anything.
    const withdrawn = { date: '2026-11-12', through: '2026-11-12', thereafter: '2026-12-03' };
    expect(isOpenHouseCadenceDate(withdrawn.thereafter)).toBe(true);
    expect(isOpenHouseCadenceDate(withdrawn.date)).toBe(false);
  });

  it('the convention itself can never collide, in any month for six years', () => {
    // The structural claim the whole fix rests on: the first Monday of a month is never a
    // Thursday, so an orientation left on the convention cannot land on an Open House. Asserted
    // over 72 consecutive months rather than argued in a comment.
    for (let year = 2026; year <= 2031; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const key = `${year}-${String(month).padStart(2, '0')}`;
        const date = orientationDateFor(key)!;
        expect({ key, date, collides: isOpenHouseCadenceDate(date) })
          .toEqual({ key, date, collides: false });
      }
    }
  });
});

describe('orientationOf — the whole answer for a row', () => {
  it('gives the live November batch its real first session, not its start_date', () => {
    const o = orientationOf(row())!;
    expect(o.batchMonth).toBe('2026-11');
    expect(o.date).toBe('2026-12-07');
    expect(o.label).toBe('Monday, December 7, 2026 at 6:30 PM CT');
  });

  it('a non-exception batch still gets the first Monday', () => {
    const dec = orientationOf(row({ name: 'Cohort - December 2026', settings_json: { batch_month: '2026-12' } }), '2026-11-20')!;
    expect(dec.label).toBe('Monday, January 4, 2027 at 6:30 PM CT');
  });

  it('IGNORES start_date entirely, even when the row carries a contradicting one', () => {
    // The control. November's stored start_date is 2026-11-12, four days in the past as of
    // 2026-11-08. If this module ever starts reading the column, this assertion is what catches it
    // before an email tells a paying member the wrong date.
    const o = orientationOf(row({ start_date: '2026-11-12' }))!;
    expect(o.date).toBe('2026-12-07');
    const moved = orientationOf(row({ start_date: '2099-01-01' }))!;
    expect(moved.date).toBe('2026-12-07');
  });

  it('works on the live row as it actually is, with no batch_month key at all', () => {
    // Production reality on 2026-11-08: the open November row carries no settings_json.batch_month,
    // so the month comes from the name. An email for the current batch depends on this path.
    const o = orientationOf({ id: 'c', name: 'Cohort - November 2026', cohort_type: 'accelerator' } as any)!;
    expect(o.date).toBe('2026-12-07');
    expect(o.time).toBe('18:30');
  });

  it('returns null for a cohort that is not a batch, rather than inventing an orientation', () => {
    // On a legacy fixed-start cohort, start_date genuinely IS a class start. Calling that an
    // orientation would be the same mislabelling in reverse.
    for (const type of ['explorer', 'ai_internship', 'corporate', 'business']) {
      expect(orientationOf({ id: 'x', name: 'Cohort - November 2026', cohort_type: type } as any)).toBeNull();
    }
    expect(orientationOf(null)).toBeNull();
    expect(orientationOf(undefined)).toBeNull();
  });

  it('a cohort whose name carries no month has no batch month, so no orientation', () => {
    // The boundary of the name fallback. Note what is NOT asserted here: a name that DOES carry a
    // month and year is read as a batch even if it is an older-style name, because that is exactly
    // what `batchMonthOf` was built to do and it is how the live November row resolves at all. My
    // first draft of this test asserted the opposite for 'July 2026 - Forward Deployed AI Engineer' and
    // the module was right, not the test.
    for (const name of ['Forward Deployed AI Engineer Program', 'Explorer - Prospects', 'Accelerator', '']) {
      expect(orientationOf({ id: 'x', name, cohort_type: 'accelerator' } as any)).toBeNull();
    }
  });
});
