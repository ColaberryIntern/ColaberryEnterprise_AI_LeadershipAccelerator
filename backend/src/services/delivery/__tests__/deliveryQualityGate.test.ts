/**
 * Gate 9 — Quality OS + Evidence.
 *
 * The gate's whole value is that it refuses. So the tests that matter most are the ones
 * that prove it refuses for the right reason — and the negative controls that prove a
 * passing assertion is not passing vacuously.
 */

import {
  DELIVERY_EVIDENCE_TYPES,
  DIMENSION_SATISFIED_BY,
  POST_RELEASE_DIMENSIONS,
  QUALITY_DIMENSIONS,
  QUALITY_DIMENSION_MEANINGS,
  SHA_PINNED_DIMENSIONS,
  deliveryEvidenceKey,
  isDeliveryEvidenceType,
  isPostRelease,
  isQualityDimension,
  isSatisfyingOutcome,
  isShaPinned,
  type DeliveryEvidenceType,
  type QualityDimension,
} from '../../../modules/delivery/deliveryEvidence';
import {
  evaluateQualityGate,
  requiredDimensionsFor,
  type QualityEvidenceInput,
} from '../deliveryQualityGate';
import {
  projectDeliveryEvidence,
  projectProgressionToDelivery,
} from '../deliveryEvidenceProjection';
import type { DeliveryStoryContract } from '../deliveryStoryContract';

const SHA = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const OTHER_SHA = '9999999999999999999999999999999999999999';

function story(overrides: Partial<DeliveryStoryContract> = {}): DeliveryStoryContract {
  return {
    storyId: 'story-1',
    title: 'A story',
    fulfills: ['req-1'],
    riskLevel: 'R1',
    ...overrides,
  };
}

/** Evidence that satisfies a dimension, pinned to the candidate commit. */
function pass(dimension: QualityDimension, evidenceType?: DeliveryEvidenceType): QualityEvidenceInput {
  return {
    dimension,
    evidenceType: evidenceType ?? DIMENSION_SATISFIED_BY[dimension][0],
    outcome: 'pass',
    subjectSha: SHA,
    sourceRef: `ref-${dimension}`,
  };
}

/** The three dimensions every story owes, whatever else it is. */
const BASELINE: QualityDimension[] = [
  'requirements_coverage',
  'acceptance_coverage',
  'unit_tests',
];

const baselineEvidence = () => BASELINE.map((d) => pass(d));

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

