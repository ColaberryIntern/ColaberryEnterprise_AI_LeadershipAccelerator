// Idempotent: creates project_dna table if not present.
// Run via: npx ts-node backend/src/seeds/seedProjectDna.ts
// Safe to run repeatedly; ON CONFLICT clause makes upsert safe for re-seeding.

import { sequelize } from '../config/database';

export async function seedProjectDna(): Promise<void> {
  await sequelize.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS project_dna (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      enrollment_id    UUID        NOT NULL UNIQUE REFERENCES enrollments(id) ON DELETE CASCADE,
      business_problem TEXT        NOT NULL,
      target_user      TEXT        NOT NULL,
      industry         VARCHAR(50) NOT NULL,
      orientation      VARCHAR(20) NOT NULL CHECK (orientation IN ('internal', 'external')),
      focus            VARCHAR(20) NOT NULL CHECK (focus IN ('revenue', 'operational')),
      project_types    JSONB       NOT NULL DEFAULT '[]',
      data_sources     JSONB       NOT NULL DEFAULT '[]',
      ai_components    JSONB       NOT NULL DEFAULT '[]',
      industry_track   TEXT        NOT NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_project_dna_enrollment_id ON project_dna(enrollment_id);
  `);
}

if (require.main === module) {
  seedProjectDna()
    .then(() => { console.log('project_dna table ready'); process.exit(0); })
    .catch((err) => { console.error('seed failed:', err); process.exit(1); });
}
