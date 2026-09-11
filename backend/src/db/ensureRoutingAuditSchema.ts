import { sequelize } from '../config/database';

/**
 * Routing Rules audit schema (Phase 2, T226) — what makes the EXISTING routing
 * engine "auditable, versioned and replay-safe" (spec §7.2) without replacing it.
 *
 * Two additive objects, both idempotent, both in their own try/catch like every
 * sibling ensure module:
 *
 *   1. `routing_rules.version` — an integer the admin controller bumps whenever
 *      a rule's `conditions` or `actions` change. Every execution row records
 *      the version it ran under, so "which rule fired?" always has an answer
 *      that survives the rule being edited afterwards.
 *
 *   2. `routing_rule_executions` — one row per (payload, rule, action index).
 *      The UNIQUE index on that triple IS the replay guard: the engine inserts
 *      a `claimed` row BEFORE running an action, and a second run of the same
 *      payload — a re-POST, a retry, two workers — loses the insert and skips
 *      the action instead of dialling the person twice.
 *
 * MUST BE CALLED AFTER `ensureIngestionSchema()`, which creates `routing_rules`
 * and `raw_lead_payloads`; the ALTER below names the former. Registered in
 * `server.ts` immediately after that call, and a test asserts the order.
 *
 * `raw_payload_id`, `rule_id` and `lead_id` are deliberately NOT foreign keys:
 * an audit row must outlive the rule that produced it (rules are hard-deleted
 * by the admin route today) and must never block or cascade from a payload
 * purge. Mixed key types are explicit (§6.4): UUIDs for the two UUID-keyed
 * tables, INTEGER for `leads`.
 */

/** Exported so the test can assert on the SQL without executing it. */
export const ROUTING_AUDIT_STATEMENTS: readonly string[] = [
  // The ONE ALTER in this module: a versioning column on the rules table, with
  // a default so every existing rule is version 1 the moment it exists.
  `ALTER TABLE routing_rules
     ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1`,

  `CREATE TABLE IF NOT EXISTS routing_rule_executions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     raw_payload_id UUID NOT NULL,
     lead_id INTEGER NOT NULL,
     rule_id UUID NOT NULL,
     rule_version INTEGER NOT NULL,
     action_index SMALLINT NOT NULL,
     action_type TEXT NOT NULL,
     action_snapshot JSONB NOT NULL,
     status VARCHAR(16) NOT NULL,
     detail JSONB,
     error_class TEXT,
     tenant_id UUID,
     brand_id UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     finished_at TIMESTAMPTZ
   )`,

  // The replay guard. See the header.
  `CREATE UNIQUE INDEX IF NOT EXISTS routing_rule_executions_payload_rule_action_unique
     ON routing_rule_executions (raw_payload_id, rule_id, action_index)`,
  `CREATE INDEX IF NOT EXISTS idx_rre_lead ON routing_rule_executions (lead_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_rre_rule ON routing_rule_executions (rule_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_rre_status ON routing_rule_executions (status)`,
];

export async function ensureRoutingAuditSchema(): Promise<void> {
  for (const statement of ROUTING_AUDIT_STATEMENTS) {
    try {
      await sequelize.query(statement);
    } catch (err: unknown) {
      // Warn and continue, matching the sibling ensure modules. Re-running is a
      // no-op, so the next boot repairs a statement that failed.
      console.warn(
        '[ensureRoutingAuditSchema] statement failed:',
        (err as { message?: string })?.message,
      );
    }
  }
}
