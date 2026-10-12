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
 * Stages that still permit unconditionally on a stub.
 *
 * **EMPTY since 2026-10-12 (P6-T5), and that is the point of this set existing.** It held two
 * entries when this file was written; `release_review` left it in P6-T4 and `launch_ready` has
 * now left it too. Every stage with a predicate now refuses a stub.
 *
 * Kept rather than deleted, because the loops below read it and because an empty set is the
 * assertion: a future stage added without a predicate, or an existing one whose rule is
 * weakened back to `() => []`, has to re-add itself HERE and justify it.
 */
const GAPLESS_TARGETS: ReadonlySet<string> = new Set<string>();

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

  it('THE HOLE IS CLOSED: nothing permits a stub unconditionally any more', async () => {
    const stub = await readLifecycleEvidence(ROW);

    // THIS TEST USED TO ASSERT THE OPPOSITE, and that was its job. It read "PINS THE REMAINING
    // HOLE: launch_ready permits unconditionally", with a comment saying the test existed "so
    // that closing a hole is a deliberate change to this assertion rather than a silent one".
    // This is that change arriving for the last of the two.
    expect([...GAPLESS_TARGETS]).toEqual([]);

    // Every stage, not only the advanceable ones the loops above walk: a stage reachable by a
    // non-ADVANCE route (a correction, a re-entry) would otherwise be unguarded here.
    //
    // `discovery` is the one stage a stub satisfies, and it does so for a MEASURED reason
    // rather than an unconditional one: its single requirement is that the project is
    // registered against a tenant, and `tenant_id` comes off the row itself, so it is known
    // without assessment. Listing it here rather than filtering it out is the point — if it
    // ever stopped being the only one, this assertion names the newcomer.
    const permitting = LIFECYCLE_STAGES
      .filter((s) => blockingGaps(prerequisiteGaps(s, stub)).length === 0);
    expect(permitting).toEqual(['discovery']);

    // And it is not a rubber stamp: withhold the tenant and it refuses. Without this, a
    // `discovery: () => []` would read identically above.
    expect(prerequisiteGaps('discovery', { ...stub, tenantId: '' }).map((g) => g.rule))
      .toEqual(['no_tenant']);

    // And both former members refuse for the RIGHT reason: nobody has looked. A measured
    // failure on a stub would mean the predicate invented a finding from placeholders.
    const released = prerequisiteGaps('release_review' as LifecycleStage, stub);
    expect(released.map((g) => g.rule)).toEqual(['release_workflow_unassessed']);
    expect(released.map((g) => g.kind)).toEqual(['not_assessed']);
    expect(blockingGaps(released)).toHaveLength(1);
    expect(satisfied(released)).toBe(false);

    const launch = prerequisiteGaps('launch_ready' as LifecycleStage, stub);
    expect(launch.map((g) => g.rule))
      .toEqual(['publish_not_exactly_one', 'publish_hash_mismatch']);
    expect(launch.map((g) => g.kind)).toEqual(['not_assessed', 'not_assessed']);
    // BLOCKING, unlike release_review's measured half. Neither of these is in ADVISORY_RULES:
    // a project with no published plan is not launch-ready under any reading.
    expect(blockingGaps(launch)).toHaveLength(2);
    expect(satisfied(launch)).toBe(false);
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
