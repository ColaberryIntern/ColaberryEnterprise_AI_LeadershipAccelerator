/**
 * AF11.0 schema — the `ensure` / `assert` / `guarded` trio, exercised rather than grepped.
 *
 * `ensure` alone CANNOT FAIL: `CREATE TABLE IF NOT EXISTS` is a no-op on an existing table and
 * every statement error is warned rather than raised, so it resolves identically whether the DDL
 * worked or did nothing whatsoever. `assert` is the part that decides, and these tests drive its
 * failure path directly.
 *
 * This file's own distinct property: **a row that cannot say who looked at what must be
 * impossible, not merely discouraged.** AF11.0 names that failure outright — a confirmation
 * recording a date and a state but not the human and the evidence "would satisfy the type and
 * prove nothing". `chk_adcc_evidence_is_present` is where that becomes structural, so its absence
 * is a named post-condition failure rather than a silent accept.
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
  assertCapabilityConfirmationSchema,
  ensureCapabilityConfirmationSchema,
  ensureCapabilityConfirmationSchemaGuarded,
} from '../ensureCapabilityConfirmationSchema';

let warn: jest.SpyInstance;

beforeEach(() => {
  mockQuery.mockReset();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const TABLE = 'agent_domain_capability_confirmations';
const CHECK = 'chk_adcc_evidence_is_present';
const SOURCE = path.join(__dirname, '..', 'ensureCapabilityConfirmationSchema.ts');

/**
 * Answer each read BY THE SQL IT SENT, not by call order. Sequential staging breaks the moment a
 * statement is added, because the guarded path runs `ensure` first and every DDL statement eats
 * one staged answer. Rows come back as RAW ARRAYS, the shape this driver really returns for a
 * single-column select.
 */
