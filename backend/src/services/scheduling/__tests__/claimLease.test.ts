import { QueryTypes } from 'sequelize';

/**
 * These call the real functions.
 *
 * That is worth stating, because the tests this fix replaces did not. `schedulerConcurrency.test.ts`
 * builds the recovery predicate inside the test and asserts on its own object, and asserts that a
 * `claimSQL` string the test author wrote contains `FOR UPDATE SKIP LOCKED` while the production
 * file says in a comment that it does not. Both pass, and neither can fail for any change to the
 * code they name. So every test below drives `renewClaim`/`recoverStaleActions` and asserts on the
 * SQL they actually hand to the database.
 */

// Both mocks declare an explicit rest parameter. Without one, `query(...args)` below is a spread
// into a signature TypeScript cannot match (TS2556) and `tsconfig.test.json` rejects the file,
// even though ts-jest transpiles and runs it happily.
const query = jest.fn((..._args: unknown[]): any => undefined);
const transaction = jest.fn(async (...args: unknown[]): Promise<any> => (args[0] as any)('TX'));

jest.mock('../../../config/database', () => ({
  sequelize: {
    query: (...args: unknown[]) => query(...args),
    transaction: (...args: unknown[]) => transaction(...args),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  renewClaim, recoverStaleActions, STALE_AFTER_MS, recoveryLogLines,
} = require('../claimLease');

/** The SQL text of the nth call, whitespace collapsed so assertions survive reformatting. */
const sqlOf = (n: number) => String(query.mock.calls[n][0]).replace(/\s+/g, ' ').trim();
const optsOf = (n: number) => query.mock.calls[n][1] as any;

beforeEach(() => {
  query.mockReset();
  transaction.mockReset().mockImplementation(async (cb: any) => cb('TX'));
});

describe('renewClaim', () => {
  it('returns true and renews the lease when the row is still ours', async () => {
    query.mockResolvedValueOnce([{ id: 'a1' }]);

    await expect(renewClaim('a1', 'proc_7')).resolves.toBe(true);

    const sql = sqlOf(0);
    expect(sql).toContain("SET processing_started_at = NOW()");
    expect(optsOf(0).replacements).toEqual({ actionId: 'a1', processorId: 'proc_7' });
  });

  it('returns false when another processor owns the row', async () => {
    // Nothing updated is the signal: recovery released it and someone else re-claimed it.
    query.mockResolvedValueOnce([]);

    await expect(renewClaim('a1', 'proc_7')).resolves.toBe(false);
  });

  it('gates on BOTH processor_id and status, not just the id', async () => {
    // The whole defect was acting on a row we no longer owned, so a renewal keyed only on id
    // would reintroduce it while still passing a naive test.
    query.mockResolvedValueOnce([{ id: 'a1' }]);
    await renewClaim('a1', 'proc_7');

    const sql = sqlOf(0);
    expect(sql).toContain('AND processor_id = :processorId');
    expect(sql).toContain("AND status = 'processing'");
  });

  it('renews with one atomic write rather than reading then writing', async () => {
    // A SELECT-then-act version would only narrow the race. One conditional UPDATE closes it.
    query.mockResolvedValueOnce([{ id: 'a1' }]);
    await renewClaim('a1', 'proc_7');

    expect(query).toHaveBeenCalledTimes(1);
    expect(sqlOf(0).startsWith('UPDATE scheduled_emails')).toBe(true);
    expect(sqlOf(0)).toContain('RETURNING id');
  });
});

describe('recoverStaleActions', () => {
  const twoRows = [{ id: 'x' }, { id: 'y' }];

  it('consumes an attempt on every recovered row', async () => {
    // This is the fix for the unbounded retry loop: without the increment, a row that hangs
    // every time keeps attempts_made at 0 and is recycled forever.
    query.mockResolvedValueOnce([]).mockResolvedValueOnce(twoRows);

    await recoverStaleActions();

    expect(sqlOf(0)).toContain('attempts_made = attempts_made + 1');
    expect(sqlOf(1)).toContain('attempts_made = attempts_made + 1');
  });

  it('fails a row that has no attempts left instead of requeueing it', async () => {
    query.mockResolvedValueOnce(twoRows).mockResolvedValueOnce([]);

    const out = await recoverStaleActions();

    expect(sqlOf(0)).toContain("SET status = 'failed'");
    expect(sqlOf(0)).toContain('AND attempts_made + 1 >= max_attempts');
    expect(out.exhausted).toBe(2);
    expect(out.requeued).toBe(0);
  });

  it('requeues only rows that still have an attempt left', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce(twoRows);

    const out = await recoverStaleActions();

    expect(sqlOf(1)).toContain("SET status = 'pending'");
    expect(sqlOf(1)).toContain('AND attempts_made + 1 < max_attempts');
    expect(out.requeued).toBe(2);
  });

  it('uses disjoint predicates so no row is both failed and requeued', async () => {
    query.mockResolvedValueOnce([{ id: 'x' }]).mockResolvedValueOnce([{ id: 'y' }]);

    const out = await recoverStaleActions();

    expect(sqlOf(0)).toContain('>= max_attempts');
    expect(sqlOf(1)).toContain('< max_attempts');
    // The first statement is the exhausting one, the second the requeueing one, and the two ids
    // land in different fields. Asserting them separately is what makes the predicates' disjointness
    // visible: a row cannot appear in both lists.
    expect(out.exhaustedIds).toEqual(['x']);
    expect(out.requeuedIds).toEqual(['y']);
  });

  it('clears the owner so the dead processor cannot renew its lease', async () => {
    // If processor_id survived recovery, the original batch's renewClaim would succeed and we
    // would be back to two processors holding the same row.
    query.mockResolvedValueOnce([]).mockResolvedValueOnce(twoRows);

    await recoverStaleActions();

    expect(sqlOf(1)).toContain('processor_id = NULL');
    expect(sqlOf(1)).toContain('processing_started_at = NULL');
  });

  it('returns the ids it touched SEPARATELY, so recycled and killed rows are distinguishable', async () => {
    query.mockResolvedValueOnce([{ id: 'dead' }]).mockResolvedValueOnce([{ id: 'back' }]);

    const out = await recoverStaleActions();

    // A count alone cannot answer "which row was recycled" when a lead reports a duplicate.
    //
    // Neither could the merged `ids` array this replaced, which is why it changed in L7.3. It
    // returned ['dead', 'back'] with nothing marking where the exhausted ids stopped and the
    // requeued ids began, so the caller logged a list that could not be read back. The original
    // intent of this test is preserved and now actually achievable: 'back' will be tried again,
    // 'dead' never will, and the two must not be confusable.
    expect(out.exhaustedIds).toEqual(['dead']);
    expect(out.requeuedIds).toEqual(['back']);
    expect(out.exhausted).toBe(1);
    expect(out.requeued).toBe(1);
  });

  it('runs both statements inside one transaction', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await recoverStaleActions();

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(optsOf(0).transaction).toBe('TX');
    expect(optsOf(1).transaction).toBe('TX');
  });

  it('measures staleness from the clock it is given', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const now = 1_800_000_000_000;

    await recoverStaleActions(now);

    const cutoff: Date = optsOf(0).replacements.staleThreshold;
    expect(cutoff.getTime()).toBe(now - STALE_AFTER_MS);
  });

  it('only ever touches rows in processing', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await recoverStaleActions();

    expect(sqlOf(0)).toContain("WHERE status = 'processing'");
    expect(sqlOf(1)).toContain("WHERE status = 'processing'");
  });

  it('asks the database for rows rather than relying on a Sequelize mock returning a count', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await recoverStaleActions();

    expect(optsOf(0).type).toBe(QueryTypes.SELECT);
    expect(sqlOf(0)).toContain('RETURNING id');
    expect(sqlOf(1)).toContain('RETURNING id');
  });
});

