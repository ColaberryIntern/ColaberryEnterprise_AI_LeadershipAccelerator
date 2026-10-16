/**
 * B3 — THE FIRST GATE, which no project could pass.
 *
 * ## The defect these tests pin
 *
 * `requirements_ready` is stage 2 of 13 and needs four things: a requirement count above zero,
 * no requirement without provenance, no uncited requirement source block, no unresolved source
 * block. Two of the four — `requirementCount` and `uncitedRequirementSourceBlocks` — had NO
 * measurement function in `EVIDENCE_MEASUREMENTS` at all.
 *
 * `blockingGaps` filters only `ADVISORY_RULES`, and `not_assessed` is a gap KIND rather than a
 * rule, so no unassessed field is ever advisory. The consequence was not a degraded gate, it was
 * a closed one: **no project could leave `discovery`, ever**, and the lifecycle was built,
 * deployed and activated in production in that state.
 *
 * ## Why these tests are shaped this way
 *
 * The positive control is LAST and it is the only one that would have been impossible before:
 * a real manifest's refs produce ZERO blocking gaps at `requirements_ready`. Every other test
 * here is a refusal, and a file of refusals passes just as happily against a measurement that
 * returns NOT_MEASURED unconditionally — which is exactly the state being fixed.
 *
 * Refs are built by the SHIPPED ADAPTERS rather than hand-written. A hand-written ref object
 * would let these tests pass while the adapters emitted something the measurement cannot read,
 * and that seam — producer and consumer agreeing in a test and disagreeing in production — is
 * the one this programme has been caught on most.
 */
import { factoryToManifestRefs } from '../adapters/factoryAdapter';
import { sbpToManifestRefs } from '../adapters/sbpAdapter';
import {
  emptyRefs, REQUIREMENT_SOURCE_COLLECTIONS, type ManifestRefs,
} from '../adapters/manifestRefs';
import {
  EVIDENCE_MEASUREMENTS, applyMeasurements, NOT_MEASURED, type EvidenceContext,
} from '../lifecycleEvidence';
import {
  prerequisiteGaps, blockingGaps, notAssessedGaps, type LifecycleEvidence,
} from '../lifecyclePrerequisites';
import { completeEvidence } from './evidenceFixture';

const ROW = {
  id: 'lc-1',
  tenant_id: 'tenant-1',
  student_project_id: null,
  delivery_project_id: 'dp-1',
  stage: 'discovery',
  condition: null,
  condition_reason: null,
};

/** A context over the given refs. `published: null` keeps every measurement pure — no I/O. */
function ctx(refs: ManifestRefs | null): EvidenceContext {
  return { row: ROW, refs, published: null };
}

/**
 * The evidence a context actually yields.
 *
 * `completeEvidence()` is the base ON PURPOSE, and it is the harder base to pass with. Every
 * field it carries is already the satisfying value, so a measurement that silently failed to run
 * would leave a PASSING placeholder behind — except that `applyMeasurements` recomputes
 * `assessedFields` from what was measured on this call, so the placeholder stays unassessed and
 * the prerequisite still refuses. Starting from the satisfying snapshot is what proves the
 * refusals below come from `assessedFields` rather than from happening to inherit a failing
 * default.
 */
function evidenceFrom(refs: ManifestRefs | null): LifecycleEvidence {
  return applyMeasurements(completeEvidence(), EVIDENCE_MEASUREMENTS, ctx(refs));
}

/** Refs for a delivery project with `n` requirements, and whatever coverage is passed. */
function factoryRefs(opts: {
  requirements?: number;
  sourceBlocks?: Array<{ id: string; kind: string }>;
  tasks?: Array<{ id: string; source_evidence?: string[] }>;
} = {}): ManifestRefs {
  const n = opts.requirements ?? 3;
  return factoryToManifestRefs({
    deliveryProjectId: 'dp-1',
    documentVersion: 2,
    requirements: Array.from({ length: n }, (_, i) => ({
      canonical_req_id: `R-${i + 1}`,
      evidence_state: 'tested',
      source_document: 'solicitation-A',
      amendment_version: '1',
    })),
    ...(opts.sourceBlocks === undefined ? {} : { sourceBlocks: opts.sourceBlocks }),
    tasks: opts.tasks ?? [],
  });
}

