import { Op } from 'sequelize';

/**
 * C10.15 — "next cohort" must resolve to the current accelerator batch.
 *
 * THE BUG, measured against production on 2026-11-06 rather than reasoned about. The open
 * cohorts were:
 *
 *   Explorer - Prospects    12 Jul 2026   cohort_type 'explorer'
 *   AI Internship           15 Sep 2026   cohort_type 'ai_internship'
 *   Cohort - November 2026   7 Dec 2026   cohort_type 'accelerator'
 *
 * `getNextCohort()` was `{ where: { status: 'open' }, order: [['start_date','ASC']] }` — no type
 * filter, no date filter — so it returned **Explorer - Prospects, 12 July**: a prospect bucket
 * and a date nearly four months stale. Every template rendering `{{cohort_name}}` or
 * `{{cohort_start}}` named it, and it was stamped onto payment_readiness actions as
 * `metadata.cohort_start_date`.
 *
 * WHY THAT WAS MORE THAN COSMETIC, and the reason this test exists at all. The scheduler cancels
 * a payment_readiness action when `now >= metadata.cohort_start_date`. Stamped with a PAST date,
 * that is true the instant the action is written — so **the readiness ladder cancelled itself**.
 * The batch model depends on that ladder to collect payment, so it had to be correct before
 * C10.13 wires placement into it.
 *
 * HOW THIS IS TESTED. The fixture is the real production row set above, and the mock below
 * implements only the two operator semantics this query actually uses (equality, and `Op.gte` on
 * a date) so the REAL predicate is exercised and a real cohort comes back. The clause shape is
 * asserted too, because a passing outcome under a hand-rolled filter is worth less on its own,
 * and the two together catch both a wrong answer and a right answer reached by accident.
 *
 * The positive control is the one that makes the rest mean anything: the OLD clause is run
 * against the same fixture and must return Explorer - Prospects. Without it, every assertion
 * here would pass just as well against a fixture that could not tell the two apart.
 */

type Row = { name: string; status: string; cohort_type: string; start_date: Date; max_seats: number; seats_taken: number };

/** The production rows, 2026-11-06. */
const PRODUCTION_COHORTS: Row[] = [
  { name: 'Explorer — Prospects', status: 'open', cohort_type: 'explorer', start_date: new Date('2026-07-12T00:00:00Z'), max_seats: 100000, seats_taken: 2 },
  { name: 'Cohort - July 2026', status: 'closed', cohort_type: 'accelerator', start_date: new Date('2026-07-23T00:00:00Z'), max_seats: 50, seats_taken: 58 },
  { name: 'AI Internship', status: 'open', cohort_type: 'ai_internship', start_date: new Date('2026-09-15T00:00:00Z'), max_seats: 9999, seats_taken: 0 },
  { name: 'Cohort - November 2026', status: 'open', cohort_type: 'accelerator', start_date: new Date('2026-12-07T00:00:00Z'), max_seats: 125, seats_taken: 2 },
  { name: 'Cohort - December 2026', status: 'closed', cohort_type: 'accelerator', start_date: new Date('2027-01-04T00:00:00Z'), max_seats: 500, seats_taken: 0 },
  /**
   * NOT a production row — added because a mutation survived without it.
   *
   * Deleting `cohort_type: 'accelerator'` from the query failed only the clause-shape
   * assertion; every behavioural test still passed. The reason is that in the real row set
   * each non-accelerator cohort happens to have a PAST start_date, so the date filter alone
   * carried them and the type filter was never independently load-bearing. A test that passes
   * whether or not the term exists does not test the term.
   *
   * This is a future, open, non-accelerator cohort — an entirely plausible row the moment a
   * new internship or prospect bucket is opened — and it is SOONER than the November batch, so
   * only the type filter can keep it from winning.
   */
  { name: 'AI Internship — Spring 2027', status: 'open', cohort_type: 'ai_internship', start_date: new Date('2026-11-20T00:00:00Z'), max_seats: 9999, seats_taken: 0 },
];

/**
 * Apply a where clause to the fixture. Supports exactly what this query uses: scalar equality
 * and `{ [Op.gte]: Date }`. Anything else throws rather than silently passing, so the mock can
 * never quietly stop filtering on a term the query added.
 */
function applyWhere(rows: Row[], where: Record<string | symbol, unknown>): Row[] {
  return rows.filter((row) => Object.entries(where).every(([key, cond]) => {
    const actual = (row as unknown as Record<string, unknown>)[key];
    if (cond !== null && typeof cond === 'object') {
      const ops = Object.getOwnPropertySymbols(cond as object);
      if (ops.length !== 1 || ops[0] !== Op.gte) {
        throw new Error(`fixture mock does not implement operator(s) on "${key}" — extend it rather than let the term go unfiltered`);
      }
      return (actual as Date).getTime() >= ((cond as Record<symbol, Date>)[Op.gte]).getTime();
    }
    return actual === cond;
  }));
}

let captured: { where: Record<string | symbol, unknown>; order: unknown } | null = null;

