import { GOV_QUALIFICATION_STATEMENTS, REQUIRED_TABLES } from '../ensureGovQualificationSchema';
import { modelsByTable, modelColumnNames, parseCreatedTables } from './schemaParityHelpers';
// Register the three models so sequelize.models knows them (Model.init needs no DB connection).
import '../../models/GovQualification';
import '../../models/BuildAuthorization';
import '../../models/GovOpportunityAlias';

/**
 * DDL/model parity for the Enterprise gov qualification model. The contract_* tables never got a parity test —
 * this closes that gap for the Phase-2 tables. The stakes: gov_qualifications carries the immutable source
 * snapshot + version a bid decision was bound to; a dropped write there would let an approval silently lose the
 * evidence it was made against.
 */
describe('ensureGovQualificationSchema — DDL and models agree', () => {
  const created = parseCreatedTables(GOV_QUALIFICATION_STATEMENTS);

  it('creates exactly the three expected tables', () => {
    expect(created.map((c) => c.table).sort()).toEqual([...REQUIRED_TABLES].sort());
  });

  it('every created table has a registered Sequelize model', () => {
    const byTable = modelsByTable();
    expect(created.map((c) => c.table).filter((t) => !byTable[t])).toEqual([]);
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
    const joined = GOV_QUALIFICATION_STATEMENTS.join('\n').toUpperCase();
    expect(joined).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/);
    expect(joined).not.toMatch(/RENAME|ALTER\s+TABLE|TRUNCATE|DELETE\s+FROM/);
    for (const sql of GOV_QUALIFICATION_STATEMENTS) expect(sql).toMatch(/IF\s+NOT\s+EXISTS/i);
  });

  it('FKs point only at existing tables (delivery_projects) or the earlier-created gov_qualifications', () => {
    const refs = GOV_QUALIFICATION_STATEMENTS.join('\n').match(/REFERENCES\s+(\w+)/gi) || [];
    const targets = new Set(refs.map((r) => r.replace(/REFERENCES\s+/i, '').toLowerCase()));
    for (const t of targets) expect(['delivery_projects', 'gov_qualifications']).toContain(t);
  });
});

describe('race-safety + immutability + isolation', () => {
  it('approval is race-safe AND allows separate-entity pursuits: UNIQUE on (canonical, bidding_entity, version)', () => {
    const idx = GOV_QUALIFICATION_STATEMENTS.find((s) => s.includes('uq_gov_qual_thread_version'));
    expect(idx).toMatch(/CREATE\s+UNIQUE\s+INDEX/i);
    expect(idx).toMatch(/\(\s*canonical_opportunity_id\s*,\s*bidding_entity\s*,\s*version\s*\)/);
  });

  it('one opportunity maps to one project: gov_opportunity_aliases is UNIQUE on canonical_opportunity_id', () => {
    const idx = GOV_QUALIFICATION_STATEMENTS.find((s) => s.includes('uq_gov_opp_alias_canonical'));
    expect(idx).toMatch(/CREATE\s+UNIQUE\s+INDEX/i);
    expect(idx).toMatch(/\(\s*canonical_opportunity_id\s*\)/);
  });

  it('the qualification carries its own tenant_id (Enterprise-owned spine table) and the immutable source snapshot', () => {
    const mapped = modelColumnNames(modelsByTable()['gov_qualifications']);
    for (const col of ['tenant_id', 'organization_id', 'bidding_entity', 'source_snapshot', 'source_snapshot_version', 'source_available', 'requirements_json', 'version', 'superseded_by_id']) {
      expect(mapped.has(col)).toBe(true);
    }
  });

  it('build authorization is a separate record with a named approver + scope + resource limit', () => {
    const mapped = modelColumnNames(modelsByTable()['build_authorizations']);
    for (const col of ['approver_identity_id', 'scope', 'resource_limit', 'delivery_project_id']) {
      expect(mapped.has(col)).toBe(true);
    }
  });
});
