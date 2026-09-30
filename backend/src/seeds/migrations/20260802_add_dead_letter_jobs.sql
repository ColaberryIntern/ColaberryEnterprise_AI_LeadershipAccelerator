BEGIN;

CREATE TABLE IF NOT EXISTS dead_letter_jobs (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name              VARCHAR(100) NOT NULL,
  label                 VARCHAR(200),
  consecutive_failures  INTEGER      NOT NULL DEFAULT 0,
  error_message         TEXT         NOT NULL,
  error_class           VARCHAR(100) NOT NULL,
  error_stack           TEXT,
  context               JSONB,
  resolved              BOOLEAN      NOT NULL DEFAULT false,
  resolved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_job_name ON dead_letter_jobs (job_name);
CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_created_at ON dead_letter_jobs (created_at);
CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_resolved ON dead_letter_jobs (resolved);

COMMIT;