describe('requirementCount is measured EXACTLY, from the collection each source came from', () => {
  it('counts a delivery project’s requirements and marks the field assessed', () => {
    const e = evidenceFrom(factoryRefs({ requirements: 7 }));

    expect(e.assessedFields.has('requirementCount')).toBe(true);
    expect(e.requirementCount).toBe(7);
  });

  it('counts a student project’s requirements too — both origins, one measurement', () => {
    // Without this, a filter that recognised only `contract_requirements` would pass every
    // delivery test above and block every student project in production.
    const refs = sbpToManifestRefs({
      projectId: 'sp-1',
      planVersion: 3,
      requirements: [
        { id: 'req-a', source: 'intake', human_confirmed: true },
        { id: 'req-b', source: 'intake', human_confirmed: false },
      ],
    });
    const e = evidenceFrom(refs);

    expect(e.assessedFields.has('requirementCount')).toBe(true);
    expect(e.requirementCount).toBe(2);
  });

  it('ZERO IS A MEASUREMENT, not an absence: no requirements captured refuses as `unmet`', () => {
    // The distinction the whole gap-kind field exists for. An empty manifest HAS been looked at
    // and genuinely holds no requirements, so the reviewer's action is "capture some" rather than
    // "run the assessment". Reporting it as `not_assessed` would send them to the wrong place.
    const e = evidenceFrom(factoryRefs({ requirements: 0 }));

    expect(e.assessedFields.has('requirementCount')).toBe(true);
    expect(e.requirementCount).toBe(0);

    const gaps = prerequisiteGaps('requirements_ready', e);
    const count = gaps.filter((g) => g.rule === 'no_requirements');
    expect(count).toHaveLength(1);
    expect(count[0].kind).toBe('unmet');
  });

  it('an UNCLASSIFIED source collection is not counted approximately — it is not counted', () => {
    // The reason the field was left unmeasured in the first place: `SourceRef` is documented as
    // "a requirement OR OTHER CAPTURED STATEMENT". One pointer from a collection nobody has
    // classified means the count would be a guess, and a guess here is a number published under
    // a name that does not describe it.
    const refs = factoryRefs({ requirements: 4 });
    refs.sources.push({
      id: 'note-1', revision: 1, source: 'meeting_notes', state: 'heard', provenanceKind: null,
    });

    const e = evidenceFrom(refs);
    expect(e.assessedFields.has('requirementCount')).toBe(false);
    expect(notAssessedGaps(prerequisiteGaps('requirements_ready', e))
      .some((g) => g.rule === 'no_requirements')).toBe(true);
  });

  it('the measurement returns the symbol, not a fallback number, when it cannot measure', () => {
    // Asserted against the map directly as well as through the gate. A measurement returning `0`
    // instead of NOT_MEASURED would read as "assessed, and zero requirements" — a fabricated
    // measured refusal, which this file treats as the same class of defect as a fabricated pass.
    const take = EVIDENCE_MEASUREMENTS.requirementCount!;
    expect(take(ctx(null))).toBe(NOT_MEASURED);
  });
});

describe('uncitedRequirementSourceBlocks reads what the composer MEASURED, never a default', () => {
  const BLOCKS = [
    { id: 'b-1', kind: 'requirement' },
    { id: 'b-2', kind: 'requirement' },
    { id: 'b-3', kind: 'context' },
  ];

  it('names the requirement block no task cites, and leaves the others alone', () => {
    const e = evidenceFrom(factoryRefs({
      sourceBlocks: BLOCKS,
      tasks: [{ id: 't-1', source_evidence: ['b-1'] }],
    }));

    expect(e.assessedFields.has('uncitedRequirementSourceBlocks')).toBe(true);
    // `b-2` only. `b-3` is `context` and is legitimately uncited; `b-1` is cited.
    expect(e.uncitedRequirementSourceBlocks).toEqual(['b-2']);

    const gap = prerequisiteGaps('requirements_ready', e)
      .find((g) => g.rule === 'source_block_uncited');
    expect(gap?.kind).toBe('unmet');
    expect(gap?.subject).toBe('b-2');
  });

  it('EMPTY IS A PASS, and only an adapter that actually looked can produce it', () => {
    const e = evidenceFrom(factoryRefs({
      sourceBlocks: BLOCKS,
      tasks: [{ id: 't-1', source_evidence: ['b-1', 'b-2'] }],
    }));

    expect(e.assessedFields.has('uncitedRequirementSourceBlocks')).toBe(true);
    expect(e.uncitedRequirementSourceBlocks).toEqual([]);
  });

  it('a task citing NOTHING contributes no citations — it is not skipped', () => {
    // Skipping a task with no `source_evidence` would be the same as treating "cites nothing" as
    // "cites everything", and citing nothing is a violation `factoryValidate` already reports.
    const e = evidenceFrom(factoryRefs({
      sourceBlocks: BLOCKS,
      tasks: [{ id: 't-1' }, { id: 't-2', source_evidence: [] }],
    }));

    expect(e.uncitedRequirementSourceBlocks).toEqual(['b-1', 'b-2']);
  });

  it('NOBODY MEASURED (`null`) blocks, and does not read as clean', () => {
    // A factory input that supplied no source blocks. `null` must not launder into `[]`.
    const refs = factoryRefs({ requirements: 3 });
    expect(refs.coverage.uncitedRequirementBlocks).toBeNull();

    const e = evidenceFrom(refs);
    expect(e.assessedFields.has('uncitedRequirementSourceBlocks')).toBe(false);
    expect(notAssessedGaps(prerequisiteGaps('requirements_ready', e))
      .some((g) => g.rule === 'source_block_uncited')).toBe(true);
  });

  it('A LEGACY MANIFEST, whose JSON has no `coverage` key at all, also blocks', () => {
    // `refs_json` is cast `parsed as ManifestRefs` at the JSONB boundary, so a row written before
    // this field existed arrives with `coverage` undefined rather than null. One `Array.isArray`
    // has to cover both, and `?.` must not throw on the way.
    const legacy = factoryRefs({ requirements: 3 }) as Record<string, unknown>;
    delete legacy.coverage;

    const e = evidenceFrom(legacy as unknown as ManifestRefs);
    expect(e.assessedFields.has('uncitedRequirementSourceBlocks')).toBe(false);
  });

  it('ONE unreadable element makes the WHOLE list unmeasurable, not a shorter list', () => {
    // A shorter gap list reads as better news. `[null, 'b-2']` reported as `['b-2']` would hide a
    // block nobody can name, and rendered raw it produces "Source block null is a requirement".
    const refs = factoryRefs({ requirements: 3 });
    refs.coverage.uncitedRequirementBlocks = [null as unknown as string, 'b-2'];

    const e = evidenceFrom(refs);
    expect(e.assessedFields.has('uncitedRequirementSourceBlocks')).toBe(false);
  });

  it('a student project is VACUOUSLY clean here, which is the documented limitation', () => {
    // SBP has no source-block layer, so zero requirement blocks are uncited and `[]` is literal
    // truth. Pinned because it is the half of this change a reader is most likely to mistake for
    // a pass: this gate does no work for a student build, and that is said out loud in the
    // adapter and in docs/project-lifecycle/backbone-adoption.md.
    const refs = sbpToManifestRefs({
      projectId: 'sp-1', planVersion: 1, requirements: [{ id: 'req-a', source: 'intake' }],
    });

    expect(refs.coverage.uncitedRequirementBlocks).toEqual([]);
    expect(evidenceFrom(refs).assessedFields.has('uncitedRequirementSourceBlocks')).toBe(true);
  });
});

