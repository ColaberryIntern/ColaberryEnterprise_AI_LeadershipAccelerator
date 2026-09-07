import { sequelize } from '../config/database';

// Reese Agentic AI Employee mission, Capability 6 (2026-09-07) — persistent
// checklist instances, confirmed absent anywhere in this codebase at
// discovery. Additive only: creates 1 new table, never alters or drops any
// existing column, table, or constraint.
export async function ensureChecklistInstanceSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS checklist_instances (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       checklist_type VARCHAR(30) NOT NULL,
       subject_type VARCHAR(50) NOT NULL,
       subject_id UUID NOT NULL,
       items JSONB NOT NULL DEFAULT '{}',
       incomplete_items JSONB NOT NULL DEFAULT '[]',
       complete BOOLEAN NOT NULL DEFAULT false,
       bypassed_at TIMESTAMPTZ,
       bypassed_by_email VARCHAR(255),
       bypass_reason TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_checklist_instance_subject ON checklist_instances (subject_type, subject_id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] checklist_instances schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Checklist instance schema ensured');
}
