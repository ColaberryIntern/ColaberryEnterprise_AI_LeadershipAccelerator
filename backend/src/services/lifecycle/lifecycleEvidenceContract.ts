/**
 * The evidence contract: what the coordinator must know to evaluate any stage.
 *
 * WHY THIS IS ITS OWN MODULE. `lifecyclePrerequisites.ts` reached 486 lines and P6-T5's
 * `launch_ready` rule would have pushed it past CLAUDE.md's 500-line hard ceiling. The rule there
 * is that the next change to such a file splits it BEFORE adding — and this contract is the
 * natural seam rather than an arbitrary cut: `lifecycleEvidence.ts` PRODUCES it and
 * `lifecyclePrerequisites.ts` CONSUMES it, so it is exactly the "missing third module C that both
 * depend on" that CLAUDE.md names when it forbids circular dependencies.
 *
 * Both types are RE-EXPORTED from `lifecyclePrerequisites.ts`, so all 21 existing consumers keep
 * their import path. A split that forced 21 files to change would be a worse change than the one
 * it replaced.
 */
import type { PrerequisiteGap } from './lifecyclePrerequisites';

/** Re-exported for the gap shape these fields are evaluated into. */
export type { PrerequisiteGap };

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
  /**
   * Releases whose every workspace-referencing story is headless, so the release
   * demonstrates nothing a human can see. Unassessable releases are ABSENT from this list
   * rather than present-and-passing — see `storyTraceability`.
   */
  releasesWithoutUserVisibleWorkflow: ReadonlyArray<string>;

  // launch_ready
  /**
   * Whether the project has EXACTLY ONE published plan.
   *
   * `false` means zero or several. Both are failures and both were reachable before P6-T5:
   * `publishPlan` ran its publish and supersede as two autocommitting statements, and the
   * interleaving left two published rows transiently and ZERO durably. Zero is the worse one,
   * because every reader treats absence as "not published yet".
   */
  publishedPlanIsSingular: boolean;
  /**
   * Whether the published plan's stored hash still matches its stored content.
   *
   * This is the launch-readiness property: a plan whose `plan_json` was edited after publish
   * carries a `plan_sha256` that no longer describes it, so "the plan a human reviewed is the
   * plan that shipped" stops being true of the row. `expectedSha` protects that invariant when
   * the row is WRITTEN; this checks it when the row is READ, which is the only way to notice a
   * `plan_json` edited afterwards.
   */
  publishedPlanHashIntact: boolean;

  /**
   * WHICH OF THE FIELDS ABOVE WERE ACTUALLY MEASURED. Anything absent is NOT ASSESSED, and
   * **its value above is meaningless** — do not read a field without checking this first.
   *
   * This exists because the header comment on this interface promised that unknown is
   * represented explicitly, "because a zero would read as a measured value", and then
   * `gatherEvidence` returned `false` for `graphHasStart`, `graphHasEnd` and
   * `effortCoverageDisclosed` and `[]` for every array. Three of those are the strongest
   * possible claim — "somebody checked and the graph has no start node" — about a graph nobody
   * had looked at. A surface rendering live blockers would have shown permanent fabricated
   * ones.
   *
   * A SET, not twenty `| null` widenings, because `selectedDesignRef`, `manifestContentHash`,
   * `proposedBy` and `approval` are already nullable and null there means something specific
   * ("not selected", "no approval"). Widening could not separate those from "not assessed".
   * It is also readable at runtime, which a TypeScript type is not.
   */
  assessedFields: ReadonlySet<EvidenceField>;
}

/** Every measurable field. Excludes `tenantId` (always known) and the set itself. */
export type EvidenceField = Exclude<keyof LifecycleEvidence, 'tenantId' | 'assessedFields'>;
