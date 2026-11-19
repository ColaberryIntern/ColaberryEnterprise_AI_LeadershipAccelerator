/**
 * Capability CANDIDATES — the object that exists before any request, and the reason the new
 * builder path does not need a second approval spine.
 *
 * ## What a candidate is, and why it is not a request
 *
 * A builder is never asked what they do by hand. They are handed four candidates from four
 * sources — their own research, their manager, Ali, and AI suggestions scored against the rung's
 * criteria — and asked to choose. That list has to live somewhere, and a change request is the
 * wrong place for it: most candidates never become a request at all, and one candidate can produce
 * TWO (a screen, and later a tool).
 *
 * So a candidate is a row with a life, and the life is derived rather than stored. See
 * `services/agentDomain/candidateStages.ts`: the eight stages are a FUNCTION of this row plus the
 * status of the requests it points at, never a column on it.
 *
 * ## This table holds no decision, and that is the whole design
 *
 * No `status`, no `approved_by`, no `decided_at`, no `declined_reason`. `AGENT_TOOL_REQUEST_HANDOFF.md`
 * is imperative about it: *"There is already an approval spine. Do not build a second one."* The
 * spine is `agent_domain_change_requests`, which carries `status`, `approved_by_identity`,
 * `approved_at`, `declined_reason` and `chk_adcr_decided_together`. The sibling
 * `ensureAgentDomainToolRequestSchema.ts` makes the same refusal in its own header for the same
 * reason: *"it cannot express a decision, which is what stops it becoming the second spine."*
 *
 * A candidate therefore cannot be approved. It can only point at the request that was.
 * `screen_request_id` and `tool_request_id` are both nullable foreign keys into the spine, and
 * reading a candidate's position means reading those rows' statuses — one source of truth, by
 * construction rather than by discipline.
 *
 * ## The two product vocabularies, named apart on purpose
 *
 * `product_state` here is the CATALOG vocabulary from `services/agentDomain/productFeatureCatalog.ts`
 * — `unchecked | in_app | partly | api_only | not_built` — and it is deliberately NOT
 * `TOOL_PRODUCT_STATES` in `ensureAgentDomainToolRequestSchema.ts`, which is
 * `used_by_hand | exists_unused | not_built`.
 *
 * They answer different questions. This one asks what the PRODUCT has. That one asks what the
 * BUILDER has tried. Collapsing them would destroy the distinction AF11.7 exists to protect: the
 * product having a feature is not the same fact as the builder having used it, which is why
 * `answerFrontDoor` returns `in_app` with `implies_tried_in_product: null`.
 *
 * The bridge between the two already exists and is `answerFrontDoor().implies_tried_in_product`.
 * There is no second mapping table, and the test asserts that bridge's range is a subset of
 * `TOOL_PRODUCT_STATES` so one cannot drift from the other.
 *
 * ## When this runs
 *
 * On the next boot after merge, from `server.ts`, AFTER
 * `ensureAgentDomainChangeRequestSchemaGuarded()` because the two foreign keys point at that
 * table. `ensureAgentDomainCandidateSchema.bootWiring.test.ts` asserts that call is active and in
 * that order — the first version of this file claimed this paragraph while nothing called it at
 * all, so the table would never have existed on any environment and all 48 tests still passed.
 *
 * One `CREATE TABLE IF NOT EXISTS`, net-new, referenced by nothing until the candidate endpoints
 * land, so reverting the code leaves an empty table that nothing reads. There are no `ALTER`
 * statements in this file and its test asserts the absence, because an absence is what a later
 * edit silently removes.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { normalizeNameRows } from './ensureAgentDomainProjectSchema';

export const REQUIRED_TABLES: ReadonlyArray<string> = ['agent_domain_candidates'];

const T = 'agent_domain_candidates';

export const REQUIRED_COLUMNS: ReadonlyArray<string> = [
  `${T}.id`,
  `${T}.domain_key`,
  `${T}.title`,
  // WHERE IT CAME FROM — four sources, because "who suggested this" decides how much weight the
  // builder should give it, and a list with no provenance reads as four equal options.
  `${T}.source`,
  `${T}.source_note`,
  // WHAT THE PRODUCT ALREADY DOES — the catalog's answer, cached on the row so the gap board can
  // be read without re-running the matcher over every candidate.
  `${T}.product_state`,
  `${T}.matched_feature_key`,
  // THE FIRST RUNG OF THE LADDER, as a fact rather than a claim.
  `${T}.proven_by_hand_at`,
  // THE TWO REQUESTS ONE CANDIDATE CAN PRODUCE. Both nullable, both pointing at the one spine.
  `${T}.screen_request_id`,
  `${T}.tool_request_id`,
  `${T}.created_at`,
  `${T}.updated_at`,
];

/**
 * WHERE THE CANDIDATE CAME FROM.
 *
 * Ali's correction, 17 Nov 2026, and the reason the earlier worked example broke: never ask a
 * builder what they do by hand, because they do not hold the job. Present a candidate list and ask
 * them to choose. These are the four places a list entry can come from.
 *
 *   - `research`   the builder's own survey of the domain
 *   - `manager`    the person who actually holds the job
 *   - `owner`      Ali
 *   - `suggested`  generated and scored against the rung's criteria
 *
 * Four candidates each, in parallel, so nobody stalls waiting on Ali. An enum rather than free
 * text because the admin surface sorts and filters by it, and because "who said this" is a ranking
 * input, not a note.
 */
