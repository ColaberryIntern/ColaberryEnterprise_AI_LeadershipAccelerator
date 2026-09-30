-- A plan must record the truth it was generated from (Ali 2026-09-10).
--
-- WHY THIS EXISTS. Today a build plan is generated from a student's confirmed
-- understanding and keeps no record of WHICH understanding. When the student
-- later corrects a fact, nothing can answer "was this plan built before or
-- after that correction" - so nobody can tell a stale plan from a current one,
-- and the honest answer to "does this plan reflect what I told you" is a shrug.
--
-- The brief for this work states it directly: store the confirmed Project Truth
-- revision used to generate the plan, and a later edit creates a NEW revision
-- rather than silently mutating the historical basis of an approved plan.
--
-- ADDITIVE ONLY. Both columns are nullable or defaulted, no existing column is
-- altered or dropped, and nothing reads them until the code that writes them
-- ships. A plan written before today keeps loading with a null basis, which is
-- the truthful answer: we do not know which truth it came from.
--
-- Idempotent: every statement is IF NOT EXISTS. Safe to run twice.
--
-- Run on prod:
--   docker exec -i accelerator-db psql -U accelerator accelerator_prod \
--     < backend/src/seeds/migrations/20260910_add_truth_revision.sql

BEGIN;

-- ── The understanding's own revision ────────────────────────────────────────
--
-- Increments when the stored items actually change. NOT a row-updated counter:
-- a re-extraction that produces the same facts in a different order is not a
-- new revision, and treating it as one would make every sync look like an edit.
--
-- DEFAULT 1 rather than 0, because every existing row already holds a real
-- understanding. Calling that revision zero would imply it was never written.
ALTER TABLE project_understandings
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

-- When a person last confirmed any part of it. Null means nobody has read it
-- back yet, which is different from "confirmed nothing".
ALTER TABLE project_understandings
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- ── The plan's basis ────────────────────────────────────────────────────────
--
-- Nullable on purpose and permanently. A plan generated before this column
-- existed genuinely has no known basis, and backfilling a guess would be
-- inventing provenance - the exact failure the truth contract exists to stop.
ALTER TABLE build_plans
  ADD COLUMN IF NOT EXISTS truth_revision INTEGER;

COMMIT;
