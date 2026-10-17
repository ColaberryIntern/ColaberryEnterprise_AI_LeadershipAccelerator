/**
 * P7-T4 — what the projects that predate lifecycle registration actually have, and what a
 * migration could honestly give them. **LC-15.**
 *
 * ## Two halves, and the second one writes nothing
 *
 *  1. `assessLegacyProjects` READS. For every project with no lifecycle row it counts what
 *     exists -- intake, plans, tasks -- and derives the furthest stage that evidence justifies.
 *  2. `previewLegacyMigration` is a PURE function over those assessments. It proposes what a
 *     migration would create and names what it refuses to create. It has no database handle, no
 *     model import and no write path, which is a stronger guarantee than a careful author: the
 *     module cannot write because it cannot reach anything that writes.
 *
 * ## The rule that shapes the whole design: a migration may not invent evidence
 *
 * `plan-phase7.md` makes it an acceptance criterion -- *"No fabricated approvals"* -- and the
 * reason is specific. A legacy project's published plan proves a plan was published. It does NOT
 * prove a human approved a blueprint, that a proposer differed from an approver, or that any
 * gate was passed, because none of those things were recorded at the time. Synthesising them to
 * make a project look migrated would put a fabricated approval behind a real gate, which is
 * worse than leaving the project unmigrated.
 *
 * So `FABRICABLE` lists what may be created and `assertNoFabrication` refuses everything else by
 * name. The refusal is not a comment or a convention; it throws.
 *
 * ## The stage is DERIVED, never assumed
 *
 * It would be easy to write `stage: 'discovery'` and move on -- and today that is the answer for
 * every legacy project. But hardcoding it would hide WHY, and would silently stop being true the
 * day evidence measurement improves. Instead the stage is computed by walking `LIFECYCLE_STAGES`
 * in order and asking the SHIPPED `prerequisiteGaps` predicate where the evidence runs out. The
 * reason returned is the first blocking gap's own rule name, so the report explains itself from
 * the product's own rules rather than from prose written here.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { LIFECYCLE_STAGES, type LifecycleStage } from './lifecycleStages';
import {
  prerequisiteGaps, blockingGaps, type LifecycleEvidence, type EvidenceField,
} from './lifecyclePrerequisites';
import { STUDENT_REGISTRATION_LIVE_SINCE } from './projectLifecycleRegistration';

/** What a legacy project demonstrably has. Counted from tables, never inferred. */
export interface LegacyEvidenceCounts {
  intake: boolean;
  publishedPlans: number;
  draftPlans: number;
  tasks: number;
}

export interface LegacyProjectAssessment {
  projectId: string;
  tenantId: string | null;
  createdAt: Date;
  /** Always false in this report: having one is what excludes a project from it. */
  hasLifecycleRow: boolean;
  counts: LegacyEvidenceCounts;
  /**
   * The furthest stage the available evidence justifies, or NULL when even the first stage's
   * prerequisites are unmet -- which is the honest answer for an unattributable project, and an
   * answer the first version of this module could not give.
   */
  highestJustifiableStage: LifecycleStage | null;
  /** The rule that stops it going further, named by the shipped predicate. */
  stoppedBy: string;
}

/**
 * The ONLY things a migration may create. Anything absent from this set is refused by name.
 *
 * A lifecycle row is fabricable because it asserts nothing that is not already true: the project
 * exists and it has reached no gate. Everything else on this surface encodes a human decision or
 * a cryptographic commitment that was never made.
 *
 * **IT IS FABRICABLE ONLY FOR AN ATTRIBUTABLE PROJECT, and an earlier version of this comment
 * got that wrong.** It claimed the project "belongs to a tenant" as a ground for fabricability.
 * `projects.tenant_id` is deliberately NULLABLE, and `models/Project.ts` is explicit that null
 * means NOT ATTRIBUTABLE rather than "no tenant" -- *"the registration hook skips it and logs a
 * ContractViolation"*. So unattributable projects are not an edge case here: being skipped by the
 * hook is exactly what puts a project in the no-lifecycle-row cohort this module reports.
 *
 * `project_lifecycle_states.tenant_id` is NOT NULL, so proposing a row for one would be
 * proposing a write the database must reject -- and the hook has already decided not to make it.
 * Those projects are routed to `cannotMigrate` with the blocking rule named. Measured on
 * production 2026-10-17: **0 of the 62** currently have a null tenant, so this is latent rather
 * than live -- but the hook creates the population by design, so the next one lands straight in
 * the cohort.
 */
export const FABRICABLE: ReadonlySet<string> = new Set<string>(['lifecycle_row']);

/** What a migration must never invent, and the reason each one cannot be inferred. */
export const NEVER_FABRICABLE: Readonly<Record<string, string>> = {
  approval: 'an approval records a human decision that was never made; inventing one puts a '
    + 'fabricated signature behind a real gate',
  manifest: 'a manifest carries a content hash committing to an exact blueprint revision; there '
    + 'is nothing to hash, so any value would be a lie about what was agreed',
  proposed_by: 'separation of duty compares proposer to approver; inventing either makes the '
    + 'comparison meaningless while appearing to satisfy it',
  design_selection: 'a selected design ref points at a decision between alternatives that were '
    + 'never presented',
};

