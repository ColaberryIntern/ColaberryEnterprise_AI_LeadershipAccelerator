/**
 * repoTreeStaleness — selection rules for the repo re-read sweep.
 *
 * Three tests carry the design. Never-synced-first, because a connection with no tree
 * renders as a student who has built nothing. The drain, because a capped sweep that
 * always picks the same head of the queue never reaches the back of it. And selection
 * being keyed on the CONNECTION rather than the enrollment, because a few students have
 * two repositories and one of them was being left permanently stale.
 */
import { RefreshCandidate, selectStale } from '../repoTreeStaleness';

const NOW = new Date('2026-08-30T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

/** One connection. Enrollment defaults to its own, which is the common case. */
const c = (connectionId: string, lastSyncAt: Date | null, enrollmentId?: string): RefreshCandidate =>
  ({ connectionId, enrollmentId: enrollmentId ?? 'e-' + connectionId, lastSyncAt });

const ids = (out: RefreshCandidate[]) => out.map((x) => x.connectionId);

const OPTS = { maxAgeHours: 6, limit: 25 };

describe('selectStale', () => {
  it('selects a tree older than the max age, and leaves a fresh one alone', () => {
    expect(ids(selectStale([c('stale', hoursAgo(7)), c('fresh', hoursAgo(1))], NOW, OPTS)))
      .toEqual(['stale']);
  });

  it('puts NEVER-SYNCED first, ahead of even the oldest stale tree', () => {
    // A connection with no tree renders as a student who has built nothing. That is the
    // worst thing this system can say about someone, so it is fixed first.
    const out = ids(selectStale(
      [c('ancient', hoursAgo(24 * 120)), c('never', null), c('old', hoursAgo(48))],
      NOW, OPTS,
    ));
    expect(out[0]).toBe('never');
    expect(out).toEqual(['never', 'ancient', 'old']);
  });

  it('orders the rest oldest first', () => {
    expect(ids(selectStale(
      [c('b', hoursAgo(10)), c('c', hoursAgo(8)), c('a', hoursAgo(100))], NOW, OPTS,
    ))).toEqual(['a', 'b', 'c']);
  });

  it('selects BOTH repositories when one student has two', () => {
    // The bug this keying fixes. Quincy has qninying/ambit and
    // qninying/ai-operations-center under one enrollment. Sweeping per enrollment
    // refreshed whichever `findOne` returned and left the other stale forever -- and the
    // stale one held 329 files against the other's 134.
    const out = selectStale([
      c('ambit', hoursAgo(50), 'enr-quincy'),
      c('ai-operations-center', hoursAgo(90), 'enr-quincy'),
    ], NOW, OPTS);
    expect(ids(out)).toEqual(['ai-operations-center', 'ambit']);
    expect(out.every((x) => x.enrollmentId === 'enr-quincy')).toBe(true);
  });

  it('carries the enrollment id through, since the sync needs both', () => {
    const [only] = selectStale([c('conn-1', null, 'enr-9')], NOW, OPTS);
    expect(only).toEqual({ connectionId: 'conn-1', enrollmentId: 'enr-9', lastSyncAt: null });
  });

  it('caps the batch so one run cannot exhaust the rate limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => c('e' + i, hoursAgo(10 + i)));
    expect(selectStale(many, NOW, { maxAgeHours: 6, limit: 25 })).toHaveLength(25);
  });

  it('DRAINS the backlog across runs rather than re-reading the same head', () => {
    // The property that makes a capped sweep converge. Sync stamps last_sync_at, so the
    // ones handled in run 1 are fresh in run 2 and the next oldest come forward.
    let rows = Array.from({ length: 30 }, (_, i) => c('e' + i, hoursAgo(100 - i)));
    const first = ids(selectStale(rows, NOW, { maxAgeHours: 6, limit: 10 }));
    expect(first).toHaveLength(10);

    rows = rows.map((r) => (first.includes(r.connectionId) ? c(r.connectionId, NOW) : r));
    const second = ids(selectStale(rows, NOW, { maxAgeHours: 6, limit: 10 }));

    expect(second).toHaveLength(10);
    expect(second.some((id) => first.includes(id))).toBe(false);
  });

  it('treats an unparseable timestamp as never-synced', () => {
    // Re-reading a repo unnecessarily is cheap; hiding a student indefinitely is not.
    const bad = { connectionId: 'bad', enrollmentId: 'e', lastSyncAt: new Date('nonsense') };
    expect(ids(selectStale([bad], NOW, OPTS))).toEqual(['bad']);
  });

  it('is stable for several never-synced connections', () => {
    expect(ids(selectStale([c('z', null), c('a', null), c('m', null)], NOW, OPTS)))
      .toEqual(['a', 'm', 'z']);
  });

  it('returns nothing when the limit is zero or negative', () => {
    // A kill switch: setting the batch to zero disables the sweep without unscheduling.
    expect(selectStale([c('x', null)], NOW, { maxAgeHours: 6, limit: 0 })).toEqual([]);
    expect(selectStale([c('x', null)], NOW, { maxAgeHours: 6, limit: -5 })).toEqual([]);
  });

  it('treats maxAgeHours 0 as "everything is due"', () => {
    expect(ids(selectStale([c('just-now', NOW)], NOW, { maxAgeHours: 0, limit: 25 })))
      .toEqual(['just-now']);
  });

  it('skips rows missing either id', () => {
    const junk = [
      { connectionId: '', enrollmentId: 'e', lastSyncAt: null },
      { connectionId: 'x', enrollmentId: '', lastSyncAt: null },
      { connectionId: undefined as any, enrollmentId: 'e', lastSyncAt: null },
      c('good', null),
    ];
    expect(ids(selectStale(junk, NOW, OPTS))).toEqual(['good']);
  });

  it('does not throw on junk input', () => {
    for (const bad of [undefined, null, 'nope', 42, [null], [undefined]]) {
      expect(() => selectStale(bad as any, NOW, OPTS)).not.toThrow();
    }
  });

  it('is deterministic: same input, same output', () => {
    const rows = [c('b', hoursAgo(9)), c('a', null), c('c', hoursAgo(30))];
    expect(selectStale(rows, NOW, OPTS)).toEqual(selectStale(rows, NOW, OPTS));
  });
});