const findOne = jest.fn(async (opts: { where: Record<string | symbol, unknown>; order?: unknown }) => {
  captured = { where: opts.where, order: opts.order };
  const matched = applyWhere(PRODUCTION_COHORTS, opts.where)
    .sort((a, b) => a.start_date.getTime() - b.start_date.getTime());
  return matched[0] ?? null;
});

jest.mock('../../models', () => ({
  Cohort: { findOne: (...a: unknown[]) => (findOne as unknown as (...x: unknown[]) => unknown)(...a) },
  ScheduledEmail: {}, Lead: {}, Campaign: {}, CampaignLead: {}, StrategyCall: {}, Enrollment: {},
}));
jest.mock('../../config/env', () => ({ env: { jwtSecret: 't', databaseUrl: 'postgres://u:p@localhost:5432/t' } }));
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

import { getNextCohort } from '../schedulerService';

describe('C10.15 getNextCohort: the current accelerator batch, not the prospect bucket', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    captured = null;
    // Inside the November batch's month, before its 7 December orientation.
    jest.useFakeTimers().setSystemTime(new Date('2026-11-06T12:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('returns Cohort - November 2026 against the real production row set', async () => {
    const got = await getNextCohort();
    expect(got).not.toBeNull();
    expect(got!.name).toBe('Cohort - November 2026');
    expect(got!.start_date).toEqual(new Date('2026-12-07T00:00:00Z'));
    expect(got!.seats_remaining).toBe(123); // 125 - 2
  });

  /**
   * THE POSITIVE CONTROL. Without this the test above could pass against a fixture in which
   * nothing else was selectable, and would then prove nothing about the filter.
   */
  it('POSITIVE CONTROL: the OLD clause returns Explorer - Prospects on the same fixture', () => {
    const oldWay = applyWhere(PRODUCTION_COHORTS, { status: 'open' })
      .sort((a, b) => a.start_date.getTime() - b.start_date.getTime());
    expect(oldWay[0].name).toBe('Explorer — Prospects');
    expect(oldWay[0].cohort_type).toBe('explorer');
  });

  it('asks for exactly the three terms, so a removed filter fails by name', async () => {
    await getNextCohort();
    expect(captured).not.toBeNull();
    const w = captured!.where as Record<string, unknown>;
    expect(w.status).toBe('open');
    expect(w.cohort_type).toBe('accelerator');
    expect(Object.keys(w).sort()).toEqual(['cohort_type', 'start_date', 'status']);
    expect(captured!.order).toEqual([['start_date', 'ASC']]);
  });

  it('bounds the date filter at start of TODAY, so the orientation day still counts', async () => {
    await getNextCohort();
    const cond = (captured!.where as Record<string, Record<symbol, Date>>).start_date;
    const gte = cond[Op.gte];
    expect(gte.getHours()).toBe(0);
    expect(gte.getMinutes()).toBe(0);
    expect(gte.getSeconds()).toBe(0);
    // Same calendar day as "now", not tomorrow and not an epoch default.
    expect(gte.getFullYear()).toBe(new Date().getFullYear());
    expect(gte.getMonth()).toBe(new Date().getMonth());
    expect(gte.getDate()).toBe(new Date().getDate());
  });

  /**
   * THE TEST THE TYPE FILTER ACTUALLY NEEDS. `AI Internship — Spring 2027` is open and starts
   * 20 November, seventeen days BEFORE the November batch's orientation, so it wins on both
   * the status and the date terms. Only `cohort_type: 'accelerator'` can exclude it.
   *
   * The first version of this test asserted `got.cohort_type !== 'explorer'` on a return value
   * that has no `cohort_type` field at all — it read undefined, defaulted, and passed no matter
   * what. Asserting on the name is the thing that can fail.
   */
  it('excludes a non-accelerator cohort even when it is the SOONEST open one', async () => {
    const got = await getNextCohort();
    expect(got!.name).toBe('Cohort - November 2026');
    expect(got!.name).not.toBe('AI Internship — Spring 2027');
    expect(got!.name).not.toBe('Explorer — Prospects');
  });

  /**
   * The failure mode this change deliberately prefers. Returning null means callers fall back
   * to "our next cohort" / "soon" and **no `cohort_start_date` is stamped at all** — so the
   * scheduler's `cohort already started` guard cannot fire, because it requires that field.
   * The old code could not return null while any cohort of any type was open, so it always had
   * something wrong to say.
   */
  it('returns null once every accelerator orientation is past, rather than naming a stale one', async () => {
    jest.setSystemTime(new Date('2027-06-01T12:00:00Z'));
    expect(await getNextCohort()).toBeNull();
  });

  it('rolls to the next batch once the current orientation has passed', async () => {
    // 8 December: November's orientation is yesterday. December's batch is still 'closed' in the
    // fixture (C10.13 owns opening it), so the honest answer is null rather than a past date.
    jest.setSystemTime(new Date('2026-12-08T12:00:00Z'));
    expect(await getNextCohort()).toBeNull();

    // And with December opened, as the monthly rollover will do, it is the one that comes back.
    const december = PRODUCTION_COHORTS.find((c) => c.name === 'Cohort - December 2026')!;
    december.status = 'open';
    try {
      const got = await getNextCohort();
      expect(got!.name).toBe('Cohort - December 2026');
    } finally {
      december.status = 'closed';
    }
  });
});
