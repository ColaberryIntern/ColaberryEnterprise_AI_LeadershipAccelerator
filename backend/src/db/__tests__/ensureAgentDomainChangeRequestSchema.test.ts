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

/** Queue the three reads `assert` performs, in the order it performs them. */
function stageAssert(opts: { tables?: string[]; columns?: string[]; indexes?: string[] } = {}) {
  mockQuery
    .mockResolvedValueOnce((opts.tables ?? [TABLE]).map((table_name) => ({ table_name })))
    .mockResolvedValueOnce((opts.columns ?? [...REQUIRED_COLUMNS]).map((ref) => ({ ref })))
    .mockResolvedValueOnce((opts.indexes ?? [...REQUIRED_INDEXES]).map((indexname) => ({ indexname })));
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
    // Four statements, then the three assert reads.
    mockQuery
      .mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
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

  it('CONTAINS NO ALTER, DROP OR UPDATE in the statements it runs at boot', async () => {
    // This is the whole safety argument for calling it PROCEED-tier rather than escalating: it
    // adds a table and touches nothing that already exists. ROLLBACK_STATEMENTS holds the only
    // DROP, and nothing calls it at boot.
    const statementBlock = source.slice(
      source.indexOf('const STATEMENTS'),
      source.indexOf('ROLLBACK_STATEMENTS'),
    );
    expect(statementBlock).not.toMatch(/\bALTER\b|\bDROP\b|\bUPDATE\b|\bDELETE\b/i);
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

  it('offers a rollback that drops only its own table', async () => {
    expect(ROLLBACK_STATEMENTS).toEqual(['DROP TABLE IF EXISTS agent_domain_change_requests']);
    expect(REQUIRED_TABLES).toEqual([TABLE]);
  });
});