describe('quality vocabulary', () => {
  it('declares the master plan’s fourteen dimensions and fourteen evidence types', () => {
    expect(QUALITY_DIMENSIONS).toHaveLength(14);
    expect(DELIVERY_EVIDENCE_TYPES).toHaveLength(14);
  });

  it('every dimension has at least one evidence type that can satisfy it', () => {
    // A dimension with no satisfier could never pass, which would make the gate
    // unsatisfiable rather than strict.
    for (const dimension of QUALITY_DIMENSIONS) {
      expect(DIMENSION_SATISFIED_BY[dimension].length).toBeGreaterThan(0);
    }
  });

  it('every satisfier is a real evidence type', () => {
    for (const dimension of QUALITY_DIMENSIONS) {
      for (const type of DIMENSION_SATISFIED_BY[dimension]) {
        expect(isDeliveryEvidenceType(type)).toBe(true);
      }
    }
  });

  it('every dimension is explained in plain language', () => {
    for (const dimension of QUALITY_DIMENSIONS) {
      expect(QUALITY_DIMENSION_MEANINGS[dimension]?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it('rejects unknown dimensions and evidence types', () => {
    expect(isQualityDimension('vibes')).toBe(false);
    expect(isDeliveryEvidenceType('a_feeling')).toBe(false);
  });

  it('only pass satisfies — not_run and partial do not', () => {
    expect(isSatisfyingOutcome('pass')).toBe(true);
    expect(isSatisfyingOutcome('partial')).toBe(false);
    expect(isSatisfyingOutcome('not_run')).toBe(false);
    expect(isSatisfyingOutcome('fail')).toBe(false);
  });

  it('SHA-pinned and post-release sets are disjoint and real', () => {
    for (const d of SHA_PINNED_DIMENSIONS) expect(isQualityDimension(d)).toBe(true);
    for (const d of POST_RELEASE_DIMENSIONS) expect(isQualityDimension(d)).toBe(true);
    for (const d of SHA_PINNED_DIMENSIONS) expect(isPostRelease(d)).toBe(false);
  });

  it('client acceptance is deliberately NOT sha-pinned', () => {
    // Re-requiring a client's sign-off on every commit would mean quietly dropping the
    // requirement. Scope changes are Gate 10's job, not SHA pinning's.
    expect(isShaPinned('client_acceptance')).toBe(false);
    expect(isShaPinned('unit_tests')).toBe(true);
  });

  it('the idempotency key varies with the source ref', () => {
    const base = { deliveryProjectId: 'p1', storyId: 's1', evidenceType: 'test_run' as const };
    // Two runs of the same dimension against different commits ARE different evidence;
    // collapsing them would discard the newer measurement.
    expect(deliveryEvidenceKey({ ...base, sourceRef: 'run-1' })).not.toEqual(
      deliveryEvidenceKey({ ...base, sourceRef: 'run-2' }),
    );
    expect(deliveryEvidenceKey({ ...base, sourceRef: 'run-1' })).toEqual(
      deliveryEvidenceKey({ ...base, sourceRef: 'run-1' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Which dimensions are required
// ---------------------------------------------------------------------------

describe('requiredDimensionsFor', () => {
  const names = (input: Parameters<typeof requiredDimensionsFor>[0]) =>
    requiredDimensionsFor(input).map((r) => r.dimension);

  it('every story owes requirements, acceptance and unit tests', () => {
    expect(names({ story: story(), evidence: [] })).toEqual(expect.arrayContaining(BASELINE));
  });

  it('a low-risk non-UI story owes ONLY the baseline', () => {
    // The negative control for every "adds X" test below. Without it, a bug that required
    // everything unconditionally would still pass them all.
    expect(names({ story: story({ riskLevel: 'R0' }), evidence: [] }).sort()).toEqual(
      [...BASELINE].sort(),
    );
  });

  it('R2 and above adds integration; R3 and above adds security', () => {
    expect(names({ story: story({ riskLevel: 'R1' }), evidence: [] })).not.toContain('integration');
    expect(names({ story: story({ riskLevel: 'R2' }), evidence: [] })).toContain('integration');
    expect(names({ story: story({ riskLevel: 'R2' }), evidence: [] })).not.toContain('security');
    expect(names({ story: story({ riskLevel: 'R4' }), evidence: [] })).toContain('security');
  });

  it('UI stories add browser, visual contract and accessibility', () => {
    const ui = names({ story: story(), evidence: [], isUiStory: true });
    expect(ui).toEqual(expect.arrayContaining(['browser', 'visual_contract', 'accessibility']));
  });

  it('agent-touching stories add AI evals and trust coverage', () => {
    const withAgents = names({ story: story({ agentImpacts: ['agent-1'] }), evidence: [] });
    expect(withAgents).toEqual(expect.arrayContaining(['ai_evals', 'trust_coverage']));
  });

  it('client_approval adds client acceptance', () => {
    expect(names({ story: story({ approvalPolicy: 'client_approval' }), evidence: [] })).toContain(
      'client_acceptance',
    );
    expect(names({ story: story({ approvalPolicy: 'internal_review' }), evidence: [] })).not.toContain(
      'client_acceptance',
    );
  });

  it('release scope adds architecture drift and defects; story scope does not', () => {
    expect(names({ story: story(), evidence: [], scope: 'release' })).toEqual(
      expect.arrayContaining(['architecture_drift', 'defects']),
    );
    expect(names({ story: story(), evidence: [], scope: 'story' })).not.toContain('defects');
  });

  it('production reliability can never be required before release', () => {
    // An unsatisfiable gate gets switched off, which is how a control becomes a checkbox.
    expect(names({ story: story(), evidence: [], phase: 'pre_release', scope: 'release' })).not.toContain(
      'production_reliability',
    );
    expect(names({ story: story(), evidence: [], phase: 'post_release' })).toContain(
      'production_reliability',
    );
  });

  it('never lists the same dimension twice', () => {
    const all = names({
      story: story({ riskLevel: 'R5', approvalPolicy: 'client_approval', agentImpacts: ['a'] }),
      evidence: [],
      isUiStory: true,
      scope: 'release',
    });
    expect(new Set(all).size).toBe(all.length);
  });

  it('states a reason for every requirement', () => {
    for (const r of requiredDimensionsFor({ story: story({ riskLevel: 'R4' }), evidence: [] })) {
      expect(r.reason.length).toBeGreaterThan(10);
    }
  });
});

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

describe('evaluateQualityGate', () => {
  it('passes when every required dimension has passing, current evidence', () => {
    const result = evaluateQualityGate({
      story: story({ riskLevel: 'R0' }),
      evidence: baselineEvidence(),
      candidateSha: SHA,
    });
    expect(result.passes).toBe(true);
    expect(result.blockingFindings).toEqual([]);
    expect(result.satisfied.sort()).toEqual([...BASELINE].sort());
  });

  it('FAILS CLOSED on no evidence at all', () => {
    const result = evaluateQualityGate({ story: story(), evidence: [], candidateSha: SHA });
    expect(result.passes).toBe(false);
    expect(result.blockingFindings.map((f) => f.rule)).toContain('missing_evidence');
    expect(result.blockingFindings).toHaveLength(BASELINE.length);
  });

  it('treats not_run as failure, not as a pass', () => {
    const evidence = baselineEvidence();
    evidence[0] = { ...evidence[0], outcome: 'not_run' };
    const result = evaluateQualityGate({ story: story(), evidence, candidateSha: SHA });
    expect(result.passes).toBe(false);
    expect(result.blockingFindings.map((f) => f.rule)).toContain('evidence_not_passing');
  });

  it('treats partial as failure too', () => {
    const evidence = baselineEvidence();
    evidence[1] = { ...evidence[1], outcome: 'partial' };
    expect(evaluateQualityGate({ story: story(), evidence, candidateSha: SHA }).passes).toBe(false);
  });

  it('blocks on a recorded failure even when that dimension was NOT required', () => {
    // The point of the rule: you do not get to un-know a red result because it was not on
    // the required list for this risk tier.
    const result = evaluateQualityGate({
      story: story({ riskLevel: 'R0' }),
      evidence: [
        ...baselineEvidence(),
        { dimension: 'security', evidenceType: 'security_scan', outcome: 'fail', subjectSha: SHA },
      ],
      candidateSha: SHA,
    });
    expect(requiredDimensionsFor({ story: story({ riskLevel: 'R0' }), evidence: [] }).map((r) => r.dimension))
      .not.toContain('security');
    expect(result.passes).toBe(false);
    expect(result.blockingFindings.map((f) => f.rule)).toContain('recorded_failure');
  });

  it('rejects evidence pinned to a different commit for SHA-pinned dimensions', () => {
    const evidence = baselineEvidence().map((e) => ({ ...e, subjectSha: OTHER_SHA }));
    const result = evaluateQualityGate({ story: story(), evidence, candidateSha: SHA });
    expect(result.passes).toBe(false);
    expect(result.blockingFindings.map((f) => f.rule)).toContain('stale_evidence');
  });

  it('does NOT apply SHA pinning to client acceptance', () => {
    const result = evaluateQualityGate({
      story: story({ approvalPolicy: 'client_approval' }),
      evidence: [
        ...baselineEvidence(),
        {
          dimension: 'client_acceptance',
          evidenceType: 'client_acceptance',
          outcome: 'pass',
          subjectSha: OTHER_SHA,
        },
      ],
      candidateSha: SHA,
    });
    expect(result.passes).toBe(true);
  });

  it('refuses evidence whose type cannot satisfy its declared dimension', () => {
    // A screenshot must not be able to claim it is a security scan.
    const result = evaluateQualityGate({
      story: story(),
      evidence: [
        ...baselineEvidence(),
        { dimension: 'security', evidenceType: 'screenshot', outcome: 'pass', subjectSha: SHA },
      ],
      candidateSha: SHA,
    });
    expect(result.blockingFindings.map((f) => f.rule)).toContain('evidence_type_mismatch');
    expect(result.passes).toBe(false);
  });

  it('never infers a dimension from an evidence type', () => {
    // One passing test_run declared for unit_tests must NOT also satisfy integration,
    // which shares `test_run` as a satisfier.
    const result = evaluateQualityGate({
      story: story({ riskLevel: 'R2' }), // R2 requires integration
      evidence: baselineEvidence(),
      candidateSha: SHA,
    });
    expect(result.satisfied).not.toContain('integration');
    expect(result.blockingFindings.some((f) => f.dimension === 'integration')).toBe(true);
  });

  it('rejects unknown dimensions and unknown evidence types on a row', () => {
    const result = evaluateQualityGate({
      story: story(),
      evidence: [
        ...baselineEvidence(),
        { dimension: 'vibes', evidenceType: 'test_run', outcome: 'pass', subjectSha: SHA },
        { dimension: 'security', evidenceType: 'a_feeling', outcome: 'pass', subjectSha: SHA },
      ],
      candidateSha: SHA,
    });
    const rules = result.blockingFindings.map((f) => f.rule);
    expect(rules).toContain('unknown_dimension');
    expect(rules).toContain('unknown_evidence_type');
  });

  it('honours evidence types the story contract itself declares', () => {
    const result = evaluateQualityGate({
      story: story({ evidenceRequired: ['browser_run'] }),
      evidence: baselineEvidence(),
      candidateSha: SHA,
    });
    expect(result.passes).toBe(false);
    expect(result.blockingFindings.map((f) => f.rule)).toContain('declared_evidence_missing');
  });

  it('blocks on an unknown entry in the story’s evidenceRequired', () => {
    const result = evaluateQualityGate({
      story: story({ evidenceRequired: ['telepathy'] }),
      evidence: baselineEvidence(),
      candidateSha: SHA,
    });
    expect(result.blockingFindings.map((f) => f.rule)).toContain('unknown_evidence_requirement');
  });

  it('reports EVERY failure, not just the first', () => {
    const result = evaluateQualityGate({
      story: story({ riskLevel: 'R4' }),
      evidence: [],
      candidateSha: SHA,
      isUiStory: true,
    });
    expect(result.blockingFindings.length).toBeGreaterThanOrEqual(7);
  });

  it('a passing gate with no candidate SHA still refuses missing evidence', () => {
    expect(evaluateQualityGate({ story: story(), evidence: [] }).passes).toBe(false);
  });

  it('skips SHA checks when no candidate SHA is supplied', () => {
    const evidence = baselineEvidence().map((e) => ({ ...e, subjectSha: null }));
    expect(evaluateQualityGate({ story: story(), evidence }).passes).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The one-way projection
// ---------------------------------------------------------------------------

describe('deliveryEvidenceProjection', () => {
  const base = {
    evidenceType: 'commit' as DeliveryEvidenceType,
    outcome: 'pass' as const,
    idempotencyKey: 'delivery_evidence:p1:s1:commit:abc',
    builderEnrollmentId: 'enrollment-1',
  };

  it('projects builder-authored work into progression', () => {
    const decision = projectDeliveryEvidence({ ...base, sourceRef: 'abc' });
    expect(decision.projects).toBe(true);
    if (decision.projects) {
      expect(decision.record.source_type).toBe('github_commit');
      expect(decision.record.enrollment_id).toBe('enrollment-1');
    }
  });

  it('reuses the SAME idempotency key so a replay collides on both sides', () => {
    const decision = projectDeliveryEvidence(base);
    if (decision.projects) expect(decision.record.idempotency_key).toBe(base.idempotencyKey);
    else throw new Error('expected a projection');
  });

  it('maps a pull request to the github_pr source', () => {
    const decision = projectDeliveryEvidence({ ...base, evidenceType: 'pull_request' });
    if (decision.projects) expect(decision.record.source_type).toBe('github_pr');
    else throw new Error('expected a projection');
  });

  it('does NOT project evidence the builder did not author', () => {
    for (const type of ['security_scan', 'operational_metric', 'client_acceptance'] as const) {
      const decision = projectDeliveryEvidence({ ...base, evidenceType: type });
      expect(decision.projects).toBe(false);
    }
  });

  it('does not project a non-passing outcome', () => {
    for (const outcome of ['fail', 'partial', 'not_run'] as const) {
      expect(projectDeliveryEvidence({ ...base, outcome }).projects).toBe(false);
    }
  });

  it('a builder with no enrollment is a supported outcome, not an error', () => {
    const decision = projectDeliveryEvidence({ ...base, builderEnrollmentId: null });
    expect(decision.projects).toBe(false);
    if (!decision.projects) expect(decision.reason).toMatch(/no enrollment/i);
  });

  it('always explains why it declined', () => {
    const decision = projectDeliveryEvidence({ ...base, evidenceType: 'screenshot' });
    // "No row was written" must be distinguishable from "the projection silently broke."
    if (!decision.projects) expect(decision.reason.length).toBeGreaterThan(10);
    else throw new Error('expected a refusal');
  });

  it('refuses to run in reverse', () => {
    expect(() => projectProgressionToDelivery()).toThrow(/one-way/i);
  });
});
