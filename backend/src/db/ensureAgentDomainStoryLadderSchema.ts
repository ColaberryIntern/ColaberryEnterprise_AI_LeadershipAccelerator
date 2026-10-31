/**
 * ensureAgentDomainStoryLadderSchema - the three story columns the autonomy ladder needs, plus the
 * one existing column that is too narrow to hold a rung.
 *
 * Phase 2 of `docs/architecture/ai-workforce-management/AUTONOMY_RELEASE_MIGRATION.md`, item 7:
 * "Persist the link the provisioner currently computes and throws away: `capability_id` and the
 * autonomy stage belong on the story row. Without them no dashboard can ever say where anyone is."
 *
 * Measured in production on 2026-10-31, before this shipped: across all 513 agent-domain stories,
 * `capability_id` had no column at all, and every one of the eleven columns
 * `ensureFactoryTaskSchema` added was NULL on all 513 rows. The capability identity was recoverable
 * only by string-splitting `story_id`, which is exactly the kind of implicit contract this adds a
 * column to retire.
 *
 * ## Why `story_id` is widened, and why that is not optional
 *
 * `story_id` was `VARCHAR(60)`, and `agentDomainProvisionPlan.plannedStory` truncates to fit it
 * while the row `id` is derived from the UNtruncated string. That combination is a latent
 * duplicate-key-by-another-name: two logically distinct stories can be written as two rows carrying
 * the same `story_id`.
 *
 * It is not hypothetical. Measured in production, 2026-10-31:
 *
 *   longest domain story_id: 60   sitting exactly at the limit: 24
 *
 * **Twenty-four ids are already cut off mid-word** - for example
 * `product_experience.CAP.stylesheet_architecture_consolidation`, whose real id ends
 * `..._consolidation_proposal`. Nothing has collided yet, purely by luck of the naming.
 *
 * Phase 2 appends the rung to a capability's story id to identify a per-rung story, which pushes
 * those same ids to 81 characters. Measured against the real capability data, keeping the 60-char
 * limit would produce **221 pairs of distinct stories sharing one truncated `story_id`**. Inventing
 * a shorter naming scheme was the alternative and it is worse: the only scheme that avoided every
 * collision did so by luck too, and still stored a truncated identifier.
 *
 * So the column is widened to 120. In Postgres, widening a `varchar` length is a catalog-only
 * change - no table rewrite, no lock beyond a brief `ACCESS EXCLUSIVE`, and no existing value is
 * altered. Every reader that accepted 60 characters accepts 120.
 *
 * ## The contract this file keeps
 *
 * Additive and nullable, the same shape as `ensureFactoryTaskSchema`, so every existing row is
 * untouched and unset until the migration populates it. It must never throw: `server.ts` awaits it
 * during boot, and a schema helper that rejects would stop the backend binding its port. That is
 * the failure Phase 1 spent a day on from the other direction, and the rule from it stands - a
 * boot-time helper reports and continues, it does not take the process with it.
 */
import { sequelize } from '../config/database';

/** The columns the ladder cannot be read without. */
export const REQUIRED_COLUMNS: ReadonlyArray<string> = [
  'capability_id', 'autonomy_stage', 'story_kind',
];

/** What `story_id` must be able to hold. 81 is the longest id Phase 2 generates; 120 is the room. */
export const STORY_ID_MIN_WIDTH = 120;

