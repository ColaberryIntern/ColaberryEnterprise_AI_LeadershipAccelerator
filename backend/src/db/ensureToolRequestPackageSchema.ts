/**
 * The decision package a request must carry before it reaches a human. ONE table, hung one-to-one
 * off the request, holding no status and no decision.
 *
 * AF11.8. Ali, 16 Nov 2026:
 *
 * > *"Any request from agent to human must come with all the pieces, meaning the problem, possible
 * > solutions, recommendation, possible impact, Executive Summary, key findings, risk assessment,
 * > simulate actions etc... We should know the steps that are going to be followed and make the
 * > answer for the human go with option A, B, C or Nothing. Once the human decides, the work is
 * > done and reported on. This is the script that all agents must follow should they need to
 * > interact with a human."*
 *
 * The rule underneath all ten blocks: **a request from an agent may not create work for the person
 * receiving it.** If reading it means going to look something up, the agent has not finished its
 * job. Every column below exists because its absence sends the reader somewhere else.
 *
 * ## Why a SEPARATE table from `agent_domain_tool_request_details`
 *
 * They answer different questions and they arrive at different times. The detail is what the tool
 * IS, checked at filing time by `toolRequestContract.ts`, and a request cannot be filed without
 * it. The package is the CASE FOR DECIDING IT, and the ticket's wording for an incomplete one is
 * *"it bounces to the agent naming the block"* rather than "it is refused" — the request exists,
 * it simply is not in front of Ali yet. Folding the two together would mean either refusing a
 * filing for a missing simulation, or making eighteen detail columns nullable to let a package be
 * half-written. Both are worse than a second one-to-one child.
 *
 * ## The ten blocks, and where each one went
 *
 *   1. Executive summary ....... `executive_summary`
 *   2. The problem ............. `problem`
 *   3. Key findings ............ `key_findings`, each entry carrying its own source
 *   4. Possible solutions ...... `options`            <- also block 10, see below
 *   5. Recommendation .......... `recommendation` + `recommendation_reason`
 *   6. Possible impact ......... `impact`
 *   7. Risk assessment ......... `risk_can_break` + `risk_cannot_break`
 *   8. Simulated action ........ `simulated_action` + `simulated_against` + `simulated_at`
 *   9. The steps that follow ... `steps_that_follow`
 *  10. The answer: A, B, C or Nothing ... `options`, and nothing else
 *
 * ## Blocks 4 and 10 are ONE column, which is the main design decision in this file
 *
 * The ticket lists "possible solutions" and "the answer is A, B, C or Nothing" as separate blocks,
 * and storing them separately would be a mistake: it would allow a package whose options and whose
 * answers disagree. Ali would then be choosing from a list that is not the list the agent argued
 * for. Part Two of the ticket settles it — *"the options live on the request; the decision records
 * which one was chosen"* — so there is one list, the agent writes it, and the decision points into
 * it.
 *
 * ## NOTHING IS NOT IN THE LIST, and that is deliberate
 *
 * `options` holds only what the agent proposes DOING. "Nothing" is always available to the decider
 * and is never written by the agent, because an option the agent has to remember to include is an
 * option it can leave out. The ticket calls Nothing *"a first-class answer... not the same as
 * deny-with-a-reason, because there is nothing to appeal"*, and a first-class answer cannot depend
 * on the asker having offered it.
 *
 * That is also what makes `chk_adtrp_no_option_is_a_refusal` below enforceable: since declining is
 * already guaranteed, an option that merely declines is not a second solution. It is the ticket's
 * *"'Do it' and 'do not' is not two options"*, as data.
 *
 * ## What this table deliberately cannot hold
 *
 * No status, no verb, no approver, no decided_at, no `tools_granted`, no `autonomy_level`. The
 * governance spine is `agent_domain_change_requests` and the decision log is
 * `agent_domain_tool_request_decisions`; `AGENT_TOOL_REQUEST_HANDOFF.md` is explicit — *"There is
 * already an approval spine. Do not build a second one."* A table that cannot express a decision
 * cannot quietly become one.
 *
 * ## When this runs
 *
 * On the next boot after merge, after the parent's own `ensure`, because the foreign key needs the
 * parent. Additive, `IF NOT EXISTS`, referenced by nothing else, so reverting the code leaves an
 * empty table nothing reads.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { normalizeNameRows } from './ensureAgentDomainProjectSchema';

export const REQUIRED_TABLES: ReadonlyArray<string> = ['agent_domain_tool_request_packages'];

const T = 'agent_domain_tool_request_packages';

export const REQUIRED_COLUMNS: ReadonlyArray<string> = [
  `${T}.change_request_id`,
  // 1, 2
  `${T}.executive_summary`,
  `${T}.problem`,
  // 3
  `${T}.key_findings`,
  // 4 and 10
  `${T}.options`,
  // 5
  `${T}.recommendation`,
  `${T}.recommendation_reason`,
  // 6
  `${T}.impact`,
  // 7 — both halves, because "what it cannot break" is the half that makes the other credible
  `${T}.risk_can_break`,
  `${T}.risk_cannot_break`,
  // 8 — the claim, what it was run against, and when
  `${T}.simulated_action`,
  `${T}.simulated_against`,
  `${T}.simulated_at`,
  // 9
  `${T}.steps_that_follow`,
];

/**
 * The option keys an agent may use, in order. Three at most.
 *
 * A fourth would make the ticket's sentence false, and the limit is the point rather than an
 * arbitrary bound: Ali is reading these to make a fast call, and a package offering six paths has
 * moved the analysis work back onto the reader, which is the one thing the whole script forbids.
 *
 * `nothing` is NOT here. See the header: it is always available and never offered.
 */
