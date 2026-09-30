import { selectEnrollableCohorts, selectNextCohort } from '../utils/cohortSelection';
import { Cohort } from '../models/Cohort';

function cohort(over: Partial<Cohort> = {}): Cohort {
  return {
    id: 'id-1',
    name: 'Cohort - July 2026',
    start_date: '2026-07-23',
    core_day: 'Thursday',
    core_time: '6:00 PM',
    optional_lab_day: null,
    max_seats: 50,
    seats_taken: 43,
    status: 'open',
    cohort_type: 'accelerator',
    ...over,
  } as Cohort;
}

/**
 * Production snapshot of GET /api/cohorts taken 2026-07-29 — the state that made
 * enrolment impossible: every open cohort had already started, so the old
 * `start_date >= today` filter emptied the picker and the Enroll submit button
 * stayed disabled. Students reported exactly this as "registration failing".
 */
const PROD_2026_07_29: Cohort[] = [
  cohort({ id: 'explorer', name: 'Explorer — Prospects', start_date: '2026-07-12', seats_taken: 0, max_seats: 100000, cohort_type: 'explorer' }),
  cohort({ id: 'demo', name: 'Timeline Demo Cohort', start_date: '2026-07-13', seats_taken: 0, max_seats: 50, cohort_type: 'demo' }),
  cohort({ id: 'july', name: 'Cohort - July 2026', start_date: '2026-07-23', seats_taken: 43, max_seats: 50, cohort_type: 'accelerator' }),
];

describe('selectEnrollableCohorts', () => {
  it('regression: keeps an already-started cohort enrollable', () => {
    const result = selectEnrollableCohorts(PROD_2026_07_29);

    expect(result.map((c) => c.id)).toEqual(['july']);
  });

  it('excludes internal lanes from the public picker', () => {
    const types = selectEnrollableCohorts(PROD_2026_07_29).map((c) => c.cohort_type);

    expect(types).not.toContain('explorer');
    expect(types).not.toContain('demo');
    expect(types).not.toContain('corporate');
    expect(types).not.toContain('business');
  });

  it('excludes a full cohort, matching the server seat check', () => {
    expect(selectEnrollableCohorts([cohort({ seats_taken: 50, max_seats: 50 })])).toHaveLength(0);
    expect(selectEnrollableCohorts([cohort({ seats_taken: 51, max_seats: 50 })])).toHaveLength(0);
    expect(selectEnrollableCohorts([cohort({ seats_taken: 49, max_seats: 50 })])).toHaveLength(1);
  });

  it('excludes a non-open cohort even if the server did not filter it', () => {
    expect(selectEnrollableCohorts([cohort({ status: 'closed' })])).toHaveLength(0);
    expect(selectEnrollableCohorts([cohort({ status: 'completed' })])).toHaveLength(0);
  });

  it('excludes a cohort with no cohort_type rather than guessing it is public', () => {
    expect(selectEnrollableCohorts([cohort({ cohort_type: undefined })])).toHaveLength(0);
  });

  it('sorts by start date, soonest first', () => {
    const result = selectEnrollableCohorts([
      cohort({ id: 'c', start_date: '2026-09-01' }),
      cohort({ id: 'a', start_date: '2026-07-23' }),
      cohort({ id: 'b', start_date: '2026-08-15' }),
    ]);

    expect(result.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('tolerates missing, empty, and malformed input', () => {
    expect(selectEnrollableCohorts(null)).toEqual([]);
    expect(selectEnrollableCohorts(undefined)).toEqual([]);
    expect(selectEnrollableCohorts([])).toEqual([]);
    expect(selectEnrollableCohorts({} as any)).toEqual([]);
    expect(selectEnrollableCohorts([null as any, cohort()])).toHaveLength(1);
    expect(selectEnrollableCohorts([cohort({ start_date: undefined as any })])).toHaveLength(0);
  });

  it("does not mutate the caller's array", () => {
    const input = [cohort({ id: 'b', start_date: '2026-09-01' }), cohort({ id: 'a', start_date: '2026-07-23' })];
    selectEnrollableCohorts(input);
    expect(input.map((c) => c.id)).toEqual(['b', 'a']);
  });
});

describe('selectNextCohort', () => {
  it('returns the soonest enrollable cohort from the production snapshot', () => {
    expect(selectNextCohort(PROD_2026_07_29)?.id).toBe('july');
  });

  it('returns null when nothing is joinable', () => {
    expect(selectNextCohort([])).toBeNull();
    expect(selectNextCohort(null)).toBeNull();
    expect(selectNextCohort([cohort({ seats_taken: 50, max_seats: 50 })])).toBeNull();
  });
});
