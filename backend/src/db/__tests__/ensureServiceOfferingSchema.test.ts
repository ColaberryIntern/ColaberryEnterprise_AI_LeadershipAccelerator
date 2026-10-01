import { SERVICE_OFFERING_STATEMENTS, REQUIRED_TABLES } from '../ensureServiceOfferingSchema';
import { modelsByTable, modelColumnNames, parseCreatedTables } from './schemaParityHelpers';
// Register the model so sequelize.models knows it (Model.init needs no DB connection).
import '../../models/ServiceOffering';

/**
 * DDL/model parity + additive-only guarantee for Colaberry's service catalog. A dropped column here would silently
 * lose a service's matching signals (keywords/NAICS/PSC), so the DDL↔model agreement and the additive-only shape
 * are asserted explicitly.
 */
describe('ensureServiceOfferingSchema — DDL and model agree', () => {
  const created = parseCreatedTables(SERVICE_OFFERING_STATEMENTS);

  it('creates exactly the one expected table', () => {
    expect(created.map((c) => c.table).sort()).toEqual([...REQUIRED_TABLES].sort());
  });

  it('every created column is declared as a model attribute', () => {
    const byTable = modelsByTable();
    const missing: string[] = [];
    for (const { table, columns } of created) {
      const model = byTable[table];
      if (!model) continue;
      const mapped = modelColumnNames(model);
      for (const column of columns) if (!mapped.has(column)) missing.push(`${table}.${column}`);
    }
    expect(missing).toEqual([]);
  });

  it('declares no model attribute that the DDL will not create', () => {
    const byTable = modelsByTable();
    const extra: string[] = [];
    for (const { table, columns } of created) {
      const model = byTable[table];
      if (!model) continue;
      const ddl = new Set(columns);
      for (const field of modelColumnNames(model)) if (!ddl.has(field)) extra.push(`${table}.${field}`);
    }
    expect(extra).toEqual([]);
  });

  it('is additive only and idempotent (never ALTER/DROP/RENAME an existing table)', () => {
    const joined = SERVICE_OFFERING_STATEMENTS.join('\n').toUpperCase();
    expect(joined).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/);
    expect(joined).not.toMatch(/RENAME|ALTER\s+TABLE|TRUNCATE|DELETE\s+FROM/);
    for (const sql of SERVICE_OFFERING_STATEMENTS) expect(sql).toMatch(/IF\s+NOT\s+EXISTS/i);
  });

  it('introduces NO foreign keys (tenant-scoped by tenant_id; no existing table is touched)', () => {
    expect(SERVICE_OFFERING_STATEMENTS.join('\n')).not.toMatch(/REFERENCES/i);
  });

  it('carries the matching signals + the soft-retire status + tenant scope', () => {
    const mapped = modelColumnNames(modelsByTable()['service_offerings']);
    for (const col of ['tenant_id', 'name', 'category', 'keywords_json', 'naics_codes_json', 'psc_codes_json', 'past_performance', 'owner', 'status']) {
      expect(mapped.has(col)).toBe(true);
    }
  });

  it('indexes the hot read path (tenant_id, status)', () => {
    const idx = SERVICE_OFFERING_STATEMENTS.find((s) => s.includes('idx_service_offering_tenant_status'));
    expect(idx).toMatch(/CREATE\s+INDEX/i);
    expect(idx).toMatch(/\(\s*tenant_id\s*,\s*status\s*\)/);
  });
});
