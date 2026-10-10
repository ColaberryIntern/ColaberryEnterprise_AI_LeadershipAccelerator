/**
 * "Not assessed" must be representable, must be DISTINGUISHABLE from a measurement, and must
 * still BLOCK.
 *
 * The defect this suite exists for: `LifecycleEvidence`'s own header promised that unknown is
 * represented explicitly, "because a zero would read as a measured value" — and the evidence
 * reader then returned `graphHasStart: false`, `graphHasEnd: false` and
 * `effortCoverageDisclosed: false`, plus `[]` for every array. `false` is not a non-answer. It
 * is the strongest claim the predicate layer can make: *somebody read the transition graph and
 * found no start node.* Nobody had read it.
 *
 * THE CONTROL THAT MATTERS IS `cannot transition`. The first draft of this change made
 * not-assessed gaps NON-blocking, which — because every field was stubbed — would have turned
 * every refused transition into an allowed one. An independent plan audit caught it before any
 * code was written. So the load-bearing test here is not "the label is right", it is "a project
 * with no evidence still cannot move", with a positive control proving a complete snapshot can.
 */
import { ADVANCE, LIFECYCLE_STAGES, type LifecycleStage } from '../lifecycleStages';
import {
  prerequisiteGaps,
  blockingGaps,
  satisfied,
  notAssessedGaps,
  ADVISORY_RULES,
  type LifecycleEvidence,
  type EvidenceField,
  type PrerequisiteGap,
} from '../lifecyclePrerequisites';
import {
  readLifecycleEvidence,
  ASSESSED_EVIDENCE_FIELDS,
  EVIDENCE_MEASUREMENTS,
  NOT_MEASURED,
  applyMeasurements,
} from '../lifecycleEvidence';
import { completeEvidence as complete } from './evidenceFixture';

const ROW = {
  id: 'proj-1',
  tenant_id: 'tenant-1',
  // Both null: this fixture has no manifest, so nothing is measurable from it and every
  // field stays unassessed. Tests that need a measurement pass `refs` explicitly.
  student_project_id: null,
  delivery_project_id: null,
  stage: 'discovery',
  condition: null,
  condition_reason: null,
};

/**
 * The two stages whose predicate is `() => []` and therefore permits unconditionally.
 *
 * Named rather than skipped. This is a real pre-existing hole — `lifecyclePrerequisites.ts` says
 * so in its own comment, and a peer session traced a production failure to it on 2026-10-02. It
 * is NOT closed by this task (Phase 6 owns it), but it is pinned here so that closing it, or
 * widening it, changes a test rather than passing unnoticed.
 */
/**
 * Stages that still permit unconditionally on a stub.
 *
 * `release_review` LEFT THIS SET on 2026-10-09 (P6-T4), which is the deliberate change the test
 * below was written to force. It now reads `releasesWithoutUserVisibleWorkflow` and reports
 * `not_assessed` on a stub rather than passing. `launch_ready` is still here and is P6-T5's.
 */
const GAPLESS_TARGETS: ReadonlySet<string> = new Set(['launch_ready']);

/** Everything measured, derived from the snapshot's own keys. The positive-control snapshot. */


/** Stages that actually have a next stage to advance into. */
function advanceable(): LifecycleStage[] {
  return LIFECYCLE_STAGES.filter((s) => ADVANCE[s] !== null);
}

describe('THE GATE IS NOT LOOSENED: unassessed evidence still refuses a transition', () => {
  it('refuses every advanceable transition on the real stubbed evidence', async () => {
    const stub = await readLifecycleEvidence(ROW);
    const permitted: string[] = [];

    for (const from of advanceable()) {
      const to = ADVANCE[from] as LifecycleStage;
      if (GAPLESS_TARGETS.has(to)) continue;
      if (blockingGaps(prerequisiteGaps(to, stub)).length === 0) permitted.push(`${from} -> ${to}`);
    }

    // Named, not counted: a bare `toHaveLength(0)` would not say which transition opened.
    expect(permitted).toEqual([]);
  });

  it('PASSING COUNTERPART: a complete snapshot permits those same transitions', () => {
    const refused: string[] = [];

    for (const from of advanceable()) {
      const to = ADVANCE[from] as LifecycleStage;
      if (GAPLESS_TARGETS.has(to)) continue;
      if (blockingGaps(prerequisiteGaps(to, complete())).length > 0) refused.push(`${from} -> ${to}`);
    }

    // Without this, the test above would pass against a predicate layer that refuses everything.
    expect(refused).toEqual([]);
  });

  it('PINS THE REMAINING HOLE: launch_ready permits unconditionally, release_review no longer does', async () => {
    const stub = await readLifecycleEvidence(ROW);

    // Not an endorsement. The test exists so that closing a hole is a deliberate change to this
    // assertion rather than a silent one — and P6-T4 is that change arriving for one of the two.
    for (const to of GAPLESS_TARGETS) {
      expect(prerequisiteGaps(to as LifecycleStage, stub)).toEqual([]);
    }
    expect([...GAPLESS_TARGETS]).toEqual(['launch_ready']);

    // release_review now REFUSES a stub, and refuses it as not-assessed rather than as a
    // measured failure: nothing in a stub declares a workspace, so nobody has looked.
    const released = prerequisiteGaps('release_review' as LifecycleStage, stub);
    expect(released.map((g) => g.rule)).toEqual(['release_workflow_unassessed']);
    expect(released.map((g) => g.kind)).toEqual(['not_assessed']);
    // And it BLOCKS rather than riding along: nobody has looked, so the stage is not
    // satisfied. The measured-failure rule is the advisory one; ignorance is not waivable.
    expect(blockingGaps(released)).toHaveLength(1);
    expect(satisfied(released)).toBe(false);
  });
});

