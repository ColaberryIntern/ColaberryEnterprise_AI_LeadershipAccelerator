-- Shaped metrics for the Case Study OS (Ali 2026-09-09).
--
-- WHY THESE COLUMNS EXIST. A metric used to arrive as one string. "4 of 7" told
-- a card nothing it could draw a meter from, because nothing in the row said
-- there was a denominator: the seven module names lived in the methodology
-- paragraph. These columns give a figure the shape it actually has, and record
-- how it was computed so a sceptic can re-derive it.
--
-- ADDITIVE ONLY, and that is the whole design. Every column added here is
-- NULLABLE with no backfill, and no existing column, constraint or index is
-- altered or dropped. Running this against production changes no current
-- behaviour: a metric row written before today keeps loading, keeps passing the
-- publish gate on exactly the blockers it passes today, and keeps rendering the
-- definition list it renders today. Nothing reads these columns until a
-- collector has written one.
--
-- WHY output_hash AND collected_at ARE HERE BUT NEVER PUBLIC. They are how the
-- sync tells a re-run from drift: same sha, different hash, means the collector
-- changed its mind about a commit that cannot have changed, and the old value
-- is kept while the run reports it. To a reader a hash says nothing and would
-- invite treating it as proof, so the public projection drops both and carries
-- only reproduce_command.
--
-- Idempotent: every statement is IF NOT EXISTS. Safe to run twice; the second
-- run is a no-op.
--
-- Run on prod:
--   docker exec -i accelerator-db psql -U accelerator accelerator_prod \
--     < backend/src/seeds/migrations/20260909_add_case_study_metric_shapes.sql

BEGIN;

-- ── The shape and its numbers ───────────────────────────────────────────────
--
-- `shape` is one of count | ratio | share | span | series. It is NOT a CHECK
-- constraint: the application guards reject a payload that disagrees with its
-- own shape, and a database constraint here would turn a bad write into a 500
-- rather than a reported sync issue. The column is a hint to the renderer, and
-- a NULL one means "render this the way every record rendered before shapes".
ALTER TABLE case_study_metrics ADD COLUMN IF NOT EXISTS shape VARCHAR(20);

-- The structured numbers the picture is drawn from. JSONB rather than columns
-- per shape, because a series carries a variable-length point list and a ratio
-- carries a member list; five sets of columns would be mostly NULL on every row.
ALTER TABLE case_study_metrics ADD COLUMN IF NOT EXISTS payload JSONB;

-- The three plain-language answers, written by a human and never by a
-- collector: what this counts, where it came from, what it does not show. All
-- three or none, enforced in the guard, because two thirds of an answer reads
-- as more certain than the number is.
ALTER TABLE case_study_metrics ADD COLUMN IF NOT EXISTS plain JSONB;

-- ── How it was collected ────────────────────────────────────────────────────
--
-- collector_key      which routine produced it, from a closed list
-- collected_sha      the commit the tree was read at, so the figure is pinned
-- reproduce_command  the ONLY one of these five that ever reaches a reader
-- output_hash        sha256 of the payload; the drift detector
-- collected_at       when the routine last ran
ALTER TABLE case_study_metrics ADD COLUMN IF NOT EXISTS collector_key VARCHAR(60);
ALTER TABLE case_study_metrics ADD COLUMN IF NOT EXISTS collected_sha VARCHAR(64);
ALTER TABLE case_study_metrics ADD COLUMN IF NOT EXISTS reproduce_command TEXT;
ALTER TABLE case_study_metrics ADD COLUMN IF NOT EXISTS output_hash VARCHAR(64);
ALTER TABLE case_study_metrics ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;

-- Partial: the vast majority of rows are hand-authored and carry no collector,
-- and the only query that needs this index asks "which metrics does the sync
-- have to recompute for this case study".
CREATE INDEX IF NOT EXISTS idx_cs_metrics_collector
  ON case_study_metrics (case_study_id, collector_key)
  WHERE collector_key IS NOT NULL;

COMMIT;