/**
 * L7.3. The ticket's success metric, verbatim: "Every recovery path leaves a log line naming why
 * it retried. A silent recovery is an unmeasurable one."
 *
 * Recovery here is the crash path: a processor died holding rows, and this is what picks them up.
 * It already logged counts. It did not log a REASON, and its single merged id array could not say
 * which rows were recycled and which were killed, so the one question the log existed to answer
 * could not be answered from it.
 *
 * These assertions are on a pure function rather than on the scheduler, which is why they can be
 * specific. What they do NOT prove is that the scheduler calls it; that is one line in
 * `recoverStaleActions`, and the typecheck is what keeps it honest.
 */
describe('recoveryLogLines names why, and keeps the two outcomes apart', () => {
  const outcome = (over = {}) => ({
    requeued: 0, exhausted: 0, requeuedIds: [], exhaustedIds: [], ...over,
  });

  it('CONTROL emits nothing when nothing was recovered', () => {
    // A recovery line for a cycle that recovered nothing is noise, and noise is how a real one
    // gets missed. This also stops the rest of the suite passing by emitting lines unconditionally.
    expect(recoveryLogLines(outcome())).toEqual([]);
  });

  it('names a reason and a stable error class when a row is requeued', () => {
    const [line] = recoveryLogLines(outcome({ requeued: 1, requeuedIds: ['a'] }));
    expect(line.event).toBe('stale_action_requeued');
    expect(line.reason).toBe('lease_expired');
    expect(line.error_class).toBe('LeaseExpired');
    expect(line.outcome).toBe('partial');
    expect(line.ids).toEqual(['a']);
  });

  it('marks an exhausted row as a failure, because nothing will retry it', () => {
    const [line] = recoveryLogLines(outcome({ exhausted: 1, exhaustedIds: ['b'] }));
    expect(line.event).toBe('stale_action_exhausted');
    expect(line.outcome).toBe('failure');
    expect(line.ids).toEqual(['b']);
  });

  it('emits TWO lines when both happened, without mixing the ids', () => {
    // The defect this replaced: ['b', 'a'] in one array, with nothing marking the boundary.
    // Annotated because the module arrives through `require`, so `lines` would otherwise be
    // `any` and the callbacks below would be implicitly-any parameters that tsconfig.test.json
    // rejects.
    const lines: Array<{ event: string; ids: string[] }> = recoveryLogLines(outcome({
      requeued: 1, requeuedIds: ['a'], exhausted: 1, exhaustedIds: ['b'],
    }));
    expect(lines).toHaveLength(2);
    const requeue = lines.find((l) => l.event === 'stale_action_requeued')!;
    const exhaust = lines.find((l) => l.event === 'stale_action_exhausted')!;
    expect(requeue.ids).toEqual(['a']);
    expect(exhaust.ids).toEqual(['b']);
    expect(requeue.ids).not.toContain('b');
  });

  it('states the staleness bound in words a person can read, not only a code', () => {
    // "lease_expired" is for counting. The detail is for whoever is reading at 3am asking why a
    // row they did not touch changed status.
    const [line] = recoveryLogLines(outcome({ requeued: 1, requeuedIds: ['a'] }));
    expect(line.stale_after_ms).toBe(STALE_AFTER_MS);
    expect(line.detail).toContain(String(STALE_AFTER_MS));
    expect(line.detail).toMatch(/presumed dead/);
  });

  it('says of an exhausted row that it was NOT recycled, which is the consequence', () => {
    const [line] = recoveryLogLines(outcome({ exhausted: 1, exhaustedIds: ['b'] }));
    expect(line.detail).toMatch(/no attempts left/);
    expect(line.detail).toMatch(/failed rather than recycled/);
  });
});
