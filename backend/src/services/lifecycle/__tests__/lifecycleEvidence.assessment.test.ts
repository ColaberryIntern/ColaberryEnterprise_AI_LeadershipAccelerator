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
  type PrerequisiteGap,
} from '../lifecyclePrerequisites';
import {
  readLifecycleEvidence,
  ASSESSED_EVIDENCE_FIELDS,
  EVIDENCE_MEASUREMENTS,
  applyMeasurements,
} from '../lifecycleStatus';

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

  it('the assessed set is DERIVED from the measurement map, not hand-written', () => {
    // THE DEFECT THIS REPLACES. The previous version of this test compared
    // `ASSESSED_EVIDENCE_FIELDS ∩ Object.keys(stub)` against `[...ASSESSED_EVIDENCE_FIELDS]`
    // — and `stub.assessedFields` IS `ASSESSED_EVIDENCE_FIELDS`, the same object. So it was
    // tautological. A verifier set the assessed set to three field names while the reader
    // still returned `[]` for all three: 811 tests passed. Three fields declared measured
    // that nobody measured.
    //
    // A value-based check cannot close that, because `[]` is a legitimate MEASURED value
    // meaning "assessed, nothing wrong". So the fix is structural: the set is derived from
    // the measurement map, and this asserts the derivation holds. Sorted, so a legitimate
    // addition in T1.3 produces a meaningful failure rather than an order mismatch.
    expect([...ASSESSED_EVIDENCE_FIELDS].sort()).toEqual(Object.keys(EVIDENCE_MEASUREMENTS).sort());
  });

  it('DIRECTION 2, RUN rather than reserved: a measured field holds its measurement', async () => {
    // THE DEFECT THIS REPLACES. The previous version iterated `EVIDENCE_MEASUREMENTS`, which
    // is empty, so its body never executed. A verifier then deleted the entire overlay loop
    // from the reader and **850 of 850 tests still passed.** The comment I had left there
    // said it "CANNOT be vacuously satisfied by a non-empty map" — a declared expectation,
    // which Amendment 4 forbids as a third category. An operand is tested or removed.
    //
    // So this drives the overlay with a NON-EMPTY map instead of waiting for T1.3 to supply
    // one. `requirementCount` placeholder is 0; the measurement returns 7.
    const base = await readLifecycleEvidence(ROW);
    expect(base.requirementCount).toBe(0);

    const out = applyMeasurements(base, { requirementCount: () => 7 }, ROW);

    expect(out.requirementCount).toBe(7);
    expect(out.assessedFields.has('requirementCount')).toBe(true);
    // And it reports ONLY what the map measured, so the set cannot overstate.
    expect([...out.assessedFields]).toEqual(['requirementCount']);
  });

  it('the measurement receives the row, so a measurement can actually read it', () => {
    const seen: string[] = [];
    const base = {} as LifecycleEvidence;

    applyMeasurements(base, { requirementCount: (r) => { seen.push(r.tenant_id); return 1; } }, ROW);

    // Without this, a measurement map that ignored its argument would pass everything above.
    expect(seen).toEqual(['tenant-1']);
  });

  it('THE READER ROUTES THROUGH THE OVERLAY, not around it', async () => {
    // This is the test that kills "delete the overlay loop". It injects into the real map, so
    // a reader that ignores the map returns the placeholder and fails here. Restored in
    // `finally` so the injection cannot leak into another test.
    const map = EVIDENCE_MEASUREMENTS as Record<string, (r: typeof ROW) => unknown>;
    expect(Object.keys(map)).toEqual([]);

    map.requirementCount = () => 42;
    try {
      const e = await readLifecycleEvidence(ROW);
      expect(e.requirementCount).toBe(42);
      expect(e.assessedFields.has('requirementCount')).toBe(true);

      // And the stage that reads it must now treat it as MEASURED, not not-assessed.
      const gap = prerequisiteGaps('requirements_ready', e)
        .find((g) => g.rule === 'no_requirements');
      expect(gap).toBeUndefined();
    } finally {
      delete map.requirementCount;
    }
    expect(Object.keys(map)).toEqual([]);
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

describe('blueprint_approved guards EVERY field it reads, not just `approval`', () => {
  /** `approval` measured, one named field deliberately not. */
  function withhold(field: EvidenceField): LifecycleEvidence {
    const e = complete();
    return {
      ...e,
      assessedFields: new Set(
        [...e.assessedFields].filter((f) => f !== field),
      ) as Set<EvidenceField>,
    };
  }

  it('THE SECOND GATE BYPASS: an unassessed currentManifestRevision must not permit the stage', () => {
    const gaps = prerequisiteGaps('blueprint_approved', withhold('currentManifestRevision'));

    // Attempt 1 read this field raw. The placeholder is null, `null !== null` is false, so
    // the comparison was skipped and the stage emitted ZERO gaps — it PERMITTED. A verifier
    // probed it and got `blocking(blueprint_approved) = 0`. The stale-revision refusal that
    // vanishes here is what LC-11 rests on.
    expect(blockingGaps(gaps).length).toBeGreaterThan(0);
    expect(gaps.find((g) => g.rule === 'approval_revision_moved')?.kind).toBe('not_assessed');
  });

  it('and does not permit it one stage later either, through composition', () => {
    // `planning`, `building` and `operating` all compose `blueprint_approved`, so the bypass
    // propagated. The verifier measured `blocking(planning) = 0`.
    for (const stage of ['planning', 'building', 'operating'] as LifecycleStage[]) {
      const gaps = prerequisiteGaps(stage, withhold('currentManifestRevision'));
      expect(blockingGaps(gaps).length).toBeGreaterThan(0);
    }
  });

  it('an unassessed proposedBy is NOT_ASSESSED, never a fabricated self-approval claim', () => {
    const gaps = prerequisiteGaps('blueprint_approved', withhold('proposedBy'));
    const g = gaps.find((x) => x.rule === 'approval_self_approved');

    // Attempt 1 emitted `kind: unmet` with "No proposer recorded, so the approver cannot be
    // shown to differ from it" — a measured claim about a field nobody read. Same species as
    // the `graphHasStart: false` defect this suite exists to prevent.
    expect(g?.kind).toBe('not_assessed');
    expect(g?.message).not.toContain('No proposer recorded');
  });

  it('PASSING COUNTERPART: with both measured, a clean approval yields no gaps', () => {
    // Without this, the three above would pass against a predicate that refuses everything.
    expect(prerequisiteGaps('blueprint_approved', complete())).toEqual([]);
  });

  it('PASSING COUNTERPART: a genuinely moved revision is still UNMET, not not_assessed', () => {
    const e = complete();
    const gaps = prerequisiteGaps('blueprint_approved', { ...e, currentManifestRevision: 9 });
    const g = gaps.find((x) => x.rule === 'approval_revision_moved');

    expect(g?.kind).toBe('unmet');
    expect(g?.message).toContain('current revision is 9');
  });
});

describe('notAssessedGaps actually discriminates', () => {
  it('excludes unmet gaps from a MIXED list', () => {
    // A verifier collapsed this function to `filter(() => true)` and 811 tests still passed:
    // both existing callers passed it lists in which every gap was already not_assessed, so
    // the discriminating operand was isolated by nothing. Amendment 4 allows two categories
    // only — tested or removed — and this function has a real consumer in P5-T2, so: tested.
    const mixed: PrerequisiteGap[] = [
      { rule: 'graph_no_start', kind: 'not_assessed', message: 'not looked at' },
      { rule: 'graph_no_end', kind: 'unmet', message: 'measured and missing' },
      { rule: 'no_requirements', kind: 'unmet', message: 'measured and missing' },
    ];

    const picked = notAssessedGaps(mixed);
    expect(picked).toHaveLength(1);
    expect(picked[0].rule).toBe('graph_no_start');
  });

  it('returns an empty list when nothing is unassessed', () => {
    const allUnmet: PrerequisiteGap[] = [
      { rule: 'graph_no_end', kind: 'unmet', message: 'measured and missing' },
    ];
    expect(notAssessedGaps(allUnmet)).toEqual([]);
  });
});

describe('EVERY guarded read is bound to the field it actually reads', () => {
  /**
   * Withhold one field from an otherwise-complete snapshot and collect the `not_assessed`
   * rules that appear across every stage.
   */
  function rulesWhenWithheld(field: EvidenceField): string[] {
    const e = complete();
    const withheld: LifecycleEvidence = {
      ...e,
      assessedFields: new Set(
        [...e.assessedFields].filter((f) => f !== field),
      ) as Set<EvidenceField>,
    };
    const rules = new Set<string>();
    for (const stage of LIFECYCLE_STAGES) {
      for (const g of notAssessedGaps(prerequisiteGaps(stage, withheld))) rules.add(g.rule);
    }
    return [...rules].sort();
  }

  it('every assessed field, withheld alone, produces at least one not_assessed gap', () => {
    // A mis-bound `field` argument produces NONE: the guard it names is still assessed, so
    // nothing fires. That is how `condGaps(e, ’actorStillAuthorized’, …)` mis-bound to
    // `’approval’` would silently drop the TOCTOU authority refusal — the same shape as the
    // `currentManifestRevision` bypass this task shipped in attempt 1.
    const silent = [...complete().assessedFields].filter((f) => rulesWhenWithheld(f).length === 0);

    // Named, not counted, so a failure says WHICH field is unbound.
    expect(silent).toEqual([]);
  });

  it('no two fields produce the same not_assessed rule set', () => {
    // The other half: a field mis-bound to a SIBLING collides with it. Injectivity catches
    // what emptiness does not — e.g. `graphHasEnd` mis-bound to `graphHasStart` makes the
    // latter emit both rules and the former emit none.
    const seen = new Map<string, EvidenceField>();
    const collisions: string[] = [];

    for (const f of [...complete().assessedFields].sort()) {
      const key = rulesWhenWithheld(f).join(
);
      if (!key) continue; // covered by the test above; do not double-report
      const prior = seen.get(key);
      if (prior) collisions.push(`${prior} and ${f} both yield [${key}]`);
      else seen.set(key, f);
    }

    expect(collisions).toEqual([]);
  });

  it('PASSING COUNTERPART: withholding nothing yields no not_assessed gap at all', () => {
    // Without this, both tests above would pass against a predicate layer that reported
    // everything as unassessed regardless of the set.
    const e = complete();
    for (const stage of LIFECYCLE_STAGES) {
      expect(notAssessedGaps(prerequisiteGaps(stage, e))).toEqual([]);
    }
  });
});
