BEGIN;

-- ── 1. cora_courses ──────────────────────────────────────────────────────────
-- One row per program. Separate from existing program_blueprints/cohorts
-- tables which serve enrollment/scheduling. This table is the KB domain anchor.
CREATE TABLE IF NOT EXISTS cora_courses (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200) NOT NULL,
  slug        VARCHAR(100) NOT NULL,
  description TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cora_courses_slug UNIQUE (slug)
);

-- ── 2. cora_cohorts ──────────────────────────────────────────────────────────
-- One row per class run. Holds all merge-tag source fields (dates, pricing,
-- URLs). At most one row per course may have is_active = true (partial index).
CREATE TABLE IF NOT EXISTS cora_cohorts (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       UUID         NOT NULL REFERENCES cora_courses(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  cohort_number   INTEGER      NOT NULL,
  open_house_date VARCHAR(100),
  open_house_url  VARCHAR(500),
  start_date      VARCHAR(100),
  end_date        VARCHAR(100),
  expo_date       VARCHAR(100),
  price_annual    INTEGER,
  price_monthly   INTEGER,
  seats_total     INTEGER,
  seats_remaining INTEGER,
  enrollment_url  VARCHAR(500),
  waitlist_url    VARCHAR(500),
  is_active       BOOLEAN      NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Enforce: exactly one active cohort per course at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_cora_cohorts_one_active_per_course
  ON cora_cohorts (course_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_cora_cohorts_course_id
  ON cora_cohorts (course_id);

-- ── 3. responsible_persons ───────────────────────────────────────────────────
-- Staff members who handle KB entry routing. areas stored as JSONB array
-- (consistent with project JSONB-for-arrays convention).
CREATE TABLE IF NOT EXISTS responsible_persons (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(200) NOT NULL,
  email         VARCHAR(200),
  phone         VARCHAR(50),
  work_hours    VARCHAR(100),
  time_zone     VARCHAR(50),
  calendar_link VARCHAR(500),
  areas         JSONB        NOT NULL DEFAULT '[]',
  shift_note    VARCHAR(200),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 4. cora_kb_entries ───────────────────────────────────────────────────────
-- Single source of truth for all KB Q&A + routing metadata. Replaces
-- coraKnowledgeBase.ts and the Google Sheet rubric.
-- course_id NULL = entry applies to all courses (global).
-- team_person_ids stored as JSONB array of UUID strings.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cora_priority') THEN
    CREATE TYPE cora_priority AS ENUM ('High', 'Medium', 'Low');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cora_automation_level') THEN
    CREATE TYPE cora_automation_level AS ENUM ('High', 'Medium', 'Low');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS cora_kb_entries (
  id                   UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id            UUID                  REFERENCES cora_courses(id) ON DELETE SET NULL,
  main_category        VARCHAR(100)          NOT NULL,
  sub_category         VARCHAR(100),
  question_pattern     TEXT                  NOT NULL,
  answer_template      TEXT                  NOT NULL,
  primary_person_id    UUID                  REFERENCES responsible_persons(id) ON DELETE SET NULL,
  team_person_ids      JSONB                 NOT NULL DEFAULT '[]',
  escalation_logic     TEXT,
  priority             cora_priority         NOT NULL DEFAULT 'Medium',
  response_time        VARCHAR(50),
  automation_potential cora_automation_level NOT NULL DEFAULT 'Medium',
  emotional_tone       VARCHAR(100),
  calendar_link        VARCHAR(500),
  email_examples       TEXT,
  keywords             TEXT,
  notes                TEXT,
  is_active            BOOLEAN               NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cora_kb_entries_course_id
  ON cora_kb_entries (course_id);
CREATE INDEX IF NOT EXISTS idx_cora_kb_entries_main_category
  ON cora_kb_entries (main_category);
CREATE INDEX IF NOT EXISTS idx_cora_kb_entries_is_active
  ON cora_kb_entries (is_active);
CREATE INDEX IF NOT EXISTS idx_cora_kb_entries_primary_person
  ON cora_kb_entries (primary_person_id);

COMMIT;
