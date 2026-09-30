/**
 * certReadinessService — the readiness policy.
 *
 * The behaviour under test is the product decision: knowledge dominates, evidence
 * counts but cannot carry, and the badge state cannot be reached by one good run.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/CertSession', () => ({ __esModule: true, default: { count: jest.fn() } }));
jest.mock('../../../models/CertResponse', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../../models/CertEvidenceMapping', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../../models/CertReadinessSnapshot', () => ({
  __esModule: true,
  default: { create: jest.fn(), findAll: jest.fn() },
}));
jest.mock('../certBlueprintService', () => ({
  getCurrentBlueprint: jest.fn(),
  weightsAreUsable: jest.fn().mockReturnValue(true),
}));
jest.mock('../certPointsService', () => ({ awardSustainedReadiness: jest.fn().mockResolvedValue({ awarded: true }) }));

import CertSession from '../../../models/CertSession';
import CertResponse from '../../../models/CertResponse';
import CertEvidenceMapping from '../../../models/CertEvidenceMapping';
import CertReadinessSnapshot from '../../../models/CertReadinessSnapshot';
import { getCurrentBlueprint } from '../certBlueprintService';
import { awardSustainedReadiness } from '../certPointsService';
import {
  tallyByDomain,
  weightedKnowledgeScaled,
  computeSampleConfidence,
  evidenceToScaled,
  blendReadiness,
  deriveState,
  computeReadiness,
  recordReadinessSnapshot,
  KNOWLEDGE_WEIGHT,
  EVIDENCE_WEIGHT,
  MIN_ITEMS_FOR_SCORE,
  SUSTAINED_MIN_SITTINGS,
  SUSTAINED_MIN_CONFIDENCE,
  CONFIDENCE_TARGET_PER_DOMAIN,
} from '../certReadinessService';
import { PASSING_SCALED, SCALE_MIN, SCALE_MAX } from '../certScoring';

const mCount = CertSession.count as unknown as jest.Mock;
const mResponses = CertResponse.findAll as unknown as jest.Mock;
const mMappings = CertEvidenceMapping.findAll as unknown as jest.Mock;
const mSnapshot = CertReadinessSnapshot.create as unknown as jest.Mock;
const mBlueprint = getCurrentBlueprint as unknown as jest.Mock;
const mAwardSustained = awardSustainedReadiness as unknown as jest.Mock;

const DOMAINS = [
  { domain_id: 'D1', weight_pct: 27, objectives: [{ objective_id: 'D1.1', label: 'a' }, { objective_id: 'D1.2', label: 'b' }] },
  { domain_id: 'D2', weight_pct: 18, objectives: [{ objective_id: 'D2.1', label: 'c' }] },
];

beforeEach(() => {
  jest.clearAllMocks();
  mBlueprint.mockResolvedValue({
    track: { track_id: 'ccar-f', blueprint_version: '1.0-2026-07' },
    domains: DOMAINS,
  });
  mCount.mockResolvedValue(0);
  mResponses.mockResolvedValue([]);
  mMappings.mockResolvedValue([]);
  mSnapshot.mockImplementation(async (attrs: any) => ({ ...attrs, id: 'snap1' }));
});

describe('tallyByDomain', () => {
  it('counts answered items only', () => {
    const stats = tallyByDomain([
      { domain_id: 'D1', is_correct: true },
      { domain_id: 'D1', is_correct: false },
      { domain_id: 'D1', is_correct: null },
    ]);
    expect(stats.get('D1')).toEqual({ domain_id: 'D1', correct: 1, answered: 2 });
  });
});

describe('weightedKnowledgeScaled', () => {
  it('weights domains by the official blueprint weights', () => {
    const stats = tallyByDomain([
      ...Array(10).fill({ domain_id: 'D1', is_correct: true }),
      ...Array(10).fill({ domain_id: 'D2', is_correct: false }),
    ]);
    // D1 100% at weight 27, D2 0% at weight 18 -> 27/45 = 0.6
    expect(weightedKnowledgeScaled(stats, DOMAINS)).toBe(640); // 100 + 900*0.6
  });

  it('EXCLUDES untouched domains rather than scoring them zero', () => {
    const stats = tallyByDomain([{ domain_id: 'D1', is_correct: true }]);
    // D2 untouched: unmeasured, not failed. Result is D1's 100%.
    expect(weightedKnowledgeScaled(stats, DOMAINS)).toBe(SCALE_MAX);
  });

  it('falls back to equal weighting when the blueprint is unweighted', () => {
    const stats = tallyByDomain([
      { domain_id: 'D1', is_correct: true },
      { domain_id: 'D2', is_correct: false },
    ]);
    const unweighted = DOMAINS.map((d) => ({ ...d, weight_pct: null }));
    expect(weightedKnowledgeScaled(stats, unweighted)).toBe(550); // equal halves
  });

  it('returns null when nothing has been answered', () => {
    expect(weightedKnowledgeScaled(new Map(), DOMAINS)).toBeNull();
  });
});

describe('computeSampleConfidence', () => {
  it('an untouched domain drags confidence down — breadth matters, not just volume', () => {
    const oneDomainOnly = tallyByDomain(
      Array(CONFIDENCE_TARGET_PER_DOMAIN * 3).fill({ domain_id: 'D1', is_correct: true }),
    );
    // D1 saturated, D2 untouched -> mean of (1, 0)
    expect(computeSampleConfidence(oneDomainOnly, DOMAINS)).toBe(0.5);
  });

  it('reaches 1 only when every domain is well sampled', () => {
    const both = tallyByDomain([
      ...Array(CONFIDENCE_TARGET_PER_DOMAIN).fill({ domain_id: 'D1', is_correct: true }),
      ...Array(CONFIDENCE_TARGET_PER_DOMAIN).fill({ domain_id: 'D2', is_correct: true }),
    ]);
    expect(computeSampleConfidence(both, DOMAINS)).toBe(1);
  });

  it('boundary: no responses is zero confidence, not undefined', () => {
    expect(computeSampleConfidence(new Map(), DOMAINS)).toBe(0);
    expect(computeSampleConfidence(new Map(), [])).toBe(0);
  });
});

describe('blendReadiness — evidence counts, but cannot carry', () => {
  it('uses the agreed 80/20 split', () => {
    expect(KNOWLEDGE_WEIGHT).toBe(0.8);
    expect(EVIDENCE_WEIGHT).toBe(0.2);
    expect(KNOWLEDGE_WEIGHT + EVIDENCE_WEIGHT).toBe(1);
  });

  it('no evidence drags a strong knowledge score below the bar', () => {
    // 800 knowledge, zero evidence -> 0.8*800 + 0.2*100 = 660
    expect(blendReadiness(800, 0)).toBe(660);
    expect(blendReadiness(800, 0)!).toBeLessThan(PASSING_SCALED);
  });

  it('full evidence lifts the same knowledge score well clear of it', () => {
    expect(blendReadiness(800, 100)).toBe(840);
  });

  it('evidence ALONE cannot reach the bar without knowledge', () => {
    // perfect evidence, weak knowledge
    expect(blendReadiness(300, 100)!).toBeLessThan(PASSING_SCALED);
  });

  it('returns null when knowledge is unmeasured, regardless of evidence', () => {
    expect(blendReadiness(null, 100)).toBeNull();
  });

  it('evidenceToScaled clamps out-of-range coverage', () => {
    expect(evidenceToScaled(0)).toBe(SCALE_MIN);
    expect(evidenceToScaled(100)).toBe(SCALE_MAX);
    expect(evidenceToScaled(150)).toBe(SCALE_MAX);
    expect(evidenceToScaled(-5)).toBe(SCALE_MIN);
  });
});

describe('deriveState — one good run does not unlock the badge', () => {
  const base = { answeredTotal: 100, overallScaled: 800, sampleConfidence: 0.9, qualifyingSittings: 2 };

  it('sustained requires the bar AND confidence AND multiple sittings', () => {
    expect(deriveState(base)).toBe('sustained');
  });

  it('a single qualifying sitting is only "approaching", however good', () => {
    expect(deriveState({ ...base, qualifyingSittings: SUSTAINED_MIN_SITTINGS - 1 })).toBe('approaching');
  });

  it('a narrow sample is only "approaching", however high the score', () => {
    expect(deriveState({ ...base, sampleConfidence: SUSTAINED_MIN_CONFIDENCE - 0.01 })).toBe('approaching');
  });

  it('below the bar is "building"', () => {
    expect(deriveState({ ...base, overallScaled: PASSING_SCALED - 1 })).toBe('building');
  });

  it('boundary: exactly at the bar counts', () => {
    expect(deriveState({ ...base, overallScaled: PASSING_SCALED })).toBe('sustained');
  });

  it('too few answered items is "not measured", not "building"', () => {
    expect(deriveState({ ...base, answeredTotal: MIN_ITEMS_FOR_SCORE - 1 })).toBe('not_measured');
  });

  it('an unmeasured score is never promoted to a state', () => {
    expect(deriveState({ ...base, overallScaled: null })).toBe('not_measured');
  });
});

describe('computeReadiness', () => {
  it('returns null when no blueprint is configured', async () => {
    mBlueprint.mockResolvedValue(null);
    await expect(computeReadiness('e1')).resolves.toBeNull();
  });

  it('counts ONLY verified evidence — pending mappings do not raise readiness', async () => {
    mMappings.mockResolvedValue([{ domain_id: 'D1', objective_id: 'D1.1' }]);
    const result = await computeReadiness('e1');
    // the query itself filters to verified
    expect(mMappings).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ mapping_state: 'verified' }) }),
    );
    // 1 of 3 objectives across the blueprint
    expect(result!.evidence_coverage_pct).toBeCloseTo(33.33, 1);
  });

  it('only counts sittings long enough to mean something', async () => {
    await computeReadiness('e1');
    const where = mCount.mock.calls[0][0].where;
    expect(where.status).toBe('completed');
    expect(where.total_count).toBeDefined();  // minimum-items filter present
    expect(where.scaled_score).toBeDefined(); // at-or-above-bar filter present
  });

  it('reports a domain the student has not touched as unmeasured, not zero', async () => {
    mResponses.mockResolvedValue([{ domain_id: 'D1', is_correct: true }]);
    const result = await computeReadiness('e1');
    const d2 = result!.domain_breakdown.find((d) => d.domain_id === 'D2')!;
    expect(d2.knowledge_pct).toBeNull();
    expect(d2.answered).toBe(0);
  });

  it('an empty history is not_measured with zero confidence', async () => {
    const result = await computeReadiness('e1');
    expect(result!.overall_state).toBe('not_measured');
    expect(result!.knowledge_scaled).toBeNull();
    expect(result!.sample_confidence).toBe(0);
    expect(result!.answered_total).toBe(0);
  });
});

describe('recordReadinessSnapshot', () => {
  it('persists every component so the number stays explainable', async () => {
    mResponses.mockResolvedValue(Array(30).fill({ domain_id: 'D1', is_correct: true }));
    await recordReadinessSnapshot('e1');
    const written = mSnapshot.mock.calls[0][0];
    ['knowledge_scaled', 'evidence_coverage_pct', 'sample_confidence', 'overall_scaled',
      'overall_state', 'weights_available', 'domain_breakdown', 'readiness_policy_version']
      .forEach((field) => expect(written).toHaveProperty(field));
    expect(written.readiness_policy_version).toBe('v1-knowledge-dominant');
  });

  it('pays the sustained award only when sustained is actually reached', async () => {
    mResponses.mockResolvedValue([
      ...Array(30).fill({ domain_id: 'D1', is_correct: true }),
      ...Array(30).fill({ domain_id: 'D2', is_correct: true }),
    ]);
    mMappings.mockResolvedValue([
      { domain_id: 'D1', objective_id: 'D1.1' },
      { domain_id: 'D1', objective_id: 'D1.2' },
      { domain_id: 'D2', objective_id: 'D2.1' },
    ]);
    mCount.mockResolvedValue(SUSTAINED_MIN_SITTINGS);

    const result = await recordReadinessSnapshot('e1');
    expect(result!.computation.overall_state).toBe('sustained');
    expect(mAwardSustained).toHaveBeenCalled();
  });

  it('does NOT pay when readiness is merely approaching', async () => {
    mResponses.mockResolvedValue(Array(30).fill({ domain_id: 'D1', is_correct: true }));
    mCount.mockResolvedValue(1); // one sitting only
    const result = await recordReadinessSnapshot('e1');
    expect(result!.computation.overall_state).not.toBe('sustained');
    expect(mAwardSustained).not.toHaveBeenCalled();
  });

  it('returns null without writing when no blueprint exists', async () => {
    mBlueprint.mockResolvedValue(null);
    await expect(recordReadinessSnapshot('e1')).resolves.toBeNull();
    expect(mSnapshot).not.toHaveBeenCalled();
  });
});
