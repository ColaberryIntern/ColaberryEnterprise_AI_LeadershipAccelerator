// Idempotent: creates mentor_review_items table if not present.
// Run via: docker exec accelerator-backend node dist/seeds/seedMentorReviewItems.js
// Safe to run repeatedly; CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

import { sequelize } from '../config/database';

export async function seedMentorReviewItems(): Promise<void> {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS mentor_review_items (
      id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id    UUID          NOT NULL UNIQUE REFERENCES assignment_submissions(id) ON DELETE CASCADE,
      enrollment_id    UUID          NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      ai_feedback      TEXT          NOT NULL,
      confidence_score FLOAT         NOT NULL,
      status           VARCHAR(20)   NOT NULL DEFAULT 'pending_review'
                       CHECK (status IN ('pending_review','auto_approved','approved','dismissed')),
      reviewer_notes   TEXT,
      reviewed_at      TIMESTAMPTZ,
      created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_mentor_review_items_enrollment
      ON mentor_review_items(enrollment_id);
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_mentor_review_items_status
      ON mentor_review_items(status);
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_mentor_review_items_created_at
      ON mentor_review_items(created_at DESC);
  `);
}

if (require.main === module) {
  seedMentorReviewItems()
    .then(() => { console.log('mentor_review_items table ready'); process.exit(0); })
    .catch((err) => { console.error('seed failed:', err); process.exit(1); });
}
