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
  | 'story_without_traceability'
  | 'release_without_user_visible_workflow'
  | 'release_workflow_unassessed'
  | 'publish_not_exactly_one'
  | 'publish_hash_mismatch';

/**
 * WHETHER THE GAP IS A MEASUREMENT OR AN ABSENCE OF ONE.
 *
 * `unmet` means somebody looked and the thing is missing: the graph really has no start node.
 * `not_assessed` means nobody has looked yet. A reviewer takes a different action in each case
 * — fix the graph, versus run the assessment — so collapsing them produces a blocker list that
 * reads as measured fact when it is not.
 *
 * BOTH BLOCK. `not_assessed` is deliberately NOT advisory: an unmeasured prerequisite is not a
 * satisfied one, and making it non-blocking would wave every project through while the evidence
 * gatherer is still stubbed. That is the "stub that waves projects through" the gatherer’s own
 * header forbids, and the first draft of this change did exactly that before an independent
 * plan audit caught it.
 */
export type PrerequisiteGapKind = 'unmet' | 'not_assessed';

export interface PrerequisiteGap {
  /** Stable class. */
  rule: PrerequisiteRule;
  /**
   * Measured-and-missing, or never measured. REQUIRED rather than defaulted: a default lets a
   * newly added gap inherit "measured" without anyone deciding, which is the exact defect this
   * field exists to remove. tsc forces the decision at every construction site.
   */
  kind: PrerequisiteGapKind;
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
/**
 * EXPORTED so a test can assert its contents. It was module-private, and an acceptance criterion
 * that asserts the contents of an unexported const cannot be written — caught in plan audit.
 *
 * Note what is NOT here: `not_assessed` is a gap KIND, not a rule, and no kind is advisory. An
 * unmeasured prerequisite blocks.
 */
export const ADVISORY_RULES: ReadonlySet<PrerequisiteRule> = new Set<PrerequisiteRule>([
  'screen_without_rationale',
  /**
   * ADVISORY ON PURPOSE, and the reason is a student, not a preference.
   *
   * `addStoryService.ts:343` refuses Add-a-Story with `PlanPredatesGate` when the PUBLISHED
   * plan fails the gate. A new BLOCKING release-level rule would therefore lock students out
   * of their own builds for a plan shape that was acceptable when it was generated — through
   * no act of theirs. The gate's own principle: write broken data, block; merely untidy, warn.
   *
   * Promoting this to blocking belongs to Phase 8, AFTER the affected-student count is
   * measured. Until then it rides along in `advisoryGaps` where a reviewer sees it.
   */
  'release_without_user_visible_workflow',
]);

export function blockingGaps(gaps: ReadonlyArray<PrerequisiteGap>): PrerequisiteGap[] {
  return gaps.filter((g) => !ADVISORY_RULES.has(g.rule));
}

/**
 * The subset nobody has measured. For a surface that wants to say "not assessed" differently
 * from "blocked" — which is the whole point of the kind — without re-deriving the split.
 */
export function notAssessedGaps(gaps: ReadonlyArray<PrerequisiteGap>): PrerequisiteGap[] {
  return gaps.filter((g) => g.kind === 'not_assessed');
}

export function advisoryGaps(gaps: ReadonlyArray<PrerequisiteGap>): PrerequisiteGap[] {
  return gaps.filter((g) => ADVISORY_RULES.has(g.rule));
}

/** A stage may be entered when nothing blocking remains. Advisories ride along. */
export function satisfied(gaps: ReadonlyArray<PrerequisiteGap>): boolean {
  return blockingGaps(gaps).length === 0;
}

/**
 * The evidence contract moved to `lifecycleEvidenceContract.ts` (P6-T5, 2026-10-12) to keep this
 * file under CLAUDE.md's 500-line ceiling before `launch_ready` was added. Re-exported here so
 * every existing consumer keeps its import path — 21 files read these two types.
 */
export type { LifecycleEvidence, EvidenceField } from './lifecycleEvidenceContract';
import type { LifecycleEvidence, EvidenceField } from './lifecycleEvidenceContract';


type Predicate = (e: LifecycleEvidence) => PrerequisiteGap[];

/** Helper: one gap per offending id, so the caller can list them. */
function each(ids: ReadonlyArray<string>, rule: PrerequisiteRule, msg: (id: string) => string): PrerequisiteGap[] {
  return ids.map((id) => ({ rule, kind: 'unmet' as const, message: msg(id), subject: id }));
}

/**
 * The gap for a field nobody has measured. BLOCKS, like any other gap — `not_assessed` is not
 * in `ADVISORY_RULES` and no kind is. An unmeasured prerequisite is not a satisfied one.
 */
function unassessed(rule: PrerequisiteRule, what: string): PrerequisiteGap {
  return { rule, kind: 'not_assessed', message: `${what} has not been assessed yet.` };
}

/** A list-valued field: not assessed, or one gap per offending id. */
function listGaps(
  e: LifecycleEvidence,
  field: EvidenceField,
  ids: ReadonlyArray<string>,
  rule: PrerequisiteRule,
  msg: (id: string) => string,
  what: string,
): PrerequisiteGap[] {
  if (!e.assessedFields.has(field)) return [unassessed(rule, what)];
  return each(ids, rule, msg);
}

/** A condition-valued field: not assessed, or satisfied, or the measured failure. */
function condGaps(
  e: LifecycleEvidence,
  field: EvidenceField,
  satisfiedNow: boolean,
  rule: PrerequisiteRule,
  failure: string,
  what: string,
): PrerequisiteGap[] {
  if (!e.assessedFields.has(field)) return [unassessed(rule, what)];
  return satisfiedNow ? [] : [{ rule, kind: 'unmet', message: failure }];
}

const PREREQUISITES: Readonly<Record<LifecycleStage, Predicate>> = {
  // `tenantId` comes off the row itself and is always known, so it needs no assessment check.
  discovery: (e) =>
    e.tenantId ? [] : [{ rule: 'no_tenant', kind: 'unmet', message: 'Project is not registered against a tenant.' }],

  requirements_ready: (e) => [
    ...condGaps(e, 'requirementCount', e.requirementCount > 0, 'no_requirements',
      'No requirements have been captured.', 'Requirement capture'),
    ...listGaps(e, 'requirementsWithoutProvenance', e.requirementsWithoutProvenance,
      'requirement_without_provenance', (id) => `Requirement ${id} has no recorded provenance.`,
      'Requirement provenance'),
    ...listGaps(e, 'uncitedRequirementSourceBlocks', e.uncitedRequirementSourceBlocks,
      'source_block_uncited', (id) => `Source block ${id} is a requirement but no task cites it.`,
      'Source-block citation'),
    ...listGaps(e, 'unresolvedSourceBlocks', e.unresolvedSourceBlocks, 'source_block_unresolved',
      (id) => `Source block ${id} is still unresolved.`, 'Source-block resolution'),
  ],

  // `graphHasStart` and `graphHasEnd` were two of the three fields the stub returned as a hard
  // `false`. "The transition graph has no reachable start" is the strongest claim this file can
  // make, and it was being made about graphs nobody had read.
  process_ready: (e) => [
    ...listGaps(e, 'processesWithoutTasks', e.processesWithoutTasks, 'process_without_tasks',
      (id) => `Process ${id} has no tasks.`, 'Process task coverage'),
    ...condGaps(e, 'graphHasStart', e.graphHasStart, 'graph_no_start',
      'The transition graph has no reachable start.', 'The transition graph\u2019s start'),
    ...condGaps(e, 'graphHasEnd', e.graphHasEnd, 'graph_no_end',
      'The transition graph has no terminal state.', 'The transition graph\u2019s terminal state'),
    ...listGaps(e, 'unreachableTasks', e.unreachableTasks, 'task_unreachable',
      (id) => `Task ${id} is unreachable from the start.`, 'Task reachability'),
    ...listGaps(e, 'unboundedReworkLoops', e.unboundedReworkLoops, 'rework_unbounded',
      (id) => `Rework loop ${id} has no bound.`, 'Rework-loop bounds'),
  ],

  // This stage and `plan_ready` emitted ZERO gaps under the stub, because every field they read
  // is a list and the stub returned `[]` for all of them. They permitted unconditionally.
  allocation_ready: (e) => [
    ...listGaps(e, 'tasksWithoutExecutionClass', e.tasksWithoutExecutionClass,
      'task_without_execution_class', (id) => `Task ${id} has no execution class.`,
      'Task execution classes'),
    ...listGaps(e, 'tasksWithoutAccountableHuman', e.tasksWithoutAccountableHuman,
      'task_without_accountable_human',
      (id) => `Task ${id} has no resolvable accountable human role.`,
      'Accountable humans per task'),
    ...listGaps(e, 'agentTasksAccountableForThemselves', e.agentTasksAccountableForThemselves,
      'agent_accountable_for_itself',
      (id) => `Task ${id} has an agent accountable for its own work.`,
      'Agent self-accountability'),
  ],

  // `selectedDesignRef` is why this had to be a SET and not a `| null` widening: the field was
  // already nullable, and null means "no variant selected". That is a different fact from "no
  // one has looked at the design yet" and a widened type cannot tell them apart.
  design_ready: (e) => [
    ...listGaps(e, 'tasksUnmappedToSurface', e.tasksUnmappedToSurface, 'task_unmapped_to_surface',
      (id) => `Task ${id} maps to no workspace action and is not marked headless.`,
      'Task-to-surface mapping'),
    ...listGaps(e, 'screensWithoutRationale', e.screensWithoutRationale, 'screen_without_rationale',
      (id) => `Proposed screen ${id} carries no rationale for why an existing workspace cannot serve it.`,
      'Proposed-screen rationale'),
    ...condGaps(e, 'selectedDesignRef', Boolean(e.selectedDesignRef), 'design_variant_not_selected',
      'No design variant has been selected.', 'Design-variant selection'),
  ],

  // `effortCoverageDisclosed` was the third hard-`false` field in the stub.
  awaiting_blueprint_approval: (e) => [
    ...condGaps(e, 'manifestContentHash', Boolean(e.manifestContentHash), 'manifest_hash_missing',
      'The manifest has no content hash.', 'The manifest content hash'),
    ...condGaps(e, 'unknownAllocationCount', e.unknownAllocationCount === 0, 'allocation_unknown',
      `${e.unknownAllocationCount} task(s) still have unknown allocation.`,
      'Unknown-allocation count'),
    ...condGaps(e, 'effortCoverageDisclosed', e.effortCoverageDisclosed,
      'effort_coverage_undisclosed',
      'Effort percentages are not accompanied by their assessed coverage.',
      'Effort-coverage disclosure'),
    ...condGaps(e, 'proposedBy', Boolean(e.proposedBy), 'proposer_unrecorded',
      'No proposer is recorded, so separation of duty cannot be enforced.', 'The recorded proposer'),
  ],

  blueprint_approved: (e) => {
    if (!e.assessedFields.has('approval')) {
      return [unassessed('approval_missing', 'The approval record')];
    }
    if (!e.approval) {
      return [{ rule: 'approval_missing', kind: 'unmet', message: 'The blueprint has no approval record.' }];
    }
    const gaps: PrerequisiteGap[] = [];
    if (e.approval.superseded) {
      gaps.push({ rule: 'approval_superseded', kind: 'unmet', message: 'The approved revision has been superseded.' });
    }

    // EVERY further field read here is guarded. An earlier version of this predicate read
    // `proposedBy` and `currentManifestRevision` raw, while the commit claimed all thirteen
    // predicates consulted `assessedFields` — a verifier probed it and found both a permitted
    // stage and a fabricated refusal. The `approval` early-return above hid it from today’s
    // reader, which populates nothing; it becomes reachable as soon as fields are added.

    // Separation of duty. A null proposer does NOT pass: that is the ceremonial loophole this
    // whole column exists to close, and it is why `proposer_unrecorded` blocks the stage before.
    // But UNMEASURED is not the same as null. Claiming 'no proposer recorded' about a field
    // nobody read is the same fabrication as asserting a graph has no start node unread.
    if (!e.assessedFields.has('proposedBy')) {
      gaps.push(unassessed('approval_self_approved', 'The recorded proposer'));
    } else if (!e.proposedBy || e.proposedBy === e.approval.approvedBy) {
      gaps.push({
        rule: 'approval_self_approved',
        kind: 'unmet',
        message: e.proposedBy
          ? `Approver ${e.approval.approvedBy} is also the proposer.`
          : 'No proposer recorded, so the approver cannot be shown to differ from it.',
      });
    }

    // This one PERMITTED the stage when unassessed, which is the worse direction: the
    // placeholder is null, `null !== null` is false, so the comparison was skipped and the
    // stale-revision refusal silently vanished. That refusal is what LC-11 rests on.
    if (!e.assessedFields.has('currentManifestRevision')) {
      gaps.push(unassessed('approval_revision_moved', 'The current manifest revision'));
    } else if (e.currentManifestRevision !== null && e.currentManifestRevision !== e.approval.revision) {
      gaps.push({
        rule: 'approval_revision_moved',
        kind: 'unmet',
        message: `Approval is for revision ${e.approval.revision} but the current revision is ${e.currentManifestRevision}.`,
      });
    }
    return gaps;
  },

  // Time-of-check/time-of-use: the approval AND the actor's authority are re-checked here, not
  // merely once at approval time. Authority can be revoked between the check and the use.
  planning: (e) => [
    ...PREREQUISITES.blueprint_approved(e),
    ...condGaps(e, 'actorStillAuthorized', e.actorStillAuthorized, 'authority_revoked',
      'The authorizing actor is no longer authorized.', 'The authorizing actor\u2019s current authority'),
  ],

  plan_ready: (e) => [
    ...listGaps(e, 'mustHaveRequirementsWithoutStory', e.mustHaveRequirementsWithoutStory,
      'requirement_uncovered_by_story',
      (id) => `Must-have requirement ${id} is covered by no story.`,
      'Story coverage of must-have requirements'),
    ...listGaps(e, 'storiesWithoutTraceability', e.storiesWithoutTraceability,
      'story_without_traceability',
      (id) => `Story ${id} carries no requirement, business-task or blueprint-revision reference.`,
      'Story traceability'),
  ],

  // Re-checked at build handoff, per the four TOCTOU moments in the approval policy.
  building: (e) => PREREQUISITES.planning(e),

  /**
   * IMPLEMENTED 2026-10-09 (P6-T4). `release_review` no longer permits unconditionally.
   *
   * The blocker this note used to describe is gone: the architecture doc requires that "each
   * release demonstrates a business workflow in the approved workspaces, including its human
   * decision", which could not be evaluated until a story carried a workspace/action reference —
   * and P6-T3 added `StoryReferences.workspace`. The rule reads that declared field, never a
   * keyword over story text.
   *
   * IT IS ADVISORY, registered in `ADVISORY_RULES` above with the reason: a blocking release-level
   * rule would retroactively refuse Add-a-Story via `PlanPredatesGate` for students whose
   * published plans predate the field.
   *
   * AND IT REPORTS `not_assessed` RATHER THAN PASSING when nothing declares a workspace, which is
   * every legacy plan. `storyTraceability.releasesWithoutUserVisibleWorkflow` returns `null` in
   * that case, the gatherer turns `null` into `NOT_MEASURED`, and `listGaps` emits the
   * `not_assessed` gap. Absence is not a finding in either direction.
   *
   * `launch_ready` below is still `() => []` and still means NOT YET IMPLEMENTED rather than
   * nothing-is-required. It is P6-T5's, because what makes a project launch-ready is that
   * publication cannot have happened against a stale revision — T5's property, and T5's signal.
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
  release_review: (e) => (
    // TWO RULE CLASSES, NOT ONE, and the split is the whole honesty of this rule.
    //
    // The MEASURED failure is advisory, because a blocking release-level rule would
    // retroactively refuse Add-a-Story via PlanPredatesGate for students whose published plans
    // predate the workspace field. Phase 8 promotes it, after the affected count is measured.
    //
    // But NOT-MEASURED MUST BLOCK, because this file's own doctrine says so: "an unmeasured
    // prerequisite is not a satisfied one". Emitting the advisory rule for the unassessed case
    // too would mean a stub PERMITS release_review while reporting a waivable note — which is
    // the "stub that waves projects through" the evidence gatherer's header forbids, and it is
    // what the first draft of this rule did. A single `listGaps` call cannot express the
    // difference, because it emits one rule for both branches.
    !e.assessedFields.has('releasesWithoutUserVisibleWorkflow')
      ? [unassessed('release_workflow_unassessed',
        'Release demonstrates a business workflow in an approved workspace')]
      : each(e.releasesWithoutUserVisibleWorkflow, 'release_without_user_visible_workflow',
        (key) => `Release ${key} demonstrates no user-visible workflow: every story in it `
          + 'that declares a workspace declares a headless one.')
  ),
  /**
   * IMPLEMENTED 2026-10-12 (P6-T5). `launch_ready` no longer permits unconditionally.
   *
   * What makes a project launch-ready is T5's property: publication cannot have happened
   * against a stale revision. Two things are measurable about a published row, and both were
   * REACHABLE failures before T5 closed the write path:
   *
   *   - exactly one plan is published. Zero or several both mean a publish interleaved with
   *     another, and zero reads as "never published" to every consumer.
   *   - the published plan's stored hash still describes its stored content. `expectedSha`
   *     protects that invariant when the row is WRITTEN; this checks it when the row is READ,
   *     which is the only way to notice a `plan_json` edited afterwards.
   *
   * BLOCKING, not advisory, and the contrast with `release_review` is deliberate rather than
   * inconsistent. That rule is advisory because a blocking release-SHAPE rule would
   * retroactively refuse students whose published plans predate the workspace field. These two
   * carry no such retroactivity: a project with zero published plans, or a stored hash that
   * does not match its own stored content, is broken NOW and was broken under the old code too.
   * Refusing to call it launch-ready is the correct answer, not a new burden.
   *
   * Unmeasurable for a delivery project, which has no `build_plans` row at all: the gatherer
   * returns NOT_MEASURED and the stage blocks on `not_assessed` rather than passing.
   */
  launch_ready: (e) => [
    ...condGaps(e, 'publishedPlanIsSingular', e.publishedPlanIsSingular,
      'publish_not_exactly_one',
      'This project does not have exactly one published plan: zero or several are published, '
      + 'which means one publish interleaved with another.',
      'Exactly one published plan'),
    ...condGaps(e, 'publishedPlanHashIntact', e.publishedPlanHashIntact,
      'publish_hash_mismatch',
      'The published plan’s stored hash no longer matches its stored content, so the plan '
      + 'that shipped is not the plan that was reviewed.',
      'Published-plan integrity'),
  ],
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

