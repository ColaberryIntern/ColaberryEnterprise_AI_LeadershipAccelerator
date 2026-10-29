/**
 * Agent-domain change requests — ONE table, ZERO `ALTER` statements.
 *
 * AF4.2, session CC-20261028-w7k5. An intern files a change request against their domain; a named
 * human decides it; the row records who filed it, who decided it, and when.
 *
 * ## Why a new table rather than `approval_requests`
 *
 * Decided by the schema, not by taste. `approval_requests` has exactly ONE identity column,
 * `decided_by`, and no `proposed_by` / `requested_by` / `created_by` / `submitted_by` of any kind.
 * The ticket's first acceptance criterion is "a CR records a named proposer", so that criterion is
 * literally unstorable there.
 *
 * The history is the second reason. All 106 rows in that table were written by a four-hour timer —
 * `decided_by` has one distinct value across every row — and
 * `docs/architecture/ai-workforce-management/APPROVAL_DROP_QUEUE_2026-10-06.md` found it asserting
 * `approved` for work the domain table recorded as `held`: *"The domain table is honest and the
 * governance table is not."*
 *
 * ## Why its own file rather than a third table in `ensureAgentDomainProjectSchema.ts`
 *
 * That file's header states its contribution as "TWO TABLES, ZERO `ALTER` STATEMENTS", and it is
 * already 354 lines against a 300-line soft target. A third table would change what it is. Nine
 * files in this directory already export their own `REQUIRED_TABLES` with their own assertion, so a
 * tenth follows the convention rather than duplicating one file's internals. It also reverts
 * independently of the file that manages the already-provisioned production domain tables.
 *
 * ## The shape is borrowed from `DeliveryChangeRequest`, which is the honest precedent
 *
 * `models/DeliveryChangeRequest.ts` already carries `requested_by_identity_id`,
 * `approved_by_identity_id`, `approved_at` and `declined_reason`. It is the right shape and the
 * wrong table: that one is a CLIENT's request scoped to `delivery_project_id`, and an intern's
 * request is against the platform.
 *
 * ## When this runs
 *
 * On the next boot of the backend after merge, for any reason — a deploy, a restart, a crash
 * recovery. There is no separate switch anybody throws. The table is additive, created
 * `IF NOT EXISTS`, and referenced by nothing else, so reverting the code leaves an empty table that
 * nothing reads.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

export const REQUIRED_TABLES: ReadonlyArray<string> = ['agent_domain_change_requests'];

export const REQUIRED_COLUMNS: ReadonlyArray<string> = [
  'agent_domain_change_requests.id',
  'agent_domain_change_requests.domain_key',
  'agent_domain_change_requests.title',
  'agent_domain_change_requests.description',
  'agent_domain_change_requests.status',
  'agent_domain_change_requests.requested_by_identity',
  'agent_domain_change_requests.requested_at',
  'agent_domain_change_requests.approved_by_identity',
  'agent_domain_change_requests.approved_at',
  'agent_domain_change_requests.declined_reason',
];

export const REQUIRED_INDEXES: ReadonlyArray<string> = [
  'idx_adcr_domain_key',
  'idx_adcr_status',
  'idx_adcr_requested_by',
];

/**
 * `requested_by_identity` is `NOT NULL`. That is the first acceptance criterion expressed as a
 * constraint rather than as a rule somebody has to remember to apply: a change request with no
 * proposer cannot physically exist in this table, independently of whether the gate is called.
 *
 * `approved_by_identity` and `approved_at` are nullable, because a submitted request has not been
 * decided yet. The service writes them together inside one transaction, and the gate refuses a
 * decision with no named human, so the pair cannot be half-filled by the application. A CHECK
 * constraint makes that structural too.
 *
 * ## Why these columns are `_identity` and not `_identity_id`, which is not cosmetic
 *
 * They hold the actor's EMAIL, and the name says so. `DeliveryChangeRequest` stores an
 * `org_members` UUID in `requested_by_identity_id`, and copying that here would have broken the
 * guard this whole ticket is about: the gate judges the stored identity with `isNonHumanIdentity`,
 * whose denylist matches strings like `system:auto_approve_timeout`. **A UUID passes that denylist
 * unconditionally**, so storing one would leave door 2 decorative in production while every unit
 * test still passed, because the tests supply emails.
 *
 * It also makes the acceptance criterion literally true. "An approved CR names the approving
 * human" is satisfied by an email on the row; a UUID names nobody without a join. The gov
 * subsystem reached the same conclusion already — actor identity there is an email, not a uuid.
 */
const STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS agent_domain_change_requests (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     domain_key TEXT NOT NULL,
     title TEXT NOT NULL,
     description TEXT,
     status TEXT NOT NULL DEFAULT 'submitted',
     requested_by_identity TEXT NOT NULL,
     requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     approved_by_identity TEXT,
     approved_at TIMESTAMPTZ,
     declined_reason TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT chk_adcr_decided_together CHECK (
       (approved_by_identity IS NULL) = (approved_at IS NULL)
     )
   )`,
  `CREATE INDEX IF NOT EXISTS idx_adcr_domain_key ON agent_domain_change_requests (domain_key)`,
  `CREATE INDEX IF NOT EXISTS idx_adcr_status ON agent_domain_change_requests (status)`,
  `CREATE INDEX IF NOT EXISTS idx_adcr_requested_by
     ON agent_domain_change_requests (requested_by_identity)`,
];

/** Net-new, and says so: `ROLLBACK_STATEMENTS` appears in no other file in this directory. */
export const ROLLBACK_STATEMENTS: ReadonlyArray<string> = [
  'DROP TABLE IF EXISTS agent_domain_change_requests',
];

export async function ensureAgentDomainChangeRequestSchema(): Promise<void> {
  for (const statement of STATEMENTS) {
    try {
      await sequelize.query(statement);
    } catch (err: unknown) {
      // Warn and continue, matching the house idiom — then `assert` below is what actually
      // decides, because a loop that swallows every failure resolves identically on total
      // success and total failure.
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'agent_domain_change_request_schema_statement_failed',
        outcome: 'failure',
        error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
        context: { message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }
}

/**
 * Assert the post-condition against `information_schema`, and THROW.
 *
 * This exists because `ensure*` above cannot fail: `CREATE TABLE IF NOT EXISTS` is a no-op on an
 * existing table and every error is warned rather than raised, so the function resolves the same
 * way whether the DDL worked or did nothing at all. A schema fix once shipped "green" and stayed
 * broken in production for a day on exactly that. Mocked unit tests cannot see a column name;
 * `information_schema` can.
 */
export async function assertAgentDomainChangeRequestSchema(): Promise<void> {
  const problems: string[] = [];

  const tables = await sequelize.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1)`,
    { type: QueryTypes.SELECT, bind: [[...REQUIRED_TABLES]] },
  );
  const haveTables = new Set(tables.map((r) => r.table_name));
  for (const t of REQUIRED_TABLES) if (!haveTables.has(t)) problems.push(`missing table ${t}`);

  // Only worth asking about columns if the table arrived; otherwise every column is "missing" and
  // the real finding drowns in ten lines of noise.
  if (problems.length === 0) {
    const cols = await sequelize.query<{ ref: string }>(
      `SELECT table_name || '.' || column_name AS ref FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1)`,
      { type: QueryTypes.SELECT, bind: [[...REQUIRED_TABLES]] },
    );
    const haveCols = new Set(cols.map((r) => r.ref));
    for (const c of REQUIRED_COLUMNS) if (!haveCols.has(c)) problems.push(`missing column ${c}`);

    const idx = await sequelize.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY($1)`,
      { type: QueryTypes.SELECT, bind: [[...REQUIRED_TABLES]] },
    );
    const haveIdx = new Set(idx.map((r) => r.indexname));
    for (const i of REQUIRED_INDEXES) if (!haveIdx.has(i)) problems.push(`missing index ${i}`);
  }

  if (problems.length > 0) {
    throw new Error(`SchemaInvariantViolation: ${problems.join('; ')}`);
  }
}

export interface GuardedChangeRequestSchemaResult {
  ok: boolean;
  error_class?: string;
}

/**
 * Boot entry point. CANNOT REJECT — a schema problem must be loud in the logs without taking the
 * whole backend down with it, which is the same contract `ensureAgentDomainProjectSchemaGuarded`
 * has and the reason `server.ts` can await it bare.
 */
export async function ensureAgentDomainChangeRequestSchemaGuarded(
): Promise<GuardedChangeRequestSchemaResult> {
  try {
    await ensureAgentDomainChangeRequestSchema();
    await assertAgentDomainChangeRequestSchema();
    return { ok: true };
  } catch (err: unknown) {
    const error_class = err instanceof Error ? err.constructor.name : 'UnknownError';
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'agent_domain_change_request_schema_unavailable',
      outcome: 'failure',
      error_class,
      context: { message: err instanceof Error ? err.message : String(err) },
    }));
    return { ok: false, error_class };
  }
}
