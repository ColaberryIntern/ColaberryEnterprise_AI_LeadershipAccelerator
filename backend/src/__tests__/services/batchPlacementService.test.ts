/**
 * Batch placement (C10.13) — "when a user signs up and pays for a membership, they should
 * automatically be moved into the cohort for that month" (Ali, 6 November 2026).
 *
 * `Cohort` is mocked because the rule under test is a decision, not a query, and because
 * a suite that touches the real model layer cannot run in CI (see jest.ci.config.ts: every
 * excluded suite is excluded for exactly that reason). `centralDate` is NOT mocked - the
 * timezone boundary is one of the things being tested, and a mocked month key would answer
 * whatever the mock said.
 */

jest.mock('../../models', () => ({
  Cohort: { findAll: jest.fn(), findByPk: jest.fn() },
}));

import { Cohort } from '../../models';
import {
  batchMonthKey,
  findBatchForMonth,
  resolvePaidBatchPlacement,
} from '../../services/batch/batchPlacementService';

const findAll = (Cohort as any).findAll as jest.Mock;
const findByPk = (Cohort as any).findByPk as jest.Mock;

/** The five accelerator rows on production 2026-11-08, with their real names, statuses and
 *  settings_json — including November's absent block. */
const PROD_BATCHES = [
  { id: 'nov', name: 'Cohort - November 2026', cohort_type: 'accelerator', status: 'open', start_date: '2026-11-12', settings_json: {} },
  { id: 'dec', name: 'Cohort - December 2026', cohort_type: 'accelerator', status: 'closed', start_date: '2027-01-04', settings_json: { batch_month: '2026-12' } },
  { id: 'jan', name: 'Cohort - January 2027', cohort_type: 'accelerator', status: 'closed', start_date: '2027-02-01', settings_json: { batch_month: '2027-01' } },
  { id: 'feb', name: 'Cohort - February 2027', cohort_type: 'accelerator', status: 'closed', start_date: '2027-03-01', settings_json: { batch_month: '2027-02' } },
  { id: 'mar', name: 'Cohort - March 2027', cohort_type: 'accelerator', status: 'closed', start_date: '2027-04-05', settings_json: { batch_month: '2027-03' } },
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  findAll.mockResolvedValue(PROD_BATCHES);
});

afterEach(() => jest.restoreAllMocks());

describe('batchMonthKey — the month is read in Central time, not UTC', () => {
  /**
   * THE BOUNDARY THIS EXISTS FOR. A payment at 23:30 on 30 November Central is 05:30 on
   * 1 December UTC. Reading the month in UTC would put that member in the December batch
   * when they paid in November — one member in the wrong group, silently, once a month,
   * only ever at night.
   */
  it('keeps a late-November payment in November', () => {
    expect(batchMonthKey(new Date('2026-12-01T05:30:00Z'))).toBe('2026-11');
  });

  it('moves over at Central midnight, not UTC midnight', () => {
    expect(batchMonthKey(new Date('2026-12-01T06:30:00Z'))).toBe('2026-12');
  });

  it('accepts epoch milliseconds as well as a Date', () => {
    expect(batchMonthKey(Date.parse('2027-01-15T18:00:00Z'))).toBe('2027-01');
  });
});

