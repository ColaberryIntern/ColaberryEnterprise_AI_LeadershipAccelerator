/**
 * AF11.3 schema — the `ensure` / `assert` / `guarded` trio, exercised rather than grepped.
 *
 * The property a mocked test normally cannot see is the one that matters: **`ensure` alone cannot
 * fail.** `CREATE TABLE IF NOT EXISTS` is a no-op on an existing table and every statement error is
 * warned rather than raised, so the function resolves identically whether the DDL worked or did
 * nothing whatsoever. A schema fix once shipped "green" on exactly that and stayed broken in
 * production for a day. So `assert` is the part that decides, and these tests drive its failure
 * path directly.
 *
 * This file's own distinct property, the one neither sibling has: **the table cannot hold a verb
 * that is not a decision, cannot hold a decision missing the words that verb requires, and cannot
 * hold an autonomy level or a tool grant at all.** The last of those is an ABSENCE, which is
 * exactly what a later edit removes without anybody noticing, so it is asserted by name.
 */

const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a) },
}));

import fs from 'fs';
import path from 'path';
import {
  REQUIRED_CHECKS,
  REQUIRED_COLUMNS,
  REQUIRED_INDEXES,
  REQUIRED_TABLES,
  ROLLBACK_STATEMENTS,
  assertToolRequestDecisionSchema,
  ensureToolRequestDecisionSchema,
  ensureToolRequestDecisionSchemaGuarded,
} from '../ensureToolRequestDecisionSchema';

let warn: jest.SpyInstance;

