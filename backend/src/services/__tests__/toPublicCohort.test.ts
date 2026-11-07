import { toPublicCohort } from '../cohortService';

/**
 * The public shape of a cohort row.
 *
 * Two things are under test and both are contracts a visitor can see. `batch_month`
 * has to reach the landing page, because it is the only thing distinguishing a monthly
 * batch (whose `start_date` is an orientation in the FOLLOWING month) from a legacy
 * fixed-start cohort (whose `start_date` is a real start). Without it the open November
 * row advertised "December 7, 2026" and leads concluded they had missed the month.
 *
 * And `settings_json` must never be returned. It carries the internal schedule, it has
 * never been public, and it is only read here to lift one field out of it.
 */
const BATCH = {
  id: '8a3de1e5',
  name: 'Cohort - December 2026',
  start_date: '2027-01-04',
  max_seats: 500,
  seats_taken: 0,
  cohort_type: 'accelerator',
  settings_json: { batch_month: '2026-12', schedule: { core_days: ['Monday'] } },
};

const LEGACY = {
  id: 'fcb83a02',
  name: 'Cohort - November 2026',
  start_date: '2026-11-12',
  max_seats: 125,
  seats_taken: 2,
  cohort_type: 'accelerator',
  settings_json: { schedule: { core_days: ['Monday', 'Thursday'] } },
};

describe('toPublicCohort', () => {
  it('lifts batch_month out for a batch row', () => {
    expect(toPublicCohort(BATCH).batch_month).toBe('2026-12');
  });

  it('returns null for a legacy cohort, which is what keeps November showing November 12', () => {
    expect(toPublicCohort(LEGACY).batch_month).toBeNull();
  });

  it('never returns settings_json', () => {
    // The whole reason the field was added to the query. If this regresses, the
    // internal schedule ships to every anonymous visitor.
    expect(toPublicCohort(BATCH)).not.toHaveProperty('settings_json');
    expect(toPublicCohort(LEGACY)).not.toHaveProperty('settings_json');
  });

  it('keeps every other field untouched', () => {
    const out = toPublicCohort(BATCH);
    expect(out.id).toBe('8a3de1e5');
    expect(out.name).toBe('Cohort - December 2026');
    expect(out.start_date).toBe('2027-01-04');
    expect(out.max_seats).toBe(500);
    expect(out.seats_taken).toBe(0);
    expect(out.cohort_type).toBe('accelerator');
  });

  it('does not mutate the row it was given', () => {
    const row = { ...LEGACY, settings_json: { ...LEGACY.settings_json } };
    toPublicCohort(row);
    expect(row).toHaveProperty('settings_json');
  });

  it('treats absent, null and non-string batch_month as no batch', () => {
    expect(toPublicCohort({ settings_json: null }).batch_month).toBeNull();
    expect(toPublicCohort({ settings_json: undefined }).batch_month).toBeNull();
    expect(toPublicCohort({}).batch_month).toBeNull();
    expect(toPublicCohort({ settings_json: { batch_month: 202612 } }).batch_month).toBeNull();
    expect(toPublicCohort({ settings_json: { batch_month: '   ' } }).batch_month).toBeNull();
  });
});
