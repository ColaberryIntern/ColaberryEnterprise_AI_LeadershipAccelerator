import fs from 'fs';
import path from 'path';
import {
  CASE_STUDY_EXTERNAL_IMPORT_STATEMENTS,
  CASE_STUDY_EXTERNAL_IMPORT_ROLLBACK,
  REQUIRED_TABLES,
} from '../ensureCaseStudyExternalImportSchema';
import { modelsByTable, modelColumnNames, parseCreatedTables } from './schemaParityHelpers';
// Register the model so sequelize.models knows it (Model.init needs no DB connection).
import '../../models/CaseStudyExternalImport';

/**
 * DDL/model parity, the additive-only guarantee, and the idempotency key for the outside case-study intake.
 *
 * The unique index on content_hash is the whole reason the table exists: without it a second import of the same
 * PDF creates a second draft record. So it is asserted in BOTH places it must exist - the boot-time ensure and the
 * production migration - and the two are asserted to say the same thing.
 */
const MIGRATION = path.join(__dirname, '..', '..', 'seeds', 'migrations', '20261113_add_case_study_external_imports.sql');
const normalize = (sql: string) => sql.replace(/\s+/g, ' ').replace(/\s*;\s*$/, '').trim().toLowerCase();

describe('ensureCaseStudyExternalImportSchema', () => {
  const created = parseCreatedTables(CASE_STUDY_EXTERNAL_IMPORT_STATEMENTS);

  it('creates exactly the one expected table', () => {
    expect(created.map((c) => c.table).sort()).toEqual([...REQUIRED_TABLES].sort());
  });

  it('declares every DDL column on the model, and no column the DDL does not create', () => {
    const model = modelsByTable().case_study_external_imports;
    expect(model).toBeDefined();
    const mapped = modelColumnNames(model);
    const ddl = new Set(created[0].columns);
    expect(created[0].columns.filter((c) => !mapped.has(c))).toEqual([]);
    expect([...mapped].filter((c) => !ddl.has(c))).toEqual([]);
  });

  it('is additive only and idempotent', () => {
    const joined = CASE_STUDY_EXTERNAL_IMPORT_STATEMENTS.join('\n').toUpperCase();
    expect(joined).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/);
    expect(joined).not.toMatch(/RENAME|ALTER\s+TABLE|TRUNCATE|DELETE\s+FROM/);
    for (const sql of CASE_STUDY_EXTERNAL_IMPORT_STATEMENTS) expect(sql).toMatch(/IF\s+NOT\s+EXISTS/i);
  });

  it('makes the content hash UNIQUE - the idempotency key', () => {
    expect(CASE_STUDY_EXTERNAL_IMPORT_STATEMENTS.some((s) =>
      /CREATE UNIQUE INDEX IF NOT EXISTS case_study_external_imports_hash_idx\s+ON case_study_external_imports \(content_hash\)/.test(s),
    )).toBe(true);
  });

  it('cascades from case_studies so a deletion is neither blocked nor orphaned', () => {
    expect(CASE_STUDY_EXTERNAL_IMPORT_STATEMENTS[0]).toMatch(/case_study_id UUID NOT NULL REFERENCES case_studies\(id\) ON DELETE CASCADE/);
  });

  it('the production migration carries every ensure statement verbatim (modulo whitespace)', () => {
    const migration = normalize(fs.readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*\n/g, '\n'));
    for (const statement of CASE_STUDY_EXTERNAL_IMPORT_STATEMENTS) {
      expect(migration).toContain(normalize(statement));
    }
    expect(migration).toMatch(/^begin;/);
    expect(migration).toMatch(/commit$/);
  });

  it('exposes a rollback that only drops this table', () => {
    expect(CASE_STUDY_EXTERNAL_IMPORT_ROLLBACK).toEqual(['DROP TABLE IF EXISTS case_study_external_imports']);
  });
});
