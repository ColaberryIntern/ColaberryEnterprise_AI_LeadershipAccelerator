import { sequelize } from '../../config/database';
import {
  backfillPageEventLeadId,
  parseArgs,
  extractRowCount,
  DEFAULTS,
} from '../backfillPageEventLeadId';

let queryMock: jest.SpyInstance;
let logSpy: jest.SpyInstance;

/**
 * Count queries return [{n}]. UPDATEs return what **Postgres actually returns**
 * through Sequelize: `[results, pgResultObject]`, where the row count lives on
 * `metadata.rowCount`.
 *
 * The original version of this helper resolved `[[], rows]` — a plain number in
 * the metadata slot. That shape does not exist for this dialect, so the suite
 * validated the author's assumption instead of the driver, and a production bug
 * sailed through 11 green tests. Keeping the realistic shape here is the point
 * of the fix, not an incidental detail.
 */
function mockDb(candidateCounts: number[], updatedPerBatch: number[]): void {
  let countIdx = 0;
  let batchIdx = 0;
  queryMock.mockImplementation((sql: string) => {
    if (/SELECT COUNT/i.test(sql)) {
      const n = candidateCounts[Math.min(countIdx, candidateCounts.length - 1)];
      countIdx++;
      return Promise.resolve([{ n }]);
    }
    const rows = updatedPerBatch[Math.min(batchIdx, updatedPerBatch.length - 1)] ?? 0;
    batchIdx++;
    // pg Result: rowCount on the metadata object, NOT a bare number.
    return Promise.resolve([[], { rowCount: rows, command: 'UPDATE' }]);
  });
}

const updateCalls = (): string[] =>
  queryMock.mock.calls.map((c) => String(c[0])).filter((s) => /^\s*UPDATE/i.test(s));

beforeEach(() => {
  queryMock = jest.spyOn(sequelize, 'query');
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  queryMock.mockRestore();
  logSpy.mockRestore();
});

describe('parseArgs', () => {
  it('defaults to a live run with 5000-row batches', () => {
    const o = parseArgs([]);
    expect(o).toEqual(DEFAULTS);
    expect(o.batchSize).toBe(5000);
    expect(o.dryRun).toBe(false);
  });

  it('reads --dry-run, --batch-size, --max-batches, --pause-ms', () => {
    const o = parseArgs(['--dry-run', '--batch-size', '250', '--max-batches', '3', '--pause-ms', '0']);
    expect(o).toEqual({ dryRun: true, batchSize: 250, maxBatches: 3, pauseMs: 0 });
  });

  it('ignores pathological batch/cap values rather than producing a runaway', () => {
    // `--batch-size 0` would make every batch update 0 rows and terminate
    // instantly; `--max-batches -1` would disable the backstop. Both fall back.
    const o = parseArgs(['--batch-size', '0', '--max-batches', '-1', '--pause-ms', 'abc']);
    expect(o.batchSize).toBe(DEFAULTS.batchSize);
    expect(o.maxBatches).toBe(DEFAULTS.maxBatches);
    expect(o.pauseMs).toBe(DEFAULTS.pauseMs);
  });

  it('honours --pause-ms 0, which is legitimate unlike a zero batch size', () => {
    // Caught by this suite on first run: a shared `> 0` guard silently rejected
    // "no pause" and fell back to 500ms, so an operator asking for a fast run on
    // a quiet database would have got a slow one with no indication why.
    expect(parseArgs(['--pause-ms', '0']).pauseMs).toBe(0);
  });
});

describe('extractRowCount — the shape that caused a production bug', () => {
  it('reads rowCount off the pg Result metadata (the real Postgres shape)', () => {
    expect(extractRowCount([[], { rowCount: 4200, command: 'UPDATE' }])).toBe(4200);
  });

  it('still handles a bare number in the metadata slot (other dialects)', () => {
    expect(extractRowCount([[], 17])).toBe(17);
  });

  it('handles affectedRows (mysql-style metadata)', () => {
    expect(extractRowCount([[], { affectedRows: 9 }])).toBe(9);
  });

  it('handles a bare number result', () => {
    expect(extractRowCount(7)).toBe(7);
  });

  it('returns 0 for shapes it genuinely cannot read, rather than guessing', () => {
    expect(extractRowCount(undefined)).toBe(0);
    expect(extractRowCount([[], {}])).toBe(0);
    expect(extractRowCount([[], null])).toBe(0);
  });

  it('never returns 0 for a real pg Result reporting work done', () => {
    // The exact regression: a pg Result with rowCount > 0 must never read as 0,
    // because the batch loop treats 0 as "nothing left to do" and stops.
    expect(extractRowCount([[], { rowCount: 1, command: 'UPDATE' }])).toBeGreaterThan(0);
  });
});

