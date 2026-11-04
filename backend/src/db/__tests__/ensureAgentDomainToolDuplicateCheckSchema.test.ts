/**
 * AF11.2 schema — the `ensure` / `assert` / `guarded` trio, exercised rather than grepped.
 *
 * The property a mocked test normally cannot see is the one that matters: **`ensure` alone cannot
 * fail.** `CREATE TABLE IF NOT EXISTS` is a no-op on an existing table and every statement error is
 * warned rather than raised, so the function resolves identically whether the DDL worked or did
 * nothing whatsoever. A schema fix once shipped "green" on exactly that and stayed broken in
 * production for a day. So `assert` is the part that decides, and these tests drive its failure
 * path directly.
 *
 * This file's own distinct property, which neither sibling has: **the table cannot hold a verdict,
 * and it cannot hold a ranking that disagrees with its own count.** AF11.2 puts both available
 * opinions out of scope, so a column named `verdict` or `approved` arriving here later would be a
 * governance change wearing a schema change's clothes. The absence is asserted, because an absence
 * is exactly what a later edit removes without anybody noticing.
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
  assertAgentDomainToolDuplicateCheckSchema,
  ensureAgentDomainToolDuplicateCheckSchema,
  ensureAgentDomainToolDuplicateCheckSchemaGuarded,
} from '../ensureAgentDomainToolDuplicateCheckSchema';

let warn: jest.SpyInstance;

beforeEach(() => {
  mockQuery.mockReset();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const TABLE = 'agent_domain_tool_duplicate_checks';
const CHECK = 'chk_adtdc_count_matches';

const SOURCE = path.join(__dirname, '..', 'ensureAgentDomainToolDuplicateCheckSchema.ts');

/**
 * Answer each of `assert`'s reads BY THE SQL IT SENT, not by call order.
 *
 * Sequential `mockResolvedValueOnce` staging breaks the moment a statement is added, because the
 * guarded path runs `ensure` first and every DDL statement eats one staged answer. `assert` would
 * then read a DDL placeholder as its table list and fail for a reason unrelated to the schema.
 *
 * Rows come back as RAW ARRAYS, which is the shape this driver really returns for a single-column
 * select. The first sibling staged `{ table_name: '...' }` objects, a shape the driver never
 * produces here, and so could not see a real production failure: a mock returning a shape the
 * driver does not produce tests the mock.
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
    .replace(/\/\/[^\n]*/g, '');
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
    await ensureAgentDomainToolDuplicateCheckSchema();
    expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('WARNS AND CONTINUES when a statement fails, which is why assert has to exist', async () => {
    mockQuery.mockRejectedValue(new TypeError('boom'));
    await expect(ensureAgentDomainToolDuplicateCheckSchema()).resolves.toBeUndefined();
    const line = JSON.parse((warn.mock.calls[0] as string[])[0]);
    expect(line.event).toBe('agent_domain_tool_duplicate_check_schema_statement_failed');
    expect(line.error_class).toBe('TypeError');
  });

  it('keeps going after one statement fails rather than abandoning the rest', async () => {
    mockQuery.mockRejectedValueOnce(new Error('first one failed')).mockResolvedValue([]);
    await ensureAgentDomainToolDuplicateCheckSchema();
    expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('assert — the part that actually decides', () => {
  it('resolves when the table, every column, the index and the constraint are present', async () => {
    stageAssert();
    await expect(assertAgentDomainToolDuplicateCheckSchema()).resolves.toBeUndefined();
  });

  it('THROWS when the table is missing, rather than warning', async () => {
    stageAssert({ tables: [] });
    await expect(assertAgentDomainToolDuplicateCheckSchema())
      .rejects.toThrow(/SchemaInvariantViolation.*missing table/);
  });

  it('does not report every column as missing when the table itself is absent', async () => {
    // Otherwise the one real finding drowns in eight lines of noise and the reader fixes the
    // wrong thing.
    stageAssert({ tables: [], columns: [] });
    await expect(assertAgentDomainToolDuplicateCheckSchema()).rejects.toThrow(
      `SchemaInvariantViolation: missing table ${TABLE}`,
    );
  });

  it('THROWS naming the column when one is missing', async () => {
    stageAssert({ columns: REQUIRED_COLUMNS.filter((c) => !c.endsWith('.catalog_absent')) });
    await expect(assertAgentDomainToolDuplicateCheckSchema())
      .rejects.toThrow(`missing column ${TABLE}.catalog_absent`);
  });

  it('THROWS when the index is missing, because the console read would be a sequential scan', async () => {
    stageAssert({ indexes: [] });
    await expect(assertAgentDomainToolDuplicateCheckSchema())
      .rejects.toThrow('missing index idx_adtdc_candidate_count');
  });

  it('THROWS when the CHECK is missing, because that is the rule the table exists to keep', async () => {
    // Without it the table accepts a count that disagrees with the list it counts, which is the
    // one remaining way a stored ranking can lie about itself.
    stageAssert({ checks: [] });
    await expect(assertAgentDomainToolDuplicateCheckSchema())
      .rejects.toThrow(`missing constraint ${CHECK}`);
  });

  it('reports EVERY problem at once rather than the first', async () => {
    stageAssert({ columns: [], indexes: [], checks: [] });
    await expect(assertAgentDomainToolDuplicateCheckSchema()).rejects.toThrow(
      /missing column.*missing index.*missing constraint/s,
    );
  });

  it('uses a NAMED bind, which is the shape proven against this driver', async () => {
    // Positional binds silently returned nothing here once, and the module reported a present
    // table as missing.
    stageAssert();
    await assertAgentDomainToolDuplicateCheckSchema();
    for (const call of mockQuery.mock.calls) {
      const options = call[1] as { bind?: Record<string, unknown> } | undefined;
      expect(options?.bind).toHaveProperty('names');
    }
  });
});

describe('guarded — the boot entry point', () => {
  it('reports ok when the schema is sound', async () => {
    stageAssert();
    await expect(ensureAgentDomainToolDuplicateCheckSchemaGuarded()).resolves.toEqual({ ok: true });
  });

  it('CANNOT REJECT, so a bad schema never stops the port binding', async () => {
    stageAssert({ tables: [] });
    const result = await ensureAgentDomainToolDuplicateCheckSchemaGuarded();
    expect(result.ok).toBe(false);
    expect(result.error_class).toBe('Error');
  });

  it('logs the failure as an error-level structured line, not a silent false', async () => {
    stageAssert({ tables: [] });
    await ensureAgentDomainToolDuplicateCheckSchemaGuarded();
    const line = JSON.parse(
      (warn.mock.calls.map((c) => c[0] as string).find((s) => s.includes('unavailable')) ?? '{}'),
    );
    expect(line.event).toBe('agent_domain_tool_duplicate_check_schema_unavailable');
    expect(line.level).toBe('error');
    expect(line.outcome).toBe('failure');
  });

  it('derives an error_class from a non-Error throw rather than crashing on it', async () => {
    mockQuery.mockImplementation(() => Promise.reject('a bare string'));
    const result = await ensureAgentDomainToolDuplicateCheckSchemaGuarded();
    expect(result.ok).toBe(false);
    expect(result.error_class).toBe('UnknownError');
  });
});

describe('what the table is NOT allowed to become', () => {
  it('holds no verdict, approver, status or reason code', () => {
    // AF11.2: a match is advice, never a grant and never a refusal. A table with nowhere to put a
    // decision cannot drift into holding one, and this is the test that notices if somebody adds
    // the column.
    const block = createBlock();
    for (const forbidden of [
      'verdict', 'approved_by', 'approved_at', 'decided_by', 'decided_at', 'declined',
      'status', 'reason_code', 'granted',
    ]) {
      expect(block).not.toContain(forbidden);
    }
  });

  it('is keyed one-to-one on the request, so two answers for one request cannot exist', () => {
    expect(createBlock()).toMatch(/change_request_id\s+UUID\s+PRIMARY KEY/);
  });

  it('cascades, so an answer cannot outlive the request it is about', () => {
    expect(createBlock()).toContain('ON DELETE CASCADE');
  });

  it('runs no ALTER on anybody else\'s table', () => {
    // The whole reason this is a second table rather than three more columns on the AF11.1 detail
    // row: it reverts by itself and leaves the sibling's "ZERO ALTER statements" claim true.
    expect(sourceSql()).not.toContain('ALTER TABLE');
  });

  it('reverts whole, mentioning only its own table', () => {
    expect(ROLLBACK_STATEMENTS).toEqual([`DROP TABLE IF EXISTS ${TABLE}`]);
    for (const statement of ROLLBACK_STATEMENTS) {
      expect(statement).not.toContain('agent_domain_change_requests');
      expect(statement).not.toContain('agent_domain_tool_request_details');
    }
  });

  it('declares the three columns that make a zero readable', () => {
    // Without these, "no candidates" cannot be told apart from "never checked" or "checked while
    // blind", and a reviewer would read "no duplicates" off a check that never happened.
    const block = createBlock();
    expect(block).toContain('catalog_size');
    expect(block).toContain('catalog_absent');
    expect(block).toContain('checked_at');
  });
});
