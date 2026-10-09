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
const GAPLESS_TARGETS: ReadonlySet<string> = new Set(['release_review', 'launch_ready']);

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

    const out = applyMeasurements(base, { requirementCount: () => 7 }, { row: ROW, refs: null });

    expect(out.requirementCount).toBe(7);
    expect(out.assessedFields.has('requirementCount')).toBe(true);
    // And it reports ONLY what the map measured, so the set cannot overstate.
    expect([...out.assessedFields]).toEqual(['requirementCount']);
  });

  it('the measurement receives the row, so a measurement can actually read it', () => {
    const seen: string[] = [];
    const base = {} as LifecycleEvidence;

    applyMeasurements(base, {
      requirementCount: (c) => { seen.push(c.row.tenant_id); return 1; },
    }, { row: ROW, refs: null });

    // Without this, a measurement map that ignored its argument would pass everything above.
    expect(seen).toEqual(['tenant-1']);
  });

  it('THE READER ROUTES THROUGH THE OVERLAY, not around it', async () => {
    // This is the test that kills "delete the overlay loop". It injects into the real map, so
    // a reader that ignores the map returns the placeholder and fails here. Restored in
    // `finally` so the injection cannot leak into another test.
    const map = EVIDENCE_MEASUREMENTS as Record<string, (c: { row: typeof ROW }) => unknown>;
    // The baseline is no longer EMPTY: P5-T1.4 populated two fields. Captured rather than
    // hardcoded, so this test does not have to be edited every time the map grows — what it
    // asserts is that the injection is REMOVED afterwards, not what the map happens to hold.
    const before = Object.keys(map).sort();
    expect(before).not.toContain('requirementCount');

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
    expect(Object.keys(map).sort()).toEqual(before);
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

describe('a measurement that cannot measure leaves the field UNASSESSED', () => {
  // THE FABRICATION PATH THIS CLOSES. `assessedFields` used to be `Object.keys(map)`, so a field
  // was claimed assessed because a function for it EXISTED — even on a call where that function
  // had no data. Every predicate would then trust the placeholder and the NOT_ASSESSED refusal
  // would silently become a pass: the gate bypass the T1.1 carry-forward named in terms.
  const base = () => ({
    assessedFields: new Set<EvidenceField>(),
    tenantId: 't', requirementCount: 0, requirementsWithoutProvenance: [],
    uncitedRequirementSourceBlocks: [], unresolvedSourceBlocks: [], processesWithoutTasks: [],
    graphHasStart: false, graphHasEnd: false, unreachableTasks: [], unboundedReworkLoops: [],
    tasksWithoutExecutionClass: [], tasksWithoutAccountableHuman: [],
    agentTasksAccountableForThemselves: [], tasksUnmappedToSurface: [], screensWithoutRationale: [],
    selectedDesignRef: null, manifestContentHash: null, unknownAllocationCount: 0,
    effortCoverageDisclosed: false, proposedBy: null, approval: null,
    currentManifestRevision: null, actorStillAuthorized: true,
    mustHaveRequirementsWithoutStory: [], storiesWithoutTraceability: [],
  }) as unknown as LifecycleEvidence;

  const CTX = { row: ROW, refs: null };

  it('NOT_MEASURED keeps the placeholder AND keeps the field out of assessedFields', () => {
    const out = applyMeasurements(base(), {
      requirementCount: () => NOT_MEASURED,
      requirementsWithoutProvenance: () => ['r-1'],
    }, CTX);

    // The unmeasurable one is absent from the set, so every predicate reading it still refuses.
    expect(out.assessedFields.has('requirementCount')).toBe(false);
    expect(out.requirementCount).toBe(0);                 // the placeholder, untouched
    // The measurable one is present, so its value is now trustworthy.
    expect(out.assessedFields.has('requirementsWithoutProvenance')).toBe(true);
    expect(out.requirementsWithoutProvenance).toEqual(['r-1']);
  });

  it('a field whose measurement returns an EMPTY list is assessed, which is the whole point', () => {
    // `[]` is a legitimate MEASURED value meaning "assessed, nothing wrong". It must be
    // distinguishable from the placeholder `[]`, and the only thing that can distinguish them is
    // membership of assessedFields.
    const out = applyMeasurements(base(), { unresolvedSourceBlocks: () => [] }, CTX);
    expect(out.unresolvedSourceBlocks).toEqual([]);
    expect(out.assessedFields.has('unresolvedSourceBlocks')).toBe(true);
  });

  it('the real map measures NOTHING when there are no refs, so everything still blocks', () => {
    // Not an incidental property: a project with no blueprint yet is the normal case, and
    // reporting it as "assessed, nothing wrong" would advance it on evidence nobody gathered.
    const out = applyMeasurements(base(), EVIDENCE_MEASUREMENTS, { row: ROW, refs: null });
    expect(out.assessedFields.size).toBe(0);
  });

  it('with refs present, the two mapped fields are measured from them', () => {
    const refs = {
      sources: [
        { id: 's-1', revision: 1, source: 'x', state: 'confirmed', provenanceKind: 'interview' },
        { id: 's-2', revision: 1, source: 'x', state: 'open', provenanceKind: null },
        { id: 's-3', revision: 1, source: 'x', state: 'heard', provenanceKind: null },
      ],
    } as unknown as Parameters<typeof applyMeasurements>[2]['refs'];

    const out = applyMeasurements(base(), EVIDENCE_MEASUREMENTS, { row: ROW, refs });

    // provenanceKind === null is documented as "unrecorded. Never inferred by an adapter."
    expect(out.requirementsWithoutProvenance).toEqual(['s-2', 's-3']);
    // `open` is the only one of the six SOURCE_STATES that means genuinely undecided.
    expect(out.unresolvedSourceBlocks).toEqual(['s-2']);
    expect(out.assessedFields.has('requirementsWithoutProvenance')).toBe(true);
    expect(out.assessedFields.has('unresolvedSourceBlocks')).toBe(true);
    // And nothing else got claimed on the way: 2 measured, not 25.
    expect(out.assessedFields.size).toBe(2);
  });

  it('a refs object WITHOUT a sources list measures nothing, rather than crashing', () => {
    // THE SURVIVOR THIS CLOSES. The shape check used to live inside the database loader,
    // behind a query, so no test could reach it and deleting it changed nothing. Moved into
    // the measurements, it is reachable with a plain object — and it has to be a REFUSAL, not
    // an empty measurement: `refs` with no `sources` is data this module cannot read, and
    // calling that "assessed, nothing wrong" is the fabrication the whole sentinel exists for.
    for (const bad of [{}, { sources: null }, { sources: 7 }, { sources: {} }]) {
      const out = applyMeasurements(base(), EVIDENCE_MEASUREMENTS, {
        row: ROW,
        refs: bad as unknown as Parameters<typeof applyMeasurements>[2]['refs'],
      });
      expect(out.assessedFields.size).toBe(0);
      // and it did not throw on the way, which a bare .filter would have
      expect(out.requirementsWithoutProvenance).toEqual([]);
    }
  });

  it('an ABSENT provenanceKind counts as unrecorded, not as recorded', () => {
    // THE GATE BYPASS THIS CLOSES, found by mutation at the JSONB boundary. Treating only
    // `null` as unrecorded meant a source with the key ABSENT was reported as having
    // provenance: the gap list came back EMPTY and the field was claimed ASSESSED, so the
    // provenance prerequisite PASSED on data recording no provenance at all.
    const refs = {
      sources: [
        { id: 's-1', state: 'heard' },                      // provenanceKind ABSENT
        { id: 's-2', state: 'heard', provenanceKind: null },
        { id: 's-3', state: 'heard', provenanceKind: 'interview' },
      ],
    } as unknown as Parameters<typeof applyMeasurements>[2]['refs'];

    const out = applyMeasurements(base(), EVIDENCE_MEASUREMENTS, { row: ROW, refs });
    // Both the absent and the explicit null are unrecorded; only s-3 has provenance.
    expect(out.requirementsWithoutProvenance).toEqual(['s-1', 's-2']);
  });

  it('ONE unreadable element makes the whole list unmeasurable, rather than crashing', () => {
    // `refs_json` is cast `parsed as ManifestRefs`, so nothing had checked its ELEMENTS:
    // `sources: [null]` threw out of the reader, and a junk element was counted silently.
    //
    // The whole list is refused, not the readable subset: a gap list that quietly omitted the
    // rows nobody could read would be SHORTER, and a shorter gap list looks like better news.
    for (const bad of [[null], [7], [{ state: 'open' }], [{ id: 1 }], [{ id: 'ok' }, null]]) {
      const refs = { sources: bad } as unknown as
        Parameters<typeof applyMeasurements>[2]['refs'];
      const out = applyMeasurements(base(), EVIDENCE_MEASUREMENTS, { row: ROW, refs });
      expect(out.assessedFields.size).toBe(0);
    }
    // POSITIVE COUNTERPART: a readable list IS measured, so the guard is not refusing
    // everything.
    const good = { sources: [{ id: 'g-1', state: 'open', provenanceKind: null }] } as unknown as
      Parameters<typeof applyMeasurements>[2]['refs'];
    expect(applyMeasurements(base(), EVIDENCE_MEASUREMENTS, { row: ROW, refs: good })
      .assessedFields.size).toBe(2);
  });

  it('requirementCount is deliberately NOT measured, and that is a decision not an omission', () => {
    // `SourceRef` is documented as "a requirement OR OTHER CAPTURED STATEMENT", so sources is a
    // superset of requirements and `sources.length` would be a count meaning something slightly
    // different from its name. Left unassessed, where it BLOCKS, rather than measured loosely.
    expect(Object.keys(EVIDENCE_MEASUREMENTS)).not.toContain('requirementCount');
    expect(Object.keys(EVIDENCE_MEASUREMENTS).sort())
      .toEqual(['requirementsWithoutProvenance', 'unresolvedSourceBlocks']);
  });
});
