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
  REQUIRED_CHECKS,
  REQUIRED_INDEXES,
  REQUIRED_TABLES,
  ROLLBACK_STATEMENTS,
  TOOL_PRODUCT_STATES,
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
  /** Columns the database reports as STILL NULLABLE. Sound schema: none of them. */
  nullable?: string[];
} = {}): void {
  mockQuery.mockImplementation((sql: string) => {
    if (/information_schema\.tables/.test(sql)) {
      return Promise.resolve(over.tables ?? [...REQUIRED_TABLES]);
    }
    // TWO reads hit `information_schema.columns` — the presence list and the nullability check —
    // and `is_nullable` is the only thing that tells them apart. Matching on the table alone would
    // answer the nullability question with the presence list, and because that list is QUALIFIED
    // (`agent_domain_tool_request_details.environment`) while the check looks for a bare
    // `environment`, the assertion would pass for a reason that has nothing to do with the
    // invariant — green whether or not the column is nullable.
    if (/information_schema\.columns/.test(sql) && /is_nullable/.test(sql)) {
      return Promise.resolve(over.nullable ?? []);
    }
    if (/information_schema\.columns/.test(sql)) {
      return Promise.resolve(over.columns ?? [...REQUIRED_COLUMNS]);
    }
    if (/pg_indexes/.test(sql)) return Promise.resolve(over.indexes ?? [...REQUIRED_INDEXES]);
    if (/table_constraints/.test(sql)) return Promise.resolve(over.checks ?? [...REQUIRED_CHECKS]);
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
    stageAssert({ checks: REQUIRED_CHECKS.filter((c) => c !== CHECK) });
    await expect(assertAgentDomainToolRequestSchema())
      .rejects.toThrow(`missing constraint ${CHECK}`);
  });

  it('throws when the ENVIRONMENT check is missing, so a row cannot carry an unknown scope', async () => {
    stageAssert({ checks: [CHECK] });
    await expect(assertAgentDomainToolRequestSchema())
      .rejects.toThrow('missing constraint chk_adtr_environment_known');
  });

  it('THROWS WHEN `environment` IS PRESENT BUT STILL NULLABLE', async () => {
    // `ALTER COLUMN ... SET NOT NULL` is a separate statement from the add, and the loop that runs
    // it warns and continues. Checking only that the column EXISTS would pass on an environment
    // where the add worked and the SET NOT NULL did not, leaving a column that accepts the blank
    // the contract refuses — which is the half-applied deploy this assertion exists for.
    stageAssert({ nullable: ['environment'] });
    await expect(assertAgentDomainToolRequestSchema())
      .rejects.toThrow('environment is still nullable');
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
      .mockResolvedValueOnce(REQUIRED_CHECKS.map((c) => ({ constraint_name: c })))
      // The nullability read, which answers "nothing is nullable" on a sound schema.
      .mockResolvedValueOnce([]);
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

  /**
   * NARROWED on 14 Nov 2026, from "no `ALTER` at all" to "no `ALTER` on the parent".
   *
   * The original assertion was the right one while this table was net-new: a child that arrives
   * entirely through `CREATE TABLE IF NOT EXISTS` reverts whole and cannot touch the governance
   * row it hangs off. That second half is the part worth protecting, and it is now what the test
   * says.
   *
   * The first half stopped being achievable the moment the table existed in production, because
   * `CREATE TABLE IF NOT EXISTS` is a NO-OP against an existing table, so a new column cannot
   * arrive any other way. `ensureAgentToolGrantSchema.ts` hit this before and records it: adding
   * a column to the CREATE alone "would have shipped green, resolved identically, and left the
   * column absent on every environment the table already exists in."
   *
   * So the rule a reader should take from this file is not "never ALTER" — it is **never ALTER
   * `agent_domain_change_requests`**, whose own header calls `kind` "THE ONLY ALTER THIS FILE
   * WILL EVER RUN".
   */
  it('runs no `ALTER` on the PARENT governance table, which is the blast radius that matters', () => {
    const alters = [...sourceSql().matchAll(/ALTER TABLE\s+([a-z_]+)/gi)].map((m) => m[1]);
    expect(alters.length).toBeGreaterThan(0);
    for (const target of alters) expect(target).toBe(TABLE);
    expect(sourceSql()).not.toMatch(/ALTER TABLE\s+agent_domain_change_requests/i);
  });

  it('adds every column with IF NOT EXISTS, so a second boot is still a no-op', () => {
    const adds = sourceSql().match(/ADD COLUMN/gi) ?? [];
    const guarded = sourceSql().match(/ADD COLUMN IF NOT EXISTS/gi) ?? [];
    expect(adds.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(adds.length);
  });

  it('guards the constraint add on its own existence, since Postgres has no IF NOT EXISTS for it', () => {
    // A plain ADD CONSTRAINT would throw `duplicate_object` on every boot after the first, filling
    // the logs with a failure that is actually the success case.
    const sql = sourceSql();
    expect(sql).toMatch(/ADD CONSTRAINT\s+chk_adtr_environment_known/);
    expect(sql).toMatch(/SELECT 1 FROM pg_constraint WHERE conname = 'chk_adtr_environment_known'/);
  });

  it('gives `environment` NO default, so no row can claim a scope nobody chose', () => {
    // `read_datasets` DOES default, to an empty list, which is the truthful value for a request
    // that named none. There is no value of `environment` that honestly means "not asked", so a
    // default here would make a pre-existing row read as answered.
    const sql = sourceSql();
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS environment TEXT\s*`/);
    expect(sql).toMatch(/ALTER COLUMN environment SET NOT NULL/);
    expect(sql).not.toMatch(/environment TEXT NOT NULL DEFAULT/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS read_datasets JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
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

describe('AF11.7 — the five "should this be built at all" columns', () => {
  const NEW_COLUMNS = [
    'acts_on_output',
    'judged_threshold',
    'judged_measured_from',
    'tried_in_product',
    'missing_from_product',
  ];

  it('adds each one with IF NOT EXISTS and then SET NOT NULL, as a SEPARATE statement', () => {
    // The trap this file already records once, for `environment`: `CREATE TABLE IF NOT EXISTS` is a
    // NO-OP against the table sitting in production, so a column declared only in the CREATE ships
    // green and is absent on every environment that has ever run this file.
    const sql = sourceSql();
    for (const col of NEW_COLUMNS) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col} TEXT`));
      expect(sql).toMatch(new RegExp(`ALTER COLUMN ${col} SET NOT NULL`));
    }
  });

  it('gives NONE of them a default, so no row can read as answered when it was not', () => {
    // The distinction this file draws for `read_datasets`: an empty list is the truthful value for
    // a request that named no datasets. There is no value of "who acts on the output" that honestly
    // means "nobody asked", and the whole point of this group is that the question WAS asked. A
    // default would make every pre-existing row claim an answer nobody gave.
    const sql = sourceSql();
    for (const col of NEW_COLUMNS) {
      expect(sql).not.toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col} TEXT NOT NULL`));
      expect(sql).not.toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col} TEXT DEFAULT`));
      expect(sql).not.toMatch(new RegExp(`ALTER COLUMN ${col} SET DEFAULT`));
    }
  });

  it('declares each one in the CREATE as well, for an environment that has never run this file', () => {
    const create = createBlock();
    for (const col of NEW_COLUMNS) {
      expect(create).toMatch(new RegExp(`${col} TEXT NOT NULL`));
    }
  });

  it('names each one in REQUIRED_COLUMNS, so `assert` fails a boot that lacks one', () => {
    for (const col of NEW_COLUMNS) {
      expect(REQUIRED_COLUMNS).toContain(`${TABLE}.${col}`);
    }
  });

  it.each([
    'acts_on_output',
    'judged_threshold',
    'judged_measured_from',
    'tried_in_product',
    'missing_from_product',
  ])('THROWS when %s is present but still NULLABLE', async (col) => {
    // `SET NOT NULL` is its own statement and the loop that runs it warns and continues, so a
    // column can arrive and stay optional. Checking only that it EXISTS would pass on exactly that
    // environment, leaving a column that accepts the blank the contract refuses. The nullability
    // read was `environment`-only before AF11.7; five more columns arrive the same way, so the
    // assertion sweeps a list rather than special-casing one name.
    stageAssert({ nullable: [col] });
    await expect(assertAgentDomainToolRequestSchema())
      .rejects.toThrow(new RegExp(`${col} is still nullable`));
  });

  it('still tolerates the columns that are LEGITIMATELY nullable', async () => {
    // `side_effects`, `reversible` and `reversibility_note` are nullable on purpose — they are
    // mandatory only on a write. The nullability read no longer filters by column name, so it now
    // returns those three on a perfectly sound schema. If the assertion ever treated its result as
    // "everything here is a problem", a healthy database would fail its own boot.
    stageAssert({ nullable: ['side_effects', 'reversible', 'reversibility_note'] });
    await expect(assertAgentDomainToolRequestSchema()).resolves.toBeUndefined();
  });
});