export const CANDIDATE_SOURCES = ['research', 'manager', 'owner', 'suggested'] as const;
export type CandidateSource = typeof CANDIDATE_SOURCES[number];

/**
 * WHAT THE PRODUCT ALREADY DOES, in the catalog's vocabulary.
 *
 * `unchecked` is first and is the default: a candidate arrives before anybody has run it past the
 * front door, and a row that claimed `not_built` on arrival would be asserting the expensive thing
 * — that the product cannot do this — on no evidence at all.
 *
 * The other four are exactly `FrontDoorAnswer['state']`, and the test asserts that equality by
 * reading the catalog's own export rather than restating the list, so a fifth catalog state cannot
 * appear without this file failing.
 */
export const CANDIDATE_PRODUCT_STATES = [
  'unchecked',
  'in_app',
  'partly',
  'api_only',
  'not_built',
] as const;
export type CandidateProductState = typeof CANDIDATE_PRODUCT_STATES[number];

export const REQUIRED_INDEXES: ReadonlyArray<string> = [
  'idx_adcand_domain_key',
  'idx_adcand_product_state',
  'uniq_adcand_domain_title',
];

/**
 * The checks `assert` names one by one, so an absent one fails a boot rather than a review.
 *
 * `chk_adcand_match_is_checked` is the structural half of the vocabulary bridge: a row cannot name
 * a matched feature while still claiming nobody has checked the product. Without it the gap board
 * could show a candidate as both matched and unchecked, which is not a state the front door can
 * produce and therefore not a state anything downstream knows how to render.
 */
export const REQUIRED_CHECKS: ReadonlyArray<string> = [
  'chk_adcand_source_known',
  'chk_adcand_product_state_known',
  'chk_adcand_match_is_checked',
];

/**
 * EVERY STATEMENT IS IDEMPOTENT BY FORM, which is the only way a boot-time ensure can be safe.
 *
 * `CREATE TABLE IF NOT EXISTS` and `CREATE [UNIQUE] INDEX IF NOT EXISTS` are no-ops on the second
 * run. There is no `ALTER` here, no `UPDATE`, no `INSERT`: nothing in this list can write a row or
 * change an existing column, on the first run or the thousandth. The test proves that by form, over
 * this list, rather than by counting queries — because the queries ARE still sent on a second run;
 * what cannot happen is any of them changing anything.
 *
 * `uniq_adcand_domain_title` goes beyond the column list the plan specified, deliberately. The
 * candidate list is seeded repeatedly — four candidates per builder, regenerated as rungs advance —
 * and without a uniqueness rule the second seed silently doubles the list. One index is cheaper
 * than the deduplication pass every reader would otherwise need.
 */
const STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS agent_domain_candidates (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     domain_key TEXT NOT NULL,
     title TEXT NOT NULL,
     source TEXT NOT NULL,
     source_note TEXT,
     product_state TEXT NOT NULL DEFAULT 'unchecked',
     matched_feature_key TEXT,
     proven_by_hand_at TIMESTAMPTZ,
     screen_request_id UUID
       REFERENCES agent_domain_change_requests (id) ON DELETE SET NULL,
     tool_request_id UUID
       REFERENCES agent_domain_change_requests (id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT chk_adcand_source_known CHECK (
       source IN ('research', 'manager', 'owner', 'suggested')
     ),
     CONSTRAINT chk_adcand_product_state_known CHECK (
       product_state IN ('unchecked', 'in_app', 'partly', 'api_only', 'not_built')
     ),
     CONSTRAINT chk_adcand_match_is_checked CHECK (
       matched_feature_key IS NULL OR product_state <> 'unchecked'
     )
   )`,
  `CREATE INDEX IF NOT EXISTS idx_adcand_domain_key
     ON agent_domain_candidates (domain_key)`,
  `CREATE INDEX IF NOT EXISTS idx_adcand_product_state
     ON agent_domain_candidates (product_state)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_adcand_domain_title
     ON agent_domain_candidates (domain_key, title)`,
];

/** Net-new, so the rollback really is a drop and loses nothing anything else depends on. */
export const ROLLBACK_STATEMENTS: ReadonlyArray<string> = [
  'DROP TABLE IF EXISTS agent_domain_candidates',
];

export async function ensureAgentDomainCandidateSchema(): Promise<void> {
  for (const statement of STATEMENTS) {
    try {
      await sequelize.query(statement);
    } catch (err: unknown) {
      // Warn and continue, matching both siblings — `assert` below is what actually decides,
      // because a loop that swallows every failure resolves identically on success and on total
      // failure.
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'agent_domain_candidate_schema_statement_failed',
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

export async function assertAgentDomainCandidateSchema(): Promise<void> {
  const problems: string[] = [];

  const tables = await readNames(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($names)`,
    REQUIRED_TABLES,
  );
  for (const t of REQUIRED_TABLES) if (!tables.includes(t)) problems.push(`missing table ${t}`);

  if (tables.includes(T)) {
    const cols = (await readNames(
      `SELECT table_name || '.' || column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($names)`,
      REQUIRED_TABLES,
    ));
    for (const c of REQUIRED_COLUMNS) if (!cols.includes(c)) problems.push(`missing column ${c}`);

    const idx = await readNames(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY($names)`,
      REQUIRED_TABLES,
    );
    for (const i of REQUIRED_INDEXES) if (!idx.includes(i)) problems.push(`missing index ${i}`);

    // The constraints are the field rules expressed as data. Without the two enum checks the table
    // accepts a source and a product state nothing downstream can render; without the match check
    // it accepts a row that claims a matched feature and an unchecked product at the same time.
    const checks = await readNames(
      `SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = ANY($names)
          AND constraint_type = 'CHECK'`,
      REQUIRED_TABLES,
    );
    for (const c of REQUIRED_CHECKS) {
      if (!checks.includes(c)) problems.push(`missing constraint ${c}`);
    }

    // THE ABSENCE IS ASSERTED, not assumed. This is the no-second-spine rule as a runtime check:
    // if some later migration adds a decision column to this table, the boot says so by name
    // rather than the second spine arriving quietly and being discovered by a reader who finds two
    // statuses that disagree.
    const forbidden = cols
      .map((c) => c.slice(T.length + 1))
      .filter((c) => /^(status|approver|approved_by|approved_at|decided_at|declined_reason)$/
        .test(c));
    for (const c of forbidden) {
      problems.push(`forbidden decision column ${T}.${c}: the approval spine is `
        + 'agent_domain_change_requests');
    }
  }

  if (problems.length > 0) {
    throw new Error(`SchemaInvariantViolation: ${problems.join('; ')}`);
  }
}

export interface GuardedCandidateSchemaResult {
  ok: boolean;
  error_class?: string;
}

/**
 * Boot entry point. CANNOT REJECT — a schema problem must be loud in the logs without taking the
 * whole backend down with it, the same contract both siblings have and the reason `server.ts` can
 * await it bare.
 */
export async function ensureAgentDomainCandidateSchemaGuarded(
): Promise<GuardedCandidateSchemaResult> {
  try {
    await ensureAgentDomainCandidateSchema();
    await assertAgentDomainCandidateSchema();
    return { ok: true };
  } catch (err: unknown) {
    const error_class = err instanceof Error ? err.constructor.name : 'UnknownError';
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'agent_domain_candidate_schema_unavailable',
      outcome: 'failure',
      error_class,
      context: { message: err instanceof Error ? err.message : String(err) },
    }));
    return { ok: false, error_class };
  }
}

/** The statement list, exported so the idempotency test can read the real thing. */
export const DDL_STATEMENTS: ReadonlyArray<string> = STATEMENTS;
