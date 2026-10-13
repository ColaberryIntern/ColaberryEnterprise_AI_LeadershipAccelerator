/**
 * T207 AC1 — "a dry run writes nothing, proved by before/after counts".
 *
 * The script already PRINTS before/after counts, but printing two equal numbers
 * is not a proof: a dry run that issued an UPDATE and re-counted would print
 * two DIFFERENT numbers and still exit 0, and a dry run whose counts were read
 * from a stale snapshot would print two equal ones while having written. So the
 * assertion here is on the statements that reach the database, with the printed
 * counts as corroboration rather than as the evidence.
 *
 * This is the test the module was restructured for: `confirm` used to be a
 * module-level `process.argv.includes(...)`, which made the committing path
 * unreachable from a test and left AC1 resting on prose.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { QueryTypes } from 'sequelize';

const query = jest.fn();
const close = jest.fn();

jest.mock('../../config/database', () => ({ sequelize: { query, close } }));

// eslint-disable-next-line @typescript-eslint/no-var-requires -- after jest.mock
const {
  runForward, runInverse, parseLedger, rowsAffected,
} = require('../backfillFreeAccountCoherence');

const COUNTS = { shape_a: '2', shape_b: '1', coherent_free: '0', total: '3' };

/** One Shape A row the predicate writes, one org row it must not. */
const ROWS = [
  {
    id: 'shape-a', email: 'learner@example.com', status: 'active',
    tier: 'member', enrollment_type: 'explorer', payment_status: 'pending',
    amount_paid: 0, subscription_status: null, is_org_member: false,
    community_role: null, mgmt_role: null, lead_source: null,
    lead_form_type: null, cohort_name: null, explorer_entered_at: null,
  },
  {
    id: 'org-row', email: 'teammate@acme.com', status: 'active',
    tier: 'guest', enrollment_type: 'standard', payment_status: 'pending',
    amount_paid: 0, subscription_status: null, is_org_member: true,
    community_role: null, mgmt_role: null, lead_source: 'free_signup',
    lead_form_type: 'free_signup', cohort_name: null, explorer_entered_at: null,
  },
];

beforeEach(() => {
  query.mockReset();
  close.mockReset();
  query.mockImplementation((sql: string, opts?: { type?: unknown }) => {
    // THE DRIVER'S REAL SHAPE. This used to resolve `[[], 1]` — second element a
    // NUMBER — which is not what node-postgres returns for an UPDATE. It returns
    // the Result OBJECT. That difference is the whole reason the 2026-10-13
    // production run printed `committed NaN of 56`: `Number({})` is NaN, while
    // `Number(1)` under this mock was 1, so every test passed. A mock that is
    // kinder than the driver hides exactly the bug it is standing in for.
    if (/^\s*UPDATE/i.test(sql)) return Promise.resolve([[], { rowCount: 1 }]);
    if (sql.includes('FILTER (WHERE')) return Promise.resolve([COUNTS]);
    if (opts?.type === QueryTypes.SELECT) return Promise.resolve(ROWS);
    return Promise.resolve([[], 0]);
  });
});

const updates = (): string[] => query.mock.calls
  .map((c) => String(c[0]))
  .filter((sql) => /^\s*UPDATE/i.test(sql));

describe('T207 AC1 — dry run is the default and it writes nothing', () => {
  it('issues no UPDATE when confirm is false', async () => {
    await runForward({ confirm: false });
    expect(updates()).toEqual([]);
  });

  it('still reads, so the empty UPDATE list is not an empty run', async () => {
    // The control: without this, "no UPDATEs" would also pass if the script had
    // crashed before touching the database at all.
    await runForward({ confirm: false });
    expect(query).toHaveBeenCalled();
    expect(query.mock.calls.some((c) => String(c[0]).includes('FROM enrollments e'))).toBe(true);
  });

  it('plans the write it is declining to make', async () => {
    const ledger = await runForward({ confirm: false });
    expect(ledger).toEqual([{ id: 'shape-a', column: 'tier', from: 'member', to: 'guest' }]);
  });
});

