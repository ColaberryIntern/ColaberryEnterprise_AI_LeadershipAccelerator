import { MARKETING_SPEND_SCHEMA_STATEMENTS } from '../ensureMarketingSpendSchema';

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
