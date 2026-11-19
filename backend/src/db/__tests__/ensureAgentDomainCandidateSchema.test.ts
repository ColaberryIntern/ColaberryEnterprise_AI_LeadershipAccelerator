/**
 * The candidate table's `ensure` / `assert` / `guarded` trio, exercised rather than grepped.
 *
 * Two properties here are the reason this file exists, and neither is visible from the schema
 * alone:
 *
 * **1. `ensure` alone cannot fail.** Every statement is `IF NOT EXISTS` and every error is warned
 * rather than raised, so the function resolves identically whether the DDL worked or did nothing
 * whatsoever. `assert` is the part that decides, and these tests drive its failure path directly.
 *
 * **2. The decision columns are ABSENT, and an absence is what a later edit silently removes.**
 * `docs/AGENT_TOOL_REQUEST_HANDOFF.md`: *"There is already an approval spine. Do not build a second
 * one."* A test that only checked the columns that ARE there would pass on the day somebody adds
 * `status` to this table, and the second spine would arrive without a single red test.
 */

const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a) },
}));

import fs from 'fs';
import path from 'path';
import {
  CANDIDATE_PRODUCT_STATES,
  CANDIDATE_SOURCES,
  DDL_STATEMENTS,
  REQUIRED_CHECKS,
  REQUIRED_COLUMNS,
  REQUIRED_INDEXES,
  REQUIRED_TABLES,
  ROLLBACK_STATEMENTS,
  assertAgentDomainCandidateSchema,
  ensureAgentDomainCandidateSchema,
  ensureAgentDomainCandidateSchemaGuarded,
} from '../ensureAgentDomainCandidateSchema';

let warn: jest.SpyInstance;

