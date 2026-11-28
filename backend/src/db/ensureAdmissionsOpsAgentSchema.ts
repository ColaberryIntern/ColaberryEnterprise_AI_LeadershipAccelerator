import { sequelize } from '../config/database';

/**
 * Admissions & Ops Command Center (AO2.3): the agent audit log and the Approvals queue. Additive only: creates two new
 * tables and one trigger, never alters an existing table. Awaited at boot through boot/admissionsOpsBoot.ts.
 *
 * admissions_ops_agent_log is APPEND-ONLY, enforced by the database: a trigger refuses every UPDATE and DELETE, so no
 * code path (or person with a SQL console and the app's role) can rewrite what the agent did. request_id is UNIQUE, so
 * replaying the same request writes one row (INSERT ... ON CONFLICT DO NOTHING in the writer).
 * admissions_ops_approvals: one item per prepared level-3 or level-5 request, keyed UNIQUE on the originating request.
 *
 * Rollback: redeploying an older image leaves both tables in place and unused; dropping them is a manual step Ali approves.
 */
export async function ensureAdmissionsOpsAgentSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS admissions_ops_agent_log (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       request_id VARCHAR(64) NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       actor_kind VARCHAR(16) NOT NULL,
       agent_id VARCHAR(64),
       agent_version VARCHAR(32),
       on_behalf_of VARCHAR(128) NOT NULL,
       mode VARCHAR(16) NOT NULL,
       intent_type VARCHAR(16) NOT NULL,
       screen VARCHAR(32),
       action VARCHAR(64),
       level SMALLINT,
       params JSONB NOT NULL DEFAULT '{}'::jsonb,
       sources_read JSONB NOT NULL DEFAULT '[]'::jsonb,
       outcome VARCHAR(24) NOT NULL,
       reason TEXT,
       approval_id UUID
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS admissions_ops_agent_log_request_unique ON admissions_ops_agent_log (request_id)`,
    `CREATE INDEX IF NOT EXISTS idx_admissions_ops_agent_log_created ON admissions_ops_agent_log (created_at DESC)`,
    `CREATE OR REPLACE FUNCTION admissions_ops_agent_log_append_only() RETURNS trigger AS $$
     BEGIN
       RAISE EXCEPTION 'admissions_ops_agent_log is append-only';
     END;
     $$ LANGUAGE plpgsql`,
    // One statement (Postgres 14+): no DROP-then-CREATE window in which the log could be changed during a boot.
    `CREATE OR REPLACE TRIGGER admissions_ops_agent_log_no_change BEFORE UPDATE OR DELETE ON admissions_ops_agent_log
       FOR EACH ROW EXECUTE FUNCTION admissions_ops_agent_log_append_only()`,
    `CREATE TABLE IF NOT EXISTS admissions_ops_approvals (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       request_id VARCHAR(64) NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       action VARCHAR(64) NOT NULL,
       level SMALLINT NOT NULL,
       screen VARCHAR(32) NOT NULL,
       summary TEXT NOT NULL,
       params JSONB NOT NULL DEFAULT '{}'::jsonb,
       prepared_by_kind VARCHAR(16) NOT NULL,
       prepared_by VARCHAR(128) NOT NULL,
       on_behalf_of VARCHAR(128) NOT NULL,
       status VARCHAR(16) NOT NULL DEFAULT 'open',
       decided_by VARCHAR(128),
       decided_at TIMESTAMPTZ
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS admissions_ops_approvals_request_unique ON admissions_ops_approvals (request_id)`,
    `CREATE INDEX IF NOT EXISTS idx_admissions_ops_approvals_status ON admissions_ops_approvals (status, created_at DESC)`,
  ];
  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      console.warn(JSON.stringify({ level: 'warn', service: 'backend', event: 'admissions_ops_schema_stmt_failed', outcome: 'failure',
        error_class: e?.name ?? 'DatabaseError', context: { message: String(e?.message ?? '').slice(0, 200), stmt: sql.slice(0, 60) } }));
    }
  }
}