export class FabricatedEvidenceError extends Error {
  status = 422;
  error_class = 'ContractViolation';
  constructor(public readonly kind: string, public readonly why: string) {
    super(`refusing to fabricate ${kind}: ${why}`);
    this.name = 'FabricatedEvidenceError';
  }
}

/**
 * Refuse anything a migration may not invent.
 *
 * Exported and called at the one place the preview builds its proposal, so a future caller
 * asking for an approval gets a typed refusal rather than a silently-honoured request.
 */
export function assertNoFabrication(kind: string): void {
  if (FABRICABLE.has(kind)) return;
  const why = (Object.hasOwn(NEVER_FABRICABLE, kind) ? NEVER_FABRICABLE[kind] : undefined)
    ?? 'it is not in the set a migration may create, and anything outside that set encodes a '
      + 'decision or commitment that was never recorded';
  throw new FabricatedEvidenceError(kind, why);
}

/**
 * Evidence as it stands for a project with no lifecycle row: a tenant, and nothing measured.
 *
 * `assessedFields` is EMPTY on purpose. That is not laziness about filling it in -- it is the
 * accurate statement. The approval-binding fields have no production measurement at all, so
 * claiming any of them were assessed would be the same fabrication this module refuses
 * elsewhere. An empty set makes every prerequisite answer `not_assessed`, which blocks, which is
 * the correct and conservative result.
 */
function evidenceForLegacy(tenantId: string | null): LifecycleEvidence {
  return {
    assessedFields: new Set<EvidenceField>(),
    tenantId: tenantId ?? '',
    requirementCount: 0,
    requirementsWithoutProvenance: [],
    uncitedRequirementSourceBlocks: [],
    unresolvedSourceBlocks: [],
    processesWithoutTasks: [],
    graphHasStart: false,
    graphHasEnd: false,
    unreachableTasks: [],
    unboundedReworkLoops: [],
    tasksWithoutExecutionClass: [],
    tasksWithoutAccountableHuman: [],
    agentTasksAccountableForThemselves: [],
    tasksUnmappedToSurface: [],
    screensWithoutRationale: [],
    selectedDesignRef: null,
    manifestContentHash: null,
    unknownAllocationCount: 0,
    effortCoverageDisclosed: false,
    proposedBy: null,
    approval: null,
    currentManifestRevision: null,
    actorStillAuthorized: false,
    mustHaveRequirementsWithoutStory: [],
    storiesWithoutTraceability: [],
    releasesWithoutUserVisibleWorkflow: [],
    publishedPlanIsSingular: false,
    publishedPlanHashIntact: false,
  };
  // NO `as LifecycleEvidence` CAST. `tsc` accepts the literal on its own, so the cast was
  // redundant -- and redundant in the dangerous direction: `{...} as T` permits MISSING
  // properties, so the day `LifecycleEvidence` gains a field this function would silently return
  // an object without it and `prerequisiteGaps` would read `undefined`. Without the cast that
  // day is a compile error on a file CI typechecks.
}

/**
 * Walk the stages in order and stop where the evidence runs out.
 *
 * Returns the last stage with no blocking gaps, and the rule that stopped the next one. Driven
 * by the shipped predicate, so if evidence measurement improves this answer improves with it
 * and nothing here needs editing.
 */
export function highestJustifiableStage(
  evidence: LifecycleEvidence,
): { stage: LifecycleStage | null; stoppedBy: string } {
  // STARTS AT NULL, not at stage zero. The first version seeded `reached` with
  // `LIFECYCLE_STAGES[0]` before checking anything, so it could never answer "no stage is
  // justified" -- it returned `discovery` while its own `stoppedBy` said
  // `discovery:no_tenant:unmet`. A record that contradicts itself is worse than one that
  // declines to answer.
  let reached: LifecycleStage | null = null;
  for (const stage of LIFECYCLE_STAGES) {
    const blocking = blockingGaps(prerequisiteGaps(stage, evidence));
    if (blocking.length) {
      return { stage: reached, stoppedBy: `${stage}:${blocking[0].rule}:${blocking[0].kind}` };
    }
    reached = stage;
  }
  return { stage: reached, stoppedBy: 'none' };
}

/**
 * Every project with no lifecycle row, with what it has counted rather than sampled.
 *
 * ENUMERATED, which the acceptance requires: the query returns rows, not a count, and the
 * per-project counts come from one grouped pass rather than N queries, so the report is
 * complete and cheap at the same time.
 *
 * `before` defaults to the student registration cutoff, so the default report is the LEGACY
 * cohort -- projects that predate the hook. Projects created AFTER it with no lifecycle row are
 * a different problem (a bypass) and `unregisteredStudentProjectsSince` already reports those.
 */
