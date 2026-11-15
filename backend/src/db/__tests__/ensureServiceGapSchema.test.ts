import fs from 'fs';
import path from 'path';
import { SERVICE_GAP_ROLLBACK, SERVICE_GAP_STATEMENTS, SERVICE_GAP_TABLES } from '../ensureServiceGapSchema';
import { modelsByTable, modelColumnNames, parseCreatedTables } from './schemaParityHelpers';
import '../../models/ServiceGapAnalysis';
import '../../models/ServiceGapRun';

/**
 * DDL/model parity, additive-only, and the two keys the Gap Detector's guarantees rest on: the analysis idempotency
 * key and the one-running-batch index. Both are asserted in the ensure AND the production migration.
 */
const MIGRATION = path.join(__dirname, '..', '..', 'seeds', 'migrations', '20261115_add_service_gap_tables.sql');
const normalize = (sql: string) => sql.replace(/\s+/g, ' ').replace(/\s*;\s*$/, '').trim().toLowerCase();

describe('ensureServiceGapSchema', () => {
  const created = parseCreatedTables(SERVICE_GAP_STATEMENTS);

  it('creates exactly the two expected tables', () => {
    expect(created.map((c) => c.table).sort()).toEqual([...SERVICE_GAP_TABLES].sort());
  });

  it.each(['service_gap_analyses', 'service_gap_runs'])('model %s declares exactly the DDL columns', (table) => {
    const model = modelsByTable()[table];
    expect(model).toBeDefined();
    const mapped = modelColumnNames(model);
    const ddl = created.find((c) => c.table === table)!.columns;
    expect(ddl.filter((c) => !mapped.has(c))).toEqual([]);
    expect([...mapped].filter((c) => !ddl.includes(c))).toEqual([]);
  });

  it('is additive only and idempotent', () => {
    const joined = SERVICE_GAP_STATEMENTS.join('\n').toUpperCase();
    expect(joined).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/);
    expect(joined).not.toMatch(/RENAME|ALTER\s+TABLE|TRUNCATE|DELETE\s+FROM/);
    for (const sql of SERVICE_GAP_STATEMENTS) expect(sql).toMatch(/IF\s+NOT\s+EXISTS/i);
  });

  it('keys analyses on (tenant, case study, both fingerprints, prompt version) - the idempotency key', () => {
    expect(SERVICE_GAP_STATEMENTS.some((s) => /CREATE UNIQUE INDEX IF NOT EXISTS service_gap_analyses_key_idx\s+ON service_gap_analyses \(tenant_id, case_study_id, case_study_fingerprint, catalog_fingerprint, prompt_version\)/.test(s))).toBe(true);
  });

  it('allows one running batch per tenant, decided by the database', () => {
    expect(SERVICE_GAP_STATEMENTS.some((s) => /CREATE UNIQUE INDEX IF NOT EXISTS service_gap_runs_one_running_idx\s+ON service_gap_runs \(tenant_id\) WHERE status = 'running'/.test(s))).toBe(true);
  });

  it('cascades from case_studies', () => {
    expect(SERVICE_GAP_STATEMENTS[0]).toMatch(/case_study_id UUID NOT NULL REFERENCES case_studies\(id\) ON DELETE CASCADE/);
  });

  it('the production migration carries every ensure statement verbatim (modulo whitespace)', () => {
    const migration = normalize(fs.readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*\n/g, '\n'));
    for (const statement of SERVICE_GAP_STATEMENTS) expect(migration).toContain(normalize(statement));
    expect(migration).toMatch(/^begin;/);
    expect(migration).toMatch(/commit$/);
  });

  it('rolls back only its own tables', () => {
    expect(SERVICE_GAP_ROLLBACK).toEqual(['DROP TABLE IF EXISTS service_gap_runs', 'DROP TABLE IF EXISTS service_gap_analyses']);
  });
});