describe('findBatchForMonth', () => {
  it('finds the batch whose declared month matches', async () => {
    expect((await findBatchForMonth('2026-12'))?.id).toBe('dec');
    expect((await findBatchForMonth('2027-03'))?.id).toBe('mar');
  });

  /** November is the live batch and has no declared month, so this is the case that
   *  decides whether the feature works at all this month. */
  it('finds the November batch through the name fallback', async () => {
    expect((await findBatchForMonth('2026-11'))?.id).toBe('nov');
  });

  it('returns null for a month with no batch row', async () => {
    expect(await findBatchForMonth('2027-06')).toBeNull();
  });

  it('returns null for a month key that is not one', async () => {
    for (const bad of ['', 'nonsense', '2026', '2026-1', undefined as any, null as any]) {
      expect(await findBatchForMonth(bad)).toBeNull();
    }
    expect(findAll).not.toHaveBeenCalled();
  });

  /**
   * STATUS IS NOT PART OF THE MATCH, deliberately. Future batches sit `closed` until
   * their month arrives, so a payment early in a month whose rollover has not run yet
   * must still find its batch. December through March are all `closed` above and all
   * resolve.
   */
  it('matches a closed batch, because a future batch is closed until its month', async () => {
    const dec = await findBatchForMonth('2026-12');
    expect(dec?.status).toBe('closed');
  });

  it('prefers the open row when a month has two, and says so', async () => {
    findAll.mockResolvedValue([
      { id: 'dupe-closed', name: 'Cohort - December 2026', cohort_type: 'accelerator', status: 'closed', settings_json: { batch_month: '2026-12' } },
      { id: 'dupe-open', name: 'Cohort - December 2026 (fixed)', cohort_type: 'accelerator', status: 'open', settings_json: { batch_month: '2026-12' } },
    ]);
    expect((await findBatchForMonth('2026-12'))?.id).toBe('dupe-open');
    expect(console.warn).toHaveBeenCalled();
  });

  it('falls back to the first row when a duplicated month has no open row', async () => {
    findAll.mockResolvedValue([
      { id: 'first', name: 'Cohort - December 2026', cohort_type: 'accelerator', status: 'closed', settings_json: { batch_month: '2026-12' } },
      { id: 'second', name: 'Cohort - December 2026 (dupe)', cohort_type: 'accelerator', status: 'closed', settings_json: { batch_month: '2026-12' } },
    ]);
    expect((await findBatchForMonth('2026-12'))?.id).toBe('first');
  });
});

