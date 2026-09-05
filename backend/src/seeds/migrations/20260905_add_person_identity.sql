-- Person identity spine (Admin OS Phase 2, Ali 2026-09-05).
--
-- WHY A SEPARATE TABLE AND NOT lead.id AS THE ANCHOR. The obvious cheap move is
-- to treat a lead as the person and hang enrolments off lead_id. It fails on the
-- measured data: 86 of 517 enrolments (16.6%) match no lead at all, so under that
-- design 86 real students would have no identity and could not appear on the
-- People roster. A person must be able to exist without an acquisition record.
--
-- ADDITIVE ONLY. Every column added here is NULLABLE with no default backfill,
-- and no existing column, constraint or index is altered or dropped. Running
-- this against production changes no current behaviour: nothing reads person_id
-- until the backfill has run and been checked.
--
-- Idempotent: CREATE TABLE / ADD COLUMN / CREATE INDEX all IF NOT EXISTS, and
-- the FKs are added under a guard. Safe to run twice; the second run is a no-op.
--
-- Run on prod:
--   docker exec -i accelerator-db psql -U accelerator accelerator_prod \
--     < backend/src/seeds/migrations/20260905_add_person_identity.sql

BEGIN;

-- ── The spine ───────────────────────────────────────────────────────────────
--
-- Deliberately thin. A person is an identity ANCHOR, not a copy of the data:
-- name, phone and company keep living on the leads and enrollments rows that
-- own them. Duplicating them here would create a second source of truth that
-- drifts, which is the failure this whole consolidation exists to remove.
CREATE TABLE IF NOT EXISTS persons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Normalised (lower + trim) email. The ONLY automatic match key, because it
  -- is the only one the data supports: of the 86 unmatched enrolments, 0 carry
  -- a usable phone and 0 match exactly one lead by name.
  primary_email TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One person per normalised email. This is what makes the backfill idempotent:
-- re-running it can only find the existing row, never mint a second.
CREATE UNIQUE INDEX IF NOT EXISTS idx_persons_primary_email ON persons (primary_email);

-- ── Nullable links from the records that describe a person ──────────────────
--
-- NULL means "not yet resolved", and that is a legitimate, permanent state for
-- the 86. It must never be read as "no such person".
ALTER TABLE leads       ADD COLUMN IF NOT EXISTS person_id UUID;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS person_id UUID;
ALTER TABLE visitors    ADD COLUMN IF NOT EXISTS person_id UUID;

CREATE INDEX IF NOT EXISTS idx_leads_person_id       ON leads (person_id)       WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enrollments_person_id ON enrollments (person_id) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visitors_person_id    ON visitors (person_id)    WHERE person_id IS NOT NULL;

-- ON DELETE SET NULL, never CASCADE. Deleting a person row must orphan the
-- link, not delete the enrolment underneath it — the enrolment is the record of
-- something that actually happened.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_leads_person') THEN
    ALTER TABLE leads ADD CONSTRAINT fk_leads_person
      FOREIGN KEY (person_id) REFERENCES persons (id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_enrollments_person') THEN
    ALTER TABLE enrollments ADD CONSTRAINT fk_enrollments_person
      FOREIGN KEY (person_id) REFERENCES persons (id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_visitors_person') THEN
    ALTER TABLE visitors ADD CONSTRAINT fk_visitors_person
      FOREIGN KEY (person_id) REFERENCES persons (id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── The resolution queue ────────────────────────────────────────────────────
--
-- Holds records a rule could not resolve WITHOUT GUESSING. An ambiguous match is
-- never merged: two people wrongly joined cannot be told apart afterwards, so a
-- queue item is always preferable to a coin flip.
--
-- On today's data this table stays nearly empty, and that is the correct
-- outcome rather than a sign it is unnecessary. leads currently holds 24,673
-- rows with 24,673 distinct normalised emails, so email matching is 1:1 and
-- cannot produce ambiguity. The queue exists because that is a property of the
-- current data, not a guarantee of the schema.
CREATE TABLE IF NOT EXISTS person_resolution_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL,
  source_id    TEXT NOT NULL,
  -- 'ambiguous' (several candidates) or 'conflict' (an existing link disagrees
  -- with what the rule now finds). 'no_candidate' is deliberately NOT queued:
  -- 86 enrolments are in that state and no rule can resolve any of them, so
  -- routing them here would build a backlog a reviewer can do nothing about.
  -- They are reported as coverage instead.
  reason       TEXT NOT NULL,
  candidates   JSONB NOT NULL DEFAULT '[]'::jsonb,
  status       TEXT NOT NULL DEFAULT 'pending',
  resolved_to  UUID,
  resolved_by  TEXT,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One open item per source record. Without this a re-run of the backfill would
-- enqueue the same unresolved record on every pass and the queue would grow
-- without bound — the classic way a "safe to rerun" script turns out not to be.
CREATE UNIQUE INDEX IF NOT EXISTS idx_person_queue_open_source
  ON person_resolution_queue (source_table, source_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_person_queue_status ON person_resolution_queue (status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_person_queue_status') THEN
    ALTER TABLE person_resolution_queue ADD CONSTRAINT ck_person_queue_status
      CHECK (status IN ('pending', 'resolved', 'dismissed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_person_queue_reason') THEN
    ALTER TABLE person_resolution_queue ADD CONSTRAINT ck_person_queue_reason
      CHECK (reason IN ('ambiguous', 'conflict'));
  END IF;
END $$;

COMMIT;
