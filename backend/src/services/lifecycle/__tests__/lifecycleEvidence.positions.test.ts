/**
 * The (stage, rule, field) binding of every guarded evidence read.
 *
 * Split out of `lifecycleEvidence.assessment.test.ts` when that file reached 504 lines,
 * over CLAUDE.md's 500-line hard ceiling. The seam is real rather than arbitrary: the file it
 * came from is about what `not_assessed` MEANS, and this one is about WHICH field gates which
 * rule — one is semantics, the other is wiring.
 *
 * The reason this exists at all: an earlier control keyed on the FIELD, and two mutations
 * walked through it. `proposedBy` is read at two positions so each masked the other, and a
 * mutual swap of two fields left both rule sets non-empty and distinct. Amendment 2 asks for a
 * control per claimed POSITION, and a field is not a position.
 */
import { LIFECYCLE_STAGES, type LifecycleStage } from '../lifecycleStages';
import {
  prerequisiteGaps,
  notAssessedGaps,
  type LifecycleEvidence,
  type EvidenceField,
} from '../lifecyclePrerequisites';
import { completeEvidence as complete } from './evidenceFixture';
/**
 * EVERY GUARDED READ, AS A (stage, rule, field) POSITION.
 *
 * A SPEC, not a transcript. I derived these 36 positions by probing the predicate layer, then
 * checked each row against the source: every rule is paired with the field it semantically
 * depends on. Pasting whatever the code currently does would encode a mis-binding as correct,
 * which is the exact failure being closed here.
 *
 * Hand-written on purpose. Amendment 1 permits a claim over an input space to be a SCOPED
 * LIST rather than a generator, and the completeness assertion below is what keeps the list
 * honest when a read is added or removed.
 *
 * WHY A POSITION AND NOT A FIELD. An earlier version of this control keyed on the field alone:
 * withhold it, require a non-empty and unique rule set. Two mutations walked through it.
 * `proposedBy` is read at TWO positions (`proposer_unrecorded` and `approval_self_approved`),
 * so mis-binding one leaves the other covering for it; and a mutual SWAP of two fields keeps
 * both sets non-empty and distinct, so it is invisible. A field is not a position, and
 * Amendment 2 asks for a control per claimed position.
 */
const GUARDED_POSITIONS: ReadonlyArray<[LifecycleStage, string, EvidenceField]> = [
  ['requirements_ready', 'no_requirements', 'requirementCount'],
  ['requirements_ready', 'requirement_without_provenance', 'requirementsWithoutProvenance'],
  ['requirements_ready', 'source_block_uncited', 'uncitedRequirementSourceBlocks'],
  ['requirements_ready', 'source_block_unresolved', 'unresolvedSourceBlocks'],
  ['process_ready', 'process_without_tasks', 'processesWithoutTasks'],
  ['process_ready', 'graph_no_start', 'graphHasStart'],
  ['process_ready', 'graph_no_end', 'graphHasEnd'],
  ['process_ready', 'task_unreachable', 'unreachableTasks'],
  ['process_ready', 'rework_unbounded', 'unboundedReworkLoops'],
  ['allocation_ready', 'task_without_execution_class', 'tasksWithoutExecutionClass'],
  ['allocation_ready', 'task_without_accountable_human', 'tasksWithoutAccountableHuman'],
  ['allocation_ready', 'agent_accountable_for_itself', 'agentTasksAccountableForThemselves'],
  ['design_ready', 'task_unmapped_to_surface', 'tasksUnmappedToSurface'],
  ['design_ready', 'screen_without_rationale', 'screensWithoutRationale'],
  ['design_ready', 'design_variant_not_selected', 'selectedDesignRef'],
  ['awaiting_blueprint_approval', 'manifest_hash_missing', 'manifestContentHash'],
  ['awaiting_blueprint_approval', 'allocation_unknown', 'unknownAllocationCount'],
  ['awaiting_blueprint_approval', 'effort_coverage_undisclosed', 'effortCoverageDisclosed'],
  ['awaiting_blueprint_approval', 'proposer_unrecorded', 'proposedBy'],
  ['blueprint_approved', 'approval_missing', 'approval'],
  ['blueprint_approved', 'approval_self_approved', 'proposedBy'],
  ['blueprint_approved', 'approval_revision_moved', 'currentManifestRevision'],
  ['planning', 'approval_missing', 'approval'],
  ['planning', 'approval_self_approved', 'proposedBy'],
  ['planning', 'approval_revision_moved', 'currentManifestRevision'],
  ['planning', 'authority_revoked', 'actorStillAuthorized'],
  ['building', 'approval_missing', 'approval'],
  ['building', 'approval_self_approved', 'proposedBy'],
  ['building', 'approval_revision_moved', 'currentManifestRevision'],
  ['building', 'authority_revoked', 'actorStillAuthorized'],
  ['operating', 'approval_missing', 'approval'],
  ['operating', 'approval_self_approved', 'proposedBy'],
  ['operating', 'approval_revision_moved', 'currentManifestRevision'],
  ['operating', 'authority_revoked', 'actorStillAuthorized'],
  ['plan_ready', 'requirement_uncovered_by_story', 'mustHaveRequirementsWithoutStory'],
  ['plan_ready', 'story_without_traceability', 'storiesWithoutTraceability'],
];

