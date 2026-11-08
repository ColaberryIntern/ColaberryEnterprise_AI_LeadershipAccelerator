/**
 * What a batch is, and which month it belongs to (C10.13).
 *
 * No mocks: `batchCohort` is pure and imports nothing, which is the point of it being its
 * own module. Every row shape below was taken from production on 2026-11-08, including
 * the two that matter most - the November batch with no `settings_json` at all, and the
 * April row whose name uses an em dash.
 */

import {
  BATCH_COHORT_TYPE,
  batchMonthFromName,
  batchMonthOf,
  isBatchCohort,
} from '../../services/batch/batchCohort';

describe('isBatchCohort', () => {
  it('accepts an accelerator cohort', () => {
    expect(isBatchCohort({ cohort_type: 'accelerator' })).toBe(true);
  });

  /** The column's own default is 'accelerator', so a row inserted without naming the type
   *  IS a batch. Reading NULL as "not a batch" would exclude exactly the rows a hand-written
   *  insert produces - and batch rows are inserted by a script, because there is no POST
   *  route for cohorts. */
  it('treats a row with no cohort_type as a batch, because that is the column default', () => {
    expect(isBatchCohort({ cohort_type: null })).toBe(true);
    expect(isBatchCohort({})).toBe(true);
  });

  it('rejects the lanes that are placed by their own rules', () => {
    for (const lane of ['explorer', 'ai_internship', 'corporate', 'sponsor', 'business']) {
      expect(isBatchCohort({ cohort_type: lane })).toBe(false);
    }
  });

  it('names the batch type once, and that name is accelerator', () => {
    expect(BATCH_COHORT_TYPE).toBe('accelerator');
  });
});

describe('batchMonthOf — the declared key is preferred', () => {
  it('reads settings_json.batch_month when it is there', () => {
    expect(batchMonthOf({
      name: 'Cohort - December 2026',
      cohort_type: 'accelerator',
      settings_json: { batch_month: '2026-12' },
    })).toBe('2026-12');
  });

  it('prefers the declared key over the name when the two disagree', () => {
    expect(batchMonthOf({
      name: 'Cohort - November 2026',
      cohort_type: 'accelerator',
      settings_json: { batch_month: '2026-12' },
    })).toBe('2026-12');
  });

  it('ignores a malformed declared key and falls back to the name', () => {
    for (const bad of ['2026-13', '2026-1', '26-01', 'December', '', '   ', '2026-00']) {
      expect(batchMonthOf({
        name: 'Cohort - November 2026',
        cohort_type: 'accelerator',
        settings_json: { batch_month: bad },
      })).toBe('2026-11');
    }
  });

  it('ignores a non-string declared key', () => {
    expect(batchMonthOf({
      name: 'Cohort - November 2026',
      cohort_type: 'accelerator',
      settings_json: { batch_month: 202612 },
    })).toBe('2026-11');
  });
});

describe('batchMonthOf — the name fallback, which is load-bearing today', () => {
  /**
   * THE REASON THE FALLBACK EXISTS. Measured on production 2026-11-08: the batch that is
   * OPEN right now, November 2026, carries no batch_month, orientation or monthly_class
   * in settings_json, while December 2026 through March 2027 all carry the full block. A
   * resolver keyed only on the declared field would find nothing for the one batch
   * currently taking signups, so the feature would ship inert for the live month.
   */
  it('resolves the live November 2026 batch, which has no settings_json block', () => {
    expect(batchMonthOf({
      name: 'Cohort - November 2026',
      cohort_type: 'accelerator',
      settings_json: null,
    })).toBe('2026-11');
  });

  /** Production holds both separators: "Cohort - July 2026" and "Cohort — April 2026". */
  it('reads the month whatever the separator is', () => {
    expect(batchMonthFromName('Cohort - July 2026')).toBe('2026-07');
    expect(batchMonthFromName('Cohort — April 2026')).toBe('2026-04');
    expect(batchMonthFromName('Cohort: March 2027')).toBe('2027-03');
    expect(batchMonthFromName('January 2027')).toBe('2027-01');
  });

  it('is case-insensitive and resolves all twelve months', () => {
    const months = [
      ['January', '01'], ['february', '02'], ['MARCH', '03'], ['April', '04'],
      ['May', '05'], ['June', '06'], ['July', '07'], ['August', '08'],
      ['September', '09'], ['October', '10'], ['November', '11'], ['December', '12'],
    ] as const;
    for (const [name, num] of months) {
      expect(batchMonthFromName(`Cohort - ${name} 2027`)).toBe(`2027-${num}`);
    }
  });

  it('returns null for a name with no month in it', () => {
    expect(batchMonthFromName('Explorer — Prospects')).toBeNull();
    expect(batchMonthFromName('AI Internship')).toBeNull();
    expect(batchMonthFromName('')).toBeNull();
    expect(batchMonthFromName(null)).toBeNull();
    expect(batchMonthFromName(undefined)).toBeNull();
  });

  it('returns null for a month name with no year beside it', () => {
    expect(batchMonthFromName('Cohort - November')).toBeNull();
    expect(batchMonthFromName('March Madness Cohort')).toBeNull();
  });
});

describe('batchMonthOf — rows that are not batches have no batch month', () => {
  /**
   * One call answers both "is this a batch" and "which month", so a caller cannot read a
   * month off another lane just because its name happens to contain one. The Explorer
   * pool and the internship both sit `open` in production alongside the real batch.
   */
  it('returns null for another lane even when its name names a month', () => {
    expect(batchMonthOf({ name: 'Explorer — November 2026', cohort_type: 'explorer' })).toBeNull();
    expect(batchMonthOf({
      name: 'AI Internship - November 2026',
      cohort_type: 'ai_internship',
      settings_json: { batch_month: '2026-11' },
    })).toBeNull();
  });

  it('returns null for nothing at all', () => {
    expect(batchMonthOf(null)).toBeNull();
    expect(batchMonthOf(undefined)).toBeNull();
  });
});

describe('start_date is never the source of the month', () => {
  /**
   * THE REGRESSION THIS GUARDS. On a batch row `start_date` holds the ORIENTATION date,
   * which falls in the month AFTER the batch: November 2026's orientation is 7 December
   * 2026, and the December 2026 batch's row carries start_date 2027-01-04. Reading a month
   * off that column would place every payer one batch late - the same error as sorting on
   * start_date, which the directive forbids by name.
   *
   * Passing a start_date that contradicts the name must change nothing.
   */
  it('ignores start_date entirely, even when it points at a different month', () => {
    expect(batchMonthOf({
      name: 'Cohort - December 2026',
      cohort_type: 'accelerator',
      settings_json: { batch_month: '2026-12' },
      start_date: '2027-01-04',
    } as any)).toBe('2026-12');

    expect(batchMonthOf({
      name: 'Cohort - November 2026',
      cohort_type: 'accelerator',
      start_date: '2026-11-12',
    } as any)).toBe('2026-11');
  });
});
