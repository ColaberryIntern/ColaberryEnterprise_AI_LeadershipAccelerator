/**
 * Where a duplicate-tool check is RECORDED. One table, one row per request, no `ALTER` on anybody
 * else's table.
 *
 * AF11.2: *"Store the result with the request so what he sees is what was computed at submit time,
 * rather than a different answer recomputed when the page loads."* This is that store, and the
 * acceptance criterion is read back off this row rather than off a second computation.
 *
 * ## Why ONE ROW holding the whole answer, rather than one row per candidate
 *
 * Because the answer is atomic. A candidates table can be half-written, and a half-written ranking
 * is a different answer from the one that was computed: the approver would be looking at two of
 * three candidates with nothing saying the third went missing. One row commits the whole ranking or
 * none of it, which is what makes "what he sees is what was computed" true rather than usually
 * true.
 *
 * `chk_adtdc_count_matches` then makes the remaining way to lie structural: `candidate_count` must
 * equal the length of `candidates`, so a truncated list cannot exist in the table even if some
 * future caller builds one. Same move, and the same reason, as `chk_adtr_write_declares_effects`
 * on the detail table and `chk_adcr_decided_together` on the parent.
 *
 * ## Why `candidates` is JSONB, given CLAUDE.md forbids untyped JSON as inter-module currency
 *
 * It is not currency, it is a stored RESULT, and it is typed on both sides: `DuplicateCandidate[]`
 * in `toolDuplicateCheck.ts` going in, and `projectDuplicateCheck()` in
 * `agentChangeRequestService.ts` coming out. The precedent is the sibling's four list columns,
 * whose header records the same reasoning. The alternative, a column per field of a nested ranked
 * structure, cannot be expressed in columns at all without the candidates table this file's first
 * paragraph rejects.
 *
 * ## FOUR STATES, which is the whole point of the row existing
 *
 * `CLAUDE.md`'s rule is that an absence is indistinguishable from a broken detector unless
 * something says which it is. A duplicate check that found nothing is good news, and good news is
 * exactly the kind of zero nobody checks. So:
 *
 * | What you see | What it means |
 * |---|---|
 * | no row at all | the check never ran for this request |
 * | row, `catalog_absent = true` | it ran and could not see the catalog; the zero means nothing |
 * | row, `catalog_absent = false`, `candidate_count = 0` | it ran against a real catalog and this request is genuinely novel |
 * | row, `candidate_count > 0` | these are the matches, as computed at submit time |
 *
 * Without the row, the third and the first look identical, and the reviewer would read "no
 * duplicates" off a check that never happened.
 *
 * ## When this runs
 *
 * On the next boot after merge, after the parent and the detail table, because the foreign key
 * needs the parent. Additive, `IF NOT EXISTS`, and net-new, so reverting the code leaves an empty
 * table nothing reads.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { normalizeNameRows } from './ensureAgentDomainProjectSchema';

export const REQUIRED_TABLES: ReadonlyArray<string> = ['agent_domain_tool_duplicate_checks'];

const T = 'agent_domain_tool_duplicate_checks';

export const REQUIRED_COLUMNS: ReadonlyArray<string> = [
  `${T}.change_request_id`,
  `${T}.checked_at`,
  // The three facts that make a zero readable
  `${T}.catalog_size`,
  `${T}.catalog_absent`,
  `${T}.threshold`,
  // The answer
  `${T}.candidate_count`,
  `${T}.candidates`,
  // Disclosed rather than silently missed: tools with no behavior text, matchable by name only
  `${T}.behaviorless_tools`,
];

export const REQUIRED_INDEXES: ReadonlyArray<string> = ['idx_adtdc_candidate_count'];

export const REQUIRED_CHECKS: ReadonlyArray<string> = ['chk_adtdc_count_matches'];

const STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS agent_domain_tool_duplicate_checks (
     change_request_id UUID PRIMARY KEY
       REFERENCES agent_domain_change_requests (id) ON DELETE CASCADE,
     checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     catalog_size INTEGER NOT NULL,
     catalog_absent BOOLEAN NOT NULL,
     threshold NUMERIC(6,4) NOT NULL,
     candidate_count INTEGER NOT NULL,
     candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
     behaviorless_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT chk_adtdc_count_matches CHECK (
       candidate_count = jsonb_array_length(candidates)
     )
   )`,
  // For the AF11.3 console's "which requests have a possible duplicate" read. Without it that is
  // a sequential scan over every request ever filed.
  `CREATE INDEX IF NOT EXISTS idx_adtdc_candidate_count
     ON agent_domain_tool_duplicate_checks (candidate_count)`,
];

/** Net-new, so it reverts whole. Neither the parent nor the detail table is mentioned here. */
export const ROLLBACK_STATEMENTS: ReadonlyArray<string> = [
  'DROP TABLE IF EXISTS agent_domain_tool_duplicate_checks',
];

export async function ensureAgentDomainToolDuplicateCheckSchema(): Promise<void> {
  for (const statement of STATEMENTS) {
    try {
      await sequelize.query(statement);
    } catch (err: unknown) {
      // Warn and continue, matching the siblings. `assert` below is what actually decides, because
      // a loop that swallows every failure resolves identically on success and on total failure.
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'agent_domain_tool_duplicate_check_schema_statement_failed',
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
 * Both halves are imported rather than rewritten. The first sibling got each of them wrong once
 * and reported `missing table` against a table sitting right there in production.
 */
async function readNames(sql: string, names: ReadonlyArray<string>): Promise<string[]> {
  const rows = await sequelize.query(sql, {
    bind: { names: names as string[] },
    type: QueryTypes.SELECT,
  });
  return normalizeNameRows(rows);
}

export async function assertAgentDomainToolDuplicateCheckSchema(): Promise<void> {
  const problems: string[] = [];

  const tables = await readNames(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($names)`,
    REQUIRED_TABLES,
  );
  for (const t of REQUIRED_TABLES) if (!tables.includes(t)) problems.push(`missing table ${t}`);

  // Only worth asking about columns if the table arrived; otherwise every column is "missing" and
  // the real finding drowns in the noise.
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

    // Without the constraint the table accepts a count that disagrees with the list it counts,
    // which is the one way a stored ranking can still lie about itself.
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

export interface GuardedToolDuplicateCheckSchemaResult {
  ok: boolean;
  error_class?: string;
}

/**
 * Boot entry point. CANNOT REJECT — a schema problem must be loud in the logs without taking the
 * whole backend down with it, the same contract its three siblings have and the reason `server.ts`
 * can await it bare.
 */
export async function ensureAgentDomainToolDuplicateCheckSchemaGuarded(
): Promise<GuardedToolDuplicateCheckSchemaResult> {
  try {
    await ensureAgentDomainToolDuplicateCheckSchema();
    await assertAgentDomainToolDuplicateCheckSchema();
    return { ok: true };
  } catch (err: unknown) {
    const error_class = err instanceof Error ? err.constructor.name : 'UnknownError';
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'agent_domain_tool_duplicate_check_schema_unavailable',
      outcome: 'failure',
      error_class,
      context: { message: err instanceof Error ? err.message : String(err) },
    }));
    return { ok: false, error_class };
  }
}
