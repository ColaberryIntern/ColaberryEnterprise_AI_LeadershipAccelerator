/**
 * The ONE read of a project's published build plan, for the lifecycle evidence gatherer.
 *
 * Split out of `lifecycleEvidence.ts` (P6-T5, 2026-10-12) BEFORE adding the integrity read,
 * not after: that file stood at 407 of CLAUDE.md's 500-line ceiling, and the previous task was
 * graded down for crossing that ceiling in the very file carrying a note about the rule.
 *
 * The seam is real rather than arithmetic. Everything here answers one question — "what does
 * `build_plans` currently say about this project?" — and answers it the way a gatherer needs:
 *
 *   · DYNAMIC import of the database, so importing this module connects to nothing. A unit test
 *     of the predicates must never acquire a pool.
 *   · RAW SQL rather than importing SBP's `planStore`, which would couple the lifecycle
 *     coordinator to SBP's service layer. Same reason `adapters/sbpAdapter.ts` declares its own
 *     `*Like` shapes instead of importing `BuildPlan`.
 *   · `null` ON ANY FAILURE, logged with an `error_class`, never thrown. A status read that
 *     reports "not measured" is correct; one that returns 500 because a project has no plan yet
 *     is not. The gatherer turns `null` into NOT_MEASURED, which leaves the prerequisite
 *     BLOCKING — so the failure direction is safe.
 *
 * ONE QUERY, THREE FACTS. The plan body and the two integrity facts come back together rather
 * than from two readers, so a status read cannot see a plan and a publication count that
 * disagree because another transaction committed between them.
 *
 * STUDENT PROJECTS ONLY, and that is a fact about the product rather than a shortcut:
 * `build_plans.project_id` is a `projects` id. A delivery project has no SBP build plan, so
 * this returns `null` for one and every plan-derived measurement reports NOT_MEASURED. That is
 * the honest answer — a delivery project's traceability is the Factory's contract, not an SBP
 * plan's — and it must not be confused with "measured, no gaps".
 */
import { hashCanonical } from '../../utils/canonicalHash';
import type { StoryLike } from './storyTraceability';

/**
 * The part of a build plan the lifecycle measurements read.
 *
 * Structural, not imported from `services/sbp`: see the header. SBP's `BuildPlan` satisfies it.
 */
export interface PlanLike {
  requirements?: ReadonlyArray<{ id: string; kind?: string | null; priority?: string | null }> | null;
  releases?: ReadonlyArray<{ key: string }> | null;
  stories?: ReadonlyArray<StoryLike> | null;
}

/**
 * The minimum this reader needs from a lifecycle row.
 *
 * Declared locally rather than importing `LifecycleRow` from `lifecycleEvidence.ts`, which
 * imports this module — the dependency runs one way, as `planDocSections.ts` does with its own
 * `SectionContext`. `id` is carried only so a failure log can name the lifecycle record.
 */
export interface PlanReadRow {
  id: string;
  student_project_id: string | null;
}

/** What `build_plans` says about publication: the plan itself, and two separate facts about it. */
export interface PublishedPlanState {
  /**
   * The published plan, or `null` when none is published.
   *
   * The HIGHEST version when several rows are published. That state is a defect rather than a
   * choice — it is what `publishedCount` exists to report — but picking one deterministically
   * is better than throwing, because then the plan-shape measurements would go unmeasured for
   * a reason unrelated to their own subject.
   */
  plan: PlanLike | null;
  /** Rows for this project carrying `status = 'published'`. Exactly one is the healthy value. */
  publishedCount: number;
  /**
   * Whether EVERY published row's stored `plan_sha256` still describes its own stored
   * `plan_json`.
   *
   * `null` when there is no published row: there is then nothing to check, and answering `true`
   * would report an absent plan as an intact one. The two facts are separate fields precisely so
   * that "none published" cannot be laundered into "published and intact".
   */
  hashIntact: boolean | null;
}

/**
 * One structured line, per CLAUDE.md's Observability Framework.
 *
 * No plan content is ever included — the context carries ids, counts and versions, never
 * `plan_json`, because a build plan is student work and this line goes to container stdout.
 */
