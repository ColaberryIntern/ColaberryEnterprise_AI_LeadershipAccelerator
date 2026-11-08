/**
 * The monthly batch rollover (C10.13) — close the month that ended, open the incoming one,
 * leave exactly one batch open.
 *
 * Mocks are the model layer and the rooms call. The decision itself — which rows change
 * and which are left alone — is real, and so is the month arithmetic.
 */

jest.mock('../../models', () => ({
  Cohort: { findAll: jest.fn(), findByPk: jest.fn() },
}));
jest.mock('../../config/env', () => ({ env: { communityRoomsEnabled: true } }));
jest.mock('../../services/communityRooms/cohortRoomService', () => ({
  ensureRoomForCohort: jest.fn(),
  cohortRoomSlug: (id: string) => `cohort-${id}`,
}));

import { Op } from 'sequelize';
import { Cohort } from '../../models';
import { ensureRoomForCohort } from '../../services/communityRooms/cohortRoomService';
import { rollBatches } from '../../services/batch/batchRolloverService';

const findAll = (Cohort as any).findAll as jest.Mock;
const ensureRoom = ensureRoomForCohort as jest.Mock;

/** A row with the `update` spy the service calls, so a test can assert both the write and
 *  the absence of one. */
function row(over: Record<string, any>) {
  const r: any = {
    cohort_type: 'accelerator',
    settings_json: {},
    start_date: '2026-11-12',
    status: 'closed',
    ...over,
  };
  r.update = jest.fn(async (patch: any) => Object.assign(r, patch));
  return r;
}

/**
 * The `where` clauses are read through the real `Op` symbols, NOT through
 * `JSON.stringify`.
 *
 * This is the bug this harness was first written with, and it is worth leaving the reason
 * here: `JSON.stringify` drops symbol keys silently, so a stringified Sequelize `where`
 * built from `Op.and`/`Op.or` reads `"{}"`. The fake could not tell the two queries apart,
 * served every row to both, and three tests failed against correct service code. A test
 * harness that cannot see the filter it is faking will agree with anything.
 */
function wantsOpenOnly(where: any): boolean {
  const and: any[] = where?.[Op.and] ?? [];
  return and.some((clause) => clause?.status === 'open');
}

/** Every batch-type clause in a `where`, flattened out of its `Op.or`. */
function cohortTypeClauses(where: any): any[] {
  const and: any[] = where?.[Op.and] ?? [];
  return and.flatMap((clause) => clause?.[Op.or] ?? []);
}

/** `findAll` is called twice with different filters: first for every non-completed batch
 *  (the month lookup), then for the open rows. Serve each from one table. */
function serve(rows: any[]) {
  findAll.mockImplementation(async (opts: any) => (
    wantsOpenOnly(opts?.where)
      ? rows.filter((r) => r.status === 'open')
      : rows.filter((r) => r.status !== 'completed')
  ));
}

const DEC_1 = new Date('2026-12-01T18:00:00Z'); // noon-ish Central on 1 December

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  ensureRoom.mockResolvedValue({ id: 'room-1', slug: 'cohort-dec' });
});

afterEach(() => jest.restoreAllMocks());

