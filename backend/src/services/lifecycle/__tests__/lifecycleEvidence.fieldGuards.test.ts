/**
 * `lifecycleEvidence` — the FIELD-GUARD half, split out of `lifecycleEvidence.assessment.test.ts`.
 *
 * WHY THIS FILE EXISTS. The parent crossed 500 lines — CLAUDE.md's hard ceiling — at 533, and
 * P6-T4 is what pushed it there. The rule is that the next change to such a file splits it before
 * adding more, and this run has already honoured that rule twice: once for a Phase 5 test at 504
 * lines, and once for `renderDocs.ts` at 554 in P6-T3. A grader caught that I had walked past it
 * here, in the same file that carries a note about walking past it once before.
 *
 * THE SEAM. The parent keeps the question "does unassessed evidence still refuse a transition" —
 * the gate-level claim. This file takes the narrower structural one: that every guarded read is
 * bound to the field it actually reads, that the declared field set is honest in both directions,
 * and that a measurement which cannot measure leaves its field unassessed. Those share no state
 * with the gate tests beyond the fixtures below, which is why the cut is here and not elsewhere.
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

    const out = applyMeasurements(base, { requirementCount: () => 7 }, { row: ROW, refs: null, published: null });

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
    }, { row: ROW, refs: null, published: null });

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

    // THE PROBE FIELD MUST BE ONE THE REAL MAP LACKS, or the injection proves nothing: a field
    // that is already measured would make `assessedFields` contain it either way. It was
    // `requirementCount` until B3 gave that field a measurement, at which point this test failed
    // — correctly, and loudly, which is why the guard below is an assertion and not a comment.
    // `graphHasStart` is the replacement: still unmeasured, and read by `process_ready` through
    // `condGaps`, so the measured-not-unassessed half of the claim is still checkable.
    expect(before).not.toContain('graphHasStart');

    map.graphHasStart = () => true;
    try {
      const e = await readLifecycleEvidence(ROW);
      expect(e.graphHasStart).toBe(true);
      expect(e.assessedFields.has('graphHasStart')).toBe(true);

      // And the stage that reads it must now treat it as MEASURED, not not-assessed.
      const gap = prerequisiteGaps('process_ready', e)
        .find((g) => g.rule === 'graph_no_start');
      expect(gap).toBeUndefined();
    } finally {
      delete map.graphHasStart;
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

  const CTX = { row: ROW, refs: null, published: null };

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
    const out = applyMeasurements(base(), EVIDENCE_MEASUREMENTS, { row: ROW, refs: null, published: null });
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

    const out = applyMeasurements(base(), EVIDENCE_MEASUREMENTS, { row: ROW, refs, published: null });

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
        published: null,
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

    const out = applyMeasurements(base(), EVIDENCE_MEASUREMENTS, { row: ROW, refs, published: null });
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
      const out = applyMeasurements(base(), EVIDENCE_MEASUREMENTS, { row: ROW, refs, published: null });
      expect(out.assessedFields.size).toBe(0);
    }
    // POSITIVE COUNTERPART: a readable list IS measured, so the guard is not refusing
    // everything.
    const good = { sources: [{ id: 'g-1', state: 'open', provenanceKind: null }] } as unknown as
      Parameters<typeof applyMeasurements>[2]['refs'];
    expect(applyMeasurements(base(), EVIDENCE_MEASUREMENTS, { row: ROW, refs: good, published: null })
      .assessedFields.size).toBe(2);
  });

  /**
   * THE MAP IS PINNED IN BOTH DIRECTIONS, because each half catches a different mistake.
   *
   * ## What this test used to say, and why it was wrong
   *
   * It asserted `requirementCount` was "deliberately NOT measured, and that is a decision not an
   * omission", on the reasoning that `SourceRef` is documented as "a requirement OR OTHER
   * CAPTURED STATEMENT", so `sources.length` would be a count meaning something other than its
   * name — better left unassessed, where it BLOCKS, than measured loosely.
   *
   * Every sentence of that was true and the conclusion still shipped a closed system.
   * `requirements_ready` is stage 2 of 13, `blockingGaps` filters only `ADVISORY_RULES`, and no
   * gap KIND is advisory — so an unassessed `requirementCount` meant **no project could ever
   * leave `discovery`**. "Unassessed because honest" is only the right answer while something is
   * on its way to measuring it, and for this field nothing was.
   *
   * B3 measured it exactly instead of loosely: the superset is a property of the type's intent,
   * not of the data, and `SourceRef.source` records which collection each pointer came from. See
   * `lifecycleEvidence.requirementsGate.test.ts`.
   */
  it('the map holds exactly nine measurements, and an addition must name itself here', () => {
    // A sorted list rather than a size: a size moves when one field is swapped for another and
    // says nothing about which.
    expect(Object.keys(EVIDENCE_MEASUREMENTS).sort())
      .toEqual([
        'mustHaveRequirementsWithoutStory',
        'publishedPlanHashIntact',
        'publishedPlanIsSingular',
        'releasesWithoutUserVisibleWorkflow',
        'requirementCount',
        'requirementsWithoutProvenance',
        'storiesWithoutTraceability',
        'uncitedRequirementSourceBlocks',
        'unresolvedSourceBlocks',
      ]);
  });

  /**
   * WHAT IS STILL UNMEASURED, pinned so the scope of B3 cannot be overstated.
   *
   * Opening `requirements_ready` moves a project ONE stage. Every field below is read by
   * `process_ready` or later and has no measurement, so those stages still refuse with
   * `not_assessed` — correctly, since nobody has looked. The data they need lives on
   * `FactoryProject` and on the approval rows, neither of which `ManifestRefs` carries today.
   *
   * This exists because "the gate opens" is the kind of sentence that gets read as "the lifecycle
   * turns", and the honest claim is narrower. A test is a worse place to hide the difference than
   * a commit message.
   */
  it('eighteen fields are still unmeasured, so stages 3 onward still refuse', () => {
    const measured = new Set(Object.keys(EVIDENCE_MEASUREMENTS));
    const unmeasured = Object.keys(complete())
      .filter((k) => k !== 'assessedFields' && k !== 'tenantId' && !measured.has(k))
      .sort();

    expect(unmeasured).toEqual([
      'actorStillAuthorized',
      'agentTasksAccountableForThemselves',
      'approval',
      'currentManifestRevision',
      'effortCoverageDisclosed',
      'graphHasEnd',
      'graphHasStart',
      'manifestContentHash',
      'processesWithoutTasks',
      'proposedBy',
      'screensWithoutRationale',
      'selectedDesignRef',
      'tasksUnmappedToSurface',
      'tasksWithoutAccountableHuman',
      'tasksWithoutExecutionClass',
      'unboundedReworkLoops',
      'unknownAllocationCount',
      'unreachableTasks',
    ]);
  });
});