export async function assessLegacyProjects(
  before: Date = STUDENT_REGISTRATION_LIVE_SINCE,
): Promise<LegacyProjectAssessment[]> {
  const rows = await sequelize.query<{
    id: string; tenant_id: string | null; created_at: Date;
    intake: string; published_plans: string; draft_plans: string; tasks: string;
  }>(
    `SELECT p.id, p.tenant_id, p.created_at,
            (SELECT count(*) FROM build_intake bi WHERE bi.project_id = p.id)::text  AS intake,
            (SELECT count(*) FROM build_plans bp
              WHERE bp.project_id = p.id AND bp.status = 'published')::text          AS published_plans,
            (SELECT count(*) FROM build_plans bp
              WHERE bp.project_id = p.id AND bp.status = 'draft')::text              AS draft_plans,
            (SELECT count(*) FROM student_tasks st WHERE st.project_id = p.id)::text AS tasks
       FROM projects p
       LEFT JOIN project_lifecycle_states pls ON pls.student_project_id = p.id
      WHERE pls.id IS NULL AND p.created_at < $1
      ORDER BY p.created_at`,
    { bind: [before], type: QueryTypes.SELECT },
  );

  return rows.map((r) => {
    const { stage, stoppedBy } = highestJustifiableStage(evidenceForLegacy(r.tenant_id));
    return {
      projectId: r.id,
      tenantId: r.tenant_id,
      createdAt: r.created_at,
      hasLifecycleRow: false,
      counts: {
        intake: Number(r.intake) > 0,
        publishedPlans: Number(r.published_plans),
        draftPlans: Number(r.draft_plans),
        tasks: Number(r.tasks),
      },
      highestJustifiableStage: stage,
      stoppedBy,
    };
  });
}

export interface MigrationProposal {
  projectId: string;
  create: 'lifecycle_row';
  stage: LifecycleStage;
  /** Why it stops there, in the product's own rule vocabulary. */
  stoppedBy: string;
}

export interface MigrationPreview {
  assessed: number;
  proposals: MigrationProposal[];
  /**
   * Projects that cannot be migrated at all, with the blocking rule named.
   *
   * A separate bucket rather than a refusal in `refused`, because the two are different kinds of
   * "no": `refused` is about evidence a migration must never INVENT, this is about a project that
   * cannot be given even the one thing a migration may create.
   */
  cannotMigrate: Array<{ projectId: string; why: string }>;
  /** Named refusals, so the report says what it will NOT do as loudly as what it will. */
  refused: Array<{ kind: string; why: string }>;
  /** Preserved untouched: counted so a reviewer can see nothing is being discarded. */
  preserves: { publishedPlans: number; draftPlans: number; tasks: number; intakes: number };
}

/**
 * What a migration would do. PURE: no database handle, no writes, no side effects.
 *
 * Takes assessments rather than reading them itself, which is what makes "writes nothing"
 * checkable by reading the signature instead of trusting the body.
 */
export function previewLegacyMigration(
  assessments: ReadonlyArray<LegacyProjectAssessment>,
): MigrationPreview {
  // The refusal runs for real, on every preview, rather than being documented. If `FABRICABLE`
  // ever grows something it should not, this is where it surfaces.
  assertNoFabrication('lifecycle_row');

  const refused = Object.entries(NEVER_FABRICABLE).map(([kind, why]) => ({ kind, why }));

  // Split before proposing anything: a project with no justifiable stage cannot be given a
  // lifecycle row, because `project_lifecycle_states.tenant_id` is NOT NULL and the registration
  // hook has already declined to write it.
  // A TYPE PREDICATE, not a plain filter, so the narrowing below is the COMPILER's
  // guarantee rather than a cast trusting this line. The first version used a plain filter
  // plus `as LifecycleStage` three lines down -- the same "redundant in the dangerous
  // direction" hazard that was accepted and removed for `as LifecycleEvidence` in the very
  // same commit. Change the filter now and the compiler objects; with the cast it would not.
  const migratable = assessments.filter(
    (a): a is LegacyProjectAssessment & { highestJustifiableStage: LifecycleStage } =>
      a.highestJustifiableStage !== null,
  );
  const cannotMigrate = assessments
    .filter((a) => a.highestJustifiableStage === null)
    .map((a) => ({ projectId: a.projectId, why: a.stoppedBy }));

  return {
    assessed: assessments.length,
    proposals: migratable.map((a) => ({
      projectId: a.projectId,
      create: 'lifecycle_row' as const,
      stage: a.highestJustifiableStage,
      stoppedBy: a.stoppedBy,
    })),
    cannotMigrate,
    refused,
    preserves: {
      publishedPlans: assessments.reduce((n, a) => n + a.counts.publishedPlans, 0),
      draftPlans: assessments.reduce((n, a) => n + a.counts.draftPlans, 0),
      tasks: assessments.reduce((n, a) => n + a.counts.tasks, 0),
      intakes: assessments.filter((a) => a.counts.intake).length,
    },
  };
}
