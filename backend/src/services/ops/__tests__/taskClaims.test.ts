/**
 * taskClaims.
 *
 * The whole value of this module is that two workers cannot both believe they hold the same task.
 * So the cases worth writing are the ones where a careless implementation would pass: a second
 * claimant while the first lease is live, a claimant after it expires, a release by somebody who
 * does not hold it, and the behaviour when the claims table itself cannot be read.
 *
 * The SQL is asserted as a CONTRACT, not just mocked away: the guard that makes this safe lives in
 * the WHERE clause of a single statement, so a test that only checked the return value would pass
 * against a read-then-write implementation with a race in it.
 */
import { QueryTypes } from 'sequelize';

const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a) },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { claim, release, get, listLive, partitionByClaim, DEFAULT_TTL_MINUTES } = require('../taskClaims');

const row = (over: Record<string, unknown> = {}) => ({
  task_key: '456/123',
  holder: 'tab-a',
  purpose: 'working it',
  claimed_at: '2026-11-11T12:00:00Z',
  expires_at: '2026-11-11T13:00:00Z',
  note: null,
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('claim', () => {
  it('reports success and returns the lease when the row is taken', async () => {
    mockQuery.mockResolvedValueOnce([row()]);
    const r = await claim('456/123', 'tab-a', { purpose: 'working it' });
    expect(r.ok).toBe(true);
    expect(r.claim.holder).toBe('tab-a');
  });

  /**
   * The guard is the point. A read-then-write implementation would satisfy every other assertion
   * in this file and still let two workers in, so the statement itself is asserted.
   */
  it('resolves the race in one statement, guarded on release, expiry and holder', async () => {
    mockQuery.mockResolvedValueOnce([row()]);
    await claim('456/123', 'tab-a');
    const sql = String(mockQuery.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toMatch(/INSERT INTO ops_task_claims/i);
    expect(sql).toMatch(/ON CONFLICT \(task_key\) DO UPDATE/i);
    expect(sql).toMatch(/released_at IS NOT NULL/i);
    expect(sql).toMatch(/expires_at <= now\(\)/i);
    expect(sql).toMatch(/holder = EXCLUDED\.holder/i);
    // One round trip on the happy path: a second query here would reopen the window.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('refuses, and names who holds it, when someone else has a live lease', async () => {
    mockQuery
      .mockResolvedValueOnce([])                       // the guarded upsert affects nothing
      .mockResolvedValueOnce([row({ holder: 'tab-b' })]); // the follow-up read
    const r = await claim('456/123', 'tab-a');
    expect(r.ok).toBe(false);
    expect(r.heldBy).toBe('tab-b');
    expect(r.heldUntil).toBe('2026-11-11T13:00:00Z');
  });

  it('does not throw when the task is held, because contention is normal', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(claim('456/123', 'tab-a')).resolves.toMatchObject({ ok: false });
  });

  it('sends a TTL that is never zero or negative', async () => {
    mockQuery.mockResolvedValueOnce([row()]);
    await claim('456/123', 'tab-a', { ttlMinutes: -5 });
    const bind = mockQuery.mock.calls[0][1].bind;
    expect(Number(bind[3])).toBeGreaterThan(0);
  });

  it('defaults to a short lease so a dead worker stops blocking the queue', async () => {
    mockQuery.mockResolvedValueOnce([row()]);
    await claim('456/123', 'tab-a');
    expect(Number(mockQuery.mock.calls[0][1].bind[3])).toBe(DEFAULT_TTL_MINUTES);
    expect(DEFAULT_TTL_MINUTES).toBeLessThanOrEqual(120);
  });

  it('binds its parameters rather than interpolating a task key', async () => {
    mockQuery.mockResolvedValueOnce([row()]);
    await claim("456/123'; DROP TABLE ops_task_claims; --", 'tab-a');
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(String(sql)).not.toMatch(/DROP TABLE/i);
    expect((opts as any).bind[0]).toMatch(/DROP TABLE/);
    expect((opts as any).type).toBe(QueryTypes.SELECT);
  });
});

describe('release', () => {
  it('succeeds for the holder', async () => {
    mockQuery.mockResolvedValueOnce([{ task_key: '456/123' }]);
    await expect(release('456/123', 'tab-a')).resolves.toBe(true);
  });

  /** Otherwise a second worker could free a lease it does not own and immediately take it. */
  it('only releases when the caller is the holder', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await expect(release('456/123', 'tab-b')).resolves.toBe(false);
    const sql = String(mockQuery.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toMatch(/WHERE task_key = \$1 AND holder = \$2/i);
  });
});

describe('get', () => {
  it('ignores a released or expired row, because neither is a claim', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await expect(get('456/123')).resolves.toBeNull();
    const sql = String(mockQuery.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toMatch(/released_at IS NULL AND expires_at > now\(\)/i);
  });
});

describe('partitionByClaim', () => {
  const orders = [{ id: '1/1' }, { id: '2/2' }, { id: '3/3' }];

  it('holds back what another worker has', async () => {
    mockQuery.mockResolvedValueOnce([row({ task_key: '2/2', holder: 'tab-b' })]);
    const { available, claimed } = await partitionByClaim(orders, 'tab-a');
    expect(available.map((o: any) => o.id)).toEqual(['1/1', '3/3']);
    expect(claimed[0]).toMatchObject({ id: '2/2', heldBy: 'tab-b' });
  });

  it('lets a worker keep what it already holds', async () => {
    mockQuery.mockResolvedValueOnce([row({ task_key: '2/2', holder: 'tab-a' })]);
    const { available, claimed } = await partitionByClaim(orders, 'tab-a');
    expect(available).toHaveLength(3);
    expect(claimed).toHaveLength(0);
  });

  /**
   * Fail-open is a judgement, so it is asserted rather than left to chance. Treating everything as
   * claimed would empty the queue and look exactly like "no work today" - the failure that wastes
   * a day silently. Duplicated effort is visible and recoverable.
   */
  it('treats all work as available when the claims table cannot be read', async () => {
    mockQuery.mockRejectedValueOnce(new Error('relation does not exist'));
    const { available, claimed } = await partitionByClaim(orders, 'tab-a');
    expect(available).toHaveLength(3);
    expect(claimed).toHaveLength(0);
  });

  it('returns an empty split for an empty queue without querying nothing into a crash', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await expect(partitionByClaim([], 'tab-a')).resolves.toEqual({ available: [], claimed: [] });
  });
});

describe('listLive', () => {
  it('asks only for unreleased, unexpired rows', async () => {
    mockQuery.mockResolvedValueOnce([row()]);
    await listLive();
    const sql = String(mockQuery.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toMatch(/released_at IS NULL AND expires_at > now\(\)/i);
  });
});
