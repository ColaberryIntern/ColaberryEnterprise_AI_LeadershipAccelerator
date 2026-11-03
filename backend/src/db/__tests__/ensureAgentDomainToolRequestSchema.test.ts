/**
 * AF11.1 schema — the `ensure` / `assert` / `guarded` trio, exercised rather than grepped.
 *
 * The property a mocked test normally cannot see is the one that matters: **`ensure` alone cannot
 * fail.** `CREATE TABLE IF NOT EXISTS` is a no-op on an existing table and every statement error is
 * warned rather than raised, so the function resolves identically whether the DDL worked or did
 * nothing whatsoever. A schema fix once shipped "green" on exactly that and stayed broken in
 * production for a day. So `assert` is the part that decides, and these tests drive its failure
 * path directly.
 *
 * This file's own distinct property, which the sibling cannot claim: **there is no `ALTER` here at
 * all.** The parent table's header calls its one `ALTER` "THE ONLY ALTER THIS FILE WILL EVER RUN";
 * eighteen columns of payload would have made that false, which is the reason this is a child
 * table. A test asserts the absence, because an absence is what a later edit silently removes.
 */

const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a) },
}));

import fs from 'fs';
import path from 'path';
import {
  REQUIRED_COLUMNS,
  REQUIRED_INDEXES,
  REQUIRED_TABLES,
  ROLLBACK_STATEMENTS,
  TOOL_RUN_FREQUENCIES,
  assertAgentDomainToolRequestSchema,
  ensureAgentDomainToolRequestSchema,
  ensureAgentDomainToolRequestSchemaGuarded,
} from '../ensureAgentDomainToolRequestSchema';

let warn: jest.SpyInstance;