export const PACKAGE_OPTION_KEYS = ['A', 'B', 'C'] as const;
export type PackageOptionKey = typeof PACKAGE_OPTION_KEYS[number];

/**
 * What a recommendation may name: one of the options, or `nothing`.
 *
 * Allowing `nothing` is a deliberate widening of the ticket's *"Recommendation - one of them by
 * name"*. An agent that has simulated its own capability and found it worthless must be able to
 * say so, and the ticket's own test case is exactly that: the design-token drift package should
 * *"read as an easy no"*. A recommendation field that could only ever argue for doing something
 * would make the honest answer unwritable, and the first agent to discover its own capability was
 * pointless would have to recommend doing it anyway.
 */
export const PACKAGE_RECOMMENDATIONS = ['A', 'B', 'C', 'nothing'] as const;
export type PackageRecommendation = typeof PACKAGE_RECOMMENDATIONS[number];

export const REQUIRED_INDEXES: ReadonlyArray<string> = ['idx_adtrp_simulated_at'];

export const REQUIRED_CHECKS: ReadonlyArray<string> = [
  'chk_adtrp_recommendation_is_known',
  'chk_adtrp_two_real_options',
  'chk_adtrp_options_are_shaped',
  'chk_adtrp_no_option_is_a_refusal',
  'chk_adtrp_recommendation_is_on_the_list',
  'chk_adtrp_findings_carry_sources',
];

const STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS agent_domain_tool_request_packages (
     change_request_id UUID PRIMARY KEY
       REFERENCES agent_domain_change_requests (id) ON DELETE CASCADE,
     executive_summary TEXT NOT NULL,
     problem TEXT NOT NULL,
     key_findings JSONB NOT NULL,
     options JSONB NOT NULL,
     recommendation TEXT NOT NULL,
     recommendation_reason TEXT NOT NULL,
     impact TEXT NOT NULL,
     risk_can_break JSONB NOT NULL,
     risk_cannot_break JSONB NOT NULL,
     simulated_action TEXT NOT NULL,
     simulated_against TEXT NOT NULL,
     simulated_at TIMESTAMPTZ NOT NULL,
     steps_that_follow JSONB NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT chk_adtrp_recommendation_is_known CHECK (
       recommendation IN ('A', 'B', 'C', 'nothing')
     ),
     -- "at least two real ones". Two is the floor and three the ceiling, both structural.
     CONSTRAINT chk_adtrp_two_real_options CHECK (
       jsonb_typeof(options) = 'array'
       AND jsonb_array_length(options) BETWEEN 2 AND 3
     ),
     -- Every option needs a key and a verb, or the two checks below are checking nothing: a
     -- recommendation cannot point into a list whose entries have no keys.
     CONSTRAINT chk_adtrp_options_are_shaped CHECK (
       NOT jsonb_path_exists(options, '$[*] ? (!exists(@.key) || @.key == "")')
       AND NOT jsonb_path_exists(options, '$[*] ? (!exists(@.verb) || @.verb == "")')
     ),
     -- THE TICKET'S SENTENCE AS DATA: *"'Do it' and 'do not' is not two options."* Declining is
     -- already guaranteed by Nothing, so an option that only declines is not a second solution.
     -- Containment rather than a subquery, and the difference is not stylistic: PostgreSQL
     -- answers 'cannot use subquery in check constraint', so the obvious NOT EXISTS form does not
     -- create the table at all. Measured against pg15 on 17 Nov 2026, in a rolled-back
     -- transaction, along with every other formulation in this block.
     CONSTRAINT chk_adtrp_no_option_is_a_refusal CHECK (
       NOT (options @> '[{"verb":"deny"}]'::jsonb)
     ),
     -- A recommendation pointing at an option that is not offered is the failure this whole
     -- one-list design exists to prevent, so it is checked in the row and not only in the service.
     CONSTRAINT chk_adtrp_recommendation_is_on_the_list CHECK (
       recommendation = 'nothing'
       OR options @> jsonb_build_array(jsonb_build_object('key', recommendation))
     ),
     -- "each with where the number came from". A finding with no source is the thing that sends
     -- the reader off to go and check, which is the one rule the whole script rests on. The
     -- jsonb_path form is the per-element test that survives the no-subquery rule, and it catches
     -- an ABSENT source and a BLANK one, which arrive from different mistakes.
     CONSTRAINT chk_adtrp_findings_carry_sources CHECK (
       jsonb_typeof(key_findings) = 'array'
       AND jsonb_array_length(key_findings) >= 1
       AND NOT jsonb_path_exists(key_findings, '$[*] ? (!exists(@.source) || @.source == "")')
       AND NOT jsonb_path_exists(key_findings, '$[*] ? (!exists(@.finding) || @.finding == "")')
     )
   )`,
  // "Which packages were simulated, and how long ago" is the question a stale simulation raises,
  // and it is the only ordering this table is ever read by.
  `CREATE INDEX IF NOT EXISTS idx_adtrp_simulated_at
     ON agent_domain_tool_request_packages (simulated_at DESC)`,
];

/** Net-new, so it reverts whole. The parent is deliberately not mentioned here. */
export const ROLLBACK_STATEMENTS: ReadonlyArray<string> = [
  'DROP TABLE IF EXISTS agent_domain_tool_request_packages',
];

export async function ensureToolRequestPackageSchema(): Promise<void> {
  for (const statement of STATEMENTS) {
    try {
      await sequelize.query(statement);
    } catch (err: unknown) {
      // Warn and continue, matching the siblings: `assert` below is what actually decides, because
      // a loop that swallows every failure resolves identically on success and on total failure.
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'tool_request_package_schema_statement_failed',
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

export async function assertToolRequestPackageSchema(): Promise<void> {
  const problems: string[] = [];

  const tables = await readNames(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($names)`,
    REQUIRED_TABLES,
  );
  for (const t of REQUIRED_TABLES) if (!tables.includes(t)) problems.push(`missing table ${t}`);

  // Only worth asking about columns if the table arrived; otherwise every column is "missing" and
  // the real finding drowns in fourteen lines of noise.
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

    // The constraints are the block rules expressed as data. Without them the table accepts a
    // package with one option, or a recommendation for an option nobody offered, which are the two
    // shapes that would let a decision be made against a list the agent never argued for.
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

export interface GuardedToolRequestPackageSchemaResult {
  ok: boolean;
  error_class?: string;
}

/**
 * Boot entry point. CANNOT REJECT — a schema problem must be loud in the logs without taking the
 * backend down with it, the same contract the siblings have and the reason `server.ts` awaits it
 * bare.
 */
export async function ensureToolRequestPackageSchemaGuarded(
): Promise<GuardedToolRequestPackageSchemaResult> {
  try {
    await ensureToolRequestPackageSchema();
    await assertToolRequestPackageSchema();
    return { ok: true };
  } catch (err: unknown) {
    const error_class = err instanceof Error ? err.constructor.name : 'UnknownError';
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'tool_request_package_schema_unavailable',
      outcome: 'failure',
      error_class,
      context: { message: err instanceof Error ? err.message : String(err) },
    }));
    return { ok: false, error_class };
  }
}
