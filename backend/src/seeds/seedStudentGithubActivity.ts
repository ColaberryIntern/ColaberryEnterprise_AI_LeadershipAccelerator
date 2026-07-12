// Idempotent: creates student_github_activity table if not present.
// Run via: docker exec accelerator-backend node dist/seeds/seedStudentGithubActivity.js
// Safe to run repeatedly; CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

import { sequelize } from '../config/database';

export async function seedStudentGithubActivity(): Promise<void> {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS student_github_activity (
      id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      enrollment_id           UUID        NOT NULL UNIQUE REFERENCES enrollments(id) ON DELETE CASCADE,
      synced_at               TIMESTAMPTZ,
      commits_last_7d         INT         NOT NULL DEFAULT 0,
      open_prs                INT         NOT NULL DEFAULT 0,
      total_stars             INT         NOT NULL DEFAULT 0,
      contribution_graph_json JSONB,
      raw_repos_json          JSONB,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_student_github_activity_enrollment
      ON student_github_activity(enrollment_id);
  `);
}

if (require.main === module) {
  seedStudentGithubActivity()
    .then(() => { console.log('student_github_activity table ready'); process.exit(0); })
    .catch((err) => { console.error('seed failed:', err); process.exit(1); });
}