describe('resolvePaidBatchPlacement — the transition, not the renewal', () => {
  /**
   * THE HAZARD THIS GUARDS. `activateByRef` runs on every renewal, so without this a
   * member who joined in November and renewed in February would be moved into the
   * February batch — out of the group they actually joined. The batch is "when you
   * joined", not "when you last paid".
   */
  it('never moves an already-paid member', async () => {
    const placed = await resolvePaidBatchPlacement({
      currentCohortId: 'nov', alreadyPaid: true, paidAt: new Date('2027-02-10T18:00:00Z'),
    });
    expect(placed).toBeNull();
    expect(findAll).not.toHaveBeenCalled();
  });

  it('places a paying Explorer into the month they paid in', async () => {
    findByPk.mockResolvedValue({ id: 'explorer', name: 'Explorer — Prospects', cohort_type: 'explorer' });
    const placed = await resolvePaidBatchPlacement({
      currentCohortId: 'explorer', alreadyPaid: false, paidAt: new Date('2026-11-20T18:00:00Z'),
    });
    expect(placed).toBe('nov');
  });

  it('places a member who has no cohort at all', async () => {
    const placed = await resolvePaidBatchPlacement({
      currentCohortId: null, alreadyPaid: false, paidAt: new Date('2026-12-10T18:00:00Z'),
    });
    expect(placed).toBe('dec');
    expect(findByPk).not.toHaveBeenCalled();
  });

  it('returns null when they are already in the right batch', async () => {
    const placed = await resolvePaidBatchPlacement({
      currentCohortId: 'nov', alreadyPaid: false, paidAt: new Date('2026-11-20T18:00:00Z'),
    });
    expect(placed).toBeNull();
    expect(findByPk).not.toHaveBeenCalled();
  });

  /** The directive's "missed rollover" repair: an enrollment created after the 1st, while
   *  last month's batch was still the open one, is moved to the right month on payment. */
  it('moves a member between accelerator batches when the rollover was missed', async () => {
    findByPk.mockResolvedValue(PROD_BATCHES[0]); // still in November
    const placed = await resolvePaidBatchPlacement({
      currentCohortId: 'nov', alreadyPaid: false, paidAt: new Date('2026-12-05T18:00:00Z'),
    });
    expect(placed).toBe('dec');
  });

  /**
   * THE OTHER LANES. The directive: "Sponsored and corporate members are placed by
   * cohort_type lookups, not by month. Out of scope for this directive. Leave those lanes
   * alone." The internship is its own program with its own cohort.
   */
  it('leaves the corporate, sponsor, internship and business lanes alone', async () => {
    for (const lane of ['corporate', 'sponsor', 'ai_internship', 'business']) {
      findByPk.mockResolvedValue({ id: `c-${lane}`, name: `A ${lane} cohort`, cohort_type: lane });
      const placed = await resolvePaidBatchPlacement({
        currentCohortId: `c-${lane}`, alreadyPaid: false, paidAt: new Date('2026-11-20T18:00:00Z'),
      });
      expect(placed).toBeNull();
    }
  });

  it('leaves them alone, with no batch row for the payment month', async () => {
    findByPk.mockResolvedValue({ id: 'explorer', name: 'Explorer — Prospects', cohort_type: 'explorer' });
    const placed = await resolvePaidBatchPlacement({
      currentCohortId: 'explorer', alreadyPaid: false, paidAt: new Date('2027-07-01T18:00:00Z'),
    });
    expect(placed).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it('places a member whose cohort_id points at a row that no longer exists', async () => {
    findByPk.mockResolvedValue(null);
    const placed = await resolvePaidBatchPlacement({
      currentCohortId: 'deleted-row', alreadyPaid: false, paidAt: new Date('2026-11-20T18:00:00Z'),
    });
    expect(placed).toBe('nov');
  });

  it('treats a cohort with no cohort_type as a batch it may move someone out of', async () => {
    findByPk.mockResolvedValue({ id: 'untyped', name: 'Cohort - July 2026', cohort_type: null });
    const placed = await resolvePaidBatchPlacement({
      currentCohortId: 'untyped', alreadyPaid: false, paidAt: new Date('2026-11-20T18:00:00Z'),
    });
    expect(placed).toBe('nov');
  });
});

describe('resolvePaidBatchPlacement — never breaks a payment that cleared', () => {
  /**
   * A payment that cleared must land even when placement cannot be computed. The member
   * sitting in the wrong batch is an admin correction; a thrown error here would leave a
   * paying member unpaid in the database. The single try/catch lives in the resolver so
   * four call sites do not each need one.
   */
  it('returns null instead of throwing when the lookup fails', async () => {
    findAll.mockRejectedValue(Object.assign(new Error('connection terminated'), { error_class: 'UpstreamUnavailable' }));
    const placed = await resolvePaidBatchPlacement({
      currentCohortId: 'explorer', alreadyPaid: false, paidAt: new Date('2026-11-20T18:00:00Z'),
    });
    expect(placed).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it('returns null instead of throwing when reading the current cohort fails', async () => {
    findByPk.mockRejectedValue(new Error('row lock timeout'));
    const placed = await resolvePaidBatchPlacement({
      currentCohortId: 'explorer', alreadyPaid: false, paidAt: new Date('2026-11-20T18:00:00Z'),
    });
    expect(placed).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it('logs the error class rather than a bare Error', async () => {
    findAll.mockRejectedValue(Object.assign(new Error('nope'), { error_class: 'TimeoutError' }));
    await resolvePaidBatchPlacement({
      currentCohortId: 'explorer', alreadyPaid: false, paidAt: new Date('2026-11-20T18:00:00Z'),
    });
    const logged = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('TimeoutError');
    expect(logged).toContain('placement_failed');
  });
});

describe('idempotency', () => {
  /** Running the same placement twice produces the same end state: the second call sees an
   *  already-paid row and changes nothing. */
  it('is a no-op on a second run', async () => {
    findByPk.mockResolvedValue({ id: 'explorer', name: 'Explorer — Prospects', cohort_type: 'explorer' });
    const first = await resolvePaidBatchPlacement({
      currentCohortId: 'explorer', alreadyPaid: false, paidAt: new Date('2026-11-20T18:00:00Z'),
    });
    const second = await resolvePaidBatchPlacement({
      currentCohortId: first, alreadyPaid: true, paidAt: new Date('2026-11-20T18:00:00Z'),
    });
    expect(first).toBe('nov');
    expect(second).toBeNull();
  });

  /** Even if a caller re-ran it without the paid flag, landing in the same batch twice
   *  still changes nothing — the destination check catches it. */
  it('is a no-op on a replay that forgets the paid flag', async () => {
    const replay = await resolvePaidBatchPlacement({
      currentCohortId: 'nov', alreadyPaid: false, paidAt: new Date('2026-11-20T18:00:00Z'),
    });
    expect(replay).toBeNull();
  });
});
