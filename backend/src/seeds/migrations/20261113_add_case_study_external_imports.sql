-- Outside case-study intake: the idempotency key and provenance record (Services Upgrade SV1, 2026-11-13).
--
-- WHY THIS TABLE EXISTS. An outside case study is a draft `case_studies` row made by AI analysis from a document
-- (an uploaded PDF/DOCX/PPTX, or a file from the Drive case-study library). Importing the same document twice must
-- not make two records, so every import writes one row here keyed on the sha256 of the file's bytes, and the UNIQUE
-- index on content_hash is what decides, including when two admins import the same file at the same moment.
-- The row also keeps the Drive id + modifiedTime (re-import without re-download), the structured AI analysis, and
-- the fail-soft analysis_error.
--
-- ADDITIVE ONLY. One new table; no existing table, column, constraint or index is altered or dropped. Nothing that
-- exists today reads it, so running this changes no current behaviour.
--
-- Idempotent: every statement is IF NOT EXISTS. Safe to run twice; the second run is a no-op.
--
-- THE BACKEND ALSO SELF-HEALS THIS AT BOOT (`db/ensureCaseStudyExternalImportSchema.ts` runs the identical
-- statements). Running this FIRST still matters: it closes the window between the new image starting and the boot
-- ensure finishing, during which an import would fail on a missing table.
--
-- Rollback: DROP TABLE IF EXISTS case_study_external_imports;
--   (bookkeeping only; the case studies it points at are ordinary drafts and remain.)
--
-- Run on prod BEFORE the deploy:
--   docker exec -i accelerator-db psql -U accelerator accelerator_prod \
--     < backend/src/seeds/migrations/20261113_add_case_study_external_imports.sql

BEGIN;

CREATE TABLE IF NOT EXISTS case_study_external_imports (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS case_study_external_imports_hash_idx
  ON case_study_external_imports (content_hash);

CREATE INDEX IF NOT EXISTS case_study_external_imports_drive_idx
  ON case_study_external_imports (drive_file_id, drive_modified_time);

CREATE INDEX IF NOT EXISTS case_study_external_imports_case_idx
  ON case_study_external_imports (case_study_id);

COMMIT;