describe('THE GATE OPENS — the claim that was impossible before this change', () => {
  it('a complete delivery manifest has ZERO blocking gaps at requirements_ready', () => {
    const e = evidenceFrom(factoryRefs({
      requirements: 5,
      sourceBlocks: [{ id: 'b-1', kind: 'requirement' }, { id: 'b-2', kind: 'context' }],
      tasks: [{ id: 't-1', source_evidence: ['b-1'] }],
    }));

    const gaps = prerequisiteGaps('requirements_ready', e);
    // Printed in the failure message rather than asserted as a bare length, because "which gap"
    // is the entire diagnostic and `expect([]).toHaveLength(0)` throws it away.
    expect(blockingGaps(gaps).map((g) => `${g.rule}:${g.kind}`)).toEqual([]);
  });

  it('and a complete STUDENT manifest does too — both consumers of the backbone', () => {
    const e = evidenceFrom(sbpToManifestRefs({
      projectId: 'sp-1',
      planVersion: 1,
      requirements: [
        { id: 'req-a', source: 'intake', human_confirmed: true },
        { id: 'req-b', source: 'interview', human_confirmed: true },
      ],
    }));

    expect(blockingGaps(prerequisiteGaps('requirements_ready', e))
      .map((g) => `${g.rule}:${g.kind}`)).toEqual([]);
  });

  it('A SKELETON REF SET STILL REFUSES, so the gate was opened and not removed', () => {
    // The control on the two tests above. `emptyRefs` has measured nothing, and if it passed,
    // what they proved would be that the gate no longer gates.
    const gaps = prerequisiteGaps('requirements_ready', evidenceFrom(emptyRefs('factory', 'dp-1')));
    expect(blockingGaps(gaps).length).toBeGreaterThan(0);
    expect(notAssessedGaps(gaps).map((g) => g.rule).sort())
      .toEqual(['source_block_uncited']);
  });
});

describe('REQUIREMENT_SOURCE_COLLECTIONS cannot drift away from the adapters', () => {
  it('is exactly the set of `source` values the two adapters emit, in BOTH directions', () => {
    // A subset assertion would miss an adapter that started emitting a third collection — which
    // surfaces in production as a silently unassessed prerequisite, not as a failure. A superset
    // assertion would miss a stale name left in the set after an adapter moved.
    const emitted = new Set<string>([
      ...factoryRefs({ requirements: 1 }).sources.map((s) => s.source),
      ...sbpToManifestRefs({
        projectId: 'sp-1', planVersion: 1, requirements: [{ id: 'r', source: 'intake' }],
      }).sources.map((s) => s.source),
    ]);

    expect([...emitted].sort()).toEqual([...REQUIREMENT_SOURCE_COLLECTIONS].sort());
  });
});