describe('AF11.7 — the storage half of the routing rule, which is NARROWER than its own enum', () => {
  it('pins a stored row to `not_built`, because this table is the detail of a BUILD request', () => {
    // `TOOL_PRODUCT_STATES` carries three values because the GATE has to recognise all three in
    // order to route two of them away. A row saying "the product already does this" would be a
    // build request for something we already own — the exact thing Ali named on 16 Nov 2026:
    // *"people are proposing things we don't even need."*
    const sql = sourceSql();
    expect(sql).toMatch(
      /CONSTRAINT chk_adtr_build_request_is_unbuilt CHECK \(\s*tried_in_product = 'not_built'\s*\)/,
    );
    expect(REQUIRED_CHECKS).toContain('chk_adtr_build_request_is_unbuilt');
  });

  it('guards the constraint add on its own existence, since Postgres has no IF NOT EXISTS for it', () => {
    // A plain ADD throws `duplicate_object` on every boot after the first and fills the logs with a
    // failure that is actually the success case.
    expect(sourceSql())
      .toMatch(/SELECT 1 FROM pg_constraint WHERE conname = 'chk_adtr_build_request_is_unbuilt'/);
  });

  it('is DELIBERATELY not an IN list over the enum, and this test is why', () => {
    // If this ever becomes `IN ('used_by_hand','exists_unused','not_built')`, the table has started
    // accepting build requests for features that already exist, and the refusal in
    // `toolRequestContract.ts` is the only thing left stopping them. That is the failure mode both
    // sibling constraints in this file were written against: a future caller that skips the
    // contract.
    expect(sourceSql()).not.toMatch(/tried_in_product IN \(/);
  });

  it('lets `missing_from_product` be plain NOT NULL rather than a conditional pairing check', () => {
    // Because the only storable state is `not_built`, the gap is ALWAYS required. A pairing check
    // in the shape of `chk_adtr_write_declares_effects` would be dead weight here, and a reader
    // finding one would reasonably conclude the other two states can be stored.
    expect(sourceSql()).not.toMatch(/tried_in_product\s*<>\s*'not_built'\s*OR/);
    expect(REQUIRED_COLUMNS).toContain(`${TABLE}.missing_from_product`);
  });

  it('keeps all three states in the TYPE, because the gate routes on them', () => {
    expect(TOOL_PRODUCT_STATES).toEqual(['used_by_hand', 'exists_unused', 'not_built']);
    expect(new Set(TOOL_PRODUCT_STATES).size).toBe(TOOL_PRODUCT_STATES.length);
  });

  it('ACTUALLY CREATES the constraint rather than only asserting it afterwards', () => {
    // The mutation this file's sibling test records: `assert` is driven through a mock that answers
    // "the constraint is there", so deleting the DDL that creates it leaves every other test green.
    // Both the CREATE clause and the guarded ADD have to be present, because an environment that
    // already has the table only ever runs the second.
    const sql = sourceSql();
    const inCreate = /CONSTRAINT chk_adtr_build_request_is_unbuilt CHECK/.test(createBlock());
    const inAlter = /ADD CONSTRAINT chk_adtr_build_request_is_unbuilt/.test(sql);
    expect(inCreate).toBe(true);
    expect(inAlter).toBe(true);
  });
});
