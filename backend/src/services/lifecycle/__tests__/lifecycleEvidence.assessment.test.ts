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
  notAssessedGaps,
  ADVISORY_RULES,
  type LifecycleEvidence,
  type EvidenceField,
} from '../lifecyclePrerequisites';
import { readLifecycleEvidence, ASSESSED_EVIDENCE_FIELDS } from '../lifecycleStatus';

const ROW = {
  id: 'proj-1',
  tenant_id: 'tenant-1',
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
const GAPLESS_TARGETS: ReadonlySet<string> = new Set(['release_review', 'launch_ready']);

/** Everything measured, derived from the snapshot's own keys. The positive-control snapshot. */
function complete(): LifecycleEvidence {
  const measured = {
    tenantId: 'tenant-1',
    requirementCount: 12,
    requirementsWithoutProvenance: [],
    uncitedRequirementSourceBlocks: [],
    unresolvedSourceBlocks: [],
    processesWithoutTasks: [],
    graphHasStart: true,
    graphHasEnd: true,
    unreachableTasks: [],
    unboundedReworkLoops: [],
    tasksWithoutExecutionClass: [],
    tasksWithoutAccountableHuman: [],
    agentTasksAccountableForThemselves: [],
    tasksUnmappedToSurface: [],
    screensWithoutRationale: [],
    selectedDesignRef: 'design-v3@vc2',
    manifestContentHash: 'a'.repeat(64),
    unknownAllocationCount: 0,
    effortCoverageDisclosed: true,
    proposedBy: 'architect@example.test',
    approval: {
      approvedBy: 'owner@example.test',
      approvedByRole: 'DELIVERY_OWNER',
      revision: 4,
      contentSha256: 'a'.repeat(64),
      superseded: false,
    },
    currentManifestRevision: 4,
    actorStillAuthorized: true,
    mustHaveRequirementsWithoutStory: [],
    storiesWithoutTraceability: [],
  };
  const assessedFields = new Set(
    Object.keys(measured).filter((k) => k !== 'tenantId'),
  ) as Set<EvidenceField>;
  return { ...measured, assessedFields };
}

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

  it('PINS THE KNOWN HOLE: release_review and launch_ready permit unconditionally', async () => {
    const stub = await readLifecycleEvidence(ROW);

    // Not an endorsement. Phase 6 owns closing this; the test exists so that closing it is a
    // deliberate change to this assertion rather than a silent one.
    for (const to of GAPLESS_TARGETS) {
      expect(prerequisiteGaps(to as LifecycleStage, stub)).toEqual([]);
    }
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

  it('ADVISORY_RULES is unchanged by this task', () => {
    // Asserted against the now-exported constant. The whole change would be undone by one
    // careless addition here, so the contents are pinned rather than the size.
    expect([...ADVISORY_RULES]).toEqual(['screen_without_rationale']);
  });
});

describe('the read-field set is honest in BOTH directions', () => {
  it('every field named as assessed is a real field of the returned evidence', async () => {
    const stub = await readLifecycleEvidence(ROW);
    const actualKeys = new Set(Object.keys(stub));

    // Catches a typo in ASSESSED_EVIDENCE_FIELDS, which would otherwise claim a measurement
    // for a field that does not exist.
    const phantom = [...ASSESSED_EVIDENCE_FIELDS].filter((f) => !actualKeys.has(f));
    expect(phantom).toEqual([]);
  });

  it('every field NOT named as assessed is absent from assessedFields', async () => {
    const stub = await readLifecycleEvidence(ROW);
    const measurable = Object.keys(stub).filter(
      (k) => k !== 'tenantId' && k !== 'assessedFields',
    );

    // The keyspace is derived from the object the reader actually returns — the code under
    // test — not from `LifecycleEvidence`, which is a TypeScript interface and erased at
    // runtime. The link that forces a newly added field to appear here at all is `tsc`
    // (TS2739 on the return literal), NOT jest: this suite runs under ts-jest with
    // `isolatedModules`, so a green run here is not a typecheck. The property is exactly as
    // strong as the `tsc --noEmit` run recorded alongside this commit, and no stronger.
    const claimed = measurable.filter((k) => stub.assessedFields.has(k as EvidenceField));
    expect(claimed).toEqual([...ASSESSED_EVIDENCE_FIELDS]);
  });

  it('reports a NOT_ASSESSED gap for every stage that reads an unassessed field', async () => {
    const stub = await readLifecycleEvidence(ROW);
    const silent: string[] = [];

    // Every stage with a real predicate must say "not assessed" rather than return nothing,
    // because returning nothing means the stage PASSES.
    for (const stage of LIFECYCLE_STAGES) {
      if (GAPLESS_TARGETS.has(stage)) continue;
      if (stage === 'discovery') continue; // reads only tenantId, which is always known
      if (notAssessedGaps(prerequisiteGaps(stage, stub)).length === 0) silent.push(stage);
    }

    expect(silent).toEqual([]);
  });
});
