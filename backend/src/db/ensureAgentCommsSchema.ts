import { sequelize } from '../config/database';

/**
 * Agent comms tool (Ali, 2026-11-22): each agent gets an email identity ("Maya would be
 * maya@colaberry.com") and every call and email is attributed to the agent on its dashboard.
 *
 * Additive only, idempotent, one statement per entry, each individually try/caught so a partial
 * database self-heals on the next boot; nothing existing is altered or dropped
 * (ensureAiAgentAutonomyLevelSchema.ts's shape).
 *
 *   - ai_agents.email_slug          the local part of the agent's addresses (maya ->
 *                                   maya@colaberry.com, replies to maya@reply.colaberry.ai).
 *                                   Unique ignoring case. NULL = the agent has no email identity.
 *   - ai_agents.email_display_name  the name shown in From ("Maya").
 *   - communication_logs agent index  the dashboard filters calls and emails on
 *                                   metadata->>'agent_name'; this keeps that cheap.
 *   - communication_logs voice idempotency  place_ai_call reserves its once-a-day key by INSERTING
 *                                   its row before it dials; this unique index is what makes two
 *                                   concurrent requests produce one call (the loser's insert fails).
 *   - Maya's identity, seeded only where none is set (never overwrites an operator's choice).
 *
 * Full undo (also in docs/agent-comms-runbook.md):
 *   UPDATE ai_agents SET email_slug = NULL, email_display_name = NULL WHERE agent_name = 'Maya';
 *   DROP INDEX IF EXISTS ai_agents_email_slug_uq;
 *   DROP INDEX IF EXISTS communication_logs_agent_name_idx;
 *   DROP INDEX IF EXISTS communication_logs_voice_idem_uq;
 * (the two nullable columns are harmless when unused).
 */
export const AGENT_COMMS_STATEMENTS: string[] = [
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS email_slug VARCHAR(40)`,
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS email_display_name VARCHAR(80)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ai_agents_email_slug_uq ON ai_agents (lower(email_slug)) WHERE email_slug IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS communication_logs_agent_name_idx ON communication_logs ((metadata->>'agent_name'))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS communication_logs_voice_idem_uq ON communication_logs ((metadata->>'idempotency_key')) WHERE channel = 'voice' AND metadata->>'idempotency_key' IS NOT NULL`,
  `UPDATE ai_agents SET email_slug = 'maya', email_display_name = 'Maya' WHERE agent_name = 'Maya' AND email_slug IS NULL`,
];

export async function ensureAgentCommsSchema(): Promise<void> {
  for (const sql of AGENT_COMMS_STATEMENTS) {
    try {
      await sequelize.query(sql);
    // `any`: a driver error of unknown shape; only name and message are read, both guarded.
    } catch (err: any) {
      console.warn(JSON.stringify({ level: 'warn', service: 'backend', event: 'agent_comms_schema_stmt_skipped', outcome: 'partial',
        error_class: err?.name || 'DatabaseError', context: { message: String(err?.message || err).slice(0, 200) } }));
    }
  }
  console.log('[DB] agent comms schema ensured');
}
