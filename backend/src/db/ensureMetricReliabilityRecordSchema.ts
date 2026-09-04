import { sequelize } from '../config/database';

// Reese Agentic AI Employee mission, Checkpoint B (2026-09-04) — the metric
// reliability registry, confirmed absent anywhere in this codebase at
// Checkpoint A discovery. Additive only: creates 1 new table, never alters
// or drops any existing column, table, or constraint.
export async function ensureMetricReliabilityRecordSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS metric_reliability_records (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       source_system VARCHAR(100) NOT NULL,
       metric_key VARCHAR(200) NOT NULL,
       scope_type VARCHAR(20) NOT NULL DEFAULT 'global',
       scope_value VARCHAR(200),
       status VARCHAR(20) NOT NULL DEFAULT 'degraded',
       severity VARCHAR(20),
       reason TEXT NOT NULL,
       incident_ticket_id UUID,
       declared_by_source VARCHAR(20) NOT NULL,
       declared_by_email VARCHAR(255),
       declared_at TIMESTAMPTZ NOT NULL,
       review_owner_email VARCHAR(255),
       next_review_at TIMESTAMPTZ,
       recovery_criteria TEXT,
       restored_by_email VARCHAR(255),
       restored_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_metric_reliability_lookup ON metric_reliability_records (source_system, metric_key, status)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] metric_reliability_records schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Metric reliability record schema ensured');
}
