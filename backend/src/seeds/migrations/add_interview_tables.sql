-- interview_rubrics: per-week question banks seeded at startup (not LLM-generated at runtime).
-- interview_sessions: one per (enrollment_id, week_number) — idempotency key prevents double-award.
-- Score is a pure function over answers + rubric (deterministic); feedback is LLM-generated narrative.

BEGIN;

CREATE TABLE IF NOT EXISTS interview_rubrics (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number  INTEGER     NOT NULL,
  questions    JSONB       NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_interview_rubric_week UNIQUE (week_number)
);

CREATE TABLE IF NOT EXISTS interview_sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID        NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  week_number   INTEGER     NOT NULL,
  rubric_id     UUID        NOT NULL REFERENCES interview_rubrics(id),
  status        TEXT        NOT NULL DEFAULT 'pending',
  answers       JSONB       NOT NULL DEFAULT '[]',
  total_score   FLOAT,
  feedback      TEXT,
  emailed_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_interview_session_enrollment_week UNIQUE (enrollment_id, week_number),
  CONSTRAINT chk_interview_session_status
    CHECK (status IN ('pending', 'in_progress', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_enrollment_id
  ON interview_sessions (enrollment_id);

COMMIT;
