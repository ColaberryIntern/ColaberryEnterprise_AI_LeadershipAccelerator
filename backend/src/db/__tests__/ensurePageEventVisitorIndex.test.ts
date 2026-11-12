/**
 * The `page_events (visitor_id, timestamp DESC)` index — the `ensure` / `assert` / `guarded` trio.
 *
 * The property a mocked test normally cannot see is the one that matters: **`ensure` alone cannot
 * fail.** `CREATE INDEX IF NOT EXISTS` is a no-op on an existing index and every statement error is
 * warned rather than raised, so the function resolves identically whether the DDL worked or did
 * nothing whatsoever. So `assert` is the part that decides, and these tests drive its failure path
 * directly.
 *
 * This file's own distinct property, which no sibling has: **it does not own its table.** Every
 * other `ensure*Schema` module creates a net-new table and may therefore do what it likes with it.
 * `page_events` already exists, is the largest table in the schema, and the tracker writes to it
 * constantly. So the tests below assert what this module must NOT do — create that table, or
 * mention it in a rollback — because those are exactly the lines a later edit adds "for symmetry"
 * with the siblings, and the damage would not show up until a production boot.
 */

const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a) },
}));

import fs from 'fs';
import path from 'path';
import {
  INDEX_NAME,
  REQUIRED_INDEXES,
  REQUIRED_TABLES,
  ROLLBACK_STATEMENTS,
  assertPageEventVisitorIndex,
  ensurePageEventVisitorIndex,
  ensurePageEventVisitorIndexGuarded,
} from '../ensurePageEventVisitorIndex';

let warn: jest.SpyInstance;

beforeEach(() => {
  mockQuery.mockReset();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const SOURCE = path.join(__dirname, '..', 'ensurePageEventVisitorIndex.ts');

/**
 * Answer each of `assert`'s reads BY THE SQL IT SENT, not by call order. Sequential staging breaks
 * the moment a statement is added, because the guarded path runs `ensure` first and every DDL
 * statement eats one staged answer.
 *
 * Rows come back as RAW ARRAYS, which is the shape this driver really returns for a single-column
 * select. A mock returning a shape the driver does not produce tests the mock.
 */
function stageAssert(over: { tables?: string[]; indexes?: string[] } = {}): void {
  mockQuery.mockImplementation((sql: string) => {
    if (/information_schema\.tables/.test(sql)) {
      return Promise.resolve(over.tables ?? [...REQUIRED_TABLES]);
    }
    if (/pg_indexes/.test(sql)) return Promise.resolve(over.indexes ?? [...REQUIRED_INDEXES]);
    return Promise.resolve([]);
  });
}

/** The file's own SQL with comments stripped, so prose ABOUT sql is never read as sql. */
function sourceSql(): string {
  return fs.readFileSync(SOURCE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

describe('ensure', () => {
  it('issues the create-index statement', async () => {
    mockQuery.mockResolvedValue([]);
    await ensurePageEventVisitorIndex();
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/CREATE INDEX IF NOT EXISTS/i);
  });

  it('WARNS AND CONTINUES when the statement fails, which is why assert has to exist', async () => {
    mockQuery.mockRejectedValue(new TypeError('boom'));
    await expect(ensurePageEventVisitorIndex()).resolves.toBeUndefined();
    const line = JSON.parse((warn.mock.calls[0] as string[])[0]);
    expect(line.event).toBe('page_event_visitor_index_statement_failed');
    expect(line.error_class).toBe('TypeError');
  });
});

describe('assert — the part that actually decides', () => {
  it('resolves when the table and the index are both present', async () => {
    stageAssert();
    await expect(assertPageEventVisitorIndex()).resolves.toBeUndefined();
  });

  it('THROWS when the index is missing, rather than warning', async () => {
    stageAssert({ indexes: [] });
    await expect(assertPageEventVisitorIndex())
      .rejects.toThrow(new RegExp(`SchemaInvariantViolation.*missing index ${INDEX_NAME}`));
  });

  it('THROWS when the table is missing', async () => {
    stageAssert({ tables: [] });
    await expect(assertPageEventVisitorIndex())
      .rejects.toThrow(/SchemaInvariantViolation.*missing table page_events/);
  });

  /**
   * A missing table makes the index missing too. Reporting both would bury the finding that
   * explains the other one, and the explanation is the whole value of the message.
   */
  it('reports only the missing table, not the index it makes unreachable', async () => {
    stageAssert({ tables: [], indexes: [] });
    await expect(assertPageEventVisitorIndex()).rejects.toThrow(
      /SchemaInvariantViolation: missing table page_events$/,
    );
  });
});

describe('guarded — the boot entry point', () => {
  it('reports ok when the index is there', async () => {
    stageAssert();
    await expect(ensurePageEventVisitorIndexGuarded()).resolves.toEqual({ ok: true });
  });

  /**
   * A missing index is a performance problem, not a correctness one. It must never be the reason
   * the backend fails to come up, which is what lets `server.ts` await this bare.
   */
  it('CANNOT REJECT when the schema is wrong; it reports and lets the boot continue', async () => {
    stageAssert({ indexes: [] });
    const result = await ensurePageEventVisitorIndexGuarded();
    expect(result.ok).toBe(false);
    expect(result.error_class).toBe('Error');
    const line = JSON.parse((warn.mock.calls.at(-1) as string[])[0]);
    expect(line.event).toBe('page_event_visitor_index_unavailable');
    expect(line.level).toBe('error');
  });
});

describe('it does not own page_events', () => {
  /**
   * The line a later edit adds for symmetry with the siblings, every one of which creates its own
   * table. Here it would conjure a `page_events` with the wrong shape, which the tracker would
   * then write into.
   */
  it('never creates the table it indexes', () => {
    expect(sourceSql()).not.toMatch(/CREATE TABLE/i);
  });

  it('rolls back only the index, never the table', () => {
    expect(ROLLBACK_STATEMENTS).toHaveLength(1);
    expect(ROLLBACK_STATEMENTS[0]).toMatch(/^DROP INDEX IF EXISTS/i);
    expect(ROLLBACK_STATEMENTS.join(' ')).not.toMatch(/DROP TABLE/i);
  });

  /**
   * Both columns, in this order, with the ordering on the trailing one. `visitor_id` alone would
   * still find the rows and then sort them; the point of the trailing `timestamp DESC` is that
   * newest-first comes off the index, which is the shape of the ROW_NUMBER window that reads it.
   */
  it('indexes (visitor_id, timestamp DESC), which is the shape of the query it serves', () => {
    const sql = sourceSql();
    expect(sql).toMatch(/ON page_events \(visitor_id, "timestamp" DESC\)/i);
  });

  /**
   * Not CONCURRENTLY, deliberately: it cannot run inside a transaction and leaves an INVALID index
   * behind if it fails partway, which is a worse thing to own at boot than a few seconds of
   * blocked inserts during a deploy the backend is restarting through anyway.
   */
  it('does not use CONCURRENTLY, whose failure mode is an INVALID index', () => {
    expect(sourceSql()).not.toMatch(/CONCURRENTLY/i);
  });
});
