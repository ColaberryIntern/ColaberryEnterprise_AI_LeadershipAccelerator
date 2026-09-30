import {
  classifyCohort,
  selectCurrentClasses,
  selectStartingSoon,
  isoDay,
  ClassCandidate,
  ENROLLMENT_STATUSES,
  DEPARTED_ENROLLMENT_STATUSES,
  AWAITING_REVIEW_STATUSES,
} from '../acceleratorCurrentClassesService';

/**
 * Enum literals used in the SQL, pinned.
 *
 * This exists because of a production 500: the query filtered
 * `status NOT IN ('withdrawn','cancelled')` and `cancelled` is not a member of
 * `enum_enrollments_status`. Postgres does not quietly match nothing against an
 * unknown enum label — it raises `invalid input value for enum` and takes the
 * whole endpoint down. So a one-word typo here is an outage, and it is not
 * visible to the compiler, which sees only a string inside a SQL template.
 */
describe('enum literals used in the SQL', () => {
  it('every excluded enrollment status is a real member of the enum', () => {
    for (const s of DEPARTED_ENROLLMENT_STATUSES) {
      expect(ENROLLMENT_STATUSES).toContain(s);
    }
  });

  it('excludes withdrawn but NOT suspended', () => {
    // Suspension is routine and transient here (the CCPP dashboard re-suspends
    // nightly), so treating it as departed would undercount live classes.
    expect(DEPARTED_ENROLLMENT_STATUSES).toContain('withdrawn');
    expect(DEPARTED_ENROLLMENT_STATUSES).not.toContain('suspended');
  });

  it('does not reintroduce "cancelled", which is not an enrollment status', () => {
    expect(ENROLLMENT_STATUSES).not.toContain('cancelled' as never);
    expect(DEPARTED_ENROLLMENT_STATUSES).not.toContain('cancelled' as never);
  });

  it('awaits review only on statuses that precede a review', () => {
    // 'reviewed' and 'flagged' have both been looked at; counting either would
    // overstate the queue.
    expect([...AWAITING_REVIEW_STATUSES].sort()).toEqual(['pending', 'submitted']);
  });
});

/**
 * The three rules that decide "is this class teaching right now" are the whole
 * value of the Accelerator page's snapshot, and each one exists because a
 * cohort row alone answers the question wrongly. They are pure so they can be
 * pinned here rather than proven by staring at production.
 */

const NOW = new Date('2026-09-08T15:00:00Z');

function cohort(over: Partial<ClassCandidate> = {}): ClassCandidate {
  return {
    id: 'c1',
    status: 'open',
    sessionCount: 10,
    firstSessionDate: '2026-07-23',
    lastSessionDate: '2026-10-15',
    ...over,
  };
}

describe('isoDay', () => {
  it('formats as a UTC date-only string', () => {
    expect(isoDay(new Date('2026-09-08T23:59:59Z'))).toBe('2026-09-08');
  });
});