describe('EVERY guarded read is bound to the field it actually reads', () => {
  /** The (stage, rule) pairs that become not_assessed when exactly one field is withheld. */
  function positionsWhenWithheld(field: EvidenceField): string[] {
    const e = complete();
    const withheld: LifecycleEvidence = {
      ...e,
      assessedFields: new Set(
        [...e.assessedFields].filter((f) => f !== field),
      ) as Set<EvidenceField>,
    };
    const out: string[] = [];
    for (const stage of LIFECYCLE_STAGES) {
      for (const g of notAssessedGaps(prerequisiteGaps(stage, withheld))) {
        out.push(`${stage}/${g.rule}`);
      }
    }
    return out.sort();
  }

  /** Every position the layer actually produces, derived by withholding each field in turn. */
  function observedPositions(): string[] {
    const out: string[] = [];
    for (const f of [...complete().assessedFields]) {
      for (const p of positionsWhenWithheld(f)) out.push(`${p}/${f}`);
    }
    return out.sort();
  }

  it.each(GUARDED_POSITIONS)(
    'PER-POSITION: %s/%s is gated by %s and nothing else',
    (stage, rule, field) => {
      // The declared field must produce this exact position...
      expect(positionsWhenWithheld(field)).toContain(`${stage}/${rule}`);

      // ...and no OTHER field may. This half is what catches a swap: a mis-bound read still
      // emits its rule, just from the wrong field, so "the rule fires" alone proves nothing.
      const impostors = [...complete().assessedFields]
        .filter((f) => f !== field)
        .filter((f) => positionsWhenWithheld(f).includes(`${stage}/${rule}`));
      expect(impostors).toEqual([]);
    },
  );

  it('the declared position list is COMPLETE — no read is unlisted, none is stale', () => {
    const declared = GUARDED_POSITIONS.map(([s_, r, f]) => `${s_}/${r}/${f}`).sort();

    // Both directions. A subset assertion would miss a read added to the predicate layer and
    // never added here, which is how this control would quietly stop covering the thing it
    // claims to — the same defect `INTEGRITY_CHECKED_LISTS` exists to prevent one file over.
    expect(observedPositions()).toEqual(declared);
  });

  it('PASSING COUNTERPART: withholding nothing yields no not_assessed gap at all', () => {
    // Without this, everything above would pass against a layer that reported every field as
    // unassessed regardless of the set.
    const e = complete();
    for (const stage of LIFECYCLE_STAGES) {
      expect(notAssessedGaps(prerequisiteGaps(stage, e))).toEqual([]);
    }
  });
});