describe('the rollover itself', () => {
  it('closes November and opens December on 1 December', async () => {
    const nov = row({ id: 'nov', name: 'Cohort - November 2026', status: 'open' });
    const dec = row({ id: 'dec', name: 'Cohort - December 2026', settings_json: { batch_month: '2026-12' }, start_date: '2027-01-04' });
    serve([nov, dec]);

    const report = await rollBatches({ now: DEC_1, execute: true });

    expect(report.month).toBe('2026-12');
    expect(report.closed.map((c) => c.cohortId)).toEqual(['nov']);
    expect(report.opened?.cohortId).toBe('dec');
    expect(nov.update).toHaveBeenCalledWith({ status: 'closed' });
    expect(dec.update).toHaveBeenCalledWith({ status: 'open' });
  });

  /** The previous value is recorded on the report and in the log, so a change can be
   *  reversed by hand — the directive's safety constraint, because "a batch row with
   *  enrollments attached is a live group of people". */
  it('records the previous status of every row it changes', async () => {
    const nov = row({ id: 'nov', name: 'Cohort - November 2026', status: 'open' });
    const dec = row({ id: 'dec', name: 'Cohort - December 2026', settings_json: { batch_month: '2026-12' } });
    serve([nov, dec]);

    const report = await rollBatches({ now: DEC_1, execute: true });

    expect(report.closed[0]).toMatchObject({ name: 'Cohort - November 2026', month: '2026-11', from: 'open', to: 'closed' });
    expect(report.opened).toMatchObject({ name: 'Cohort - December 2026', from: 'closed', to: 'open' });
  });

  it('writes nothing on a dry run but reports the same decisions', async () => {
    const nov = row({ id: 'nov', name: 'Cohort - November 2026', status: 'open' });
    const dec = row({ id: 'dec', name: 'Cohort - December 2026', settings_json: { batch_month: '2026-12' } });
    serve([nov, dec]);

    const report = await rollBatches({ now: DEC_1, execute: false });

    expect(report.executed).toBe(false);
    expect(report.closed.map((c) => c.cohortId)).toEqual(['nov']);
    expect(report.opened?.cohortId).toBe('dec');
    expect(nov.update).not.toHaveBeenCalled();
    expect(dec.update).not.toHaveBeenCalled();
    expect(ensureRoom).not.toHaveBeenCalled();
  });

  it('closes every stale open batch, not just the most recent', async () => {
    const nov = row({ id: 'nov', name: 'Cohort - November 2026', status: 'open' });
    const oct = row({ id: 'oct', name: 'Cohort - October 2026', status: 'open', start_date: '2026-10-05' });
    const dec = row({ id: 'dec', name: 'Cohort - December 2026', settings_json: { batch_month: '2026-12' } });
    serve([oct, nov, dec]);

    const report = await rollBatches({ now: DEC_1, execute: true });

    expect(report.closed.map((c) => c.cohortId).sort()).toEqual(['nov', 'oct']);
  });

  /** A future batch wrongly left open is closed too: "exactly one open" is the invariant,
   *  and it is not only about the past. */
  it('closes a future batch that was opened early', async () => {
    const dec = row({ id: 'dec', name: 'Cohort - December 2026', status: 'open', settings_json: { batch_month: '2026-12' } });
    const jan = row({ id: 'jan', name: 'Cohort - January 2027', status: 'open', settings_json: { batch_month: '2027-01' } });
    serve([dec, jan]);

    const report = await rollBatches({ now: DEC_1, execute: true });

    expect(report.closed.map((c) => c.cohortId)).toEqual(['jan']);
    expect(report.opened).toBeNull();
  });
});

describe('idempotency', () => {
  it('changes nothing when the right batch is already the only open one', async () => {
    const nov = row({ id: 'nov', name: 'Cohort - November 2026', status: 'closed' });
    const dec = row({ id: 'dec', name: 'Cohort - December 2026', status: 'open', settings_json: { batch_month: '2026-12' } });
    serve([nov, dec]);

    const report = await rollBatches({ now: DEC_1, execute: true });

    expect(report.closed).toEqual([]);
    expect(report.opened).toBeNull();
    expect(nov.update).not.toHaveBeenCalled();
    expect(dec.update).not.toHaveBeenCalled();
  });

  it('reaches the same end state when run twice', async () => {
    const nov = row({ id: 'nov', name: 'Cohort - November 2026', status: 'open' });
    const dec = row({ id: 'dec', name: 'Cohort - December 2026', settings_json: { batch_month: '2026-12' } });
    serve([nov, dec]);

    await rollBatches({ now: DEC_1, execute: true });
    const second = await rollBatches({ now: DEC_1, execute: true });

    expect(nov.status).toBe('closed');
    expect(dec.status).toBe('open');
    expect(second.closed).toEqual([]);
    expect(second.opened).toBeNull();
  });
});