describe('T207 — the committing path, so the dry-run proof has a counterpart', () => {
  it('issues exactly one pinned UPDATE per ledger entry when confirmed', async () => {
    await runForward({ confirm: true });
    const sent = updates();
    expect(sent).toHaveLength(1);
    // Pinned to the value that was read: a row changed underneath us is skipped,
    // not overwritten with a decision made about a different value.
    expect(sent[0]).toContain('UPDATE enrollments SET tier = :to WHERE id = :id AND tier = :from');
  });

  it('never issues an UPDATE for an excluded row', async () => {
    await runForward({ confirm: true });
    const replacements = query.mock.calls
      .filter((c) => /^\s*UPDATE/i.test(String(c[0])))
      .map((c) => (c[1] as { replacements: { id: string } }).replacements.id);
    expect(replacements).toEqual(['shape-a']);
    expect(replacements).not.toContain('org-row');
  });
});

/**
 * AC8 — the ROLLBACK PATH, which attempt 1 left entirely untested.
 *
 * Attempt 1 tested `planInverse`, the pure inversion, and mistook that for
 * testing the inverse. An independent verifier replaced the whole body of
 * `runInverse` with `return []` and all 33 tests still passed: the function an
 * operator actually invokes under pressure — carrying its OWN separate copy of
 * the dry-run gate, and the only other code path that issues
 * `UPDATE enrollments` — could be deleted without a single test noticing. That
 * is the "would pass with the production code deleted" failure mode applied to
 * a whole function, and it is why these tests exist.
 */
describe('T207 AC8 — runInverse, the path an operator actually runs', () => {
  const FORWARD = [
    { id: 'row-a', column: 'tier', from: 'member', to: 'guest' },
    { id: 'row-b', column: 'enrollment_type', from: 'standard', to: 'explorer' },
  ];
  let ledgerPath: string;

  beforeEach(() => {
    ledgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 't207-')), 'ledger.json');
    fs.writeFileSync(ledgerPath, JSON.stringify(FORWARD));
  });

  it('issues no UPDATE when confirm is false', async () => {
    // runInverse has its own dry-run gate, separate from runForward's. Disabling
    // only this one is the mutation that survived attempt 1.
    await runInverse(ledgerPath, { confirm: false });
    expect(updates()).toEqual([]);
  });

  it('still reads when declining to revert, so the empty list is not an empty run', async () => {
    await runInverse(ledgerPath, { confirm: false });
    expect(query.mock.calls.some((c) => String(c[0]).includes('FILTER (WHERE'))).toBe(true);
  });

  it('reverts every entry with from and to swapped when confirmed', async () => {
    await runInverse(ledgerPath, { confirm: true });
    const sent = query.mock.calls.filter((c) => /^\s*UPDATE/i.test(String(c[0])));
    expect(sent).toHaveLength(2);
    expect(sent.map((c) => (c[1] as { replacements: Record<string, string> }).replacements))
      .toEqual([
        // from/to inverted against FORWARD: the ledger is the only thing that
        // knows which rows the sweep touched.
        { id: 'row-a', from: 'guest', to: 'member' },
        { id: 'row-b', from: 'explorer', to: 'standard' },
      ]);
  });

  it('pins each revert to the value the forward run wrote', async () => {
    await runInverse(ledgerPath, { confirm: true });
    expect(String(query.mock.calls.filter((c) => /^\s*UPDATE/i.test(String(c[0])))[0][0]))
      .toContain('UPDATE enrollments SET tier = :to WHERE id = :id AND tier = :from');
  });

  /**
   * Asserts the SEAM, not the validator.
   *
   * A verifier found that reverting the single line `parseLedger(readFileSync(...))`
   * back to `JSON.parse(...) as LedgerEntry[]` — unwiring the security fix and
   * reopening the SQL-identifier injection — left the whole suite green, because
   * every other test in this describe feeds `runInverse` a VALID ledger.
   * `parseLedger` being proven load-bearing in isolation says nothing about
   * whether this function calls it.
   */
  it('refuses a hostile ledger before any statement reaches the database', async () => {
    fs.writeFileSync(ledgerPath, JSON.stringify([
      { id: 'x', column: "tier = 'member', payment_status", from: 'a', to: 'b' },
    ]));
    await expect(runInverse(ledgerPath, { confirm: true })).rejects.toThrow(/column must be/);
    expect(updates()).toEqual([]);
  });
});

