-- week_item_visibility: tracks which activities are visible to a student per week.
-- Content items (course, video, readings) are always open — only activities need visibility tracking.
-- Drives both the week page (progressive reveal) and the student timeline (only visible items emitted).
-- Idempotency key: UNIQUE (enrollment_id, week_number, item_type)

BEGIN;

CREATE TABLE IF NOT EXISTS week_item_visibility (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id  UUID        NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  week_number    INTEGER     NOT NULL,
  item_type      TEXT        NOT NULL,
  visible        BOOLEAN     NOT NULL DEFAULT false,
  revealed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_week_item_visibility_enrollment_week_item
    UNIQUE (enrollment_id, week_number, item_type),
  CONSTRAINT chk_week_item_type
    CHECK (item_type IN ('warm_up', 'lab', 'video_critique', 'post_quiz', 'mock_interview'))
);

CREATE INDEX IF NOT EXISTS idx_week_item_visibility_enrollment_id
  ON week_item_visibility (enrollment_id);

CREATE INDEX IF NOT EXISTS idx_week_item_visibility_enrollment_week
  ON week_item_visibility (enrollment_id, week_number);

COMMIT;
