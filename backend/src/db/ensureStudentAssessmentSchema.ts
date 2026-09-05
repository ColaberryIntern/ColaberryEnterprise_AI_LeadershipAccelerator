import { sequelize } from '../config/database';

// Reese Agentic AI Employee mission, Checkpoint D (2026-09-05) — the student
// health assessment history table, confirmed absent anywhere in this
// codebase at discovery. Additive only: creates 1 new table, never alters
// or drops any existing column, table, or constraint.
export async function ensureStudentAssessmentSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS student_assessments (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL,
       status VARCHAR(20) NOT NULL DEFAULT 'unknown',
       confidence_score INTEGER NOT NULL DEFAULT 0,
       confidence_band VARCHAR(30) NOT NULL DEFAULT 'insufficient_evidence',
       primary_root_cause VARCHAR(50),
       secondary_root_cause VARCHAR(50),
       supporting_evidence JSONB NOT NULL DEFAULT '[]',
       contradicting_evidence JSONB NOT NULL DEFAULT '[]',
       excluded_evidence JSONB NOT NULL DEFAULT '[]',
       positive_momentum_signals JSONB NOT NULL DEFAULT '[]',
       unanswered_questions JSONB NOT NULL DEFAULT '[]',
       recommended_intervention TEXT,
       requires_human_review BOOLEAN NOT NULL DEFAULT false,
       reassessment_date TIMESTAMPTZ,
       rules_version VARCHAR(20) NOT NULL,
       model VARCHAR(100),
       llm_cost_usd DECIMAL(10, 6),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_student_assessment_enrollment ON student_assessments (enrollment_id, created_at)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] student_assessments schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Student assessment schema ensured');
}
