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

  it('is additive only', () => {
    const joined = BRAND_GOVERNANCE_SCHEMA_STATEMENTS.join('\n').toUpperCase();
    expect(joined).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/);
    expect(joined).not.toMatch(/ALTER\s+TABLE/);
    expect(joined).not.toMatch(/TRUNCATE|DELETE\s+FROM/);
  });
});