describe('classifyCohort', () => {
  it('calls a started, unfinished cohort in flight', () => {
    expect(classifyCohort(cohort(), NOW)).toBe('in_flight');
  });

  it('excludes a cohort with no sessions, however open it looks', () => {
    // The self-paced Explorer pool: hundreds of members, status open, no
    // sessions. Counting it would swamp every average while teaching nobody.
    expect(classifyCohort(cohort({ sessionCount: 0, firstSessionDate: null, lastSessionDate: null }), NOW))
      .toBe('not_a_class');
  });

  it('calls a cohort whose first session is ahead "starting soon", not in flight', () => {
    expect(classifyCohort(cohort({ firstSessionDate: '2026-11-12', lastSessionDate: '2027-02-01' }), NOW))
      .toBe('starting_soon');
  });

  it('calls a cohort whose last session has passed finished', () => {
    expect(classifyCohort(cohort({ firstSessionDate: '2026-01-05', lastSessionDate: '2026-04-14' }), NOW))
      .toBe('finished');
  });

  it('does not rely on status: an unfinished cohort still marked open is in flight', () => {
    // Cohorts are marked completed by hand, late. Status cannot carry this.
    expect(classifyCohort(cohort({ status: 'open', lastSessionDate: '2026-09-30' }), NOW)).toBe('in_flight');
  });

  it('does not rely on status: a taught-out cohort still marked open is finished', () => {
    expect(classifyCohort(cohort({ status: 'open', firstSessionDate: '2026-02-01', lastSessionDate: '2026-05-01' }), NOW))
      .toBe('finished');
  });

  describe('boundaries — the day a class starts and the day it ends both count', () => {
    it('first session TODAY is in flight, not starting soon', () => {
      expect(classifyCohort(cohort({ firstSessionDate: '2026-09-08', lastSessionDate: '2026-12-01' }), NOW))
        .toBe('in_flight');
    });

    it('last session TODAY is in flight, not finished', () => {
      // Off-by-one guard: a class must not vanish from the dashboard on the
      // morning of its own final session.
      expect(classifyCohort(cohort({ firstSessionDate: '2026-06-01', lastSessionDate: '2026-09-08' }), NOW))
        .toBe('in_flight');
    });

    it('a single-session class held today is in flight', () => {
      expect(classifyCohort(cohort({ sessionCount: 1, firstSessionDate: '2026-09-08', lastSessionDate: '2026-09-08' }), NOW))
        .toBe('in_flight');
    });

    it('last session yesterday is finished', () => {
      expect(classifyCohort(cohort({ lastSessionDate: '2026-09-07' }), NOW)).toBe('finished');
    });

    it('first session tomorrow is starting soon', () => {
      expect(classifyCohort(cohort({ firstSessionDate: '2026-09-09', lastSessionDate: '2026-12-01' }), NOW))
        .toBe('starting_soon');
    });
  });

  it('treats a session-bearing cohort with null dates as in flight rather than hiding it', () => {
    // Null dates cannot prove the class is over, and silently dropping a cohort
    // that has sessions is the worse failure of the two.
    expect(classifyCohort(cohort({ firstSessionDate: null, lastSessionDate: null }), NOW)).toBe('in_flight');
  });
});

describe('selectCurrentClasses', () => {
  const rows: ClassCandidate[] = [
    cohort({ id: 'explorer', sessionCount: 0, firstSessionDate: null, lastSessionDate: null }),
    cohort({ id: 'july', firstSessionDate: '2026-07-23', lastSessionDate: '2026-10-15' }),
    cohort({ id: 'november', firstSessionDate: '2026-11-12', lastSessionDate: '2027-02-04' }),
    cohort({ id: 'april', firstSessionDate: '2026-04-14', lastSessionDate: '2026-06-30' }),
    cohort({ id: 'ending-first', firstSessionDate: '2026-08-01', lastSessionDate: '2026-09-20' }),
  ];

  it('returns only the in-flight cohorts', () => {
    expect(selectCurrentClasses(rows, NOW).map((r) => r.id)).toEqual(['ending-first', 'july']);
  });

  it('orders by the cohort finishing soonest', () => {
    // The class about to end is the one needing attention first.
    expect(selectCurrentClasses(rows, NOW)[0].id).toBe('ending-first');
  });

  it('is pure — it does not reorder or mutate the input', () => {
    const before = rows.map((r) => r.id);
    selectCurrentClasses(rows, NOW);
    expect(rows.map((r) => r.id)).toEqual(before);
  });

  it('returns an empty list rather than throwing when nothing is running', () => {
    expect(selectCurrentClasses([], NOW)).toEqual([]);
    expect(selectCurrentClasses([rows[0]], NOW)).toEqual([]);
  });

  it('is deterministic across repeated calls with the same inputs', () => {
    expect(selectCurrentClasses(rows, NOW)).toEqual(selectCurrentClasses(rows, NOW));
  });
});

describe('selectStartingSoon', () => {
  it('returns future intakes nearest-first and excludes session-less cohorts', () => {
    const rows: ClassCandidate[] = [
      cohort({ id: 'far', firstSessionDate: '2027-03-01', lastSessionDate: '2027-06-01' }),
      cohort({ id: 'near', firstSessionDate: '2026-11-12', lastSessionDate: '2027-02-04' }),
      cohort({ id: 'poolnosessions', sessionCount: 0, firstSessionDate: null, lastSessionDate: null }),
      cohort({ id: 'running' }),
    ];
    expect(selectStartingSoon(rows, NOW).map((r) => r.id)).toEqual(['near', 'far']);
  });
});
