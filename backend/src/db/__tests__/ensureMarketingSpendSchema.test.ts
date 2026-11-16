import { Sequelize } from 'sequelize';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { injectReplacements } = require('sequelize/lib/utils/sql');
import {
  MARKETING_SPEND_SCHEMA_STATEMENTS, REQUIRED_COLUMNS_QUERY, requiredColumnTables,
} from '../ensureMarketingSpendSchema';

/**
 * Boot crash 2026-11-16: `table_name = ANY(:tables)` was expanded by Sequelize to
 * `ANY('marketing_spend_syncs')`, a malformed array literal, and production crash-looped.
 * This runs the query through Sequelize's own replacement step (no database connection).
 */
describe('marketing spend schema: required-columns check query', () => {
  const s = new Sequelize('postgres://u:p@127.0.0.1:5432/never_connected', { logging: false });
  afterAll(() => s.close());

  it('expands the table list into IN (...), never into ANY(\'...\')', () => {
    const sql: string = injectReplacements(REQUIRED_COLUMNS_QUERY, s.getDialect() === 'postgres' ? (s as any).dialect : null, { tables: requiredColumnTables() });
    expect(sql).toContain("table_name IN ('marketing_spend_syncs')");
    expect(sql).not.toMatch(/ANY\s*\(\s*'/);
  });

  it('lists each table once', () => {
    const t = requiredColumnTables();
    expect(new Set(t).size).toBe(t.length);
    expect(t.length).toBeGreaterThan(0);
  });
});

/**
 * ADS-9: rows_skipped is persisted, so "success with 12 rows skipped" is visible in the ledger
 * rather than only in a log line.
 *
 * The load-bearing assertion is the ALTER. The table already exists in production, so adding the
 * column to CREATE TABLE alone would give it to a fresh database and never to the real one -
 * a change that passes every test and does nothing where it matters.
 */
describe('marketing spend schema', () => {
  const all = MARKETING_SPEND_SCHEMA_STATEMENTS.join('\n');

  it('adds rows_skipped to the CREATE, for databases that do not exist yet', () => {
    const create = MARKETING_SPEND_SCHEMA_STATEMENTS.find((s) => s.includes('CREATE TABLE IF NOT EXISTS marketing_spend_syncs'));
    expect(create).toBeDefined();
    expect(create).toMatch(/rows_skipped INTEGER\s+NOT NULL DEFAULT 0/);
  });

  it('ALSO alters the existing table, which is the only way production gets the column', () => {
    const alter = MARKETING_SPEND_SCHEMA_STATEMENTS.find((s) => s.startsWith('ALTER TABLE marketing_spend_syncs'));
    expect(alter).toBeDefined();
    expect(alter).toMatch(/ADD COLUMN IF NOT EXISTS rows_skipped INTEGER NOT NULL DEFAULT 0/);
  });

  it('declares rows_skipped NOT NULL, so "none skipped" and "never counted" cannot be confused', () => {
    // A nullable column would reintroduce the exact ambiguity this ticket removes.
    expect(all).not.toMatch(/rows_skipped INTEGER\s*,/);
    expect(all).not.toMatch(/rows_skipped INTEGER NULL/);
  });

  it('stays additive: no DROP, no TRUNCATE, and no ALTER that is not an additive ADD COLUMN', () => {
    expect(all).not.toMatch(/\bDROP\b/i);
    expect(all).not.toMatch(/\bTRUNCATE\b/i);
    for (const s of MARKETING_SPEND_SCHEMA_STATEMENTS.filter((x) => /^ALTER/i.test(x))) {
      expect(s).toMatch(/ADD COLUMN IF NOT EXISTS/i);
    }
  });

  it('keeps every statement safe to run twice', () => {
    for (const s of MARKETING_SPEND_SCHEMA_STATEMENTS) {
      expect(s).toMatch(/IF NOT EXISTS/);
    }
  });
});
