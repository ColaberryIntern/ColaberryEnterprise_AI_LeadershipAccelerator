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
 *
 * ## Phase 2b — WHAT DATA, and WHERE
 *
 * `datasets` and `environment` arrived 15 Nov 2026, and they are what makes the Phase 2a picker
 * more than a form field. A tool request could already name the datasets it reads and say
 * whether it runs on the sandbox or in production; the grant recorded neither, so an approval
 * recorded the tool and dropped the scope it was approved for. A narrow production request and a
 * wide one produced the same row.
 *
 * `environment` is `NOT NULL`. The table held **0 rows** in production when this shipped
 * (measured 15 Nov 2026), so requiring it refuses no grant anybody has made. It is required
 * rather than nullable because a grant IS a decision about where a tool may run, and "we did not
 * say" is not an acceptable state for a permission record — unlike `change_request_id`, where
 * null is a real and ordinary fact about a grant that answers no request.
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
  // WHICH REQUEST IT ANSWERS, when it answers one. AF11.4. Nullable: a grant made for a
  // capability promotion answers no request.
  `${T}.change_request_id`,
  // WHO SAID SO, and WHEN.
  `${T}.approved_by_identity`,
  `${T}.approved_at`,
  // WHAT DATA, and WHERE. Phase 2b. The scope this grant was approved for, which until now was
  // declared on the request and then thrown away at the moment of approval.
  `${T}.datasets`,
  `${T}.environment`,
];

export const REQUIRED_INDEXES: ReadonlyArray<string> = [
  'idx_adtg_agent_name',
  'idx_adtg_change_request',
  'uq_adtg_agent_tool',
];

/**
 * The checks `assert` names one by one, so an absent one fails a boot rather than a review.
 *
 * `chk_adtg_environment_known` is the storage half of `grant_environment_unknown`: the contract
 * refuses an unknown value with a sentence, and this makes a row carrying one impossible even if
 * a future caller skips the contract. Same move, same reason, and the same pair of names as
 * `chk_adtr_environment_known` on the request table.
 */
export const REQUIRED_CHECKS: ReadonlyArray<string> = [
  'chk_adtg_fields_are_present',
  'chk_adtg_environment_known',
];

const STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS agent_domain_tool_grants (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     agent_id UUID NOT NULL,
     agent_name TEXT NOT NULL,
     tool_name TEXT NOT NULL,
     capability_id TEXT NOT NULL,
     approved_by_identity TEXT NOT NULL,
     approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     -- Phase 2b. The scope this grant was approved for.
     --
     -- datasets defaults to the empty array, which means NO DATASET SCOPE WAS RECORDED and not
     -- "no data": a tool that sends email reads no table. The request side is where an empty
     -- list gets its second reading, because Ali's 4 Nov ruling makes an unscoped SANDBOX read
     -- legitimate -- see grant_datasets_exceed_request in agentToolGrantContract.ts.
     datasets JSONB NOT NULL DEFAULT '[]'::jsonb,
     environment TEXT NOT NULL,
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
     ),
     CONSTRAINT chk_adtg_environment_known CHECK (
       environment IN ('sandbox', 'production')
     )
   )`,
  // AF11.4 — WHICH REQUEST THIS GRANT ANSWERS.
  //
  // An ALTER, and not a column in the CREATE above, because `CREATE TABLE IF NOT EXISTS` is a
  // NO-OP against the table AF3.5 already created in production. Adding the column to the
  // CREATE alone would have shipped green, resolved identically, and left the column absent on
  // every environment the table already exists in. The `assertAgentToolGrantSchema`
  // post-condition below names this column, so a deploy where the ALTER did not run fails loudly
  // at boot rather than at the first assignment.
  //
  // NULLABLE on purpose: a grant made for a capability promotion answers no request, so a NOT
  // NULL column would force a fake id into those rows. No foreign key, for the same reason
  // `capability_id` has none — a grant outranks the paperwork that prompted it, and a cascade
  // from a deleted request to a live grant would be the wrong direction of authority.
  `ALTER TABLE agent_domain_tool_grants
     ADD COLUMN IF NOT EXISTS change_request_id UUID`,
  // Phase 2b — WHAT DATA, and WHERE. ALTERs for exactly the reason the AF11.4 comment above
  // gives: the table exists in production (verified 15 Nov 2026), so `CREATE TABLE IF NOT
  // EXISTS` is a no-op and a column added only to the CREATE would ship green and be absent.
  `ALTER TABLE agent_domain_tool_grants
     ADD COLUMN IF NOT EXISTS datasets JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE agent_domain_tool_grants
     ADD COLUMN IF NOT EXISTS environment TEXT`,
  // Two statements, not `ADD COLUMN ... NOT NULL`, because that form needs a DEFAULT and there
  // is deliberately none: a default environment is a guess about where a tool runs, and this
  // column exists precisely so nobody has to guess. Safe without one because the table held 0
  // rows when this shipped — a row that existed would make this statement fail, loudly, which is
  // the correct outcome rather than a silent backfill of an invented value.
  `ALTER TABLE agent_domain_tool_grants
     ALTER COLUMN environment SET NOT NULL`,
  // Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so the guard is explicit. Without it this
  // statement throws on every boot after the first and the failure is swallowed into a warn,
  // which would make the log claim a problem that is not one.
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'chk_adtg_environment_known'
     ) THEN
       ALTER TABLE agent_domain_tool_grants
         ADD CONSTRAINT chk_adtg_environment_known
         CHECK (environment IN ('sandbox', 'production'));
     END IF;
   END $$`,
  // "Which grants answered this request" is the question the review console asks.
  `CREATE INDEX IF NOT EXISTS idx_adtg_change_request
     ON agent_domain_tool_grants (change_request_id)`,
  // THE IDEMPOTENCY KEY. Granting the same tool to the same agent twice is one row, not two, so
  // a retried request cannot produce a duplicate grant.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_adtg_agent_tool
     ON agent_domain_tool_grants (agent_id, tool_name)`,
  // "What has this agent been granted" is the question the boot seed asks, by name, for every
  // agent in the registry.
  `CREATE INDEX IF NOT EXISTS idx_adtg_agent_name
     ON agent_domain_tool_grants (agent_name)`,
];

/**
 * Net-new, so it reverts whole. `ai_agents` is deliberately not mentioned here.
 *
 * AF11.4's `change_request_id` and Phase 2b's `datasets` and `environment` go with the table
 * rather than getting a `DROP COLUMN` each: this module OWNS the table, so a module-level revert
 * is dropping it. A column-only revert would be a different operation with a different blast
 * radius, and inventing one here would mean two rollback paths where nothing calls even the first.
 */
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

    // NULLABILITY IS ITS OWN QUESTION. `ADD COLUMN IF NOT EXISTS environment TEXT` and
    // `ALTER COLUMN environment SET NOT NULL` are two statements, and `ensureAgentToolGrantSchema`
    // swallows each failure independently — so a deploy where the first ran and the second did
    // not leaves a column that EXISTS and is nullable. Checking only for presence would pass that
    // half-applied state, and the first grant written through it would record a null environment:
    // a permission record that does not say where it applies.
    const nullable = await readNames(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($names)
          AND column_name = 'environment' AND is_nullable = 'YES'`,
      REQUIRED_TABLES,
    );
    if (nullable.includes('environment')) {
      problems.push('column agent_domain_tool_grants.environment is still nullable');
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
