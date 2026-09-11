import { Op } from 'sequelize';
import {
  isJobDue,
  dueJobsWhere,
  nextRetryDelayMs,
  shouldDeadLetter,
  RUNNABLE_STATES,
  PUBLISHING_JOB_STATES,
  type DueCheckableJob,
  type PublishingJobState,
} from '../publishingQueueQuery';

/**
 * THE REGRESSION THIS SUITE EXISTS FOR.
 *
 * `OpenclawTask.scheduled_for` has existed in this repo for a long time. It is declared,
 * indexed, and never written by any create site.
 *
 * Stated precisely, because an earlier draft of this comment overstated it: the supervisor
 * agent DOES apply a `scheduled_for IS NULL OR <= now` predicate when promoting pending to
 * assigned. The defect is that the browser worker reads `status IN ('assigned','pending')`
 * ordered by priority with no time predicate at all, bypassing that gate — so a task
 * scheduled for next Tuesday is picked up and posted within thirty minutes anyway. One
 * guarded read path does not help when an unguarded one reads the same rows.
 *
 * Adding a `publish_at` column would reproduce that bug exactly unless something actually
 * filters on it, and the schema would look correct either way. So the filter is a pure
 * function and this suite drives it directly. The first test below is the one that would have
 * caught the original defect.
 */

const NOW = new Date('2026-09-10T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function job(overrides: Partial<DueCheckableJob> = {}): DueCheckableJob {
  return {
    state: 'pending',
    publish_at: new Date(NOW.getTime() - HOUR), // an hour overdue by default
    next_retry_at: null,
    dead_lettered_at: null,
    ...overrides,
  };
}

describe('isJobDue — publish_at is actually honoured', () => {
  it('a job scheduled for the FUTURE is not due', () => {
    // The exact defect being replaced. If this ever passes with a future date, scheduling is
    // decorative again.
    expect(isJobDue(job({ publish_at: new Date(NOW.getTime() + HOUR) }), NOW)).toBe(false);
  });

  it('a job scheduled for the past IS due', () => {
    expect(isJobDue(job({ publish_at: new Date(NOW.getTime() - 1) }), NOW)).toBe(true);
  });

  it('a job scheduled for exactly now is due', () => {
    // Boundary. `<=`, not `<` — otherwise a job lands one poll interval late, every time.
    expect(isJobDue(job({ publish_at: new Date(NOW.getTime()) }), NOW)).toBe(true);
  });

  it('accepts ISO strings as well as Dates', () => {
    // Sequelize hands back strings in some configurations; a predicate that only understood
    // Date objects would silently compare NaN and return false for everything.
    expect(isJobDue(job({ publish_at: new Date(NOW.getTime() - HOUR).toISOString() }), NOW)).toBe(true);
    expect(isJobDue(job({ publish_at: new Date(NOW.getTime() + HOUR).toISOString() }), NOW)).toBe(false);
  });
});

describe('isJobDue — only runnable states are picked up', () => {
  const NOT_RUNNABLE = PUBLISHING_JOB_STATES.filter((s) => !RUNNABLE_STATES.includes(s));

  it.each(NOT_RUNNABLE)('state %s is never due, even when overdue', (state) => {
    // `claimed` and `publishing` belong to another worker. Picking one up is how a single
    // post gets published twice, and a published post cannot be recalled.
    expect(isJobDue(job({ state: state as PublishingJobState }), NOW)).toBe(false);
  });

  it('pending is due when overdue', () => {
    expect(isJobDue(job({ state: 'pending' }), NOW)).toBe(true);
  });

  it('an unknown state is not due', () => {
    // Fail closed: a state this module has never heard of must not be executed.
    expect(isJobDue(job({ state: 'something_new' }), NOW)).toBe(false);
  });
});

describe('isJobDue — retry scheduling', () => {
  it('a retrying job waits for next_retry_at', () => {
    expect(isJobDue(job({ state: 'retrying', next_retry_at: new Date(NOW.getTime() + HOUR) }), NOW))
      .toBe(false);
  });

  it('a retrying job is due once next_retry_at has passed', () => {
    expect(isJobDue(job({ state: 'retrying', next_retry_at: new Date(NOW.getTime() - 1) }), NOW))
      .toBe(true);
  });

  it('a retrying job with NO next_retry_at is not due', () => {
    // "Unset" must not mean "run now". Treating null as due is how a failing job spins as
    // fast as the loop runs and rate-limits the whole account.
    expect(isJobDue(job({ state: 'retrying', next_retry_at: null }), NOW)).toBe(false);
  });

  it('a retrying job still respects publish_at', () => {
    // Both gates apply. A retry must not jump ahead of the intended publication time.
    expect(isJobDue(job({
      state: 'retrying',
      publish_at: new Date(NOW.getTime() + HOUR),
      next_retry_at: new Date(NOW.getTime() - HOUR),
    }), NOW)).toBe(false);
  });
});

describe('isJobDue — dead letters stay dead', () => {
  it('a dead-lettered job is never due, whatever its state says', () => {
    // Tracked separately from `state` on purpose, so a human can inspect a dead job without
    // it re-entering the queue.
    expect(isJobDue(job({ state: 'pending', dead_lettered_at: new Date(NOW.getTime() - HOUR) }), NOW))
      .toBe(false);
  });
});

