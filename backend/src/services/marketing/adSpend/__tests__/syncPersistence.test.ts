import { recordSyncOutcome, type SyncResult } from '../metaSpendSync';

/**
 * ADS-9: the discard count reaches the database, not just a log line.
 *
 * The count has existed since 2026-11-13, when a run dropped 7 rows and $397.17 while reporting
 * success. It was never stored, so on 2026-11-15 - reconciling the ledger against Meta - the
 * first useful question ("how many rows did the last run refuse?") could not be answered from
 * the database at all.
 *
 * THE TEST THAT MATTERS IS THE NON-ZERO ONE. A test that only ever checks 0 cannot tell a real
 * field from a hardcoded zero, which is the same class of vacuous check that let the original
 * silent discarding ship.
 */
const result = (over: Partial<SyncResult> = {}): SyncResult => ({
  outcome: 'success',
  rowsWritten: 62,
  rowsSkipped: 0,
  rangeStart: '2026-10-17',
  rangeEnd: '2026-11-15',
  errorClass: null,
  error: null,
  ...over,
});

describe('recordSyncOutcome', () => {
  it('persists a NON-ZERO skipped count, exactly as reported', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    await recordSyncOutcome('41', result({ rowsWritten: 55, rowsSkipped: 7 }), write);

    const [sql, repl] = write.mock.calls[0];
    expect(sql).toMatch(/rows_skipped = :skipped/);
    // 7, not "truthy" and not "a number": a hardcoded 0 or a copied rowsWritten both fail here.
    expect(repl.skipped).toBe(7);
    expect(repl.rows).toBe(55);
    expect(repl.skipped).not.toBe(repl.rows);
  });

  it('records a clean run as 0 rather than leaving the column untouched', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    await recordSyncOutcome('42', result(), write);
    expect(write.mock.calls[0][1].skipped).toBe(0);
  });

  it('updates the row it was given, and only that row', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    await recordSyncOutcome('43', result(), write);
    const [sql, repl] = write.mock.calls[0];
    expect(sql).toMatch(/UPDATE marketing_spend_syncs/);
    expect(sql).toMatch(/WHERE id = :id/);
    expect(repl.id).toBe('43');
  });

  it('carries the outcome, the error class and the error through unchanged', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    await recordSyncOutcome('44', result({
      outcome: 'failure', rowsWritten: 0, rowsSkipped: 0,
      errorClass: 'RateLimitError', error: 'too many calls to this ad account',
    }), write);
    const repl = write.mock.calls[0][1];
    expect(repl.outcome).toBe('failure');
    expect(repl.errorClass).toBe('RateLimitError');
    expect(repl.error).toBe('too many calls to this ad account');
  });

  it('still records the count on a run that failed after skipping rows', async () => {
    // The worst case for the old behaviour: a failure that ALSO discarded rows lost both facts.
    const write = jest.fn().mockResolvedValue(undefined);
    await recordSyncOutcome('45', result({ outcome: 'failure', rowsWritten: 0, rowsSkipped: 3 }), write);
    expect(write.mock.calls[0][1].skipped).toBe(3);
  });

  it('lets a write failure surface rather than swallowing it', async () => {
    // This is the opposite call from the bug-report store, deliberately: there the write is a
    // safety net under a send that must not be blocked, here the write IS the record of the run.
    const write = jest.fn().mockRejectedValue(new Error('connection reset'));
    await expect(recordSyncOutcome('46', result(), write)).rejects.toThrow('connection reset');
  });
});