describe('the failure path, which is the one that matters', () => {
  /**
   * ZERO OPEN BATCHES IS WORSE THAN ONE STALE OPEN BATCH. `open` is the only status the
   * public cohort list returns, so closing the last batch empties that list and blocks
   * enrollment outright, where a stale batch still admits members. So when the current
   * month has no row at all, this closes nothing and says why.
   */
  it('closes nothing when the current month has no batch row', async () => {
    const nov = row({ id: 'nov', name: 'Cohort - November 2026', status: 'open' });
    serve([nov]);

    const report = await rollBatches({ now: DEC_1, execute: true });

    expect(report.skipped).toContain('no batch row for 2026-12');
    expect(report.closed).toEqual([]);
    expect(report.opened).toBeNull();
    expect(nov.update).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it('still rolls over when the batch room cannot be created', async () => {
    const nov = row({ id: 'nov', name: 'Cohort - November 2026', status: 'open' });
    const dec = row({ id: 'dec', name: 'Cohort - December 2026', settings_json: { batch_month: '2026-12' } });
    serve([nov, dec]);
    ensureRoom.mockRejectedValue(new Error('rooms table is locked'));

    const report = await rollBatches({ now: DEC_1, execute: true });

    expect(report.opened?.cohortId).toBe('dec');
    expect(report.roomSlug).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('what it refuses to touch', () => {
  /**
   * Only rows this module can IDENTIFY as a batch of another month are closed. An open
   * accelerator row with no resolvable month is a demo or fixture row, not a batch, so
   * "exactly one batch open" says nothing about it — and closing a row we cannot even
   * name would be a bulk status change wearing a filter.
   */
  it('leaves an open accelerator row whose month cannot be resolved', async () => {
    const demo = row({ id: 'demo', name: 'Demo Cohort', status: 'open' });
    const dec = row({ id: 'dec', name: 'Cohort - December 2026', settings_json: { batch_month: '2026-12' } });
    serve([demo, dec]);

    const report = await rollBatches({ now: DEC_1, execute: true });

    expect(report.closed).toEqual([]);
    expect(demo.update).not.toHaveBeenCalled();
    expect(report.opened?.cohortId).toBe('dec');
  });

  /** The Explorer pool and the internship both sit `open` in production and must stay
   *  that way: closing the Explorer cohort would stop every free signup. The SQL filter
   *  excludes them, so they never reach the loop at all. */
  it('asks the database only for accelerator or untyped rows', async () => {
    const dec = row({ id: 'dec', name: 'Cohort - December 2026', settings_json: { batch_month: '2026-12' } });
    serve([dec]);

    await rollBatches({ now: DEC_1, execute: true });

    expect(findAll.mock.calls.length).toBeGreaterThan(0);
    for (const call of findAll.mock.calls) {
      expect(cohortTypeClauses(call[0]?.where)).toEqual(
        expect.arrayContaining([{ cohort_type: 'accelerator' }, { cohort_type: null }]),
      );
    }
  });

  it('confirms the batch room once it has opened the batch', async () => {
    const dec = row({ id: 'dec', name: 'Cohort - December 2026', settings_json: { batch_month: '2026-12' } });
    serve([dec]);

    const report = await rollBatches({ now: DEC_1, execute: true });

    expect(ensureRoom).toHaveBeenCalledTimes(1);
    expect(report.roomSlug).toBe('cohort-dec');
  });
});

describe('the month it resolves', () => {
  it('reads the month in Central time', async () => {
    const dec = row({ id: 'dec', name: 'Cohort - December 2026', settings_json: { batch_month: '2026-12' } });
    const nov = row({ id: 'nov', name: 'Cohort - November 2026' });
    serve([nov, dec]);

    // 05:30Z on 1 December is still 30 November in Central.
    const late = await rollBatches({ now: new Date('2026-12-01T05:30:00Z'), execute: false });
    expect(late.month).toBe('2026-11');
    expect(late.opened?.cohortId).toBe('nov');
  });
});
