/**
 * ensureCaseStudyExternalImportSchema - the idempotency key and provenance record for OUTSIDE case studies, additive.
 *
 * An outside case study is a draft `case_studies` row made from a document (an uploaded PDF/DOCX/PPTX, or a file
 * imported from the Drive case-study library) by AI analysis. Importing the same document twice must not make two
 * records (root CLAUDE.md, Idempotency: non-negotiable), so every import writes one row here keyed on the sha256 of
 * the file's bytes, and a UNIQUE index on that hash is what decides - including when two admins import the same
 * deck at the same moment, where a read-then-insert check alone would let both through.
 *
 * WHY A NEW TABLE rather than an index on `case_study_artifacts`: the row also carries what no existing table holds -
 * the Drive file id + modifiedTime (so a re-import can skip the download), the structured AI analysis (keywords and
 * NAICS that propose-service pre-fills from), and `analysis_error` for the fail-soft path. Additive only: no
 * existing table is altered. `ensureCaseStudySchema.ts` is already past the 500-line ceiling, so this lives apart.
 *
 * ON DELETE CASCADE from `case_studies`, matching `case_study_service_links`: permanently deleting a case study must
 * neither be blocked by this bookkeeping row nor leave it behind.
 *
 * Mirrored for production by `seeds/migrations/20261113_add_case_study_external_imports.sql` (run it BEFORE the
 * deploy; this boot-time ensure self-heals if it is forgotten).
 *
 *   case_study_external_imports - one row per imported document (per distinct content hash).
 */
import { sequelize } from '../config/database';

export const REQUIRED_TABLES: ReadonlyArray<string> = ['case_study_external_imports'];

/** Every DDL statement, hoisted so a test can assert the whole set is additive (CREATE ... IF NOT EXISTS only). */
export const CASE_STUDY_EXTERNAL_IMPORT_STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS case_study_external_imports (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     case_study_id UUID NOT NULL REFERENCES case_studies(id) ON DELETE CASCADE,
     content_hash VARCHAR(64) NOT NULL,
     source_kind TEXT NOT NULL,
     drive_file_id TEXT,
     drive_modified_time TIMESTAMPTZ,
     original_filename TEXT NOT NULL,
     mime_type TEXT,
     size_bytes INTEGER,
     storage_key TEXT,
     analysis_status TEXT NOT NULL DEFAULT 'pending',
     analysis_error TEXT,
     analysis JSONB,
     imported_by TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // THE idempotency key. Same bytes -> same hash -> one record, however many times and however concurrently.
  `CREATE UNIQUE INDEX IF NOT EXISTS case_study_external_imports_hash_idx
     ON case_study_external_imports (content_hash)`,
  // The Drive pre-check: an unchanged Drive file (same id, same modifiedTime) is recognised before it is downloaded.
  `CREATE INDEX IF NOT EXISTS case_study_external_imports_drive_idx
     ON case_study_external_imports (drive_file_id, drive_modified_time)`,
  `CREATE INDEX IF NOT EXISTS case_study_external_imports_case_idx
     ON case_study_external_imports (case_study_id)`,
];

/** The full rollback, for tests and for an operator. The table is bookkeeping; the case studies it points at stay. */
export const CASE_STUDY_EXTERNAL_IMPORT_ROLLBACK: ReadonlyArray<string> = [
  'DROP TABLE IF EXISTS case_study_external_imports',
];

/**
 * Run every statement. NOT swallowed: unlike the service-catalog ensure, a failure here is thrown, because the
 * intake's idempotency depends on the unique index existing - a missing index would let a re-import create a
 * duplicate record, which is worse than a loud boot error. Must run AFTER ensureCaseStudySchema (FK parent).
 */
export async function ensureCaseStudyExternalImportSchema(): Promise<void> {
  for (const statement of CASE_STUDY_EXTERNAL_IMPORT_STATEMENTS) {
    await sequelize.query(statement);
  }
}

export default ensureCaseStudyExternalImportSchema;
