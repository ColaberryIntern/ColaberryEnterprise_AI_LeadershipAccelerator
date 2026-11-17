/**
 * The decision log for a tool request. APPEND-ONLY, one row per decision, never one per request.
 *
 * AF11.3: *"A tool grant is the moment an agent stops observing and starts acting, and 255 of 257
 * agents are deliberately held at observe today, so the record of that decision matters as much
 * as the decision."*
 *
 * ## Why a log and not a column on the request
 *
 * Because `send_back` happens more than once. A request can be sent back, edited, sent back
 * again, and finally approved, and every one of those is a decision somebody made and should be
 * able to be asked about later. A single column would keep only the last one and quietly lose
 * the history that makes an approval auditable — which is the opposite of what this ticket is
 * for.
 *
 * It also means a decision can never be edited into a different decision. A correction is a new
 * row, so "who approved what, and when" survives somebody changing their mind.
 *
 * ## It is NOT a second approval spine
 *
 * The ticket is explicit: *"There is already an approval spine. Do not build a second one."* The
 * governance status still lives on `agent_domain_change_requests.status`, written by the same
 * service in the same transaction. This table holds the VERB and the words that verb required —
 * the things the parent's four-value status cannot express. It carries no status of its own, so
 * it cannot disagree with the parent about whether a request is open.
 *
 * ## What it deliberately cannot hold
 *
 * No `autonomy_level`, no `tools_granted`, no `enabled`, no `risk_tier`. AF11.3's sharpest
 * warning is that a console granting a tool and lifting an autonomy level in one action means
 * nobody separately decided the agent may act more freely. A table with nowhere to put an
 * autonomy level cannot be used to lift one.
 *
 * `assigned_tool_name` records an INTENT, not a grant: AF11.4 performs the write against
 * `ai_agents.tools_granted`, and nothing in this file touches that column.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { normalizeNameRows } from './ensureAgentDomainProjectSchema';

export const REQUIRED_TABLES: ReadonlyArray<string> = ['agent_domain_tool_request_decisions'];

const T = 'agent_domain_tool_request_decisions';

export const REQUIRED_COLUMNS: ReadonlyArray<string> = [
  `${T}.id`,
  `${T}.change_request_id`,
  // WHICH of the four verbs.
  `${T}.verb`,
  // WHO, and WHEN. The two facts that make the log worth keeping.
  `${T}.decided_by_identity`,
  `${T}.decided_at`,
  // The words a verb requires. Nullable because three of the four verbs need none of them.
  `${T}.reason`,
  `${T}.missing_field`,
  `${T}.assigned_tool_name`,
  // AF11.8. WHICH OF THE OPTIONS THE REQUEST OFFERED was chosen: A, B, C or nothing.
  //
  // Nullable, and that is not a hedge. A `deny` is still a decision a human can make and it is
  // not one of the agent's options — the ticket keeps it distinct from Nothing precisely because
  // a denial carries a reason and can be appealed. So a decision has a chosen option when it was
  // made by choosing one, and does not when it was not, and `chk_adtrd_nothing_is_its_own_answer`
  // below stops the two drifting apart for the one value where they must agree.
  `${T}.chosen_option`,
];

export const REQUIRED_INDEXES: ReadonlyArray<string> = ['idx_adtrd_change_request_id'];

export const REQUIRED_CHECKS: ReadonlyArray<string> = [
  'chk_adtrd_verb_is_known',
  'chk_adtrd_verb_carries_its_words',
  // AF11.8
  'chk_adtrd_chosen_option_is_known',
  'chk_adtrd_nothing_is_its_own_answer',
];

const STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS agent_domain_tool_request_decisions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     change_request_id UUID NOT NULL
       REFERENCES agent_domain_change_requests (id) ON DELETE CASCADE,
     verb TEXT NOT NULL,
     decided_by_identity TEXT NOT NULL,
     decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     reason TEXT,
     missing_field TEXT,
     assigned_tool_name TEXT,
     chosen_option TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT chk_adtrd_verb_is_known CHECK (
       verb IN ('approve_to_build', 'deny', 'assign_existing_tool', 'send_back', 'nothing')
     ),
     -- AF11.8. The answer space the ticket names: *"make the answer for the human go with option
     -- A, B, C or Nothing."*
     CONSTRAINT chk_adtrd_chosen_option_is_known CHECK (
       chosen_option IS NULL OR chosen_option IN ('A', 'B', 'C', 'nothing')
     ),
     -- NOTHING AND ITS VERB MOVE TOGETHER OR NOT AT ALL.
     --
     -- The ticket: *"'Nothing' is a first-class answer and means the capability comes off the
     -- board - it is not the same as deny-with-a-reason, because there is nothing to appeal."*
     -- A row saying 'verb = 'nothing'' with some other option chosen, or an option of 'nothing'
     -- recorded under a verb that grants something, would make that sentence unreadable from the
     -- log. Written both ways round because one implication alone leaves the other open, and
     -- 'IS DISTINCT FROM' because 'chosen_option' is nullable and '<>' against NULL is NULL.
     CONSTRAINT chk_adtrd_nothing_is_its_own_answer CHECK (
       (verb <> 'nothing' OR chosen_option = 'nothing')
       AND (chosen_option IS DISTINCT FROM 'nothing' OR verb = 'nothing')
     ),
     -- The application refuses these by name so the person gets a sentence; the constraint means
     -- a row that breaks them cannot exist even if some future caller skips the contract. Same
     -- move, same reason, as chk_adtr_write_declares_effects on the AF11.1 detail table.
     CONSTRAINT chk_adtrd_verb_carries_its_words CHECK (
       (verb <> 'deny' OR length(btrim(coalesce(reason, ''))) > 0)
       AND (verb <> 'send_back' OR length(btrim(coalesce(missing_field, ''))) > 0)
       AND (verb <> 'assign_existing_tool' OR length(btrim(coalesce(assigned_tool_name, ''))) > 0)
     )
   )`,
  // "Show me every decision on this request, in order" is the question the console asks.
  `CREATE INDEX IF NOT EXISTS idx_adtrd_change_request_id
     ON agent_domain_tool_request_decisions (change_request_id, decided_at)`,
  // ----------------------------------------------------------------------------------------
  // AF11.8. THE ONLY STATEMENTS BELOW THAT DO ANYTHING on an environment that already has this
  // table, because `CREATE TABLE IF NOT EXISTS` above is a no-op there. The column is in the
  // CREATE as well, for an environment that has never run this file; the sibling
  // `ensureAgentDomainToolRequestSchema.ts` records the same trap in its own words.
  `ALTER TABLE agent_domain_tool_request_decisions
     ADD COLUMN IF NOT EXISTS chosen_option TEXT`,
  // WIDENING `chk_adtrd_verb_is_known` MEANS REPLACING IT, because Postgres has no way to alter a
  // CHECK in place. Dropping and re-adding is safe here for a measured reason rather than a
  // hopeful one: `agent_domain_tool_request_decisions` held ZERO rows in production on 17 Nov
  // 2026, and widening a value list cannot invalidate a row in any case. If that is ever untrue,
  // the ADD fails, the loop logs it, and `assert` fails the boot by name with the constraint
  // missing, which is the loud failure rather than a silent one.
  //
  // DROP IF EXISTS, then ADD, as two statements: the drop must not throw on an environment that
  // has never had the constraint, and the add must still run there.
  `ALTER TABLE agent_domain_tool_request_decisions
     DROP CONSTRAINT IF EXISTS chk_adtrd_verb_is_known`,
  `ALTER TABLE agent_domain_tool_request_decisions
     ADD CONSTRAINT chk_adtrd_verb_is_known
     CHECK (verb IN ('approve_to_build', 'deny', 'assign_existing_tool', 'send_back', 'nothing'))`,
  // The two new ones are guarded on their own existence, since Postgres has no
  // `ADD CONSTRAINT IF NOT EXISTS` and a plain ADD throws `duplicate_object` on every boot after
  // the first, filling the logs with a failure that is actually the success case.
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'chk_adtrd_chosen_option_is_known'
     ) THEN
       ALTER TABLE agent_domain_tool_request_decisions
         ADD CONSTRAINT chk_adtrd_chosen_option_is_known
         CHECK (chosen_option IS NULL OR chosen_option IN ('A', 'B', 'C', 'nothing'));
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'chk_adtrd_nothing_is_its_own_answer'
     ) THEN
       ALTER TABLE agent_domain_tool_request_decisions
         ADD CONSTRAINT chk_adtrd_nothing_is_its_own_answer
         CHECK (
           (verb <> 'nothing' OR chosen_option = 'nothing')
           AND (chosen_option IS DISTINCT FROM 'nothing' OR verb = 'nothing')
         );
     END IF;
   END $$`,
];

/** Net-new, so it reverts whole. The parent is deliberately not mentioned here. */
export const ROLLBACK_STATEMENTS: ReadonlyArray<string> = [
  'DROP TABLE IF EXISTS agent_domain_tool_request_decisions',
];

export async function ensureToolRequestDecisionSchema(): Promise<void> {
  for (const statement of STATEMENTS) {
    try {
      await sequelize.query(statement);
    } catch (err: unknown) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'tool_request_decision_schema_statement_failed',
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

export async function assertToolRequestDecisionSchema(): Promise<void> {
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

export interface GuardedToolRequestDecisionSchemaResult {
  ok: boolean;
  error_class?: string;
}

/** Boot entry point. CANNOT REJECT, the same contract its siblings have. */
export async function ensureToolRequestDecisionSchemaGuarded(
): Promise<GuardedToolRequestDecisionSchemaResult> {
  try {
    await ensureToolRequestDecisionSchema();
    await assertToolRequestDecisionSchema();
    return { ok: true };
  } catch (err: unknown) {
    const error_class = err instanceof Error ? err.constructor.name : 'UnknownError';
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'tool_request_decision_schema_unavailable',
      outcome: 'failure',
      error_class,
      context: { message: err instanceof Error ? err.message : String(err) },
    }));
    return { ok: false, error_class };
  }
}
