/**
 * ensureFactoryTaskSchema — the assignment attributes a human-or-AI allocation actually needs,
 * added to `student_tasks` additively.
 *
 * DISCOVER found `student_tasks` carries lifecycle + verification + owner_agent (a string name)
 * + execution_mode (a free string), but NONE of: a typed executor class, an accountable human,
 * required skills, judgment level, decision authority, confidence, or a source-evidence
 * citation. Those are exactly what the factory decides an executor against. This adds them as
 * new NULLABLE, default-free columns — the same shape as archived_at / approval_state — so
 * every existing row is untouched and unset until the factory populates it.
 */
import { sequelize } from '../config/database';

export const REQUIRED_COLUMNS: ReadonlyArray<string> = [
  'executor_type', 'accountable_identity_id', 'required_skills', 'judgment_level',
  'decision_authority', 'data_sensitivity', 'interaction_pattern', 'frequency',
  'factory_confidence', 'source_evidence', 'decomposition_method',
];

export const FACTORY_TASK_STATEMENTS: ReadonlyArray<string> = [
  // Typed executor class (human | ai | system). owner_agent stays as the agent's NAME; this is
  // its KIND, which is what the OVERSIGHT rule reasons about.
  `ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS executor_type TEXT`,
  // The human who owns the outcome even when AI performs the work.
  `ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS accountable_identity_id TEXT`,
  // Skill ids from the ontology (JSONB array), not free text.
  `ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS required_skills JSONB`,
  `ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS judgment_level TEXT`,
  `ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS decision_authority TEXT`,
  `ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS data_sensitivity TEXT`,
  `ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS interaction_pattern TEXT`,
  `ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS frequency TEXT`,
  // The task's decomposition confidence (0..1). Named factory_confidence to avoid any clash.
  `ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS factory_confidence DOUBLE PRECISION`,
  // The requirement source blocks this task derives from (JSONB array of block ids).
  `ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS source_evidence JSONB`,
  // EXPLICIT | INFERRED | LLM — the precedence tag the LLM must set in Phase 2.
  `ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS decomposition_method TEXT`,
];

export async function ensureFactoryTaskSchema(): Promise<void> {
  for (const sql of FACTORY_TASK_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] factory task schema stmt skipped:', err?.message);
    }
  }
  await assertFactoryTaskSchema();
}

export async function assertFactoryTaskSchema(): Promise<boolean> {
  const problems: string[] = [];
  try {
    const [cols] = await sequelize.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'student_tasks' AND column_name = ANY($names)`,
      { bind: { names: [...REQUIRED_COLUMNS] } },
    );
    const have = new Set((cols as { column_name: string }[]).map((r) => r.column_name));
    for (const c of REQUIRED_COLUMNS) if (!have.has(c)) problems.push(`student_tasks.${c} missing`);
  } catch (err: any) {
    problems.push(`schema introspection failed: ${err?.message}`);
  }

  if (problems.length === 0) {
    console.log('[DB] factory task schema ensured');
    return true;
  }
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'factory_task_schema_invariant_violated', outcome: 'failure',
    error_class: 'SchemaInvariantViolation',
    context: { problems, impact: 'Factory task attributes unreadable; allocation decisions blocked.', remedy: 'Run the ALTER TABLE student_tasks ADD COLUMN statements in ensureFactoryTaskSchema.' },
  }));
  return false;
}