function stageAssert(over: {
  tables?: string[]; columns?: string[]; indexes?: string[]; checks?: string[];
} = {}): void {
  mockQuery.mockImplementation((sql: string) => {
    if (/information_schema\.tables/.test(sql)) return Promise.resolve(over.tables ?? [...REQUIRED_TABLES]);
    if (/information_schema\.columns/.test(sql)) return Promise.resolve(over.columns ?? [...REQUIRED_COLUMNS]);
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
    await ensureCapabilityConfirmationSchema();
    expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('WARNS AND CONTINUES when a statement fails, which is why assert has to exist', async () => {
    mockQuery.mockRejectedValue(new TypeError('boom'));
    await expect(ensureCapabilityConfirmationSchema()).resolves.toBeUndefined();
    const line = JSON.parse((warn.mock.calls[0] as string[])[0]);
    expect(line.event).toBe('capability_confirmation_schema_statement_failed');
    expect(line.error_class).toBe('TypeError');
  });
});

describe('assert — the part that actually decides', () => {
  it('resolves when the table, columns, index and constraint are all present', async () => {
    stageAssert();
    await expect(assertCapabilityConfirmationSchema()).resolves.toBeUndefined();
  });

  it('THROWS when the table is missing', async () => {
    stageAssert({ tables: [] });
    await expect(assertCapabilityConfirmationSchema())
      .rejects.toThrow(`SchemaInvariantViolation: missing table ${TABLE}`);
  });

  it('does not drown the real finding in a column list when the table is absent', async () => {
    stageAssert({ tables: [], columns: [] });
    await expect(assertCapabilityConfirmationSchema())
      .rejects.toThrow(`SchemaInvariantViolation: missing table ${TABLE}`);
  });

  it('THROWS naming each evidence column when one is missing', async () => {
    for (const col of ['evidence_kind', 'evidence_source', 'evidence_observed_at', 'evidence_evaluated_by']) {
      stageAssert({ columns: REQUIRED_COLUMNS.filter((c) => !c.endsWith(`.${col}`)) });
      await expect(assertCapabilityConfirmationSchema())
        .rejects.toThrow(`missing column ${TABLE}.${col}`);
    }
  });

  it('THROWS when the human column is missing, because then nobody confirmed it', async () => {
    stageAssert({ columns: REQUIRED_COLUMNS.filter((c) => !c.endsWith('.confirmed_by_identity')) });
    await expect(assertCapabilityConfirmationSchema())
      .rejects.toThrow(`missing column ${TABLE}.confirmed_by_identity`);
  });

  it('THROWS when the CHECK is missing, because that is the rule the table exists to keep', async () => {
    stageAssert({ checks: [] });
    await expect(assertCapabilityConfirmationSchema()).rejects.toThrow(`missing constraint ${CHECK}`);
  });

  it('THROWS when the index is missing', async () => {
    stageAssert({ indexes: [] });
    await expect(assertCapabilityConfirmationSchema()).rejects.toThrow('missing index idx_adcc_confirmed_by');
  });

  it('uses a NAMED bind, the shape proven against this driver', async () => {
    stageAssert();
    await assertCapabilityConfirmationSchema();
    for (const call of mockQuery.mock.calls) {
      expect((call[1] as { bind?: Record<string, unknown> })?.bind).toHaveProperty('names');
    }
  });
});

describe('guarded — the boot entry point', () => {
  it('reports ok when the schema is sound', async () => {
    stageAssert();
    await expect(ensureCapabilityConfirmationSchemaGuarded()).resolves.toEqual({ ok: true });
  });

  it('CANNOT REJECT, so a bad schema never stops the port binding', async () => {
    stageAssert({ tables: [] });
    const result = await ensureCapabilityConfirmationSchemaGuarded();
    expect(result.ok).toBe(false);
    expect(result.error_class).toBe('Error');
  });

  it('logs the failure at error level rather than returning a silent false', async () => {
    stageAssert({ tables: [] });
    await ensureCapabilityConfirmationSchemaGuarded();
    const line = JSON.parse(
      warn.mock.calls.map((c) => c[0] as string).find((s) => s.includes('unavailable')) ?? '{}',
    );
    expect(line.event).toBe('capability_confirmation_schema_unavailable');
    expect(line.level).toBe('error');
  });

  it('derives an error_class from a non-Error throw', async () => {
    mockQuery.mockImplementation(() => Promise.reject('a bare string'));
    const result = await ensureCapabilityConfirmationSchemaGuarded();
    expect(result.error_class).toBe('UnknownError');
  });
});

describe('what this table must never become', () => {
  it('holds no verdict, no grant and no autonomy level', () => {
    // A confirmation is a fact about a requirement. The moment this table can express a decision
    // about a TOOL, it has quietly become the grant that AF3.5 and AF11.4 own.
    const block = createBlock();
    for (const forbidden of ['verdict', 'granted', 'tools_granted', 'autonomy', 'agent_id', 'approved']) {
      expect(block).not.toContain(forbidden);
    }
  });

  it('is keyed one-to-one on the capability', () => {
    expect(createBlock()).toMatch(/capability_id\s+TEXT\s+PRIMARY KEY/);
  });

  it('makes all four evidence fields NOT NULL, not merely recommended', () => {
    const block = createBlock();
    for (const col of ['evidence_kind', 'evidence_source', 'evidence_observed_at', 'evidence_evaluated_by']) {
      expect(block).toMatch(new RegExp(`${col}\\s+TEXT\\s+NOT NULL`));
    }
  });

  it('refuses blank evidence in the CHECK, since NOT NULL alone permits an empty string', () => {
    // The hole NOT NULL leaves open: '' is not null. Without the length test a row could claim a
    // confirmation while naming nothing at all.
    const block = createBlock();
    expect(block).toContain('length(btrim(evidence_source)) > 0');
    expect(block).toContain('length(btrim(confirmed_by_identity)) > 0');
  });

  it('runs no ALTER on anybody else\'s table', () => {
    expect(sourceSql()).not.toContain('ALTER TABLE');
  });

  it('reverts whole, mentioning only its own table', () => {
    expect(ROLLBACK_STATEMENTS).toEqual([`DROP TABLE IF EXISTS ${TABLE}`]);
  });
});
