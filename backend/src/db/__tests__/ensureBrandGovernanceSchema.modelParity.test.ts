import { BRAND_GOVERNANCE_SCHEMA_STATEMENTS } from '../ensureBrandGovernanceSchema';
import { modelsByTable, modelColumnNames, parseCreatedTables } from './schemaParityHelpers';
import '../../models';

/**
 * Schema/model parity for brand_governance_rules, in the same shape as the other five
 * ensure* suites in this workstream.
 */

describe('ensureBrandGovernanceSchema — DDL and model agree', () => {
  const created = parseCreatedTables(BRAND_GOVERNANCE_SCHEMA_STATEMENTS);

  it('creates exactly one table', () => {
    expect(created.map((t) => t.table)).toEqual(['brand_governance_rules']);
  });

  it('every DDL column is declared on the model, and vice versa', () => {
    const model = modelsByTable()['brand_governance_rules'];
    expect(model).toBeDefined();
    const mapped = modelColumnNames(model);
    const ddl = created.find((t) => t.table === 'brand_governance_rules')!.columns;
    expect(ddl.filter((c) => !mapped.has(c))).toEqual([]);
    expect(Array.from(mapped).filter((c) => !ddl.includes(c))).toEqual([]);
  });

  it('versions are unique per brand, enforced by the database', () => {
    // Two publishers racing for version 4 must produce one winner and one loud failure, not
    // two rows that disagree about what version 4 says.
    const idx = BRAND_GOVERNANCE_SCHEMA_STATEMENTS.find((s) => s.includes('brand_governance_rules_brand_version_unique'));
    expect(idx).toBeDefined();
    expect(idx).toMatch(/UNIQUE INDEX/);
    expect(idx).toMatch(/\(brand_id, version\)/);
  });

  it('every statement is idempotent', () => {
    for (const sql of BRAND_GOVERNANCE_SCHEMA_STATEMENTS) expect(sql).toMatch(/IF NOT EXISTS/i);
  });

  it('is additive only - the same guards the other five suites apply', () => {
    // Not a blanket ban on ALTER TABLE: `ADD COLUMN IF NOT EXISTS` on brands IS additive. What
    // is banned is every form that could destroy or rewrite live rows.
    const joined = BRAND_GOVERNANCE_SCHEMA_STATEMENTS.join('\n').toUpperCase();
    expect(joined).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/);
    expect(joined).not.toMatch(/RENAME/);
    expect(joined).not.toMatch(/ALTER\s+COLUMN/);
    expect(joined).not.toMatch(/SET\s+NOT\s+NULL/);
    expect(joined).not.toMatch(/ADD\s+COLUMN[^\n]*NOT\s+NULL/);
    expect(joined).not.toMatch(/TRUNCATE|DELETE\s+FROM|UPDATE\s+BRANDS/);
  });

  it('the brands.timezone column it adds is declared on the Brand model, nullable', () => {
    // The live-table stakes: a column the model declares and the DB lacks breaks every brand
    // read in the product, not just the calendar.
    const brand = modelsByTable()['brands'];
    expect(brand).toBeDefined();
    expect(modelColumnNames(brand).has('timezone')).toBe(true);
    const attr = brand.getAttributes().timezone;
    expect(attr.allowNull).toBe(true);
  });
});