beforeEach(() => {
  mockQuery.mockReset();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const TABLE = 'agent_domain_tool_request_decisions';
const SOURCE = path.join(__dirname, '..', 'ensureToolRequestDecisionSchema.ts');

/**
 * Answer each of `assert`'s reads BY THE SQL IT SENT, not by call order.
 *
 * Sequential `mockResolvedValueOnce` staging breaks the moment a statement is added, because the
 * guarded path runs `ensure` first and every DDL statement eats one staged answer. `assert` would
 * then read a DDL placeholder as its table list and fail for a reason unrelated to the schema.
 *
 * Rows come back as RAW ARRAYS, the shape this driver really returns for a single-column select.
 * An earlier sibling staged `{ table_name: '...' }` objects, a shape the driver never produces
 * here, and so could not see a real production failure: a mock returning a shape the driver does
 * not produce tests the mock.
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
    if (/table_constraints/.test(sql)) return Promise.resolve(over.checks ?? [...REQUIRED_CHECKS]);
    return Promise.resolve([]);
  });
}

/** The file's own SQL with comments stripped, so prose ABOUT sql is never read as sql. */
function sourceSql(): string {
  return fs.readFileSync(SOURCE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/--[^\n]*/g, '');
}

/** Just the `CREATE TABLE` statement, ending where the first `CREATE INDEX` begins. */
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
    await ensureToolRequestDecisionSchema();
    expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('WARNS AND CONTINUES when a statement fails, which is why assert has to exist', async () => {
    mockQuery.mockRejectedValue(new TypeError('boom'));
    await expect(ensureToolRequestDecisionSchema()).resolves.toBeUndefined();
    const line = JSON.parse((warn.mock.calls[0] as string[])[0]);
    expect(line.event).toBe('tool_request_decision_schema_statement_failed');
    expect(line.error_class).toBe('TypeError');
  });

  it('keeps going after one statement fails rather than abandoning the rest', async () => {
    mockQuery.mockRejectedValueOnce(new Error('first one failed')).mockResolvedValue([]);
    await ensureToolRequestDecisionSchema();
    expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('assert — the part that actually decides', () => {
  it('resolves when the table, every column, the index and both constraints are present', async () => {
    stageAssert();
    await expect(assertToolRequestDecisionSchema()).resolves.toBeUndefined();
  });

  it('THROWS when the table is missing, rather than warning', async () => {
    stageAssert({ tables: [] });
    await expect(assertToolRequestDecisionSchema())
      .rejects.toThrow(/SchemaInvariantViolation.*missing table/);
  });

  it('does not report every column as missing when the table itself is absent', async () => {
    // Otherwise the one real finding drowns in eight lines of noise and the reader fixes the
    // wrong thing.
    stageAssert({ tables: [], columns: [] });
    await expect(assertToolRequestDecisionSchema()).rejects.toThrow(
      `SchemaInvariantViolation: missing table ${TABLE}`,
    );
  });

  it('THROWS naming the column when `decided_by_identity` is missing', async () => {
    // WHO decided. Without it the log records that something was decided and not by whom, which
    // is the one fact the table exists to keep.
    stageAssert({ columns: REQUIRED_COLUMNS.filter((c) => !c.endsWith('.decided_by_identity')) });
    await expect(assertToolRequestDecisionSchema())
      .rejects.toThrow(`missing column ${TABLE}.decided_by_identity`);
  });

  it('THROWS naming the column when `decided_at` is missing', async () => {
    stageAssert({ columns: REQUIRED_COLUMNS.filter((c) => !c.endsWith('.decided_at')) });
    await expect(assertToolRequestDecisionSchema())
      .rejects.toThrow(`missing column ${TABLE}.decided_at`);
  });

  it('THROWS when the index is missing, because the history read would be a sequential scan', async () => {
    stageAssert({ indexes: [] });
    await expect(assertToolRequestDecisionSchema())
      .rejects.toThrow('missing index idx_adtrd_change_request_id');
  });

  it('THROWS when the verb CHECK is missing, because an unknown verb is not a decision', async () => {
    stageAssert({ checks: REQUIRED_CHECKS.filter((c) => c !== 'chk_adtrd_verb_is_known') });
    await expect(assertToolRequestDecisionSchema())
      .rejects.toThrow('missing constraint chk_adtrd_verb_is_known');
  });

  it('THROWS when the words CHECK is missing, because a denial with no reason could be stored', async () => {
    stageAssert({ checks: REQUIRED_CHECKS.filter((c) => c !== 'chk_adtrd_verb_carries_its_words') });
    await expect(assertToolRequestDecisionSchema())
      .rejects.toThrow('missing constraint chk_adtrd_verb_carries_its_words');
  });

  it('reports EVERY problem at once rather than the first', async () => {
    stageAssert({ columns: [], indexes: [], checks: [] });
    await expect(assertToolRequestDecisionSchema()).rejects.toThrow(
      /missing column.*missing index.*missing constraint/s,
    );
  });

  it('uses a NAMED bind, which is the shape proven against this driver', async () => {
    // Positional binds silently returned nothing on a sibling once, and the module reported a
    // present table as missing.
    stageAssert();
    await assertToolRequestDecisionSchema();
    for (const call of mockQuery.mock.calls) {
      const options = call[1] as { bind?: Record<string, unknown> } | undefined;
      expect(options?.bind).toHaveProperty('names');
    }
  });
});

describe('guarded — the boot entry point', () => {
  it('reports ok when the schema is sound', async () => {
    stageAssert();
    await expect(ensureToolRequestDecisionSchemaGuarded()).resolves.toEqual({ ok: true });
  });

  it('CANNOT REJECT when assert throws — it reports, and boot continues', async () => {
    // Its siblings have the same contract, and the reason is that a schema the console needs is
    // not a reason to take the whole backend down.
    stageAssert({ tables: [] });
    await expect(ensureToolRequestDecisionSchemaGuarded()).resolves.toEqual({
      ok: false,
      error_class: 'Error',
    });
    const line = JSON.parse((warn.mock.calls.at(-1) as string[])[0]);
    expect(line.event).toBe('tool_request_decision_schema_unavailable');
    expect(line.level).toBe('error');
  });
});

describe('the DDL keeps the rules the application states in words', () => {
  it('names all four verbs in the verb CHECK and nothing else', () => {
    const block = createBlock();
    for (const verb of ['approve_to_build', 'deny', 'assign_existing_tool', 'send_back']) {
      expect(block).toContain(`'${verb}'`);
    }
    // A fifth value sneaking in here would widen what a decision can be without touching the
    // contract. Count the quoted values inside the verb CHECK rather than trusting the list above.
    const verbCheck = block.slice(block.indexOf('chk_adtrd_verb_is_known'));
    const inList = verbCheck.slice(0, verbCheck.indexOf(')'));
    expect((inList.match(/'[a-z_]+'/g) ?? []).length).toBe(4);
  });

  it('requires a reason on a denial, a field on a send-back and a tool on an assignment', () => {
    const block = createBlock();
    // `length(btrim(coalesce(...)))` and not `IS NOT NULL`: a reason of three spaces is not a
    // reason, and `NOT NULL` would accept one.
    expect(block).toMatch(/verb\s*<>\s*'deny'\s*OR\s*length\(btrim\(coalesce\(reason/);
    expect(block).toMatch(/verb\s*<>\s*'send_back'\s*OR\s*length\(btrim\(coalesce\(missing_field/);
    expect(block).toMatch(
      /verb\s*<>\s*'assign_existing_tool'\s*OR\s*length\(btrim\(coalesce\(assigned_tool_name/,
    );
  });

  it('CANNOT HOLD an autonomy level, a tool grant, an enabled flag or a risk tier', () => {
    // The absence IS the governance property. AF11.3's sharpest warning is that a console which
    // grants a tool and lifts an autonomy level in one action means nobody separately decided the
    // agent may act more freely — and a table with nowhere to put an autonomy level cannot be
    // used to lift one. A later migration adding one of these columns is a governance change
    // wearing a schema change's clothes, and this is what makes it fail a test.
    const block = createBlock();
    for (const col of ['autonomy_level', 'tools_granted', 'enabled', 'risk_tier', 'abac_mode']) {
      expect(block).not.toContain(col);
    }
  });

  it('CARRIES NO STATUS of its own, so it cannot disagree with the parent request', () => {
    const block = createBlock();
    // `request_status` is computed and returned by the service; it is deliberately not stored.
    expect(block).not.toMatch(/\bstatus\b/);
  });

  it('cascades from the parent, so a deleted request leaves no orphan decisions', () => {
    expect(createBlock()).toMatch(
      /REFERENCES\s+agent_domain_change_requests\s*\(id\)\s*ON DELETE CASCADE/,
    );
  });

  it('reverts WHOLE, naming only its own net-new table', () => {
    // A rollback that touched `agent_domain_change_requests` would take AF4.2 and AF11.1 with it.
    expect(ROLLBACK_STATEMENTS).toEqual([`DROP TABLE IF EXISTS ${TABLE}`]);
  });
});