describe('backfillPageEventLeadId — dry run writes nothing', () => {
  it('issues zero UPDATE statements and reports the candidate count', async () => {
    mockDb([1234], []);
    const result = await backfillPageEventLeadId({ dryRun: true });

    expect(updateCalls()).toHaveLength(0);
    expect(result).toMatchObject({
      candidatesBefore: 1234,
      updated: 0,
      batches: 0,
      remaining: 1234,
      stoppedBecause: 'dry_run',
    });
  });
});

describe('backfillPageEventLeadId — batching and termination', () => {
  it('stops when a batch updates zero rows', async () => {
    // 3 productive batches then an empty one. The empty batch is the real
    // termination condition; maxBatches is only a backstop.
    mockDb([300, 0], [100, 100, 100, 0]);
    const result = await backfillPageEventLeadId({ pauseMs: 0 });

    expect(result.batches).toBe(4);
    expect(result.updated).toBe(300);
    expect(result.stoppedBecause).toBe('complete');
    expect(result.remaining).toBe(0);
  });

  it('respects --max-batches so it can never run unbounded', async () => {
    // A source that always returns a full batch would loop forever without the cap.
    mockDb([1_000_000, 999_000], [1000]);
    const result = await backfillPageEventLeadId({ maxBatches: 3, batchSize: 1000, pauseMs: 0 });

    expect(result.batches).toBe(3);
    expect(result.updated).toBe(3000);
    expect(result.stoppedBecause).toBe('max_batches');
  });

  it('passes the configured batch size to the query, bounding each transaction', async () => {
    mockDb([10, 0], [10, 0]);
    await backfillPageEventLeadId({ batchSize: 777, pauseMs: 0 });

    const call = queryMock.mock.calls.find((c) => /^\s*UPDATE/i.test(String(c[0])));
    expect((call?.[1] as { replacements?: { batchSize?: number } })?.replacements?.batchSize).toBe(777);
  });

  it('is idempotent — a completed backfill updates zero rows on re-run', async () => {
    mockDb([0, 0], [0]);
    const result = await backfillPageEventLeadId({ pauseMs: 0 });

    expect(result.updated).toBe(0);
    expect(result.remaining).toBe(0);
    expect(result.stoppedBecause).toBe('complete');
  });

  it('reports the true updated count for a multi-batch run', async () => {
    // The regression in one line: with the old extraction this asserted 0 and
    // batches===1 while the database had actually moved 300 rows.
    mockDb([300, 200, 100, 0], [100, 100, 100, 0]);
    const result = await backfillPageEventLeadId({ pauseMs: 0 });
    expect(result.updated).toBe(300);
    expect(result.batches).toBe(4);
  });

  it('flags a STALL instead of claiming complete when 0 rows move but work remains', async () => {
    // If the UPDATE reports nothing changed while candidates still exist, the
    // driver contract is wrong — which is precisely how the original bug hid.
    // It must surface as a failure signal, never as outcome:'complete'.
    mockDb([50, 50], [0]);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await backfillPageEventLeadId({ pauseMs: 0 });

    expect(result.stoppedBecause).toBe('stalled');
    expect(result.remaining).toBe(50);
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toContain('BackfillStalled');
    warn.mockRestore();
  });
});

describe('backfillPageEventLeadId — SQL safety', () => {
  it('only ever attributes rows that are currently unattributed', async () => {
    mockDb([5, 0], [5, 0]);
    await backfillPageEventLeadId({ pauseMs: 0 });

    const update = updateCalls()[0];
    // Without `pe2.lead_id IS NULL` a re-run would churn every row and could
    // reassign an event whose lead was already resolved.
    expect(update).toMatch(/pe2\.lead_id IS NULL/i);
    expect(update).toMatch(/vs\.lead_id IS NOT NULL/i);
    expect(update).toMatch(/LIMIT :batchSize/i);
  });

  it('never deletes or drops anything', async () => {
    mockDb([5, 0], [5, 0]);
    await backfillPageEventLeadId({ pauseMs: 0 });
    for (const sql of queryMock.mock.calls.map((c) => String(c[0]))) {
      expect(sql).not.toMatch(/\bDELETE\b/i);
      expect(sql).not.toMatch(/\bDROP\b/i);
      expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    }
  });
});
