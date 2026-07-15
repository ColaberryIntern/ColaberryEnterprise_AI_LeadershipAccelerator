-- architect_evaluations: one row per (enrollment_id, week_number)
-- Stores the weekly AI evaluation of a student's project progress.
-- Idempotency key: UNIQUE (enrollment_id, week_number)

CREATE TABLE IF NOT EXISTS architect_evaluations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id    UUID        NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  week_number      INTEGER     NOT NULL,
  overall_score    INTEGER,
  progress_summary TEXT,
  strengths        JSONB       NOT NULL DEFAULT '[]',
  next_steps       JSONB       NOT NULL DEFAULT '[]',
  technical_gaps   JSONB       NOT NULL DEFAULT '[]',
  raw_response     JSONB,
  evaluated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_architect_eval_enrollment_week UNIQUE (enrollment_id, week_number)
);

CREATE INDEX IF NOT EXISTS idx_architect_evaluations_enrollment_id
  ON architect_evaluations (enrollment_id);
