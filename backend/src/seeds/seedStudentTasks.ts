// One-time migration: creates student_task_lists and student_tasks tables.
// Safe to re-run (CREATE TABLE IF NOT EXISTS). No data is modified.
// Run via: npx ts-node backend/src/seeds/seedStudentTasks.ts

import { sequelize } from '../config/database';

export async function seedStudentTaskTables(): Promise<void> {
  await sequelize.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS student_task_lists (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id    UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      enrollment_id UUID        NOT NULL REFERENCES enrollments(id),
      cluster       VARCHAR(50) NOT NULL,
      title         VARCHAR(255) NOT NULL,
      status        VARCHAR(30) NOT NULL DEFAULT 'not_started'
                    CHECK (status IN ('not_started', 'in_progress', 'complete')),
      position      INTEGER     NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT student_task_lists_unique_cluster UNIQUE (project_id, cluster)
    );
  `);

  await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_stl_project ON student_task_lists (project_id);`);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_stl_enrollment ON student_task_lists (enrollment_id);`);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS student_tasks (
      id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      task_list_id        UUID        NOT NULL REFERENCES student_task_lists(id) ON DELETE CASCADE,
      project_id          UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      requirement_map_id  UUID        REFERENCES requirements_maps(id),
      requirement_key     VARCHAR(255) NOT NULL,
      title               VARCHAR(500) NOT NULL,
      description         TEXT,
      status              VARCHAR(30) NOT NULL DEFAULT 'not_started'
                          CHECK (status IN ('not_started', 'in_progress', 'complete', 'blocked')),
      position            INTEGER     NOT NULL DEFAULT 0,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT student_tasks_unique_req_key UNIQUE (project_id, requirement_key)
    );
  `);

  await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_st_task_list ON student_tasks (task_list_id);`);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_st_project ON student_tasks (project_id);`);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_st_req_map ON student_tasks (requirement_map_id);`);
}

if (require.main === module) {
  seedStudentTaskTables()
    .then(() => {
      console.log('student_task_lists and student_tasks tables ready');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
