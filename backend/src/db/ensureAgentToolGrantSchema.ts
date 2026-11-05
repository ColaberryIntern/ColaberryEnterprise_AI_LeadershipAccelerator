/**
 * ensureAgentToolGrantSchema — the ledger that makes a tool grant a RECORD rather than an edit.
 *
 * AF3.5. One row per (agent, tool): who approved it, which capability it was granted for, and
 * when. `ai_agents.tools_granted` is the column the runtime reads; this table is why that column
 * holds what it holds.
 *
 * ## The ledger is not bookkeeping. It is the thing that makes the grant survive a deploy.
 *
 * `seedAgentRegistry()` rewrites `tools_granted` from hardcoded array literals on EVERY boot,
 * wholesale, and the ten domain agents declare `tools_granted: []`. So before this table existed,
 * any grant was reverted by the next deploy, and `maybeReclassifyAutonomyLevel` then fired on the
 * revert and rewrote `autonomy_level` too. The seed now unions the registry list with the grants
 * recorded here, which is only possible because the grants are written down somewhere the seed
 * can read.
 *
 * ## There is no revoke, deliberately
 *
 * Revocation is a different decision with a different authority and it is out of this ticket's
 * scope. Rather than ship a `revoked_at` column that nothing writes — a promise the code does not
 * keep — there is none, and a recorded grant therefore outranks the registry permanently until a
 * later ticket adds one. The UNIQUE constraint makes re-granting a no-op instead of a duplicate.
 *
 * ## What this table deliberately CANNOT hold
 *
 * No `autonomy_level`, no `enabled`, no `abac_mode_override`, no verdict. A grant and an autonomy
 * level are two decisions; a table that could carry both is how they become one click.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { normalizeNameRows } from './ensureAgentDomainProjectSchema';

export const REQUIRED_TABLES: ReadonlyArray<string> = ['agent_domain_tool_grants'];

const T = 'agent_domain_tool_grants';

export const REQUIRED_COLUMNS: ReadonlyArray<string> = [
  `${T}.id`,
  // WHO it was granted to. The name is denormalised on purpose: the seed matches agents by
  // `agent_name`, so a name here means the seed can resolve grants without a join on every boot.
  `${T}.agent_id`,
  `${T}.agent_name`,
  // WHAT.
  `${T}.tool_name`,
  // WHAT FOR. The capability someone proved by hand and recorded.
  `${T}.capability_id`,
  // WHO SAID SO, and WHEN.
  `${T}.approved_by_identity`,
  `${T}.approved_at`,
];

export const REQUIRED_INDEXES: ReadonlyArray<string> = [
  'idx_adtg_agent_name',
  'uq_adtg_agent_tool',
];

export const REQUIRED_CHECKS: ReadonlyArray<string> = ['chk_adtg_fields_are_present'];

const STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS agent_domain_tool_grants (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     agent_id UUID NOT NULL,
     agent_name TEXT NOT NULL,
     tool_name TEXT NOT NULL,
     capability_id TEXT NOT NULL,
     approved_by_identity TEXT NOT NULL,
     approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     -- The application refuses each of these by name so the person gets a sentence. The
     -- constraint means a row that breaks them cannot exist even if a future caller skips the
     -- contract. Same move, same reason, as chk_adcc_evidence_is_present on the AF11.0 table.
     CONSTRAINT chk_adtg_fields_are_present CHECK (
       length(btrim(agent_name)) > 0
       AND length(btrim(tool_name)) > 0
       AND length(btrim(capability_id)) > 0
       AND length(btrim(approved_by_identity)) > 0
     )
   )`,
  // THE IDEMPOTENCY KEY. Granting the same tool to the same agent twice is one row, not two, so
  // a retried request cannot produce a duplicate grant.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_adtg_agent_tool
     ON agent_domain_tool_grants (agent_id, tool_name)`,
  // "What has this agent been granted" is the question the boot seed asks, by name, for every
  // agent in the registry.
  `CREATE INDEX IF NOT EXISTS idx_adtg_agent_name
     ON agent_domain_tool_grants (agent_name)`,
];

/** Net-new, so it reverts whole. `ai_agents` is deliberately not mentioned here. */
export const ROLLBACK_STATEMENTS: ReadonlyArray<string> = [
  'DROP TABLE IF EXISTS agent_domain_tool_grants',
];

export async function ensureAgentToolGrantSchema(): Promise<void> {
  for (const statement of STATEMENTS) {
    try {
      await sequelize.query(statement);
    } catch (err: unknown) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'agent_tool_grant_schema_statement_failed',
        outcome: 'failure',
        error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
        context: { message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }
}

/** NAMED bind plus `normalizeNameRows`, the shape proven against this driver. */
async function readNames(sql: string, names: ReadonlyArray<string>): Promise<string[]> {
  const rows = await sequelize.query(sql, {
    bind: { names: names as string[] },
    type: QueryTypes.SELECT,
  });
  return normalizeNameRows(rows);
}

/**
 * Prove the DDL actually ran.
 *
 * `ensureAgentToolGrantSchema` swallows every failure into a warn, so it resolves identically on
 * total success and total failure — and `CREATE TABLE IF NOT EXISTS` is a no-op against an
 * existing table. Asserting post-conditions against `information_schema` is the only way this
 * distinguishes the two.
 */
export async function assertAgentToolGrantSchema(): Promise<void> {
  const problems: string[] = [];

  const tables = await readNames(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($names)`,
    REQUIRED_TABLES,
  );
  for (const t of REQUIRED_TABLES) if (!tables.includes(t)) problems.push(`missing table ${t}`);

  if (problems.length === 0) {
    const cols = await readNames(
      `SELECT table_name || '.' || column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($names)`,
      REQUIRED_TABLES,
    );
    for (const c of REQUIRED_COLUMNS) if (!cols.includes(c)) problems.push(`missing column ${c}`);

    const idx = await readNames(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY($names)`,
      REQUIRED_TABLES,
    );
    for (const i of REQUIRED_INDEXES) if (!idx.includes(i)) problems.push(`missing index ${i}`);

    const checks = await readNames(
      `SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = ANY($names)
          AND constraint_type = 'CHECK'`,
      REQUIRED_TABLES,
    );
    for (const c of REQUIRED_CHECKS) {
      if (!checks.includes(c)) problems.push(`missing constraint ${c}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`SchemaInvariantViolation: ${problems.join('; ')}`);
  }
}

export interface GuardedAgentToolGrantSchemaResult {
  ok: boolean;
  error_class?: string;
}

/** Boot entry point. CANNOT REJECT, the same contract its siblings have. */
export async function ensureAgentToolGrantSchemaGuarded(
): Promise<GuardedAgentToolGrantSchemaResult> {
  try {
    await ensureAgentToolGrantSchema();
    await assertAgentToolGrantSchema();
    return { ok: true };
  } catch (err: unknown) {
    const error_class = err instanceof Error ? err.constructor.name : 'UnknownError';
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'agent_tool_grant_schema_unavailable',
      outcome: 'failure',
      error_class,
      context: { message: err instanceof Error ? err.message : String(err) },
    }));
    return { ok: false, error_class };
  }
}
