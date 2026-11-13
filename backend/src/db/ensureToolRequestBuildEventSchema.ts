/**
 * What happened to a tool request AFTER it was approved. APPEND-ONLY, one row per milestone.
 *
 * Agent Tools Phase 3, 2026-11-11. Ali asked that a request be tracked "until it is built out
 * and handed over". Approval was the last thing anything recorded, so a request sat at
 * "approved" forever whether it shipped the next day or was never started.
 *
 * ## Why this is not a wider status enum on the request
 *
 * `agent_domain_change_requests.status` is the GOVERNANCE state: submitted, approved, declined,
 * withdrawn, with a transition machine in `agentChangeRequest.ts` and other code reading those
 * four values. Adding `in_build` and `handed_over` to it would mean the column that answers "was
 * this allowed" also answers "did somebody build it", and every existing reader of that column
 * would silently acquire two new values it has never seen.
 *
 * Those are different questions with different authors. Approval is Ali's; building is the
 * builder's. So delivery progress lives here, the way the decision log and the conversation
 * already live beside the status rather than inside it, and the request's governance state is
 * untouched by anything in this file.
 *
 * ## Why append-only
 *
 * "Handed over on the 20th" is a fact about a day, not a flag. A row per milestone keeps the
 * sequence — approved, started, handed over — and the dates between them, which is the whole
 * point of tracking it. A single column would keep only the last one.
 *
 * ## What it deliberately cannot hold
 *
 * No `status`, no `verb`, no `tools_granted`, no `autonomy_level`. It cannot approve anything
 * and cannot grant anything. A request that was never approved cannot have a build event at all,
 * which the service refuses by name and which keeps this table from becoming a way to route
 * around the approval it depends on.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { normalizeNameRows } from './ensureAgentDomainProjectSchema';

export const REQUIRED_TABLES: ReadonlyArray<string> = ['agent_domain_tool_request_build_events'];

const T = 'agent_domain_tool_request_build_events';

export const REQUIRED_COLUMNS: ReadonlyArray<string> = [
  `${T}.id`,
  `${T}.change_request_id`,
  // WHICH milestone.
  `${T}.event`,
  // WHO recorded it and WHEN it happened.
  `${T}.actor_identity`,
  `${T}.occurred_at`,
  // Optional words. A handover with a link to what was handed over is worth more than a date.
  `${T}.note`,
  `${T}.created_at`,
];

export const REQUIRED_INDEXES: ReadonlyArray<string> = ['idx_adtrbe_change_request_id'];

export const REQUIRED_CHECKS: ReadonlyArray<string> = [
  'chk_adtrbe_event_is_known',
  'chk_adtrbe_actor_is_not_blank',
];

const STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS agent_domain_tool_request_build_events (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     change_request_id UUID NOT NULL
       REFERENCES agent_domain_change_requests (id) ON DELETE CASCADE,
     event TEXT NOT NULL,
     actor_identity TEXT NOT NULL,
     occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     note TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     -- Two milestones, not an open-ended string. A vocabulary that anything may add to is one that
     -- nothing can read reliably, and the sentence the dashboard derives depends on knowing
     -- exactly which values exist.
     CONSTRAINT chk_adtrbe_event_is_known CHECK (
       event IN ('started_build', 'handed_over')
     ),
     CONSTRAINT chk_adtrbe_actor_is_not_blank CHECK (length(btrim(actor_identity)) > 0)
   )`,
  // "What has happened to this request, in order" is the only question this table answers.
  `CREATE INDEX IF NOT EXISTS idx_adtrbe_change_request_id
     ON agent_domain_tool_request_build_events (change_request_id, occurred_at)`,
];

/** Net-new, so it reverts whole. The parent is deliberately not mentioned here. */
export const ROLLBACK_STATEMENTS: ReadonlyArray<string> = [
  'DROP TABLE IF EXISTS agent_domain_tool_request_build_events',
];

export async function ensureToolRequestBuildEventSchema(): Promise<void> {
  for (const statement of STATEMENTS) {
    try {
      await sequelize.query(statement);
    } catch (err: unknown) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'tool_request_build_event_schema_statement_failed',
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

export async function assertToolRequestBuildEventSchema(): Promise<void> {
  const problems: string[] = [];

  const tables = await readNames(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($names)`,
    REQUIRED_TABLES,
  );
  for (const t of REQUIRED_TABLES) if (!tables.includes(t)) problems.push(`missing table ${t}`);

  // Every query binds REQUIRED_TABLES and filters by table, matching its siblings exactly. That
  // is the form proven against this driver; a hand-rolled variant might work and might silently
  // return nothing, which this assert would read as a clean schema.
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

export interface GuardedToolRequestBuildEventSchemaResult {
  ok: boolean;
  error_class?: string;
}

/** Boot entry point. CANNOT REJECT, the same contract its siblings have. */
export async function ensureToolRequestBuildEventSchemaGuarded(
): Promise<GuardedToolRequestBuildEventSchemaResult> {
  try {
    await ensureToolRequestBuildEventSchema();
    await assertToolRequestBuildEventSchema();
    return { ok: true };
  } catch (err: unknown) {
    const error_class = err instanceof Error ? err.constructor.name : 'UnknownError';
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'tool_request_build_event_schema_unavailable',
      outcome: 'failure',
      error_class,
      context: { message: err instanceof Error ? err.message : String(err) },
    }));
    return { ok: false, error_class };
  }
}