describe('T207 — the ledger is untrusted input on a path that writes to production', () => {
  /**
   * `entry.column` is interpolated into the identifier position of
   * `UPDATE enrollments SET ${entry.column} = ...`, which bound parameters
   * cannot cover. The file sits in /tmp on a production box and may be
   * hand-edited between the forward run and the rollback.
   */
  it('rejects a column outside the two it is allowed to write', () => {
    const hostile = JSON.stringify([
      { id: 'x', column: 'payment_status', from: 'pending', to: 'paid' },
    ]);
    expect(() => parseLedger(hostile)).toThrow(/column must be 'tier' or 'enrollment_type'/);
  });

  it('rejects a column carrying SQL rather than a column name', () => {
    const hostile = JSON.stringify([
      { id: 'x', column: "tier = 'member', payment_status", from: 'a', to: 'b' },
    ]);
    expect(() => parseLedger(hostile)).toThrow(/column must be/);
  });

  it('names the offending index rather than skipping the entry', () => {
    // A rollback that silently dropped a bad entry would under-revert and still
    // report success.
    const mixed = JSON.stringify([
      { id: 'ok', column: 'tier', from: 'member', to: 'guest' },
      { id: 'bad', column: 'tier', from: 'member', to: 7 },
    ]);
    expect(() => parseLedger(mixed)).toThrow(/ledger\[1\]/);
  });

  it('rejects a non-array and a missing id', () => {
    expect(() => parseLedger('{"id":"x"}')).toThrow(/must be a JSON array/);
    expect(() => parseLedger(JSON.stringify([{ column: 'tier', from: 'a', to: 'b' }])))
      .toThrow(/id must be a non-empty string/);
  });

  it('accepts exactly what the forward run emits', () => {
    // The control: without this, every assertion above would also pass if
    // parseLedger rejected everything.
    const good = [{ id: 'row-a', column: 'tier' as const, from: 'member', to: 'guest' }];
    expect(parseLedger(JSON.stringify(good))).toEqual(good);
  });
});

/**
 * THE `committed NaN of 56` DEFECT, found by running this script against
 * production on 2026-10-13. All 56 rows were written; the script could not say
 * so. On a production data-repair tool, "what did you just change" is most of
 * the value, and a count of `NaN` is indistinguishable from a count of nothing.
 *
 * Nothing here would have caught it before, for two separate reasons, and both
 * are worth stating because either alone was sufficient: the mock resolved
 * UPDATEs with a NUMBER where the driver returns an OBJECT, and no test
 * asserted the reported count in the first place.
 */
describe('the committed count is readable, which it was not in production', () => {
  it('reads node-postgres result objects', () => {
    expect(rowsAffected({ rowCount: 1 })).toBe(1);
    expect(rowsAffected({ rowCount: 56 })).toBe(56);
    // A genuine zero is a real answer and must not be confused with "unknown".
    expect(rowsAffected({ rowCount: 0 })).toBe(0);
  });

  it('REPRODUCES the production shape that produced NaN, and refuses to guess', () => {
    // The exact value the old code did `Number(...)` on: a Result object with no
    // rowCount. `Number({})` is NaN; null means "could not tell", which the
    // caller reports out loud instead of printing a number.
    expect(rowsAffected({})).toBeNull();
    expect(rowsAffected(undefined)).toBeNull();
    expect(rowsAffected(null)).toBeNull();
    expect(rowsAffected({ rowCount: 'four' })).toBeNull();
    expect(rowsAffected({ rowCount: NaN })).toBeNull();
  });

  it('still accepts a bare number, so a dialect that returns one is not lost', () => {
    expect(rowsAffected(3)).toBe(3);
  });

  it('reports the real count on a committing run', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runForward({ confirm: true });
      const out = log.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(out).toContain('committed 1 of 1');
      // The regression itself. Without this the suite would pass again the day
      // somebody reintroduces Number() on the metadata object.
      expect(out).not.toContain('NaN');
      expect(out).not.toContain('WARNING');
    } finally {
      log.mockRestore();
    }
  });

  it('says so LOUDLY when the driver returns no readable count', async () => {
    query.mockImplementation((sql: string, opts?: { type?: unknown }) => {
      if (/^\s*UPDATE/i.test(sql)) return Promise.resolve([[], {}]);
      if (sql.includes('FILTER (WHERE')) return Promise.resolve([COUNTS]);
      if (opts?.type === QueryTypes.SELECT) return Promise.resolve(ROWS);
      return Promise.resolve([[], 0]);
    });
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runForward({ confirm: true });
      const out = log.mock.calls.map((c) => c.join(' ')).join('\n');
      // Under-reporting is the failure mode here, so it must not be silent.
      expect(out).toContain('committed 0 of 1');
      expect(out).toContain('UNDERSTATES');
      expect(out).not.toContain('NaN');
    } finally {
      log.mockRestore();
    }
  });
});
