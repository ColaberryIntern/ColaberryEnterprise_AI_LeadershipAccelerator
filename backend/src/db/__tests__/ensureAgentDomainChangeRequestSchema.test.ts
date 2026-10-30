/**
 * AF4.2 schema — the `ensure` / `assert` / `guarded` trio, exercised rather than grepped.
 *
 * The property that matters most here is one a mocked test normally cannot see: **`ensure` alone
 * cannot fail.** `CREATE TABLE IF NOT EXISTS` is a no-op on an existing table and every statement
 * error is warned rather than raised, so the function resolves identically whether the DDL worked
 * or did nothing whatsoever. A schema fix once shipped "green" on exactly that and stayed broken in
 * production for a day.
 *
 * So `assert` is the part that decides, and these tests drive its failure path directly instead of
 * reading the source and trusting it.
 */

const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a) },
}));

import {
  CHANGE_REQUEST_KINDS,
  REQUIRED_COLUMNS,
  REQUIRED_INDEXES,
  REQUIRED_TABLES,
  ROLLBACK_STATEMENTS,
  assertAgentDomainChangeRequestSchema,
  ensureAgentDomainChangeRequestSchema,
  ensureAgentDomainChangeRequestSchemaGuarded,
} from '../ensureAgentDomainChangeRequestSchema';

let warn: jest.SpyInstance;