describe('dueJobsWhere — the query mirrors the predicate', () => {
  it('filters on publish_at, not merely on state', () => {
    const where = dueJobsWhere(NOW) as any;
    expect(where.publish_at).toEqual({ [Op.lte]: NOW });
  });

  it('excludes dead-lettered rows', () => {
    const where = dueJobsWhere(NOW) as any;
    expect(where.dead_lettered_at).toEqual({ [Op.is]: null });
  });

  it('admits pending, and retrying only when next_retry_at has passed', () => {
    const branches = (dueJobsWhere(NOW) as any)[Op.or];
    expect(branches).toHaveLength(2);
    expect(branches[0]).toEqual({ state: 'pending' });
    expect(branches[1].state).toBe('retrying');
    expect(branches[1].next_retry_at).toEqual({ [Op.ne]: null, [Op.lte]: NOW });
  });

  it('does not admit any state outside RUNNABLE_STATES', () => {
    // Guards the pair against drifting apart: a query that selected `claimed` while the
    // predicate rejected it would let one worker steal another's job, and every unit test
    // here would still pass because they test the predicate.
    const branches = (dueJobsWhere(NOW) as any)[Op.or] as Array<{ state: string }>;
    for (const b of branches) {
      expect(RUNNABLE_STATES).toContain(b.state as PublishingJobState);
    }
    expect(branches.map((b) => b.state).sort()).toEqual([...RUNNABLE_STATES].sort());
  });
});

describe('nextRetryDelayMs — exponential with jitter', () => {
  it('grows exponentially with the attempt number', () => {
    const noJitter = () => 1; // pins the jitter to its maximum so growth is observable
    const a1 = nextRetryDelayMs(1, noJitter);
    const a2 = nextRetryDelayMs(2, noJitter);
    const a3 = nextRetryDelayMs(3, noJitter);
    expect(a2).toBeGreaterThan(a1);
    expect(a3).toBeGreaterThan(a2);
  });

  it('caps so a retry cannot be scheduled absurdly far out', () => {
    const noJitter = () => 1;
    expect(nextRetryDelayMs(50, noJitter)).toBeLessThanOrEqual(6 * 60 * 60 * 1000);
  });

  it('applies jitter, so a provider outage does not resynchronise every job', () => {
    // The repo has no jitter anywhere today — every retry is a fixed +30 minutes or the next
    // cron tick. Fixed delays make an outage fail every job at once and retry them all at the
    // same instant, which is how a recovering provider gets knocked over a second time.
    const low = nextRetryDelayMs(3, () => 0);
    const high = nextRetryDelayMs(3, () => 1);
    expect(low).toBeLessThan(high);
    expect(low).toBeGreaterThan(0);
  });

  it('never returns a negative or zero delay', () => {
    for (let attempt = 0; attempt <= 10; attempt += 1) {
      expect(nextRetryDelayMs(attempt, () => 0)).toBeGreaterThan(0);
    }
  });
});

describe('shouldDeadLetter', () => {
  it('dead-letters once attempts reach max_attempts', () => {
    expect(shouldDeadLetter({ attempts: 3, max_attempts: 3 })).toBe(true);
    expect(shouldDeadLetter({ attempts: 4, max_attempts: 3 })).toBe(true);
  });

  it('does not dead-letter while attempts remain', () => {
    expect(shouldDeadLetter({ attempts: 2, max_attempts: 3 })).toBe(false);
    expect(shouldDeadLetter({ attempts: 0, max_attempts: 3 })).toBe(false);
  });
});

describe('isJobDue - unparseable times FAIL CLOSED', () => {
  /**
   * Regression for a real defect found in review.
   *
   * `NaN > nowMs` evaluates to `false`, so the original `publish_at > now` guard treated a
   * job whose date did not parse as DUE - publishing it immediately, which is the exact
   * outcome this module exists to prevent. `publish_at` is typed `Date | string` precisely
   * because Sequelize returns string dates under some configurations, so a malformed string
   * is a declared input path rather than a hypothetical one.
   *
   * Every other unknown-input case here already failed closed. This one did not.
   */
  it.each([
    ['not-a-date'],
    [''],
    ['2026-13-45T99:99:99Z'],
    ['undefined'],
  ])('an unparseable publish_at (%p) is NOT due', (bad) => {
    expect(isJobDue(job({ publish_at: bad }), NOW)).toBe(false);
  });

  it('an Invalid Date object for publish_at is NOT due', () => {
    expect(isJobDue(job({ publish_at: new Date('nonsense') }), NOW)).toBe(false);
  });

  it('an unparseable next_retry_at is NOT due', () => {
    expect(isJobDue(job({ state: 'retrying', next_retry_at: 'not-a-date' }), NOW)).toBe(false);
  });

  it('an invalid `now` yields nothing due, rather than everything', () => {
    // If the caller's clock is broken, the safe answer is "publish nothing", not "publish
    // the entire queue".
    expect(isJobDue(job(), new Date('nonsense'))).toBe(false);
  });
});
