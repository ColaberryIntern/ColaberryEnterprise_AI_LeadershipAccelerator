/**
 * Tool-request detail — the payload half of a `kind = 'tool'` change request. ONE table, ZERO
 * `ALTER` statements.
 *
 * AF11.1. Ali, 3 Nov 2026: *"the tool request needs to be much more extensive. I should have all
 * the details to understand the who what when where how as it pertains to what they need the tool
 * for."* This table is those details.
 *
 * ## Why this is a CHILD of `agent_domain_change_requests` and not a second request table
 *
 * `ensureAgentDomainChangeRequestSchema.ts` already carries `kind` with the values `change` and
 * `tool`, added by AF7.1, and its own docblock states the reason it is one table: *"One table
 * rather than two, because the governance is identical and splitting it would mean two approval
 * spines to keep honest."* `docs/AGENT_TOOL_REQUEST_HANDOFF.md` says the same thing in the
 * imperative: *"There is already an approval spine. Do not build a second one."*
 *
 * So the governance stays exactly where it is. This table holds **no status, no approver, no
 * decision timestamp and no decline reason** — it cannot express a decision, which is what stops it
 * becoming the second spine. It is keyed one-to-one on the request it belongs to, by primary key,
 * and it is deleted with it.
 *
 * ## Why not eighteen more columns on the parent
 *
 * The parent's header states its contribution as "ONE table, ZERO `ALTER` statements" and records
 * `kind` as "THE ONLY ALTER THIS FILE WILL EVER RUN". Eighteen columns would make that false, make
 * the governance row mostly payload, and put the whole six-group contract behind an `ALTER` on a
 * table that already exists in production with ten live domain projects pointing at it. A child
 * table arrives `CREATE TABLE IF NOT EXISTS`, reverts by itself, and leaves the parent untouched.
 *
 * ## Why not a JSONB blob on the parent
 *
 * `CLAUDE.md`'s Contract Enforcement Layer: *"Untyped JSON blobs forbidden as inter-module
 * currency."* A blob would also make every refusal in `toolRequestContract.ts` unenforceable at the
 * storage layer, where `chk_adtr_write_declares_effects` below makes the write rule structural.
 *
 * The four list columns ARE `JSONB`, and that is a narrower decision: `reads` and `produces` are
 * `string[]` in the catalog already (`ToolCapability` in
 * `services/reese/agentToolCapabilities.ts`), the house precedent for a list of strings on a row is
 * `ai_agents.tools_granted` which is `JSONB`, and the model below types all four as `string[]` so
 * nothing downstream receives an untyped value.
 *
 * ## When this runs
 *
 * On the next boot after merge, immediately after the parent's own `ensure`, because the foreign
 * key needs the parent to exist. Additive, `IF NOT EXISTS`, referenced by nothing else, so
 * reverting the code leaves an empty table that nothing reads.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { normalizeNameRows } from './ensureAgentDomainProjectSchema';

export const REQUIRED_TABLES: ReadonlyArray<string> = ['agent_domain_tool_request_details'];

const T = 'agent_domain_tool_request_details';

export const REQUIRED_COLUMNS: ReadonlyArray<string> = [
  `${T}.change_request_id`,
  // WHO
  `${T}.agent_id`,
  `${T}.domain_key`,
  // WHAT — the catalog's own vocabulary, so a request and a registered tool are comparable
  `${T}.tool_name`,
  `${T}.purpose`,
  `${T}.reads`,
  `${T}.produces`,
  // WHICH DATA — the dataset picker's output, checked against `dataset_registry` by the contract
  `${T}.read_datasets`,
  // WHAT FOR
  `${T}.capability_id`,
  `${T}.task_unblocked`,
  `${T}.manual_today`,
  // WHETHER IT SHOULD BE BUILT AT ALL — AF11.7. The three questions the first six groups do not
  // ask: who reads the output, what number decides it worked, and whether the product can already
  // do this. See `services/agentDomain/toolRequestContract.ts` for the capability that passed all
  // eighteen fields above and should never have been started.
  `${T}.acts_on_output`,
  `${T}.judged_threshold`,
  `${T}.judged_measured_from`,
  `${T}.tried_in_product`,
  `${T}.missing_from_product`,
  // WHEN
  `${T}.needed_by`,
  `${T}.run_frequency`,
  // WHERE — the blast-radius fields
  `${T}.touches`,
  `${T}.environment`,
  // HOW
  `${T}.inputs`,
  `${T}.writes`,
  `${T}.side_effects`,
  `${T}.reversible`,
  `${T}.reversibility_note`,
];

/**
 * How often the tool would run, as an enum rather than free text.
 *
 * Frequency is a RISK INPUT, not a note: a tool that runs once a quarter and one that runs hourly
 * are not the same decision. Free text cannot be compared, sorted or filtered, so the review
 * console in AF11.3 could not rank by it and AF11.2 could not use it as a matching signal.
 *
 * `on_demand` and `per_event` are distinct on purpose. `on_demand` means a person triggers it;
 * `per_event` means something in the system does, which is the shape that surprises people.
 */