describe('the production backlog it was built for', () => {
  /**
   * The real shape, measured 2026-08-31. Postgres computed the expected answer
   * independently of this code:
   *
   *   connections=29  never_synced=4  due_at_6h=29  fresh=0
   *
   * Every single connected student repository was overdue for a re-read, and four had
   * never been read at all. Ids are anonymised; the timestamp distribution is real.
   */
  const PROD: RefreshCandidate[] = [
    ...Array.from({ length: 4 }, (_, i) => c('never' + i, null)),
    // Oldest cluster: April and May, four months untouched.
    ...Array.from({ length: 7 }, (_, i) => c('ancient' + i, hoursAgo(24 * (100 + i * 5)))),
    // The bulk: mid-to-late August, days rather than months.
    ...Array.from({ length: 18 }, (_, i) => c('recent' + i, hoursAgo(13 + i * 12))),
  ];

  it('finds all 29 due, matching what Postgres computed', () => {
    expect(PROD).toHaveLength(29);
    expect(selectStale(PROD, NOW, { maxAgeHours: 6, limit: 100 })).toHaveLength(29);
  });

  it('clears the whole backlog in two sweeps at the default batch size', () => {
    // 29 due against a cap of 25 is the real first-run case. What matters is that the
    // leftover 4 are picked up next time rather than starving behind the same head.
    const first = ids(selectStale(PROD, NOW, { maxAgeHours: 6, limit: 25 }));
    expect(first).toHaveLength(25);
    expect(first.slice(0, 4).every((id) => id.startsWith('never'))).toBe(true);

    const afterFirst = PROD.map((r) => (first.includes(r.connectionId) ? c(r.connectionId, NOW) : r));
    const second = ids(selectStale(afterFirst, NOW, { maxAgeHours: 6, limit: 25 }));

    expect(second).toHaveLength(4);
    expect(second.some((id) => first.includes(id))).toBe(false);
    expect(selectStale(
      afterFirst.map((r) => (second.includes(r.connectionId) ? c(r.connectionId, NOW) : r)),
      NOW, { maxAgeHours: 6, limit: 25 },
    )).toEqual([]);
  });
});
