/**
 * AF11.14 — somewhere for Ali's standing instructions to live.
 *
 * Ali, 16 Nov 2026: *"when approving the functionality, I should be able to add my details of how
 * the agent should work and respond."* AF11.8 specified it as Part Three and closed with it
 * unbuilt. Measured in production on 17 Nov 2026: there is no column anywhere in the agent domain
 * that can hold it. `agent_domain_tool_grants` carries agent, tool, capability, approver,
 * timestamp, datasets and environment, and nothing else. The only instruction-shaped columns in
 * the whole database belong to unrelated systems.
 *
 * ## WHY THIS IS NOT A COLUMN ON THE GRANT
 *
 * Two reasons, and the second is the one that decided it.
 *
 * The grant is keyed `(agent_id, tool_name)` and is the record of a permission. Instructions are
 * about a CAPABILITY — what the agent should do and how it should answer while doing that work —
 * and one capability can be served by several tools. Hanging the text off one of them would mean
 * the same instruction copied onto three grants, or silently applying to only one.
 *
 * And the requirement says the text must be *"editable later without re-approving the capability,
 * and every edit recorded with who and when, because it changes agent behaviour in production."* A
 * column holds one value and forgets the last one. So this is an APPEND-ONLY LOG: the current
 * instructions are the most recent row for `(agent_id, capability_id)`, and the history is every
 * other row, with its author and its timestamp already attached. Attribution comes free rather
 * than needing a second audit table that could disagree with the first.
 *
 * ## AN EMPTY STRING IS "CLEARED", AND IT IS A REAL ENTRY
 *
 * `instructions` is NOT NULL and MAY be empty. An empty latest row means somebody deliberately
 * removed the standing instructions, and it records who did that and when — which is the thing
 * worth knowing about a rule that used to be in force and is not any more. Deleting the row
 * instead would make a removal indistinguishable from never having set any, and those are
 * different facts about a production agent.
 *
 * The CHECK therefore constrains the ACTOR and the CAPABILITY, never the text.
 *
 * ## "NEWEST" IS `seq`, NOT `created_at`, AND THIS WAS MEASURED RATHER THAN REASONED
 *
 * The first version ordered by `created_at DESC`. Proving the DDL against `accelerator_dev1`
 * showed why that is wrong: `DEFAULT NOW()` is the TRANSACTION timestamp, so two entries written
 * in one transaction carry the identical value and `DISTINCT ON` then picks between them
 * arbitrarily. In the probe it picked the OLDER one, which meant a capability whose instructions
 * had just been cleared still reported the instruction it had replaced.
 *
 * That is the worst failure this table could have: an agent running under a rule a human had
 * already removed, with the screen agreeing. `BIGSERIAL` is monotonic by construction and settles
 * the order whatever the clock says, so every read orders by `seq`.
 *
 * ## NO FOREIGN KEY TO THE AGENT
 *
 * The same reasoning `ensureAgentToolGrantSchema.ts` records for `capability_id`: a record of what
 * a human instructed outranks the paperwork around it, and a cascade from a deleted row to a live
 * instruction would be the wrong direction of authority.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { normalizeNameRows } from './ensureAgentDomainProjectSchema';

export const REQUIRED_TABLES: ReadonlyArray<string> = ['agent_domain_capability_instructions'];

const T = 'agent_domain_capability_instructions';

export const REQUIRED_COLUMNS: ReadonlyArray<string> = [
  `${T}.id`,
  // THE ORDER OF EVENTS, and it is not `created_at`. See the header.
  `${T}.seq`,
  // WHOSE capability. The same capability on two agents is two different sets of instructions,
  // because it is two different agents being told how to behave.
  `${T}.agent_id`,
  `${T}.capability_id`,
  // WHAT THEY WERE TOLD. May be empty, which means cleared. See the header.
  `${T}.instructions`,
  // WHO SAID SO, and WHEN. The whole reason this is a log and not a column.
  `${T}.set_by_identity`,
  `${T}.created_at`,
];

export const REQUIRED_INDEXES: ReadonlyArray<string> = ['idx_adci_agent_capability'];

export const REQUIRED_CHECKS: ReadonlyArray<string> = ['chk_adci_actor_and_capability_present'];

const STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS agent_domain_capability_instructions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     -- WHICH ENTRY IS NEWER. Monotonic, and deliberately not a timestamp: see the header.
     seq BIGSERIAL NOT NULL,
     agent_id UUID NOT NULL,
     capability_id TEXT NOT NULL,
     -- NOT NULL and deliberately allowed to be empty: empty means CLEARED, by this person, at
     -- this time. See the module header for why that is a fact worth a row.
     instructions TEXT NOT NULL,
     set_by_identity TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     -- The application refuses both of these by name so the person gets a sentence. The
     -- constraint means a row that breaks them cannot exist even if a future caller skips the
     -- contract. Same move as chk_adtg_fields_are_present on the grant table.
     CONSTRAINT chk_adci_actor_and_capability_present CHECK (
       length(btrim(set_by_identity)) > 0
       AND length(btrim(capability_id)) > 0
     )
   )`,
  // "What is in force for this capability on this agent, and what was before it."
  //
  // `created_at DESC` because every read of this table asks for the LATEST row and then, on the
  // history view, the ones behind it in the same order. An ascending index would serve the first
  // query with a backwards scan.
  `CREATE INDEX IF NOT EXISTS idx_adci_agent_capability
     ON agent_domain_capability_instructions (agent_id, capability_id, seq DESC)`,
];

/** Net-new, so it reverts whole. */
export const ROLLBACK_STATEMENTS: ReadonlyArray<string> = [
  'DROP TABLE IF EXISTS agent_domain_capability_instructions',
];

export async function ensureCapabilityInstructionSchema(): Promise<void> {
  for (const statement of STATEMENTS) {
    try {
      await sequelize.query(statement);
    } catch (err: unknown) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'capability_instruction_schema_statement_failed',
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
 * `ensureCapabilityInstructionSchema` swallows every failure into a warn, so it resolves
 * identically on total success and total failure. Asserting post-conditions against
 * `information_schema` is the only thing that distinguishes the two.
 */
export async function assertCapabilityInstructionSchema(): Promise<void> {
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
    throw new Error(`capability instruction schema post-condition failed: ${problems.join('; ')}`);
  }
}

/**
 * Boot entry point. Ensures, then asserts, and NEVER stops the backend binding its port.
 *
 * Same shape and the same reason as `ensureAgentToolGrantSchemaGuarded`: a schema problem on this
 * table must be loud in the log and must not take the whole platform down, because nothing else
 * the backend serves depends on standing instructions existing.
 */
export async function ensureCapabilityInstructionSchemaGuarded(): Promise<void> {
  try {
    await ensureCapabilityInstructionSchema();
    await assertCapabilityInstructionSchema();
  } catch (err: unknown) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'capability_instruction_schema_unavailable',
      outcome: 'failure',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      context: { message: err instanceof Error ? err.message : String(err) },
    }));
  }
}