export const TOOL_RUN_FREQUENCIES = [
  'once',
  'on_demand',
  'per_event',
  'hourly',
  'daily',
  'weekly',
  'monthly',
  'quarterly',
] as const;
export type ToolRunFrequency = typeof TOOL_RUN_FREQUENCIES[number];

/**
 * WHICH ENVIRONMENT the tool would read, as an enum for the same reason frequency is one.
 *
 * Added by the dataset-scope change. Until it existed there was nowhere on a tool request to
 * record whether a read lands on a sandbox copy or on the production database, so the rule Ali
 * set — *sandbox-wide read is fine, narrow only for production* — had nothing to key off. A gate
 * cannot enforce a distinction the payload cannot express.
 *
 * Two values, not three. `both` was considered and rejected: a request that means "sandbox now,
 * production later" is two grants with two different scopes, and one row that claimed both would
 * have to satisfy the stricter rule anyway, which makes it `production` wearing a softer word.
 */
export const TOOL_ENVIRONMENTS = ['sandbox', 'production'] as const;
export type ToolEnvironment = typeof TOOL_ENVIRONMENTS[number];

/**
 * HAS THE BUILDER ALREADY DONE THIS BY HAND, IN THE PRODUCT — AF11.7.
 *
 * Three states, and the state decides the PATH rather than annotating it. Ali, 16 Nov 2026, on
 * what has to happen before a request is written: *"1st sarbjit would need to create a landing page
 * in the app to see how it works and make sure she can build it how she wants. If that
 * functionality does not exists, she has to put the request in."*
 *
 *   - `used_by_hand`   the feature is there and the builder has used it. Nothing to build; the
 *                      agent needs a GRANT. Refused here, routed to the assign-existing-tool path.
 *   - `exists_unused`  the feature is there and the builder has not tried it. Refused, and sent to
 *                      go and use it, because the answer to "is this worth building" is downstream
 *                      of actually trying the thing that exists.
 *   - `not_built`      the product cannot do this. The only state that is a build request.
 *
 * Why an ENUM and not a boolean: "have you tried it" and "does it exist" are two questions, and a
 * single boolean would collapse the two refusals into one, losing the route that makes each
 * refusal actionable. The states are also the reason `missing_from_product` can be `NOT NULL` —
 * see `chk_adtr_build_request_is_unbuilt` below.
 */
export const TOOL_PRODUCT_STATES = ['used_by_hand', 'exists_unused', 'not_built'] as const;
export type ToolProductState = typeof TOOL_PRODUCT_STATES[number];

export const REQUIRED_INDEXES: ReadonlyArray<string> = [
  'idx_adtr_tool_name',
  'idx_adtr_capability_id',
  'idx_adtr_agent_id',
];

/**
 * The checks `assert` names one by one, so an absent one fails a boot rather than a review.
 *
 * `chk_adtr_environment_known` is the storage half of `environment_unknown`: the application
 * refuses an unknown value with a sentence, and this makes a row carrying one impossible even if
 * some future caller skips the contract. Same move, same reason, as the write-declares-effects
 * pair that was already here.
 */
export const REQUIRED_CHECKS: ReadonlyArray<string> = [
  'chk_adtr_write_declares_effects',
  'chk_adtr_environment_known',
  'chk_adtr_build_request_is_unbuilt',
];

