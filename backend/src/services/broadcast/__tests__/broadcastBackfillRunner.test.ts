/**
 * The write half. What matters here is not what gets written (the planner decided that and
 * is tested separately) but the operational properties:
 *
 *   - dry run is the DEFAULT, and writes nothing
 *   - a failed row does not abort the batch
 *   - every row carries the batch id, which is the reversal predicate
 *   - reversal refuses to delete an occurrence that has since been published or gone live
 */
jest.mock('../../../config/database', () => ({
  sequelize: { transaction: jest.fn(async (fn: any) => fn({})), query: jest.fn() },
}));
jest.mock('../../../models/BroadcastOccurrence', () => ({ __esModule: true, default: { create: jest.fn() } }));

import { runBackfill, reverseBackfill } from '../broadcastBackfillRunner';
import { sequelize } from '../../../config/database';
import BroadcastOccurrence from '../../../models/BroadcastOccurrence';
import type { BackfillPlan } from '../broadcastBackfillPlanner';

const query = (sequelize as any).query as jest.Mock;
const create = (BroadcastOccurrence as any).create as jest.Mock;

const BATCH = 'bf-2026-10-02-001';

const plan = (over: Partial<BackfillPlan> = {}): BackfillPlan => ({
  batchId: BATCH,
  decisions: [
    { sourceType: 'live_session', sourceId: 's1', action: 'link', reason: 'ready_to_link',
      occurrenceKey: 'live_session:s1:2026-07-23T23:30', startsAt: new Date('2026-07-23T23:30:00Z'),
      proposed: { access_mode: 'private', editorial_state: 'ended' } },
    { sourceType: 'live_session', sourceId: 's2', action: 'link', reason: 'ready_to_link',
      occurrenceKey: 'live_session:s2:2026-07-30T23:30', startsAt: new Date('2026-07-30T23:30:00Z'),
      proposed: { access_mode: 'private', editorial_state: 'ended' } },
    { sourceType: 'live_session', sourceId: 's3', action: 'skip', reason: 'already_linked' },
    { sourceType: 'live_session', sourceId: 's4', action: 'quarantine', reason: 'undetermined_start' },
  ],
  counts: { link: 2, skip: 1, quarantine: 1 },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  create.mockImplementation(async (attrs: any) => ({ id: `occ-${attrs.occurrence_key}` }));
  query.mockResolvedValue([[], []]);
});

describe('dry run is the default', () => {
  it('writes NOTHING when execute is not passed', async () => {
    const r = await runBackfill(plan());
    expect(r.dryRun).toBe(true);
    expect(r.written).toBe(0);
    expect(create).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('writes nothing when execute is explicitly false', async () => {
    const r = await runBackfill(plan(), { execute: false });
    expect(r.dryRun).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it('still reports what it WOULD do, including quarantined and skipped counts', async () => {
    const r = await runBackfill(plan());
    expect(r).toMatchObject({ attempted: 2, skipped: 1, quarantined: 1 });
  });
});

describe('execution', () => {
  it('writes only the link decisions, never the skipped or quarantined ones', async () => {
    const r = await runBackfill(plan(), { execute: true });
    expect(r.written).toBe(2);
    expect(create).toHaveBeenCalledTimes(2);
    const keys = create.mock.calls.map((c) => c[0].occurrence_key);
    expect(keys).toEqual(['live_session:s1:2026-07-23T23:30', 'live_session:s2:2026-07-30T23:30']);
  });

  it('creates every occurrence private and unpublished, straight from the plan', async () => {
    await runBackfill(plan(), { execute: true });
    for (const call of create.mock.calls) {
      expect(call[0]).toMatchObject({ access_mode: 'private', editorial_state: 'ended' });
    }
  });

  it('stamps the BATCH ID on every source ref — the reversal predicate', async () => {
    await runBackfill(plan(), { execute: true });
    const inserts = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO broadcast_source_refs'));
    expect(inserts).toHaveLength(2);
    for (const [, options] of inserts) {
      expect(options.replacements.batchId).toBe(BATCH);
    }
  });

  it('respects a row limit', async () => {
    const r = await runBackfill(plan(), { execute: true, limit: 1 });
    expect(r.attempted).toBe(1);
    expect(r.written).toBe(1);
  });

  it('a failed row does NOT abort the batch — one bad source cannot block every valid one', async () => {
    create.mockImplementationOnce(async () => { throw Object.assign(new Error('unique violation'), { error_class: 'UniqueConstraint' }); });
    const r = await runBackfill(plan(), { execute: true });
    expect(r.written).toBe(1);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]).toMatchObject({ sourceId: 's1', error_class: 'UniqueConstraint' });
  });

  it('truncates a failure message rather than logging an unbounded error body', async () => {
    create.mockImplementationOnce(async () => { throw new Error('x'.repeat(5000)); });
    const r = await runBackfill(plan(), { execute: true });
    expect(r.failed[0].message.length).toBeLessThanOrEqual(200);
  });
});

describe('reversal', () => {
  const untouched = { ref_id: 'r1', occurrence_id: 'o1', editorial_state: 'ended', access_mode: 'private' };
  const published = { ref_id: 'r2', occurrence_id: 'o2', editorial_state: 'replay_ready', access_mode: 'free' };
  const wentLive = { ref_id: 'r3', occurrence_id: 'o3', editorial_state: 'live', access_mode: 'private' };

  it('dry run by default, deleting nothing', async () => {
    query.mockResolvedValueOnce([[untouched], []]);
    const r = await reverseBackfill(BATCH);
    expect(r.dryRun).toBe(true);
    expect(r.occurrencesDeleted).toBe(0);
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('DELETE'))).toBe(false);
  });

  it('deletes only rows still in the state the backfill left them in', async () => {
    query.mockResolvedValueOnce([[untouched, published, wentLive], []]);
    const r = await reverseBackfill(BATCH, { execute: true });
    expect(r.occurrencesDeleted).toBe(1);
    expect(r.retained).toEqual(['o2', 'o3']);
  });

  it('RETAINS an occurrence that has since been published — deleting it would destroy real work', async () => {
    query.mockResolvedValueOnce([[published], []]);
    const r = await reverseBackfill(BATCH, { execute: true });
    expect(r.occurrencesDeleted).toBe(0);
    expect(r.retained).toEqual(['o2']);
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('DELETE'))).toBe(false);
  });

  it('RETAINS one that has gone live', async () => {
    query.mockResolvedValueOnce([[wentLive], []]);
    const r = await reverseBackfill(BATCH, { execute: true });
    expect(r.retained).toEqual(['o3']);
  });

  it('scopes the lookup to the batch id, never to a time window', async () => {
    query.mockResolvedValueOnce([[], []]);
    await reverseBackfill(BATCH);
    const [sql, options] = query.mock.calls[0];
    expect(String(sql)).toContain('r.batch_id = :batchId');
    expect(options.replacements.batchId).toBe(BATCH);
  });
});
