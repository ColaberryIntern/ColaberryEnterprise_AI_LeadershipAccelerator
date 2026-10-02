/**
 * Typed prerequisites for every lifecycle stage.
 *
 * A prerequisite returns STRUCTURED GAPS, never a bare boolean. The reason is the product: a
 * project page has to say *what is missing and who has to do it*, and "not ready" is useless to
 * the person who has to act. This is also what lets a transition be refused with a 422 that
 * lists the gaps rather than a flat "forbidden".
 *
 * NO I/O. These are pure functions over a `LifecycleEvidence` snapshot that the caller gathers.
 * Two reasons: they stay in the CI gate, which has no `DATABASE_URL` and therefore cannot run
 * anything that touches Sequelize; and the evidence shape becomes the explicit contract between
 * the coordinator and the Factory/SBP adapters, rather than an implicit set of queries smeared
 * across the predicates.
 *
 * ON REUSING THE GATE VOCABULARY. The `{ rule, message, subject? }` shape and the
 * blocking-vs-advisory split are deliberately the same as `services/sbp/planGate.ts`'s
 * `GateViolation` — that distinction already earns its keep there, and a second vocabulary for
 * the same idea would be a tax on everyone reading both. But `GateRule` itself is NOT imported:
 * its values are SBP plan rules (`must_uncovered`, `dangling_release`, …) and importing them
 * would couple the lifecycle coordinator to SBP's plan model, which is exactly the
 * cross-contamination the coordinator-over-engines decision exists to prevent.
 *
 * Decision record: docs/project-lifecycle/architecture.md §3.
 */
import { LIFECYCLE_STAGES, type LifecycleStage } from './lifecycleStages';

/** Stable machine-readable classes, so a caller can route a fix rather than re-parse prose. */
export type PrerequisiteRule =
  | 'no_tenant'
  | 'no_requirements'
  | 'requirement_without_provenance'
  | 'source_block_uncited'
  | 'source_block_unresolved'
  | 'process_without_tasks'
  | 'graph_no_start'
  | 'graph_no_end'
  | 'task_unreachable'
  | 'rework_unbounded'
  | 'task_without_execution_class'
  | 'task_without_accountable_human'
  | 'agent_accountable_for_itself'
  | 'task_unmapped_to_surface'
  | 'screen_without_rationale'
  | 'design_variant_not_selected'
  | 'manifest_hash_missing'
  | 'allocation_unknown'
  | 'effort_coverage_undisclosed'
  | 'proposer_unrecorded'
  | 'approval_missing'
  | 'approval_superseded'
  | 'approval_self_approved'
  | 'approval_revision_moved'
  | 'authority_revoked'
  | 'requirement_uncovered_by_story'
  | 'story_without_traceability';

export interface PrerequisiteGap {
  /** Stable class. */
  rule: PrerequisiteRule;
  /** Human-readable, names the offending id where there is one. */
  message: string;
  /** The requirement, task, screen or story this concerns. */
  subject?: string;
}

/**
 * Gaps that mean the stage genuinely cannot be entered, as opposed to ones worth surfacing.
 *
 * Everything that would let unapproved or unaccountable work reach an authorized plan is
 * blocking. The advisory set is deliberately small: a prerequisite that can be waived is barely
 * a prerequisite, and the gate only means something if the blocking list is the common case.
 */
const ADVISORY_RULES: ReadonlySet<PrerequisiteRule> = new Set<PrerequisiteRule>([
  'screen_without_rationale',
]);

export function blockingGaps(gaps: ReadonlyArray<PrerequisiteGap>): PrerequisiteGap[] {
  return gaps.filter((g) => !ADVISORY_RULES.has(g.rule));
}

export function advisoryGaps(gaps: ReadonlyArray<PrerequisiteGap>): PrerequisiteGap[] {
  return gaps.filter((g) => ADVISORY_RULES.has(g.rule));
}

/** A stage may be entered when nothing blocking remains. Advisories ride along. */
export function satisfied(gaps: ReadonlyArray<PrerequisiteGap>): boolean {
  return blockingGaps(gaps).length === 0;
}

/**
 * What the coordinator must know to evaluate any stage.
 *
 * Counts and id lists rather than whole domain objects, so the adapters decide what a
 * "requirement" is in their own model and the coordinator stays ignorant of both. Unknown is
 * represented explicitly — `null` for "not assessed" — because a zero would read as a measured
 * value, and this system's whole posture is that "don't know" is a value, not a guess.
 */
export interface LifecycleEvidence {
  tenantId: string | null;

  // requirements_ready
  requirementCount: number;
  requirementsWithoutProvenance: ReadonlyArray<string>;
  uncitedRequirementSourceBlocks: ReadonlyArray<string>;
  unresolvedSourceBlocks: ReadonlyArray<string>;