/**
 * `writes` is `NOT NULL BOOLEAN` and the CHECK makes the consequence structural.
 *
 * The rule the ticket asks for is *"when the request says the tool WRITES, the side-effect and
 * reversibility fields become mandatory"*. `toolRequestContract.ts` refuses it with a named reason
 * so the person filing gets a sentence; this constraint means a row that breaks it cannot exist
 * even if some future caller skips the contract. Same move, and the same reason, as
 * `chk_adcr_decided_together` on the parent.
 *
 * `reversibility_note` stays nullable even on a write. "Is it reversible" is the decision input;
 * "how" is useful and not always knowable at filing time, and a required field nobody can answer
 * is how a form teaches people to type a full stop into it.
 */
const STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS agent_domain_tool_request_details (
     change_request_id UUID PRIMARY KEY
       REFERENCES agent_domain_change_requests (id) ON DELETE CASCADE,
     agent_id UUID NOT NULL,
     domain_key TEXT NOT NULL,
     tool_name TEXT NOT NULL,
     purpose TEXT NOT NULL,
     reads JSONB NOT NULL DEFAULT '[]'::jsonb,
     produces JSONB NOT NULL DEFAULT '[]'::jsonb,
     read_datasets JSONB NOT NULL DEFAULT '[]'::jsonb,
     capability_id TEXT NOT NULL,
     task_unblocked TEXT NOT NULL,
     manual_today TEXT NOT NULL,
     acts_on_output TEXT NOT NULL,
     judged_threshold TEXT NOT NULL,
     judged_measured_from TEXT NOT NULL,
     tried_in_product TEXT NOT NULL,
     missing_from_product TEXT NOT NULL,
     needed_by DATE NOT NULL,
     run_frequency TEXT NOT NULL,
     touches JSONB NOT NULL DEFAULT '[]'::jsonb,
     environment TEXT NOT NULL,
     inputs JSONB NOT NULL DEFAULT '[]'::jsonb,
     writes BOOLEAN NOT NULL,
     side_effects TEXT,
     reversible BOOLEAN,
     reversibility_note TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT chk_adtr_write_declares_effects CHECK (
       writes = FALSE OR (side_effects IS NOT NULL AND reversible IS NOT NULL)
     ),
     CONSTRAINT chk_adtr_environment_known CHECK (
       environment IN ('sandbox', 'production')
     ),
     CONSTRAINT chk_adtr_build_request_is_unbuilt CHECK (
       tried_in_product = 'not_built'
     )
   )`,
  // THREE STATEMENTS, not a column in the CREATE above, because `CREATE TABLE IF NOT EXISTS` is a
  // NO-OP against the table this change finds already sitting in production. The column is in the
  // CREATE as well, for an environment that has never run this file; on every environment that
  // has, only these three do anything. The sibling `ensureAgentToolGrantSchema.ts` records the
  // same trap in its own words: adding a column to the CREATE alone "would have shipped green,
  // resolved identically, and left the column absent on every environment the table already
  // exists in."
  //
  // `SET NOT NULL` is a SEPARATE statement from the add, and deliberately has no `DEFAULT`.
  //
  // A default would be the easy way to make this ALTER succeed on a populated table, and it is the
  // wrong one: every pre-existing row would silently claim an environment nobody chose, and a
  // future caller that forgot the field would file a request that reads as answered. There are
  // zero rows in this table in production today (measured, 14 Nov 2026) so the statement applies
  // cleanly. If that is ever untrue, `SET NOT NULL` fails, the loop logs it, and
  // `assertAgentDomainToolRequestSchema` below fails the boot by name — which is the loud failure
  // this file is built around, not an outage: the backend survives a failed assert.
  `ALTER TABLE agent_domain_tool_request_details
     ADD COLUMN IF NOT EXISTS environment TEXT`,
  // `read_datasets` DOES carry a default, where `environment` deliberately does not. An empty list
  // is the truthful value for a request that named no datasets — it is what the contract itself
  // stores for one — whereas there is no value of `environment` that honestly means "not asked".
  `ALTER TABLE agent_domain_tool_request_details
     ADD COLUMN IF NOT EXISTS read_datasets JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE agent_domain_tool_request_details
     ALTER COLUMN environment SET NOT NULL`,
  // AF11.7 — the five columns of the "should this be built at all" group, added the same way
  // `environment` was and for the same measured reason: `CREATE TABLE IF NOT EXISTS` above is a
  // NO-OP against the table already sitting in production, so a column that exists only in the
  // CREATE would ship green and be absent on every environment that has ever run this file.
  //
  // NO DEFAULTS, deliberately, on any of the five. A default is the easy way to make an ALTER
  // succeed on a populated table and the wrong one here: every pre-existing row would silently
  // claim an answer nobody gave, and a request that reads as answered is worse than one that
  // reads as blank. The whole point of this group is that the question WAS asked.
  //
  // Measured in production on 16 Nov 2026: `agent_domain_tool_request_details` holds ZERO rows,
  // and `agent_domain_change_requests` holds one row of kind `change` and none of kind `tool`. So
  // every `SET NOT NULL` below applies cleanly and no filed request is refused retroactively. If
  // that is ever untrue, `SET NOT NULL` fails, the loop logs it, and
  // `assertAgentDomainToolRequestSchema` fails the boot BY NAME — the loud failure this file is
  // built around, not an outage: the backend survives a failed assert.
  `ALTER TABLE agent_domain_tool_request_details
     ADD COLUMN IF NOT EXISTS acts_on_output TEXT`,
  `ALTER TABLE agent_domain_tool_request_details
     ADD COLUMN IF NOT EXISTS judged_threshold TEXT`,
  `ALTER TABLE agent_domain_tool_request_details
     ADD COLUMN IF NOT EXISTS judged_measured_from TEXT`,
  `ALTER TABLE agent_domain_tool_request_details
     ADD COLUMN IF NOT EXISTS tried_in_product TEXT`,
  `ALTER TABLE agent_domain_tool_request_details
     ADD COLUMN IF NOT EXISTS missing_from_product TEXT`,
  `ALTER TABLE agent_domain_tool_request_details
     ALTER COLUMN acts_on_output SET NOT NULL`,
  `ALTER TABLE agent_domain_tool_request_details
     ALTER COLUMN judged_threshold SET NOT NULL`,
  `ALTER TABLE agent_domain_tool_request_details
     ALTER COLUMN judged_measured_from SET NOT NULL`,
  `ALTER TABLE agent_domain_tool_request_details
     ALTER COLUMN tried_in_product SET NOT NULL`,
  `ALTER TABLE agent_domain_tool_request_details
     ALTER COLUMN missing_from_product SET NOT NULL`,
  // Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so the existence check is explicit. A plain
  // ADD would throw `duplicate_object` on every boot after the first and fill the logs with a
  // failure that is actually the success case.
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'chk_adtr_environment_known'
     ) THEN
       ALTER TABLE agent_domain_tool_request_details
         ADD CONSTRAINT chk_adtr_environment_known
         CHECK (environment IN ('sandbox', 'production'));
     END IF;
   END $$`,
  // AF11.7 — THE STORAGE HALF OF THE ROUTING RULE, which is the one constraint in this file that
  // is narrower than its enum.
  //
  // `TOOL_PRODUCT_STATES` carries three values because the GATE has to recognise all three in order
  // to route them. This table can hold only `not_built`, because this table is the detail of a
  // BUILD request: a row saying "the product already does this" would be a build request for
  // something we already own, which is precisely the thing Ali said was happening
  // (*"people are proposing things we don't even need"*).
  //
  // `toolRequestContract.ts` refuses the other two states with a sentence and a route, so the
  // person filing gets help rather than a constraint violation. This makes it IMPOSSIBLE for a
  // future caller that skips the contract — the failure mode `chk_adtr_write_declares_effects` and
  // `chk_adtr_environment_known` were both written against — to put one in the queue anyway.
  //
  // It is also what lets `missing_from_product` be plain `NOT NULL` rather than a conditional
  // pairing check: if the only storable state is `not_built`, the gap is always required.
  //
  // THE COST, stated rather than discovered later: if a later release routes GRANT requests through
  // this same table, this constraint is the thing that has to change first, and it will fail loudly
  // on the first insert rather than silently accepting a row no reader expects.
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'chk_adtr_build_request_is_unbuilt'
     ) THEN
       ALTER TABLE agent_domain_tool_request_details
         ADD CONSTRAINT chk_adtr_build_request_is_unbuilt
         CHECK (tried_in_product = 'not_built');
     END IF;
   END $$`,
  `CREATE INDEX IF NOT EXISTS idx_adtr_tool_name
     ON agent_domain_tool_request_details (tool_name)`,
  `CREATE INDEX IF NOT EXISTS idx_adtr_capability_id
     ON agent_domain_tool_request_details (capability_id)`,
  `CREATE INDEX IF NOT EXISTS idx_adtr_agent_id
     ON agent_domain_tool_request_details (agent_id)`,
];

/** Net-new, so it reverts whole. The parent table is deliberately not mentioned here. */
export const ROLLBACK_STATEMENTS: ReadonlyArray<string> = [
  'DROP TABLE IF EXISTS agent_domain_tool_request_details',
];

export async function ensureAgentDomainToolRequestSchema(): Promise<void> {
  for (const statement of STATEMENTS) {
    try {
      await sequelize.query(statement);
    } catch (err: unknown) {
      // Warn and continue, matching the sibling — `assert` below is what actually decides, because
      // a loop that swallows every failure resolves identically on success and on total failure.
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'agent_domain_tool_request_schema_statement_failed',
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
 * Both halves are imported rather than rewritten. The sibling got each of them wrong once and
 * reported `missing table` against a table sitting right there in production; its header records
 * the whole episode.
 */
async function readNames(sql: string, names: ReadonlyArray<string>): Promise<string[]> {
  const rows = await sequelize.query(sql, {
    bind: { names: names as string[] },
    type: QueryTypes.SELECT,
  });
  return normalizeNameRows(rows);
}

export async function assertAgentDomainToolRequestSchema(): Promise<void> {
  const problems: string[] = [];

  const tables = await readNames(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($names)`,
    REQUIRED_TABLES,
  );
  for (const t of REQUIRED_TABLES) if (!tables.includes(t)) problems.push(`missing table ${t}`);

  // Only worth asking about columns if the table arrived; otherwise every column is "missing" and
  // the real finding drowns in eighteen lines of noise.
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

    // The constraints are the field rules expressed as data. Without the write one the table
    // accepts a write with no declared side effects, which is the one thing it exists to refuse;
    // without the environment one it accepts a scope no grant rule can read.
    const checks = await readNames(
      `SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = ANY($names)
          AND constraint_type = 'CHECK'`,
      REQUIRED_TABLES,
    );
    for (const c of REQUIRED_CHECKS) {
      if (!checks.includes(c)) problems.push(`missing constraint ${c}`);
    }

    // NULLABILITY, asked separately, because a column can be present and still optional.
    //
    // `ALTER COLUMN ... SET NOT NULL` is its own statement in the list above and the loop that
    // runs it warns and continues. Checking only that `environment` EXISTS would therefore pass on
    // an environment where the add worked and the SET NOT NULL did not, leaving a column that
    // accepts the blank the contract refuses — a schema check that resolves identically whether or
    // not the invariant it names actually holds.
    // AF11.7 adds five more columns through the same add-then-SET-NOT-NULL pair, so the list is
    // named here rather than `environment` being special-cased. A new required column whose
    // `SET NOT NULL` silently failed would otherwise pass this assert and then accept the blank
    // the contract refuses.
    const mustNotBeNullable = [
      'environment',
      'acts_on_output',
      'judged_threshold',
      'judged_measured_from',
      'tried_in_product',
      'missing_from_product',
    ];
    const nullable = await readNames(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($names)
          AND is_nullable = 'YES'`,
      REQUIRED_TABLES,
    );
    for (const col of mustNotBeNullable) {
      if (nullable.includes(col)) {
        problems.push(`column agent_domain_tool_request_details.${col} is still nullable`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`SchemaInvariantViolation: ${problems.join('; ')}`);
  }
}

export interface GuardedToolRequestSchemaResult {
  ok: boolean;
  error_class?: string;
}

/**
 * Boot entry point. CANNOT REJECT — a schema problem must be loud in the logs without taking the
 * whole backend down with it, the same contract the two siblings have and the reason `server.ts`
 * can await it bare.
 */
export async function ensureAgentDomainToolRequestSchemaGuarded(
): Promise<GuardedToolRequestSchemaResult> {
  try {
    await ensureAgentDomainToolRequestSchema();
    await assertAgentDomainToolRequestSchema();
    return { ok: true };
  } catch (err: unknown) {
    const error_class = err instanceof Error ? err.constructor.name : 'UnknownError';
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'agent_domain_tool_request_schema_unavailable',
      outcome: 'failure',
      error_class,
      context: { message: err instanceof Error ? err.message : String(err) },
    }));
    return { ok: false, error_class };
  }
}