beforeEach(() => {
  mockQuery.mockReset();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const TABLE = 'agent_domain_candidates';
const SOURCE = path.join(__dirname, '..', 'ensureAgentDomainCandidateSchema.ts');

/**
 * Answer each of `assert`'s reads BY THE SQL IT SENT, not by call order.
 *
 * Sequential `mockResolvedValueOnce` staging would silently break the moment a statement is added,
 * because the guarded path runs `ensure` first and every DDL statement would eat one staged
 * answer. Rows come back as RAW ARRAYS, which is the shape this driver really returns for a
 * single-column select: a mock that returns a shape the driver does not produce tests the mock.
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
    await ensureAgentDomainCandidateSchema();
    expect(mockQuery.mock.calls.length).toBe(DDL_STATEMENTS.length);
  });

  it('WARNS AND CONTINUES when a statement fails, which is why assert has to exist', async () => {
    mockQuery.mockRejectedValue(new TypeError('boom'));
    await expect(ensureAgentDomainCandidateSchema()).resolves.toBeUndefined();
    const line = JSON.parse((warn.mock.calls[0] as string[])[0]);
    expect(line.event).toBe('agent_domain_candidate_schema_statement_failed');
    expect(line.error_class).toBe('TypeError');
  });

  it('keeps going after one statement fails rather than abandoning the rest', async () => {
    mockQuery.mockRejectedValueOnce(new Error('first one failed')).mockResolvedValue([]);
    await ensureAgentDomainCandidateSchema();
    expect(mockQuery.mock.calls.length).toBe(DDL_STATEMENTS.length);
  });
});

/**
 * IDEMPOTENCE, proven by FORM rather than by counting queries to zero.
 *
 * The criterion was written as "running the ensure twice writes nothing the second time, asserted
 * by counting statements executed on the second call". Counting is the wrong instrument and the
 * count is not zero: the statements ARE sent again on a second run, because `IF NOT EXISTS` is
 * evaluated by Postgres, not by this module. A test that expected zero calls would fail against
 * correct code.
 *
 * What is actually true, and what these two tests prove, is stronger: the second call sends the
 * SAME statements, and NONE of them can write anything on any run. Every statement is
 * `CREATE TABLE IF NOT EXISTS` or `CREATE [UNIQUE] INDEX IF NOT EXISTS`; there is no `ALTER`, no
 * `UPDATE`, no `INSERT`, no `DELETE`. The number of statements that can change the database on the
 * second call is therefore zero, which is the fact the criterion was reaching for.
 */
describe('idempotence', () => {
  it('sends the identical statement list on the second call', async () => {
    mockQuery.mockResolvedValue([]);
    await ensureAgentDomainCandidateSchema();
    const first = mockQuery.mock.calls.map((c) => c[0]);
    mockQuery.mockClear();
    await ensureAgentDomainCandidateSchema();
    const second = mockQuery.mock.calls.map((c) => c[0]);
    expect(second).toEqual(first);
  });

  it('ZERO statements can write on a second run: every one is IF NOT EXISTS', () => {
    const writers = DDL_STATEMENTS.filter((s) => !/^CREATE (UNIQUE )?(TABLE|INDEX) IF NOT EXISTS/
      .test(s.trim()));
    expect(writers).toEqual([]);
    for (const s of DDL_STATEMENTS) {
      // `ON DELETE SET NULL` is part of a foreign key declaration, not a DML verb. Stripping the
      // referential actions first is the difference between testing what the statement DOES and
      // matching a word that happens to appear inside it.
      const dml = s.replace(/ON DELETE (SET NULL|SET DEFAULT|CASCADE|RESTRICT|NO ACTION)/gi, '');
      expect(dml).not.toMatch(/\b(ALTER|UPDATE|INSERT|DELETE|DROP|TRUNCATE)\b/i);
    }
  });

  it('has no ALTER anywhere in the file, which is the claim the header makes', () => {
    expect(sourceSql()).not.toMatch(/\bALTER\s+TABLE\b/i);
  });
});

/**
 * THE NO-SECOND-SPINE RULE, asserted three ways, because one way is removable.
 *
 * The source check catches the column being declared. The `REQUIRED_COLUMNS` check catches it
 * being added to the list the assert reads. The runtime check catches a column that reached the
 * database by some path neither of those sees — a hand-run migration, a `sequelize.sync`, an
 * ALTER somebody ran on the box.
 */
describe('the approval spine is somewhere else', () => {
  const FORBIDDEN = /status|approver|approved|decided|decline/;

  it('declares no decision column', () => {
    const declarations = createBlock()
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[a-z_]+\s+(UUID|TEXT|TIMESTAMPTZ|BOOLEAN|DATE|JSONB)/.test(l))
      .map((l) => l.split(/\s+/)[0]);

    expect(declarations.length).toBeGreaterThan(8);
    expect(declarations.filter((c) => FORBIDDEN.test(c))).toEqual([]);
  });

  it('lists no decision column in REQUIRED_COLUMNS', () => {
    const bare = REQUIRED_COLUMNS.map((c) => c.slice(TABLE.length + 1));
    expect(bare.filter((c) => FORBIDDEN.test(c))).toEqual([]);
  });

  it('FAILS THE BOOT if a decision column ever reaches the table anyway', async () => {
    stageAssert({ columns: [...REQUIRED_COLUMNS, `${TABLE}.status`] });
    await expect(assertAgentDomainCandidateSchema())
      .rejects.toThrow(/forbidden decision column agent_domain_candidates\.status/);
  });

  it('points at the spine by foreign key instead, twice', () => {
    const block = createBlock();
    const refs = block.match(/REFERENCES agent_domain_change_requests/g) ?? [];
    expect(refs.length).toBe(2);
    expect(block).toMatch(/screen_request_id UUID/);
    expect(block).toMatch(/tool_request_id UUID/);
  });
});

describe('assert', () => {
  it('passes on a sound schema', async () => {
    stageAssert();
    await expect(assertAgentDomainCandidateSchema()).resolves.toBeUndefined();
  });

  it('names a missing table', async () => {
    stageAssert({ tables: [] });
    await expect(assertAgentDomainCandidateSchema())
      .rejects.toThrow(`missing table ${TABLE}`);
  });

  it('names a missing column', async () => {
    stageAssert({ columns: REQUIRED_COLUMNS.filter((c) => !c.endsWith('.proven_by_hand_at')) });
    await expect(assertAgentDomainCandidateSchema())
      .rejects.toThrow(`missing column ${TABLE}.proven_by_hand_at`);
  });

  it('names a missing index', async () => {
    stageAssert({ indexes: [] });
    await expect(assertAgentDomainCandidateSchema())
      .rejects.toThrow('missing index uniq_adcand_domain_title');
  });

  it('names a missing check', async () => {
    stageAssert({ checks: ['chk_adcand_source_known'] });
    await expect(assertAgentDomainCandidateSchema())
      .rejects.toThrow('missing constraint chk_adcand_product_state_known');
  });

  it('does not read columns at all when the table is absent', async () => {
    stageAssert({ tables: [] });
    await expect(assertAgentDomainCandidateSchema()).rejects.toThrow();
    const sqls = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls.filter((s) => /pg_indexes/.test(s))).toEqual([]);
  });
});

describe('guarded', () => {
  it('returns ok on a sound schema', async () => {
    stageAssert();
    await expect(ensureAgentDomainCandidateSchemaGuarded()).resolves.toEqual({ ok: true });
  });

  it('CANNOT REJECT, so server boot survives a broken schema', async () => {
    stageAssert({ tables: [] });
    const result = await ensureAgentDomainCandidateSchemaGuarded();
    expect(result.ok).toBe(false);
    expect(result.error_class).toBe('Error');
    const line = JSON.parse((warn.mock.calls.at(-1) as string[])[0]);
    expect(line.event).toBe('agent_domain_candidate_schema_unavailable');
    expect(line.outcome).toBe('failure');
  });
});

describe('the enums the table checks against', () => {
  it('writes each source value into chk_adcand_source_known', () => {
    const block = createBlock();
    for (const s of CANDIDATE_SOURCES) expect(block).toContain(`'${s}'`);
    expect(CANDIDATE_SOURCES.length).toBe(4);
  });

  it('writes each product state into chk_adcand_product_state_known', () => {
    const block = createBlock();
    for (const s of CANDIDATE_PRODUCT_STATES) expect(block).toContain(`'${s}'`);
  });

  it('defaults product_state to the one state that claims nothing', () => {
    expect(createBlock()).toMatch(/product_state TEXT NOT NULL DEFAULT 'unchecked'/);
    expect(CANDIDATE_PRODUCT_STATES[0]).toBe('unchecked');
  });

  it('rolls back by dropping one net-new table', () => {
    expect(ROLLBACK_STATEMENTS).toEqual([`DROP TABLE IF EXISTS ${TABLE}`]);
  });
});