function emit(
  event: string,
  outcome: 'failure' | 'partial',
  errorClass: string,
  context: Record<string, unknown>,
): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'warn',
    service: 'backend',
    event,
    outcome,
    error_class: errorClass,
    context,
  }));
}

/**
 * `plan_json` arrives from JSONB already parsed, but a string is possible if a writer ever
 * stored text. Parse defensively; `null` for anything that is not an object, and for content
 * no parser can read.
 */
function asPlan(raw: unknown): PlanLike | null {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed === null || typeof parsed !== 'object') return null;
    return parsed as PlanLike;
  } catch {
    // Not swallowed silently: the only two callers below both treat `null` as a reportable
    // finding — unmeasured for the plan shape, NOT INTACT for the hash. See each.
    return null;
  }
}

/**
 * Everything the gatherer knows about this project's publication, or `null` if it could not be
 * read.
 *
 * Reads PUBLISHED rows only, never drafts. A draft is a proposal nobody authorized, and judging
 * a stage's prerequisites against one would let an unapproved edit satisfy a gate.
 *
 * ## Why the hash is re-checked on READ, when `expectedSha` already guards the WRITE
 *
 * `publishPlan` now requires the reviewed hash and takes a row lock, so the interleaving that
 * produced two published rows — demonstrated in `planStore.publishConcurrency.integration` —
 * cannot happen through that function any more. This check is not redundant with it:
 *
 *   · Rows written BEFORE that fix are still in the table, and nothing migrated them.
 *   · `plan_json` is a JSONB column. Any script, any `UPDATE`, any future writer can change it
 *     without touching `plan_sha256`, and a write-side guard cannot see that at all.
 *
 * So "the plan that shipped is the plan that was reviewed" is ENFORCED when the row is written
 * and VERIFIED when it is read. The hash is recomputed with `hashCanonical` — the same leaf
 * function `services/sbp/planHash.hashPlan` calls, not a reimplementation, because two
 * implementations of one invariant eventually disagree and reject a legitimate plan as tampered.
 */
export async function publishedPlanState(row: PlanReadRow): Promise<PublishedPlanState | null> {
  if (row.student_project_id === null) return null;

  let rows: Array<{ version: number; plan_json: unknown; plan_sha256: string | null }>;
  try {
    const { sequelize } = await import('../../config/database');
    rows = await sequelize.query<{ version: number; plan_json: unknown; plan_sha256: string | null }>(
      `SELECT version, plan_json, plan_sha256
         FROM build_plans
        WHERE project_id = $1 AND status = 'published'
        ORDER BY version DESC`,
      {
        bind: [row.student_project_id],
        type: (await import('sequelize')).QueryTypes.SELECT,
      },
    );
  } catch (err: unknown) {
    // LOGGED, not swallowed. CLAUDE.md names the silent catch a production defect, and a wrong
    // column name here would otherwise be permanently invisible AND would silently block every
    // project, because an unreadable plan becomes NOT_MEASURED on five fields at once.
    emit('lifecycle_evidence_plan_unavailable', 'partial',
      (err as { name?: string })?.name ?? 'UnclassifiedError',
      { lifecycle_id: row.id, measured: false });
    return null;
  }

  if (rows.length === 0) return { plan: null, publishedCount: 0, hashIntact: null };

  let intact = true;
  for (const r of rows) {
    const plan = asPlan(r.plan_json);
    // Unparseable or non-object content is NOT INTACT rather than unreadable: the row was read,
    // so this is a finding about its contents, not an absence of evidence about them.
    if (plan === null || r.plan_sha256 === null || hashCanonical(plan) !== r.plan_sha256) intact = false;
  }

  if (!intact || rows.length !== 1) {
    // A real alarm rather than debug noise: either state means a published plan is not what it
    // claims to be, and under `ENABLE_PROJECT_LIFECYCLE` it will refuse `launch_ready`.
    emit('lifecycle_publish_integrity_violation', 'failure', 'ContractViolation', {
      lifecycle_id: row.id,
      published_count: rows.length,
      hash_intact: intact,
      versions: rows.map((r) => r.version),
    });
  }

  return { plan: asPlan(rows[0].plan_json), publishedCount: rows.length, hashIntact: intact };
}
