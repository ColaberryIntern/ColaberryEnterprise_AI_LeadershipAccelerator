-- Migration: Add student_skilljar_progress table for Anthropic Skilljar course completion tracking
-- Created: 2026-06-25
-- Ticket: BC #9946499805 (Develop skilljarSyncService.ts backend)
-- Run: ssh root@95.216.199.47 then docker exec accelerator-backend psql -U accelerator -d accelerator < /path/to/this/file
-- Idempotent: all statements wrapped in IF NOT EXISTS / conditional guards

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Create student_skilljar_progress table
-- ─────────────────────────────────────────────────────────────────────────────
-- Stores per-student, per-course progress fetched from the Anthropic Skilljar API.
-- Keyed on (email, course_url) — one row per student per Anthropic course.
-- Upserted on each sync run; last_synced_at tracks freshness.

CREATE TABLE IF NOT EXISTS student_skilljar_progress (
  id                UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email             VARCHAR(255)  NOT NULL,
  skilljar_user_id  VARCHAR(100)  NULL,
  course_url        TEXT          NOT NULL,
  course_title      TEXT          NULL,
  percent_complete  INTEGER       NOT NULL DEFAULT 0 CHECK (percent_complete >= 0 AND percent_complete <= 100),
  completed         BOOLEAN       NOT NULL DEFAULT FALSE,
  completed_at      TIMESTAMPTZ   NULL,
  last_synced_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Idempotency key: one row per student per course
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_student_skilljar_progress_email_course'
  ) THEN
    ALTER TABLE student_skilljar_progress
      ADD CONSTRAINT uq_student_skilljar_progress_email_course UNIQUE (email, course_url);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_student_skilljar_progress_email
  ON student_skilljar_progress (email);

CREATE INDEX IF NOT EXISTS idx_student_skilljar_progress_completed
  ON student_skilljar_progress (completed);

COMMIT;
