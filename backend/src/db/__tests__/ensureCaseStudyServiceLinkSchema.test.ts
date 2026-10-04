import {
  CASE_STUDY_SERVICE_LINK_STATEMENTS,
  REQUIRED_TABLES,
} from '../ensureCaseStudyServiceLinkSchema';
import { modelsByTable, modelColumnNames, parseCreatedTables } from './schemaParityHelpers';
// Register the model so sequelize.models knows it (Model.init needs no DB connection).
import '../../models/CaseStudyServiceLink';

/**
 * DDL/model parity and the additive-only guarantee for the case-study/service link.
 *
 * Two things are asserted here that the sibling schemas do not assert, because this table differs from them on
 * purpose and a difference nobody tests is a difference nobody meant:
 *
 *   - it DOES carry foreign keys, with ON DELETE CASCADE. A case study was permanently deleted on 2026-10-02 and
 *     the delete rolled back on its first attempt because a child table linked through a column the schema scan had
 *     not thought to look for. Cascade means a future deletion can neither orphan a link nor be blocked by one.
 *   - `state` exists and defaults to `suggested`. These rows feed past-performance claims in government bids, so a
 *     row must never begin life asserting that a human agreed with it.
 */
describe('ensureCaseStudyServiceLinkSchema — DDL and model agree', () => {
  const created = parseCreatedTables(CASE_STUDY_SERVICE_LINK_STATEMENTS);

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
    const joined = CASE_STUDY_SERVICE_LINK_STATEMENTS.join('\n').toUpperCase();
    expect(joined).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/);
    expect(joined).not.toMatch(/RENAME|ALTER\s+TABLE|TRUNCATE|DELETE\s+FROM/);
    for (const sql of CASE_STUDY_SERVICE_LINK_STATEMENTS) expect(sql).toMatch(/IF\s+NOT\s+EXISTS/i);
  });

  it('cascades from BOTH parents, so a deletion cannot orphan a link or be blocked by one', () => {
    const create = CASE_STUDY_SERVICE_LINK_STATEMENTS[0];
    expect(create).toMatch(/case_study_id[^,]*REFERENCES\s+case_studies\(id\)\s+ON\s+DELETE\s+CASCADE/i);
    expect(create).toMatch(/service_offering_id[^,]*REFERENCES\s+service_offerings\(id\)\s+ON\s+DELETE\s+CASCADE/i);
  });

  it('starts every link as a proposal, never as an agreement', () => {
    const create = CASE_STUDY_SERVICE_LINK_STATEMENTS[0];
    expect(create).toMatch(/state\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'suggested'/i);
    const mapped = modelColumnNames(modelsByTable()['case_study_service_links']);
    for (const col of ['state', 'rationale', 'match_score', 'decided_by', 'decided_at']) {
      expect(mapped.has(col)).toBe(true);
    }
  });

  it('allows one row per pair, and indexes both read directions', () => {
    const joined = CASE_STUDY_SERVICE_LINK_STATEMENTS.join('\n');
    expect(joined).toMatch(/CREATE\s+UNIQUE\s+INDEX[\s\S]*\(\s*case_study_id\s*,\s*service_offering_id\s*\)/i);
    expect(joined).toMatch(/\(\s*service_offering_id\s*,\s*state\s*\)/i);
    expect(joined).toMatch(/\(\s*case_study_id\s*,\s*state\s*\)/i);
  });
});