describe('not-assessed is distinguishable from measured-and-missing', () => {
  it('reports NOT_ASSESSED, not a fabricated blocker, for a graph nobody read', async () => {
    const stub = await readLifecycleEvidence(ROW);
    const gaps = prerequisiteGaps('process_ready', stub);

    const start = gaps.find((g) => g.rule === 'graph_no_start');
    expect(start).toBeDefined();
    expect(start?.kind).toBe('not_assessed');
    // The old behaviour asserted this as fact about an unread graph.
    expect(start?.message).not.toContain('has no reachable start');
  });

  it('PASSING COUNTERPART: a measured missing start node is UNMET and says so', () => {
    const e = complete();
    const gaps = prerequisiteGaps('process_ready', { ...e, graphHasStart: false });

    const start = gaps.find((g) => g.rule === 'graph_no_start');
    expect(start?.kind).toBe('unmet');
    expect(start?.message).toContain('has no reachable start');
  });

  it('the two kinds produce DIFFERENT output for the same rule', async () => {
    const stub = await readLifecycleEvidence(ROW);
    const unassessedGap = prerequisiteGaps('process_ready', stub)
      .find((g) => g.rule === 'graph_no_start');
    const unmetGap = prerequisiteGaps('process_ready', { ...complete(), graphHasStart: false })
      .find((g) => g.rule === 'graph_no_start');

    // A surface cannot render them differently if they are not different.
    expect(unassessedGap?.kind).not.toBe(unmetGap?.kind);
    expect(unassessedGap?.message).not.toBe(unmetGap?.message);
  });

  it('separates an unselected design variant from an unassessed one', () => {
    // This pair is why `assessedFields` is a SET and not twenty `| null` widenings:
    // `selectedDesignRef` was ALREADY nullable, so a widened type could not tell these apart.
    const e = complete();
    const measuredAbsent = prerequisiteGaps('design_ready', { ...e, selectedDesignRef: null })
      .find((g) => g.rule === 'design_variant_not_selected');
    const notLookedAt = prerequisiteGaps('design_ready', {
      ...e,
      selectedDesignRef: null,
      assessedFields: new Set(
        [...e.assessedFields].filter((f) => f !== 'selectedDesignRef'),
      ) as Set<EvidenceField>,
    }).find((g) => g.rule === 'design_variant_not_selected');

    expect(measuredAbsent?.kind).toBe('unmet');
    expect(notLookedAt?.kind).toBe('not_assessed');
  });
});

describe('not_assessed BLOCKS', () => {
  it('survives blockingGaps, because no kind is advisory', async () => {
    const stub = await readLifecycleEvidence(ROW);
    const gaps = prerequisiteGaps('process_ready', stub);

    expect(notAssessedGaps(gaps).length).toBeGreaterThan(0);
    for (const g of notAssessedGaps(gaps)) {
      expect(blockingGaps([g])).toHaveLength(1);
    }
  });

  it('ADVISORY_RULES holds exactly the two rules that have earned it', () => {
    // Asserted against the now-exported constant. The whole change would be undone by one
    // careless addition here, so the contents are pinned rather than the size.
    //
    // P6-T4 added the second member and this assertion is the deliberate act of doing so.
    // What it buys: `release_without_user_visible_workflow` is waivable, but the UNMEASURED
    // case is a SEPARATE rule — `release_workflow_unassessed` — which is NOT here and
    // therefore blocks. A stub cannot pass release_review by calling its own ignorance a
    // waivable note.
    expect([...ADVISORY_RULES].sort()).toEqual([
      'release_without_user_visible_workflow',
      'screen_without_rationale',
    ]);
    expect([...ADVISORY_RULES]).not.toContain('release_workflow_unassessed');
  });
});