beforeEach(() => {
  mockQuery.mockReset();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const TABLE = 'agent_domain_change_requests';

/**
 * Queue the three reads `assert` performs, in the order it performs them.
 *
 * ROWS ARE RAW ARRAYS, because that is what this driver returns for a SINGLE-COLUMN select. The
 * first version of this helper staged them as `{ table_name: '...' }` objects, and that is exactly
 * why a broken assert shipped: `rows.map(r => r.table_name)` works beautifully against a mock that
 * invents objects and yields `undefined` against the real thing. In production it reported
 * `missing table agent_domain_change_requests` with the table present and correct.
 *
 * **A mock that returns a shape the real driver does not produce tests the mock.**
 */
function stageAssert(opts: { tables?: string[]; columns?: string[]; indexes?: string[] } = {}) {
  const rowsOf = (names: string[]) => names.map((n) => [n]);
  // DISPATCH ON THE SQL, not on call order. An earlier version queued three `mockResolvedValueOnce`
  // in sequence, which silently broke the moment AF7.1 added a DDL statement: the extra statement
  // ate the first queued answer and the assert read columns where it expected tables. Keying on
  // what the query asks for cannot drift when a statement is added or reordered.
  mockQuery.mockImplementation((sql: unknown) => {
    const s = String(sql);
    if (s.includes('information_schema.tables')) return Promise.resolve(rowsOf(opts.tables ?? [TABLE]));
    if (s.includes('information_schema.columns')) return Promise.resolve(rowsOf(opts.columns ?? [...REQUIRED_COLUMNS]));
    if (s.includes('pg_indexes')) return Promise.resolve(rowsOf(opts.indexes ?? [...REQUIRED_INDEXES]));
    return Promise.resolve([]); // the DDL statements
  });
}

function lastWarning(): Record<string, unknown> | null {
  for (let i = warn.mock.calls.length - 1; i >= 0; i -= 1) {
    const arg = warn.mock.calls[i][0];
    if (typeof arg === 'string') {
      try { return JSON.parse(arg) as Record<string, unknown>; } catch { /* not ours */ }
    }
  }
  return null;
}

describe('ensure', () => {
  it('issues every statement', async () => {
    mockQuery.mockResolvedValue([]);
    await ensureAgentDomainChangeRequestSchema();
    expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('WARNS AND CONTINUES when a statement fails, which is why assert has to exist', async () => {
    mockQuery.mockRejectedValue(new TypeError('permission denied'));
    await expect(ensureAgentDomainChangeRequestSchema()).resolves.toBeUndefined();
    const w = lastWarning();
    expect(w?.event).toBe('agent_domain_change_request_schema_statement_failed');
    // A stable error_class, not the generic 'Error' that CLAUDE.md forbids in a production path.
    expect(w?.error_class).toBe('TypeError');
  });

  it('keeps going after one statement fails rather than abandoning the rest', async () => {
    mockQuery
      .mockRejectedValueOnce(new Error('first one failed'))
      .mockResolvedValue([]);
    await ensureAgentDomainChangeRequestSchema();
    expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});

describe('THE PRODUCTION REGRESSION: the query shape has to match the real driver', () => {
  // This whole block exists because the first version shipped, the DDL worked perfectly, and the
  // assert still reported a missing table against one that was present in production with all 12
  // columns and all 4 indexes. Two separate mistakes, either of which alone was enough.

  it('reads rows as RAW ARRAYS, the shape a single-column select really returns', async () => {
    stageAssert(); // raw arrays
    await expect(assertAgentDomainChangeRequestSchema()).resolves.toBeUndefined();
  });

  it('also copes with object rows, so the normalizer is doing the work and not a lucky shape', async () => {
    mockQuery
      .mockResolvedValueOnce([{ table_name: TABLE }])
      .mockResolvedValueOnce(REQUIRED_COLUMNS.map((ref) => ({ ref })))
      .mockResolvedValueOnce(REQUIRED_INDEXES.map((indexname) => ({ indexname })));
    await expect(assertAgentDomainChangeRequestSchema()).resolves.toBeUndefined();
  });

  it('binds by NAME, never positionally — $1 with a nested array matched nothing', async () => {
    stageAssert();
    await assertAgentDomainChangeRequestSchema();
    for (const call of mockQuery.mock.calls) {
      const [sql, opts] = call as [string, { bind?: unknown }];
      expect(sql).toContain('ANY($names)');
      expect(sql).not.toContain('ANY($1)');
      // An object bind, not an array: `bind: [[...]]` is the exact shape that failed.
      expect(Array.isArray(opts.bind)).toBe(false);
      expect(opts.bind).toHaveProperty('names');
    }
  });

  it('reuses the sibling normalizer rather than reimplementing it', async () => {
    const source: string = jest.requireActual('fs')
      .readFileSync(require.resolve('../ensureAgentDomainChangeRequestSchema'), 'utf8');
    expect(source).toMatch(/import\s*\{\s*normalizeNameRows\s*\}\s*from\s*'\.\/ensureAgentDomainProjectSchema'/);
    // A local copy would drift from the shape the driver actually returns, which is the whole bug.
    expect(source).not.toMatch(/function normalizeNameRows/);
  });
});

describe('assert — the part that actually decides', () => {
  it('resolves when the table, every column and every index are present', async () => {
    stageAssert();
    await expect(assertAgentDomainChangeRequestSchema()).resolves.toBeUndefined();
  });

  it('THROWS when the table is missing, rather than warning', async () => {
    stageAssert({ tables: [] });
    await expect(assertAgentDomainChangeRequestSchema())
      .rejects.toThrow(/SchemaInvariantViolation.*missing table agent_domain_change_requests/);
  });

  it('throws when a column is missing — the case a mocked unit test cannot otherwise see', async () => {
    stageAssert({ columns: REQUIRED_COLUMNS.filter((c) => !c.endsWith('.approved_at')) });
    await expect(assertAgentDomainChangeRequestSchema())
      .rejects.toThrow(/missing column agent_domain_change_requests\.approved_at/);
  });

  it('throws when an index is missing', async () => {
    stageAssert({ indexes: ['idx_adcr_status'] });
    await expect(assertAgentDomainChangeRequestSchema())
      .rejects.toThrow(/missing index idx_adcr_(domain_key|requested_by)/);
  });

  it('does not list ten missing columns when the table itself never arrived', async () => {
    // Ten lines of noise would bury the one finding that matters.
    stageAssert({ tables: [] });
    await expect(assertAgentDomainChangeRequestSchema()).rejects.toThrow(
      /SchemaInvariantViolation: missing table agent_domain_change_requests$/,
    );
  });
});

describe('the boot guard cannot reject, so server.ts can await it bare', () => {
  it.each([
    ['an Error', new RangeError('nope'), 'RangeError'],
    ['a string', 'just a string', 'UnknownError'],
    ['null', null, 'UnknownError'],
    ['undefined', undefined, 'UnknownError'],
  ])('resolves ok:false for %s', async (_label, thrown, expectedClass) => {
    mockQuery.mockReset();
    // Statements warn; the assert read is what throws, and the guard has to absorb it.
    mockQuery.mockResolvedValue([]).mockImplementationOnce(() => Promise.reject(thrown));
    mockQuery.mockImplementation(() => Promise.reject(thrown));
    const result = await ensureAgentDomainChangeRequestSchemaGuarded();
    expect(result.ok).toBe(false);
    expect(result.error_class).toBe(expectedClass);
  });

  it('reports ok:true when the schema is sound', async () => {
    mockQuery.mockReset();
    // stageAssert dispatches on the SQL, so the DDL statements answer `[]` and the three reads
    // answer correctly no matter how many statements run before them.
    stageAssert();
    await expect(ensureAgentDomainChangeRequestSchemaGuarded()).resolves.toEqual({ ok: true });
  });
});

describe('idempotency and blast radius, asserted on the SQL itself', () => {
  // The statements are a private const, so this reads them the way the DDL will actually run.
  const source: string = jest.requireActual('fs')
    .readFileSync(require.resolve('../ensureAgentDomainChangeRequestSchema'), 'utf8');

  it('every CREATE is IF NOT EXISTS, so a second boot is a no-op', async () => {
    const creates = source.match(/CREATE (?:TABLE|INDEX)[^`]*?\(/g) ?? [];
    expect(creates.length).toBeGreaterThanOrEqual(4);
    for (const c of creates) expect(c).toMatch(/IF NOT EXISTS/);
  });

  /**
   * NARROWED, DELIBERATELY, in AF7.1 — and the narrowing is the point.
   *
   * This started as "no ALTER at all", which was right while the file only ever created a table.
   * AF7.1 adds a `kind` column to a table that already exists in production, so an ALTER is
   * unavoidable. Deleting the assertion would have been the easy move and would have thrown away
   * the guarantee; instead it now bans the ALTERs that can destroy or lock, and permits exactly
   * one additive form.
   *
   * `ADD COLUMN IF NOT EXISTS ... NOT NULL DEFAULT` is safe here specifically because Postgres
   * applies the default to existing rows without rewriting the table, so there is no migration
   * window and no backfill. `DROP COLUMN`, `ALTER TYPE` and `SET NOT NULL` on an existing nullable
   * column are all different propositions and all still refused.
   */
  it('runs NO destructive statement at boot, and only ONE additive ALTER form', async () => {
    // COMMENTS STRIPPED FIRST. The block's own prose explains which ALTERs are banned, and names
    // them to do so - so an un-stripped assertion matches the explanation rather than the SQL and
    // fails on correct code. Exactly the trap `agentChangeRequestNoTrigger.test.ts` documents.
    const statementBlock = source
      .slice(source.indexOf('const STATEMENTS'), source.indexOf('ROLLBACK_STATEMENTS'))
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    // Never, under any circumstances, at boot.
    expect(statementBlock).not.toMatch(/\bDROP\b|\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b/i);
    expect(statementBlock).not.toMatch(/ALTER\s+TABLE[\s\S]*?\bDROP\s+COLUMN\b/i);
    expect(statementBlock).not.toMatch(/ALTER\s+TABLE[\s\S]*?\bALTER\s+COLUMN\b/i);
    expect(statementBlock).not.toMatch(/\bSET\s+NOT\s+NULL\b/i);
    // Every ALTER that IS present must be the one permitted additive shape.
    const alters = statementBlock.match(/ALTER\s+TABLE[^`]*/gi) ?? [];
    expect(alters.length).toBeGreaterThan(0); // positive control: there is one to check
    for (const a of alters) expect(a).toMatch(/ADD COLUMN IF NOT EXISTS/i);
  });

  it('constrains the approver and the timestamp to move together', async () => {
    // An approver with no timestamp, or a timestamp with no approver, is the half-written
    // governance record this ticket exists to prevent. The acceptance criterion is that an
    // approved CR names BOTH, so the pair is the unit.
    expect(source).toMatch(/CHECK\s*\(\s*\(approved_by_identity IS NULL\) = \(approved_at IS NULL\)/);
  });

  it('makes a proposer-less row impossible rather than merely refused', async () => {
    expect(source).toMatch(/requested_by_identity TEXT NOT NULL/);
  });

  it('AF7.1: `kind` defaults to change, so rows written before it keep their meaning', async () => {
    // No backfill, no migration window. A row that predates the column reads as `change`, which
    // is exactly what it was.
    expect(source).toMatch(/ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'change'/);
    expect(CHANGE_REQUEST_KINDS).toEqual(['change', 'tool']);
  });

  it('asserts the new column and its index, so a half-applied ALTER is caught', async () => {
    // The ALTER cannot fail loudly (every statement error is warned), so the post-condition is
    // the only thing that would notice it had not run.
    expect(REQUIRED_COLUMNS).toContain('agent_domain_change_requests.kind');
    expect(REQUIRED_INDEXES).toContain('idx_adcr_kind');
  });

  it('THROWS when kind is missing, the case this whole ALTER could fail silently on', async () => {
    stageAssert({ columns: REQUIRED_COLUMNS.filter((c) => !c.endsWith('.kind')) });
    await expect(assertAgentDomainChangeRequestSchema())
      .rejects.toThrow(/missing column agent_domain_change_requests\.kind/);
  });

  it('offers a rollback that drops only its own table', async () => {
    expect(ROLLBACK_STATEMENTS).toEqual(['DROP TABLE IF EXISTS agent_domain_change_requests']);
    expect(REQUIRED_TABLES).toEqual([TABLE]);
  });
});