beforeEach(() => {
  mockQuery.mockReset();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const TABLE = 'agent_domain_tool_request_details';
const CHECK = 'chk_adtr_write_declares_effects';

const SOURCE = path.join(__dirname, '..', 'ensureAgentDomainToolRequestSchema.ts');

/**
 * Answer each of `assert`'s reads BY THE SQL IT SENT, not by call order.
 *
 * Sequential `mockResolvedValueOnce` staging would silently break the moment an index is added to
 * `STATEMENTS`, because the guarded path runs `ensure` first and every DDL statement would eat one
 * staged answer. Then `assert` would read a DDL placeholder as its table list and the test would
 * fail for a reason that has nothing to do with the schema.
 *
 * Rows come back as RAW ARRAYS, which is the shape this driver really returns for a single-column
 * select. The sibling's first tests staged `{ table_name: '...' }` objects, a shape the driver
 * never produces here, and so could not see a real production failure: **a mock that returns a
 * shape the driver does not produce tests the mock.**
 */
function stageAssert(over: {
  tables?: string[];
  columns?: string[];
  indexes?: string[];
  checks?: string[];
} = {}): void {
  mockQuery.mockImplementation((sql: string) => {
    if (/information_schema\.tables/.test(sql)) {
      return Promise.resolve(over.tables ?? [...REQUIRED_TABLES]);
    }
    if (/information_schema\.columns/.test(sql)) {
      return Promise.resolve(over.columns ?? [...REQUIRED_COLUMNS]);
    }
    if (/pg_indexes/.test(sql)) return Promise.resolve(over.indexes ?? [...REQUIRED_INDEXES]);
    if (/table_constraints/.test(sql)) return Promise.resolve(over.checks ?? [CHECK]);
    // Every DDL statement, which `assert` never reads.
    return Promise.resolve([]);
  });
}

/**
 * The file's own SQL with comments stripped, so prose ABOUT sql is never read as sql.
 *
 * That is the lesson `bootSchemaCreatable.test.ts` records against itself: a draft of it matched a
 * `CREATE TABLE` inside a doc comment written that morning to document the table's ABSENCE, and
 * classified it as creatable. It read the description of a thing as the thing.
 */
function sourceSql(): string {
  return fs.readFileSync(SOURCE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

/**
 * Just the `CREATE TABLE` statement, ending where the first `CREATE INDEX` begins.
 *
 * Needed because the column names also appear in `REQUIRED_COLUMNS` a few lines above, so a sweep
 * over the whole file cannot tell a declaration from the list that asserts it.
 */
function createBlock(): string {
  const sql = sourceSql();
  const start = sql.indexOf('CREATE TABLE IF NOT EXISTS');
  const end = sql.indexOf('CREATE INDEX', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe('ensure', () => {
  it('issues every statement', async () => {
    mockQuery.mockResolvedValue([]);
    await ensureAgentDomainToolRequestSchema();
    expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('WARNS AND CONTINUES when a statement fails, which is why assert has to exist', async () => {
    mockQuery.mockRejectedValue(new TypeError('boom'));
    await expect(ensureAgentDomainToolRequestSchema()).resolves.toBeUndefined();
    const line = JSON.parse((warn.mock.calls[0] as string[])[0]);
    expect(line.event).toBe('agent_domain_tool_request_schema_statement_failed');
    expect(line.error_class).toBe('TypeError');
  });

  it('keeps going after one statement fails rather than abandoning the rest', async () => {
    mockQuery
      .mockRejectedValueOnce(new Error('first one failed'))
      .mockResolvedValue([]);
    await ensureAgentDomainToolRequestSchema();
    expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});

describe('assert — the part that actually decides', () => {
  it('resolves when the table, every column, every index and the constraint are present', async () => {
    stageAssert();
    await expect(assertAgentDomainToolRequestSchema()).resolves.toBeUndefined();
  });

  it('THROWS when the table is missing, rather than warning', async () => {
    stageAssert({ tables: [] });
    await expect(assertAgentDomainToolRequestSchema())
      .rejects.toThrow(`SchemaInvariantViolation: missing table ${TABLE}`);
  });

  it('throws when a column is missing — the case a mocked unit test cannot otherwise see', async () => {
    stageAssert({ columns: REQUIRED_COLUMNS.filter((c) => !c.endsWith('.touches')) });
    await expect(assertAgentDomainToolRequestSchema())
      .rejects.toThrow(`missing column ${TABLE}.touches`);
  });

  it('throws when an index is missing', async () => {
    stageAssert({ indexes: ['idx_adtr_tool_name'] });
    await expect(assertAgentDomainToolRequestSchema())
      .rejects.toThrow('missing index idx_adtr_capability_id');
  });

  it('THROWS WHEN THE CHECK CONSTRAINT IS MISSING, which is the write rule as data', async () => {
    // Without it the table accepts a write with no declared side effects — the one thing it
    // exists to refuse — and every behavioral test still passes, because the application-level
    // refusal in `toolRequestContract.ts` is a separate code path.
    stageAssert({ checks: [] });
    await expect(assertAgentDomainToolRequestSchema())
      .rejects.toThrow(`missing constraint ${CHECK}`);
  });

  it('does not list eighteen missing columns when the table itself never arrived', async () => {
    stageAssert({ tables: [], columns: [], indexes: [], checks: [] });
    await expect(assertAgentDomainToolRequestSchema())
      .rejects.toThrow(`SchemaInvariantViolation: missing table ${TABLE}`);
  });

  it('binds by NAME, never positionally — $1 with a nested array matched nothing', async () => {
    stageAssert();
    await assertAgentDomainToolRequestSchema();
    for (const [sql, opts] of mockQuery.mock.calls as Array<[string, { bind: unknown }]>) {
      expect(sql).toContain('ANY($names)');
      expect(sql).not.toContain('ANY($1)');
      expect(Array.isArray(opts.bind)).toBe(false);
      expect(opts.bind).toHaveProperty('names');
    }
  });

  it('copes with object rows too, so the normalizer is doing the work and not a lucky shape', async () => {
    mockQuery
      .mockResolvedValueOnce([{ table_name: TABLE }])
      .mockResolvedValueOnce(REQUIRED_COLUMNS.map((c) => ({ name: c })))
      .mockResolvedValueOnce(REQUIRED_INDEXES.map((i) => ({ indexname: i })))
      .mockResolvedValueOnce([{ constraint_name: CHECK }]);
    await expect(assertAgentDomainToolRequestSchema()).resolves.toBeUndefined();
  });

  it('reuses the sibling normalizer rather than reimplementing it', () => {
    const source = fs.readFileSync(SOURCE, 'utf8');
    expect(source).toMatch(
      /import\s*\{\s*normalizeNameRows\s*\}\s*from\s*'\.\/ensureAgentDomainProjectSchema'/,
    );
    expect(source).not.toMatch(/function normalizeNameRows/);
  });
});

describe('the boot guard cannot reject, so server.ts can await it bare', () => {
  it('reports ok:true when the schema is sound', async () => {
    stageAssert();
    await expect(ensureAgentDomainToolRequestSchemaGuarded()).resolves.toEqual({ ok: true });
  });

  it('reports ok:false with the error class instead of throwing', async () => {
    // Every read answers empty, so `assert` finds the table missing and throws. The guard turns
    // that into a logged result rather than an unhandled rejection that would take boot down.
    mockQuery.mockResolvedValue([]);
    const result = await ensureAgentDomainToolRequestSchemaGuarded();
    expect(result.ok).toBe(false);
    expect(result.error_class).toBe('Error');
  });
});

describe('idempotency and blast radius, asserted on the SQL itself', () => {
  it('every CREATE is IF NOT EXISTS, so a second boot is a no-op', async () => {
    mockQuery.mockResolvedValue([]);
    await ensureAgentDomainToolRequestSchema();
    const sql = (mockQuery.mock.calls as Array<[string]>).map(([s]) => s).join('\n');
    const creates = sql.match(/CREATE (TABLE|INDEX)/g) ?? [];
    const guarded = sql.match(/CREATE (?:TABLE|INDEX) IF NOT EXISTS/g) ?? [];
    expect(creates.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(creates.length);
  });

  it('RUNS NO `ALTER` AT ALL, which is the reason this is a child table', () => {
    expect(sourceSql()).not.toMatch(/ALTER TABLE/i);
  });

  it('runs nothing destructive on any existing table', () => {
    const sql = sourceSql();
    // `DROP TABLE IF EXISTS` appears once, in ROLLBACK_STATEMENTS, which is not part of boot.
    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
    expect(sql).not.toMatch(/DELETE FROM/i);
  });

  it('rolls back ONLY the new table and never the parent it hangs off', () => {
    expect(ROLLBACK_STATEMENTS).toEqual([`DROP TABLE IF EXISTS ${TABLE}`]);
    expect(ROLLBACK_STATEMENTS.join(' ')).not.toContain('agent_domain_change_requests');
  });

  it('keys the detail on the request, one to one, by primary key', () => {
    const sql = sourceSql();
    expect(sql).toMatch(/change_request_id UUID PRIMARY KEY/);
    expect(sql).toMatch(/REFERENCES agent_domain_change_requests \(id\) ON DELETE CASCADE/);
  });

  it('ACTUALLY CREATES the write-rule constraint, not merely asserts it afterwards', () => {
    // FOUND BY MUTATION. Deleting the whole `CONSTRAINT ... CHECK (...)` clause from the DDL left
    // every other test in this file green: `assert` is driven through a mock that answers "the
    // constraint is present" whatever SQL was sent, so it can only ever test the assertion, never
    // the creation. That is the same blind spot this file's header describes — a mocked unit test
    // cannot see what the DDL did — and it needed its own assertion rather than a comment.
    const sql = sourceSql();
    expect(sql).toContain(`CONSTRAINT ${CHECK} CHECK (`);
    expect(sql).toMatch(/writes = FALSE OR \(side_effects IS NOT NULL AND reversible IS NOT NULL\)/);
  });

  it('declares every required column in the CREATE, so `assert` cannot pass a table that lacks one', () => {
    // Same class of hole: `REQUIRED_COLUMNS` and the `CREATE TABLE` are two separate lists, and a
    // column named in one and absent from the other would only ever fail against a real database.
    //
    // TWO THINGS THIS GETS RIGHT THAT THE FIRST VERSION DID NOT, both found by mutation. It
    // searched the whole file for the bare word, so deleting `touches` from the `CREATE` still
    // passed — the name was still sitting in `REQUIRED_COLUMNS` a few lines above. So: scope to the
    // CREATE block, and require a TYPE after the name. A mention is not a declaration.
    const block = createBlock();
    const TYPES = 'UUID|TEXT|JSONB|BOOLEAN|DATE|TIMESTAMPTZ';
    for (const qualified of REQUIRED_COLUMNS) {
      const column = qualified.split('.')[1];
      expect(block).toMatch(new RegExp(`\\b${column}\\s+(?:${TYPES})\\b`));
    }
  });

  it('the column sweep is looking at the CREATE and nothing else', () => {
    // The instrument's own control. If `createBlock()` ever returned the whole file, the sweep
    // above would go back to passing on a name that only appears in `REQUIRED_COLUMNS`.
    const block = createBlock();
    expect(block).toContain('CREATE TABLE IF NOT EXISTS');
    expect(block).not.toContain('CREATE INDEX');
    expect(block).not.toContain('REQUIRED_COLUMNS');
    expect(block).not.toContain('ROLLBACK_STATEMENTS');
  });

  it('holds no decision column, so it cannot become a second approval spine', () => {
    const sql = sourceSql();
    for (const forbidden of ['status', 'approved_by_identity', 'approved_at', 'declined_reason']) {
      expect(sql).not.toContain(forbidden);
    }
  });
});

describe('the frequency enum is a comparable risk input, not free text', () => {
  it('distinguishes who triggers a run', () => {
    // `on_demand` means a person triggers it; `per_event` means the system does, which is the
    // shape that surprises people. Collapsing them would lose the distinction the approver needs.
    expect(TOOL_RUN_FREQUENCIES).toContain('on_demand');
    expect(TOOL_RUN_FREQUENCIES).toContain('per_event');
  });

  it('covers the range an approver would actually rank by', () => {
    expect(TOOL_RUN_FREQUENCIES).toContain('hourly');
    expect(TOOL_RUN_FREQUENCIES).toContain('quarterly');
    expect(new Set(TOOL_RUN_FREQUENCIES).size).toBe(TOOL_RUN_FREQUENCIES.length);
  });
});