export const STORY_LADDER_STATEMENTS: ReadonlyArray<string> = [
  // The capability this story traces to, e.g. `internship.application_intake_and_state_transitions`.
  // TEXT, not UUID: capability ids are dotted human-readable strings, and the records live in
  // version-controlled JSON rather than a table, so there is no foreign key to point at.
  // Nullable because 70 of 513 stories legitimately have no capability - the Command Center, the
  // five research stories and the legacy migration plan per domain - and each carries a recorded
  // `shared_foundation_reason` instead.
  `ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS capability_id TEXT`,
  // The rung this story sits on, stored NAMESPACED as `autonomy:R0` .. `autonomy:R9`.
  //
  // Never a bare `R3`. `services/agentDomain/autonomyLadder.ts` carries the long version of why:
  // the platform already uses bare `R0`-`R5` for DELIVERY RISK TIERS, where `R3` means
  // `schema_security_or_external_side_effect`, and two readers of that vocabulary fail OPEN on a
  // value they do not recognise - `agentAutonomy.isHighRiskTier()` returns false and skips the
  // human approval, and `workGraph/capabilityRouter.riskTierIndex()` returns 0 and clears every
  // `maxRiskTier` ceiling. A bare rung written here and read there removes two guards silently.
  // The column is deliberately NOT named `risk_tier`; `assertNoAutonomyInRiskTierColumn` refuses
  // that pairing outright.
  `ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS autonomy_stage TEXT`,
  // command_center | research | legacy_migration | implementation | release_behaviour.
  //
  // The provisioner has always computed this and dropped it at the INSERT, which forced every
  // later reader to re-derive a story's class by pattern-matching its `story_id` prefix. Two
  // acceptance backfills do exactly that today via `release_key IN ('r0','r1')` and
  // `release_key = 'r2'` - predicates that stop matching the moment a release means a rung instead
  // of a workstream. This column is what lets those scripts ask what they actually mean.
  `ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS story_kind TEXT`,
  // See the header. Catalog-only widening; idempotent, since re-running it is a no-op.
  `ALTER TABLE student_tasks ALTER COLUMN story_id TYPE VARCHAR(${STORY_ID_MIN_WIDTH})`,
];

export async function ensureAgentDomainStoryLadderSchema(): Promise<void> {
  for (const sql of STORY_LADDER_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] agent domain story ladder stmt skipped:', err?.message);
    }
  }
  await assertAgentDomainStoryLadderSchema();
}

/**
 * Proves the statements above actually landed, by introspection rather than by their exit status.
 *
 * The loop swallows every failure into a `console.warn`, deliberately and like its sibling, so it
 * resolves identically whether all four statements succeeded or all four failed. That makes the
 * assert the only thing standing between a swallowed `ALTER` and a migration that writes into a
 * column nobody created. It checks the WIDTH as well as the presence of the three new columns,
 * because a swallowed widening is the failure that would otherwise show up much later as two
 * stories sharing one truncated id.
 */
export async function assertAgentDomainStoryLadderSchema(): Promise<boolean> {
  const problems: string[] = [];
  try {
    const [cols] = await sequelize.query(
      `SELECT column_name, character_maximum_length FROM information_schema.columns
        WHERE table_name = 'student_tasks'
          AND column_name = ANY($names)`,
      { bind: { names: [...REQUIRED_COLUMNS, 'story_id'] } },
    );
    const rows = cols as { column_name: string; character_maximum_length: number | null }[];
    const have = new Map(rows.map((r) => [r.column_name, r.character_maximum_length]));

    for (const c of REQUIRED_COLUMNS) {
      if (!have.has(c)) problems.push(`student_tasks.${c} missing`);
    }

    if (!have.has('story_id')) {
      problems.push('student_tasks.story_id missing');
    } else {
      const width = have.get('story_id');
      // A null length means an unbounded type (TEXT), which is wider than any limit we need.
      if (width !== null && width !== undefined && width < STORY_ID_MIN_WIDTH) {
        problems.push(
          `student_tasks.story_id is varchar(${width}), narrower than the ${STORY_ID_MIN_WIDTH} a `
          + 'per-rung story id needs; ids would be truncated and two stories could collide',
        );
      }
    }
  } catch (err: any) {
    problems.push(`schema introspection failed: ${err?.message}`);
  }

  if (problems.length === 0) {
    console.log('[DB] agent domain story ladder schema ensured');
    return true;
  }
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'agent_domain_story_ladder_schema_invariant_violated', outcome: 'failure',
    error_class: 'SchemaInvariantViolation',
    context: {
      problems,
      impact: 'Autonomy rung and capability link unreadable; no surface can report where an '
        + 'agent sits on the ladder, and the release migration must not run.',
      remedy: 'Run the statements in ensureAgentDomainStoryLadderSchema against a reachable '
        + 'database and read the warnings the loop swallowed.',
    },
  }));
  return false;
}

export default ensureAgentDomainStoryLadderSchema;
