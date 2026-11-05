/**
 * Where a capability confirmation is RECORDED. One table, one row per capability.
 *
 * AF11.0: *"A recorded, checkable fact that a named human confirmed a capability, so that 'refuse
 * a grant for a draft capability' stops meaning 'refuse every grant'."*
 *
 * ## Why a table at all, when the 443 capabilities are JSON files
 *
 * Because the JSON is the wrong place and the ticket says so outright: hand-editing a record to
 * `confirmed` is *"exactly the fabricated approval `assertDraftOnlyInvariant()` exists to catch"*.
 * The files describe what a capability IS, which is reviewed in a pull request. A confirmation is
 * an EVENT — a named person looked at named evidence on a date — and an event belongs in a row
 * with an author and a timestamp, not in a file somebody can edit with no trace of who did it.
 *
 * That split is what makes the replaced invariant work: the file still says `draft`, the row says
 * who confirmed it, and `assertConfirmationsAreRecorded` refuses any file claiming non-draft with
 * no row behind it.
 *
 * ## One row per capability, not per capability and agent
 *
 * AF6.3 asked which, and Ali's ruling answered only WHO, so the reasoning is recorded in
 * `capabilityConfirmationContract.ts` and the key enforces it: a requirement is confirmed as a
 * requirement. "This is a real thing we want" is a statement about the capability, not about
 * which employee performs it. It is also the reversible direction — adding an agent column later
 * is additive, while removing one would strand rows.
 *
 * ## The evidence is COLUMNS, not a blob
 *
 * `CLAUDE.md` forbids untyped JSON as inter-module currency, and this is the case where it would
 * have hurt most: the whole point of the ticket is that a confirmation recording a date and a
 * state *"would satisfy the type and prove nothing"*. Four `NOT NULL` evidence columns mean a row
 * that cannot say what was looked at cannot exist. They mirror `EvidenceRecord` in
 * `promotionContract.ts` field for field, so the vocabulary is reused rather than paralleled.
 *
 * ## When this runs
 *
 * On the next boot after merge. Net-new, `IF NOT EXISTS`, referenced by nothing else, so
 * reverting the code leaves an empty table nothing reads — and an empty table means every
 * capability is still `draft`, which is the current state anyway.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { normalizeNameRows } from './ensureAgentDomainProjectSchema';

export const REQUIRED_TABLES: ReadonlyArray<string> = ['agent_domain_capability_confirmations'];

const T = 'agent_domain_capability_confirmations';

export const REQUIRED_COLUMNS: ReadonlyArray<string> = [
  // WHAT was confirmed. The primary key, so one capability cannot hold two confirmations.
  `${T}.capability_id`,
  // WHO confirmed it. Resolved through `resolveRecordedHumans`, never taken from a payload.
  `${T}.confirmed_by_identity`,
  // WHAT THEY POINTED AT. All four NOT NULL: a confirmation that cannot say what was looked at
  // is the one this ticket calls out as satisfying the type and proving nothing.
  `${T}.evidence_kind`,
  `${T}.evidence_source`,
  `${T}.evidence_observed_at`,
  `${T}.evidence_evaluated_by`,
  `${T}.evidence_summary`,
  // WHEN.
  `${T}.confirmed_at`,
];

export const REQUIRED_INDEXES: ReadonlyArray<string> = ['idx_adcc_confirmed_by'];

export const REQUIRED_CHECKS: ReadonlyArray<string> = ['chk_adcc_evidence_is_present'];

const STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS agent_domain_capability_confirmations (
     capability_id TEXT PRIMARY KEY,
     confirmed_by_identity TEXT NOT NULL,
     evidence_kind TEXT NOT NULL,
     evidence_source TEXT NOT NULL,
     evidence_observed_at TEXT NOT NULL,
     evidence_evaluated_by TEXT NOT NULL,
     evidence_summary TEXT NOT NULL DEFAULT '',
     confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT chk_adcc_evidence_is_present CHECK (
       length(btrim(confirmed_by_identity)) > 0
       AND length(btrim(evidence_kind)) > 0
       AND length(btrim(evidence_source)) > 0
       AND length(btrim(evidence_observed_at)) > 0
       AND length(btrim(evidence_evaluated_by)) > 0
     )
   )`,
  // "Which capabilities did this person confirm" is the question an audit asks first.
  `CREATE INDEX IF NOT EXISTS idx_adcc_confirmed_by
     ON agent_domain_capability_confirmations (confirmed_by_identity)`,
];

/** Net-new, so it reverts whole. No other table is mentioned here. */
export const ROLLBACK_STATEMENTS: ReadonlyArray<string> = [
  'DROP TABLE IF EXISTS agent_domain_capability_confirmations',
];

export async function ensureCapabilityConfirmationSchema(): Promise<void> {
  for (const statement of STATEMENTS) {
    try {
      await sequelize.query(statement);
    } catch (err: unknown) {
      // Warn and continue, matching its siblings. `assert` below is what actually decides, because
      // a loop that swallows every failure resolves identically on success and on total failure.
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'capability_confirmation_schema_statement_failed',
        outcome: 'failure',
        error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
        context: { message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }
}

/**
 * Read one column of names using the shape PROVEN against this driver: a NAMED bind, and
 * `normalizeNameRows` because a single-column select comes back as raw arrays.
 *
 * Both halves are imported rather than rewritten. A sibling got each of them wrong once and
 * reported `missing table` against a table sitting right there in production.
 */
async function readNames(sql: string, names: ReadonlyArray<string>): Promise<string[]> {
  const rows = await sequelize.query(sql, {
    bind: { names: names as string[] },
    type: QueryTypes.SELECT,
  });
  return normalizeNameRows(rows);
}

export async function assertCapabilityConfirmationSchema(): Promise<void> {
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

    // Without the constraint a row can claim a confirmation while naming neither the person nor
    // what they looked at, which is the exact shape this ticket calls out as proving nothing.
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

export interface GuardedCapabilityConfirmationSchemaResult {
  ok: boolean;
  error_class?: string;
}

/**
 * Boot entry point. CANNOT REJECT — a schema problem must be loud in the logs without taking the
 * whole backend down with it, the same contract its siblings have.
 */
export async function ensureCapabilityConfirmationSchemaGuarded(
): Promise<GuardedCapabilityConfirmationSchemaResult> {
  try {
    await ensureCapabilityConfirmationSchema();
    await assertCapabilityConfirmationSchema();
    return { ok: true };
  } catch (err: unknown) {
    const error_class = err instanceof Error ? err.constructor.name : 'UnknownError';
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'capability_confirmation_schema_unavailable',
      outcome: 'failure',
      error_class,
      context: { message: err instanceof Error ? err.message : String(err) },
    }));
    return { ok: false, error_class };
  }
}
