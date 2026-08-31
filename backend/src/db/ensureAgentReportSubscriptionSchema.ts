import { sequelize } from '../config/database';

// AI Workforce Management, Checkpoint D (2026-08-31) — a manager's standing
// request to receive a recurring email report about one agent. Additive
// only: creates 1 new table, never alters or drops any existing column,
// table, or constraint. Report generation/delivery (AgentReportRun) is a
// separate, later piece — this table just holds what was requested.
export async function ensureAgentReportSubscriptionSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS agent_report_subscriptions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       agent_id UUID NOT NULL REFERENCES ai_agents(id),
       subscriber_org_member_id UUID REFERENCES org_members(id),
       created_by_email VARCHAR(255) NOT NULL,
       content_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
       cadence VARCHAR(20) NOT NULL,
       delivery_hour_local INTEGER NOT NULL,
       timezone VARCHAR(60) NOT NULL DEFAULT 'America/Chicago',
       channel VARCHAR(20) NOT NULL DEFAULT 'email',
       enabled BOOLEAN NOT NULL DEFAULT true,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_agent_report_subs_agent_enabled ON agent_report_subscriptions (agent_id, enabled)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] agent_report_subscriptions schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Agent report subscription schema ensured');
}