  // process_ready
  processesWithoutTasks: ReadonlyArray<string>;
  graphHasStart: boolean;
  graphHasEnd: boolean;
  unreachableTasks: ReadonlyArray<string>;
  unboundedReworkLoops: ReadonlyArray<string>;

  // allocation_ready
  tasksWithoutExecutionClass: ReadonlyArray<string>;
  tasksWithoutAccountableHuman: ReadonlyArray<string>;
  agentTasksAccountableForThemselves: ReadonlyArray<string>;

  // design_ready
  tasksUnmappedToSurface: ReadonlyArray<string>;
  screensWithoutRationale: ReadonlyArray<string>;
  selectedDesignRef: string | null;

  // awaiting_blueprint_approval
  manifestContentHash: string | null;
  unknownAllocationCount: number;
  effortCoverageDisclosed: boolean;
  proposedBy: string | null;

  // blueprint_approved
  approval: {
    approvedBy: string;
    approvedByRole: string | null;
    revision: number;
    contentSha256: string;
    superseded: boolean;
  } | null;
  currentManifestRevision: number | null;
  actorStillAuthorized: boolean;

  // plan_ready
  mustHaveRequirementsWithoutStory: ReadonlyArray<string>;
  storiesWithoutTraceability: ReadonlyArray<string>;
}

type Predicate = (e: LifecycleEvidence) => PrerequisiteGap[];

/** Helper: one gap per offending id, so the caller can list them. */
function each(ids: ReadonlyArray<string>, rule: PrerequisiteRule, msg: (id: string) => string): PrerequisiteGap[] {
  return ids.map((id) => ({ rule, message: msg(id), subject: id }));
}

