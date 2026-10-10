/**
 * Two-way traceability between requirements, stories and the releases that demonstrate them.
 *
 * PURE. Every function here takes plain arrays and returns id lists. No I/O, no clock, no model
 * call — so each one is driven directly in tests rather than through a database, and the evidence
 * gatherer stays the only place that knows how to read a plan.
 *
 * ## The structural types, and why this file does not import from `services/sbp`
 *
 * `services/lifecycle/adapters/` exists so the lifecycle never depends on SBP's internals: each
 * adapter declares the shape it needs and SBP's real types satisfy it structurally. This follows
 * that, which is also why `StoryLike.references` is declared loosely here — the lifecycle cares
 * that a story cites *something*, not what `StoryReferences` happens to look like this week.
 *
 * ## ABSENCE IS NOT A FINDING
 *
 * The hard rule in this file, and the reason it returns `null` in places rather than `[]`.
 *
 * Every plan generated before 2026-10-09 has no `references` at all, and so does any plan whose
 * project has no approved blueprint. A release whose stories carry no references has not FAILED
 * the user-visible-workflow check — nobody has looked. `null` means "not assessable", and the
 * evidence gatherer turns that into `NOT_MEASURED`, which leaves the prerequisite field unassessed
 * and the stage blocked on `not_assessed` rather than passed. Returning `[]` instead would report
 * "measured, no gaps" for data nobody measured, which is the gate bypass
 * `lifecycleEvidence.applyMeasurements` was rewritten to prevent.
 */

/** What this module needs off a story. SBP's `PlanStory` satisfies it structurally. */
export interface StoryLike {
  id: string;
  /** The release key this story belongs to. */
  release?: string | null;
  /** Requirement ids this story fulfils. */
  fulfills?: ReadonlyArray<string> | null;
  /**
   * Lifecycle references, when they have been resolved. Deliberately loose: this module asks
   * whether a story cites anything, not what the reference block's full shape is.
   */
  references?: {
    business_task_ids?: ReadonlyArray<string> | null;
    blueprint?: { revision?: number | null } | null;
    workspace?: { kind?: string | null; ref?: string | null } | null;
  } | null;
}

/**
 * Requirements that need a story and have none.
 *
 * Takes the ids that NEED coverage rather than deciding which do: that judgement is
 * `planContract.requiresStoryCoverage` (must-have, and not a CONSTRAINT), mirrored by
 * `adapters/sbpAdapter.requirementsNeedingCoverage`. Duplicating it here would be a second place
 * to get it wrong — and it has been wrong once already: that adapter function claimed to mirror
 * the predicate while omitting the priority half of it.
 */
export function requirementsWithoutStory(
  requirementIdsNeedingCoverage: ReadonlyArray<string>,
  stories: ReadonlyArray<StoryLike>,
): string[] {
  const covered = new Set<string>();
  for (const s of stories) for (const id of s.fulfills ?? []) covered.add(id);
  return requirementIdsNeedingCoverage.filter((id) => !covered.has(id));
}

/**
 * Stories citing nothing at all.
 *
 * The three citations that count are the three the prerequisite message already names: a
 * requirement, a business task, or a blueprint revision. A story with any one of them is traceable
 * to something a reviewer can follow; a story with none of the three is a work item nobody can
 * connect to the plan that authorized it.
 *
 * This is assessable on EVERY plan, including legacy ones, because `fulfills` has always existed.
 * So it returns a list rather than `null`: a pre-references plan whose stories all carry
 * requirements is genuinely traceable, and reporting it as unassessable would block every legacy
 * project for a gap it does not have.
 */
export function storiesWithoutTraceability(stories: ReadonlyArray<StoryLike>): string[] {
  return stories.filter((s) => {
    const hasRequirement = (s.fulfills ?? []).length > 0;
    const hasBusinessTask = (s.references?.business_task_ids ?? []).length > 0;
    // A revision of 0 is not a revision; revisions start at 1. `!= null` alone would accept it.
    const rev = s.references?.blueprint?.revision;
    const hasBlueprint = typeof rev === 'number' && rev > 0;
    return !hasRequirement && !hasBusinessTask && !hasBlueprint;
  }).map((s) => s.id);
}

/**
 * Releases that demonstrate no workflow a human can see.
 *
 * ## The failure this exists for, which is not hypothetical
 *
 * `lifecyclePrerequisites`' own note records it: a student finished 20 of 20 stories,
 * platform-verified, with twelve of her fourteen services unreachable, because her releases were
 * layered by pipeline stage and no release-level check asked whether r0 reached user-visible
 * output. The architecture doc's requirement is that "each release demonstrates a business
 * workflow in the approved workspaces, including its human decision".
 *
 * ## Why a declared field and not a keyword rule
 *
 * `planGate.ts`'s `r0_no_trust_spine` is the standing in-repo example of the alternative: a
 * keyword regex over story text, measured by a peer session to miss `Approval`, `Notification`,
 * `Generation`, `Deliver` and `Upload` while flagging correct plans. It is advisory for that
 * reason. This reads `references.workspace.kind`, which somebody declared, so there is nothing to
 * infer.
 *
 * ## RETURNS null WHEN THE RELEASE CANNOT BE ASSESSED
 *
 * A release is assessable only if at least one of its stories carries a `workspace` reference at
 * all. With none, nobody has looked — see this file's header. `null` propagates to `NOT_MEASURED`.
 * A release with no stories is also unassessable rather than failing: an empty release is the
 * plan gate's business, not this rule's.
 */
export function releasesWithoutUserVisibleWorkflow(
  releaseKeys: ReadonlyArray<string>,
  stories: ReadonlyArray<StoryLike>,
): string[] | null {
  const anyWorkspaceDeclared = stories.some((s) => (s.references?.workspace?.kind ?? null) !== null);
  if (!anyWorkspaceDeclared) return null;

  const failing: string[] = [];
  for (const key of releaseKeys) {
    const inRelease = stories.filter((s) => s.release === key);
    if (!inRelease.length) continue;
    const declared = inRelease.filter((s) => (s.references?.workspace?.kind ?? null) !== null);
    // Per-release assessability, not just per-plan: one release may be referenced and another not.
    if (!declared.length) continue;
    // `headless` is a real answer, so a release fails only when EVERY declared story is headless.
    if (!declared.some((s) => s.references?.workspace?.kind === 'workspace')) failing.push(key);
  }
  return failing;
}
