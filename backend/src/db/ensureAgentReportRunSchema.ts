import { sequelize } from '../config/database';

// AI Workforce Management, Checkpoint D (2026-08-31) — one attempt to
// generate/deliver a subscription's report for one delivery period.
// Additive only: creates 1 new table, never alters or drops any existing
// column, table, or constraint. The unique index on (subscription_id,
// period_key) is the real, DB-enforced idempotency guard — see
// AgentReportRun.ts's own header comment.
export async function ensureAgentReportRunSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS agent_report_runs (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       subscription_id UUID NOT NULL REFERENCES agent_report_subscriptions(id),
       period_key VARCHAR(20) NOT NULL,
       generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       delivered_at TIMESTAMPTZ,
       delivery_status VARCHAR(20) NOT NULL DEFAULT 'pending',
       content_snapshot JSONB,
       error_message TEXT
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS agent_report_runs_sub_period_unique ON agent_report_runs (subscription_id, period_key)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_report_runs_subscription ON agent_report_runs (subscription_id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] agent_report_runs schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Agent report run schema ensured');
}