const PREREQUISITES: Readonly<Record<LifecycleStage, Predicate>> = {
  discovery: (e) =>
    e.tenantId ? [] : [{ rule: 'no_tenant', message: 'Project is not registered against a tenant.' }],

  requirements_ready: (e) => [
    ...(e.requirementCount > 0
      ? []
      : [{ rule: 'no_requirements' as PrerequisiteRule, message: 'No requirements have been captured.' }]),
    ...each(e.requirementsWithoutProvenance, 'requirement_without_provenance',
      (id) => `Requirement ${id} has no recorded provenance.`),
    ...each(e.uncitedRequirementSourceBlocks, 'source_block_uncited',
      (id) => `Source block ${id} is a requirement but no task cites it.`),
    ...each(e.unresolvedSourceBlocks, 'source_block_unresolved',
      (id) => `Source block ${id} is still unresolved.`),
  ],

  process_ready: (e) => [
    ...each(e.processesWithoutTasks, 'process_without_tasks', (id) => `Process ${id} has no tasks.`),
    ...(e.graphHasStart ? [] : [{ rule: 'graph_no_start' as PrerequisiteRule, message: 'The transition graph has no reachable start.' }]),
    ...(e.graphHasEnd ? [] : [{ rule: 'graph_no_end' as PrerequisiteRule, message: 'The transition graph has no terminal state.' }]),
    ...each(e.unreachableTasks, 'task_unreachable', (id) => `Task ${id} is unreachable from the start.`),
    ...each(e.unboundedReworkLoops, 'rework_unbounded', (id) => `Rework loop ${id} has no bound.`),
  ],

  allocation_ready: (e) => [
    ...each(e.tasksWithoutExecutionClass, 'task_without_execution_class',
      (id) => `Task ${id} has no execution class.`),
    ...each(e.tasksWithoutAccountableHuman, 'task_without_accountable_human',
      (id) => `Task ${id} has no resolvable accountable human role.`),
    ...each(e.agentTasksAccountableForThemselves, 'agent_accountable_for_itself',
      (id) => `Task ${id} has an agent accountable for its own work.`),
  ],

  design_ready: (e) => [
    ...each(e.tasksUnmappedToSurface, 'task_unmapped_to_surface',
      (id) => `Task ${id} maps to no workspace action and is not marked headless.`),
    ...each(e.screensWithoutRationale, 'screen_without_rationale',
      (id) => `Proposed screen ${id} carries no rationale for why an existing workspace cannot serve it.`),
    ...(e.selectedDesignRef
      ? []
      : [{ rule: 'design_variant_not_selected' as PrerequisiteRule, message: 'No design variant has been selected.' }]),
  ],

  awaiting_blueprint_approval: (e) => [
    ...(e.manifestContentHash
      ? []
      : [{ rule: 'manifest_hash_missing' as PrerequisiteRule, message: 'The manifest has no content hash.' }]),
    ...(e.unknownAllocationCount === 0
      ? []
      : [{ rule: 'allocation_unknown' as PrerequisiteRule, message: `${e.unknownAllocationCount} task(s) still have unknown allocation.` }]),
    ...(e.effortCoverageDisclosed
      ? []
      : [{ rule: 'effort_coverage_undisclosed' as PrerequisiteRule, message: 'Effort percentages are not accompanied by their assessed coverage.' }]),
    ...(e.proposedBy
      ? []
      : [{ rule: 'proposer_unrecorded' as PrerequisiteRule, message: 'No proposer is recorded, so separation of duty cannot be enforced.' }]),
  ],

  blueprint_approved: (e) => {
    if (!e.approval) {
      return [{ rule: 'approval_missing', message: 'The blueprint has no approval record.' }];
    }
    const gaps: PrerequisiteGap[] = [];
    if (e.approval.superseded) {
      gaps.push({ rule: 'approval_superseded', message: 'The approved revision has been superseded.' });
    }
    // Separation of duty. A null proposer does NOT pass: that is the ceremonial loophole this
    // whole column exists to close, and it is why `proposer_unrecorded` blocks the stage before.
    if (!e.proposedBy || e.proposedBy === e.approval.approvedBy) {
      gaps.push({
        rule: 'approval_self_approved',
        message: e.proposedBy
          ? `Approver ${e.approval.approvedBy} is also the proposer.`
          : 'No proposer recorded, so the approver cannot be shown to differ from it.',
      });
    }
    if (e.currentManifestRevision !== null && e.currentManifestRevision !== e.approval.revision) {
      gaps.push({
        rule: 'approval_revision_moved',
        message: `Approval is for revision ${e.approval.revision} but the current revision is ${e.currentManifestRevision}.`,
      });
    }
    return gaps;
  },

  // Time-of-check/time-of-use: the approval AND the actor's authority are re-checked here, not
  // merely once at approval time. Authority can be revoked between the check and the use.
  planning: (e) => [
    ...PREREQUISITES.blueprint_approved(e),
    ...(e.actorStillAuthorized
      ? []
      : [{ rule: 'authority_revoked' as PrerequisiteRule, message: 'The authorizing actor is no longer authorized.' }]),
  ],

  plan_ready: (e) => [
    ...each(e.mustHaveRequirementsWithoutStory, 'requirement_uncovered_by_story',
      (id) => `Must-have requirement ${id} is covered by no story.`),
    ...each(e.storiesWithoutTraceability, 'story_without_traceability',
      (id) => `Story ${id} carries no requirement, business-task or blueprint-revision reference.`),
  ],

  // Re-checked at build handoff, per the four TOCTOU moments in the approval policy.
  building: (e) => PREREQUISITES.planning(e),

  /**
   * EMPTY MEANS 'NOT YET IMPLEMENTED', NOT 'NOTHING IS REQUIRED HERE'.
   *
   * The contract of this map is "unmet prerequisites", so an empty list means none unmet and the
   * stage PASSES. These two therefore permit unconditionally, which is the opposite of every
   * other entry here and must not be mistaken for a decision.
   *
   * The architecture doc specifies what release_review owes: "each release demonstrates a
   * business workflow in the approved workspaces, including its human decision". That cannot be
   * evaluated until a story carries a workspace/action reference, which Phase 6 (P6-T3/T4) adds.
   * Implementing a placeholder rule now would either block every transition or wave every one
   * through, and neither is more honest than saying so here.
   *
   * WHY THIS IS WRITTEN DOWN AT ALL: a peer session traced a real production failure to exactly
   * this gap on 2026-10-02 - a student finished 20 of 20 stories, platform-verified, with twelve
   * of her fourteen services unreachable, because her releases were layered by pipeline stage
   * and no release-level check asked whether r0 reached user-visible output. release_review is
   * the prerequisite that would have caught it. Full record and the constraints it places on
   * Phase 6 (including why a keyword rule cannot do this job, and why any new r0 gate rule must
   * ship ADVISORY so it does not retroactively lock students out via PlanPredatesGate) are in
   * .loop-architect/runs/20261001-unified-project-lifecycle/phase6-design-constraints.md.
   *
   * Nothing routes through the coordinator yet and FLAGS.lifecycleEnforcement defaults off, so
   * the present blast radius is nil. That is why it has not bitten, not that it is safe.
   */
  release_review: () => [],
  launch_ready: () => [],
  // Runtime business actions re-check the approved revision and current authority at execution.
  operating: (e) => PREREQUISITES.planning(e),
};

/**
 * Gaps standing between a project and the given target stage. An empty array means nothing is
 * missing; `satisfied()` is the convenience over the blocking subset.
 */
export function prerequisiteGaps(target: LifecycleStage, evidence: LifecycleEvidence): PrerequisiteGap[] {
  return PREREQUISITES[target](evidence);
}

/** Every stage has a predicate. Asserted by a test so a new stage cannot be added without one. */
export function stagesWithPrerequisites(): ReadonlyArray<LifecycleStage> {
  return LIFECYCLE_STAGES.filter((s) => typeof PREREQUISITES[s] === 'function');
}
