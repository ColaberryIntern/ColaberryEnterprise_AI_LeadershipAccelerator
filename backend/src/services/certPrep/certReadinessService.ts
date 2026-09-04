import { Op } from 'sequelize';
import CertSession from '../../models/CertSession';
import CertResponse from '../../models/CertResponse';
import CertEvidenceMapping from '../../models/CertEvidenceMapping';
import CertReadinessSnapshot, { CertReadinessState, CertDomainReadiness } from '../../models/CertReadinessSnapshot';
import { getCurrentBlueprint, weightsAreUsable } from './certBlueprintService';
import { toScaledScore, SCALE_MIN, SCALE_MAX, PASSING_SCALED } from './certScoring';
import { awardSustainedReadiness } from './certPointsService';

/**
 * certReadinessService — turns sittings and verified builds into one number, and
 * keeps that number explainable.
 *
 * THE PRODUCT DECISION THIS ENCODES (Ali, 2026-09-03): "build evidence can count
 * some, but they should keep taking practice exams until their scores get really
 * good." So knowledge dominates the score, evidence moves it meaningfully but
 * cannot carry it, and the badge state deliberately cannot be reached by one good
 * run — it needs sustained performance across more than one sitting, on a sample
 * large enough to mean something.
 *
 * WHY THE COMPONENTS ARE STORED SEPARATELY. A student who sees their readiness
 * move will ask why. `knowledge_scaled`, `evidence_coverage_pct` and
 * `sample_confidence` are each persisted on every snapshot, so the answer is
 * always available and never reconstructed. An unexplainable score is not a
 * credential anyone should trust.
 *
 * Everything here is a COLABERRY READINESS ESTIMATE. It shares an axis with the
 * real exam so it can be compared to the same 720 line; it is not a predicted
 * Anthropic score, and no surface may caption it as one. See certScoring.ts.
 */

/** This policy's own version. Stored on every snapshot so history stays truthful. */
export const READINESS_POLICY_VERSION = 'v1-knowledge-dominant';

/** Knowledge dominates; evidence counts, but cannot carry a student on its own. */
export const KNOWLEDGE_WEIGHT = 0.8;
export const EVIDENCE_WEIGHT = 0.2;

/**
 * Answered items per domain at which we consider that domain well sampled.
 * Confidence is the mean across domains, so breadth matters as much as volume —
 * 60 items all in one domain does not make a confident overall picture.
 */
export const CONFIDENCE_TARGET_PER_DOMAIN = 20;

/** Below this many answered items in total, we report no measurement at all. */
export const MIN_ITEMS_FOR_SCORE = 20;

/** A sitting only counts toward "sustained" if it was long enough to mean something. */
export const QUALIFYING_SITTING_MIN_ITEMS = 20;

/** How many qualifying sittings at or above the bar make readiness "sustained". */
export const SUSTAINED_MIN_SITTINGS = 2;

/** And the sample must be broad enough as well as good enough. */
export const SUSTAINED_MIN_CONFIDENCE = 0.6;

export interface ReadinessComputation {
  track_id: string;
  blueprint_version: string;
  readiness_policy_version: string;
  knowledge_scaled: number | null;
  evidence_coverage_pct: number;
  sample_confidence: number;
  overall_scaled: number | null;
  overall_state: CertReadinessState;
  weights_available: boolean;
  domain_breakdown: CertDomainReadiness[];
  qualifying_sittings: number;
  answered_total: number;
}

// ── pure core ────────────────────────────────────────────────────────────────

export interface DomainStat { domain_id: string; correct: number; answered: number }

/** Group answered responses by domain. Unanswered rows are ignored entirely. */
export function tallyByDomain(
  responses: { domain_id: string; is_correct: boolean | null }[],
): Map<string, DomainStat> {
  const out = new Map<string, DomainStat>();
  for (const r of responses) {
    if (r.is_correct === null || r.is_correct === undefined) continue;
    const stat = out.get(r.domain_id) ?? { domain_id: r.domain_id, correct: 0, answered: 0 };
    stat.answered += 1;
    if (r.is_correct) stat.correct += 1;
    out.set(r.domain_id, stat);
  }
  return out;
}

/**
 * Exam-weighted knowledge, expressed on the reported scale.
 *
 * Domains the student has not touched are EXCLUDED from the weighted mean rather
 * than counted as zero — an untouched domain is unmeasured, not failed, and
 * scoring it zero would tell a student they are bad at something they have not
 * attempted. The consequence (a score built on partial coverage) is what
 * `sample_confidence` exists to communicate.
 *
 * Returns null when nothing has been answered.
 */
export function weightedKnowledgeScaled(
  stats: Map<string, DomainStat>,
  domains: { domain_id: string; weight_pct: number | null }[],
): number | null {
  let weightSum = 0;
  let weighted = 0;
  for (const domain of domains) {
    const stat = stats.get(domain.domain_id);
    if (!stat || stat.answered === 0) continue;
    const weight = domain.weight_pct === null || domain.weight_pct === undefined
      ? 1                       // unweighted blueprint: every touched domain counts equally
      : Number(domain.weight_pct);
    weighted += (stat.correct / stat.answered) * weight;
    weightSum += weight;
  }
  if (weightSum === 0) return null;
  return toScaledScore(Math.round((weighted / weightSum) * 1000), 1000);
}

/**
 * How much the sample can be trusted, 0..1.
 *
 * The mean of per-domain coverage against the target, over ALL blueprint domains —
 * so an untouched domain drags confidence down. That is the mechanism that makes
 * "keep practising" the honest advice rather than a slogan: a student cannot reach
 * a confident readiness by drilling one domain they already like.
 */
export function computeSampleConfidence(
  stats: Map<string, DomainStat>,
  domains: { domain_id: string }[],
  targetPerDomain = CONFIDENCE_TARGET_PER_DOMAIN,
): number {
  if (domains.length === 0 || targetPerDomain <= 0) return 0;
  const total = domains.reduce((sum, d) => {
    const answered = stats.get(d.domain_id)?.answered ?? 0;
    return sum + Math.min(1, answered / targetPerDomain);
  }, 0);
  return Number((total / domains.length).toFixed(3));
}

/** Put evidence coverage on the same axis as knowledge so they can be blended. */
export function evidenceToScaled(coveragePct: number): number {
  const clamped = Math.max(0, Math.min(100, coveragePct));
  return Math.round(SCALE_MIN + (SCALE_MAX - SCALE_MIN) * (clamped / 100));
}

/**
 * Blend knowledge and evidence into the reported number.
 *
 * At 80/20, evidence can move a result by up to ~180 points — enough that a
 * student with no verified builds cannot present as exam-ready, and not so much
 * that builds alone carry someone who cannot answer the questions. That balance is
 * the product decision, and changing it is a policy-version bump, not a tweak.
 */
export function blendReadiness(knowledgeScaled: number | null, evidenceCoveragePct: number): number | null {
  if (knowledgeScaled === null) return null;
  const evidenceScaled = evidenceToScaled(evidenceCoveragePct);
  return Math.round(KNOWLEDGE_WEIGHT * knowledgeScaled + EVIDENCE_WEIGHT * evidenceScaled);
}

/**
 * The coarse, honest answer — prefer this over the number in student-facing copy.
 *
 * 'sustained' is deliberately hard: at or above the bar, on a broad enough sample,
 * across more than one qualifying sitting. One lucky run does not unlock a badge.
 */
export function deriveState(input: {
  answeredTotal: number;
  overallScaled: number | null;
  sampleConfidence: number;
  qualifyingSittings: number;
}): CertReadinessState {
  if (input.answeredTotal < MIN_ITEMS_FOR_SCORE || input.overallScaled === null) return 'not_measured';
  if (
    input.overallScaled >= PASSING_SCALED &&
    input.sampleConfidence >= SUSTAINED_MIN_CONFIDENCE &&
    input.qualifyingSittings >= SUSTAINED_MIN_SITTINGS
  ) {
    return 'sustained';
  }
  if (input.overallScaled >= PASSING_SCALED) return 'approaching';
  return 'building';
}

// ── database-backed ──────────────────────────────────────────────────────────

/**
 * Compute a readiness picture without writing anything. Returns null when no
 * blueprint is configured — there is nothing to be ready for.
 */
export async function computeReadiness(
  enrollmentId: string,
  trackId?: string,
): Promise<ReadinessComputation | null> {
  const blueprint = await getCurrentBlueprint(trackId);
  if (!blueprint) return null;

  const { track, domains } = blueprint;

  const responses = await CertResponse.findAll({
    where: { enrollment_id: enrollmentId },
    attributes: ['domain_id', 'is_correct'],
  });
  const stats = tallyByDomain(responses.map((r) => ({ domain_id: r.domain_id, is_correct: r.is_correct })));
  const answeredTotal = Array.from(stats.values()).reduce((sum, s) => sum + s.answered, 0);

  // Verified evidence only. Pending and auto-matched candidates do not count —
  // a student cannot self-verify their way to a readiness score.
  const mappings = await CertEvidenceMapping.findAll({
    where: {
      enrollment_id: enrollmentId,
      track_id: track.track_id,
      blueprint_version: track.blueprint_version,
      mapping_state: 'verified',
    },
    attributes: ['domain_id', 'objective_id'],
  });
  const verifiedObjectives = new Set(
    mappings.filter((m) => m.objective_id).map((m) => `${m.domain_id}:${m.objective_id}`),
  );
  const totalObjectives = domains.reduce((sum, d) => sum + (d.objectives?.length ?? 0), 0);
  const evidenceCoveragePct = totalObjectives === 0
    ? 0
    : Number(((verifiedObjectives.size / totalObjectives) * 100).toFixed(2));

  const weightsUsable = weightsAreUsable(domains);
  const knowledgeScaled = weightedKnowledgeScaled(
    stats,
    domains.map((d) => ({ domain_id: d.domain_id, weight_pct: weightsUsable ? Number(d.weight_pct) : null })),
  );
  const sampleConfidence = computeSampleConfidence(stats, domains);
  const overallScaled = blendReadiness(knowledgeScaled, evidenceCoveragePct);

  const qualifyingSittings = await CertSession.count({
    where: {
      enrollment_id: enrollmentId,
      status: 'completed',
      scaled_score: { [Op.gte]: PASSING_SCALED },
      total_count: { [Op.gte]: QUALIFYING_SITTING_MIN_ITEMS },
    },
  });

  const domainBreakdown: CertDomainReadiness[] = domains.map((d) => {
    const stat = stats.get(d.domain_id);
    const objectives = d.objectives ?? [];
    const evidenced = objectives.filter((o) => verifiedObjectives.has(`${d.domain_id}:${o.objective_id}`)).length;
    return {
      domain_id: d.domain_id,
      knowledge_pct: stat && stat.answered > 0 ? Number((stat.correct / stat.answered).toFixed(3)) : null,
      answered: stat?.answered ?? 0,
      evidence_verified: evidenced,
      objectives_total: objectives.length,
      objectives_evidenced: evidenced,
    };
  });

  return {
    track_id: track.track_id,
    blueprint_version: track.blueprint_version,
    readiness_policy_version: READINESS_POLICY_VERSION,
    knowledge_scaled: knowledgeScaled,
    evidence_coverage_pct: evidenceCoveragePct,
    sample_confidence: sampleConfidence,
    overall_scaled: overallScaled,
    overall_state: deriveState({
      answeredTotal,
      overallScaled,
      sampleConfidence,
      qualifyingSittings,
    }),
    weights_available: weightsUsable,
    domain_breakdown: domainBreakdown,
    qualifying_sittings: qualifyingSittings,
    answered_total: answeredTotal,
  };
}

/**
 * Compute, persist as a new snapshot, and pay the sustained award if it has just
 * been reached.
 *
 * Snapshots are APPEND-ONLY — a policy change inserts new rows and never rewrites
 * old ones, so an instructor sees real progress rather than a curve retroactively
 * restated by a formula change. The points award is idempotent on its own key, so
 * recomputing readiness repeatedly cannot pay twice.
 */
export async function recordReadinessSnapshot(
  enrollmentId: string,
  trackId?: string,
): Promise<{ snapshot: CertReadinessSnapshot; computation: ReadinessComputation } | null> {
  const computation = await computeReadiness(enrollmentId, trackId);
  if (!computation) return null;

  const snapshot = await CertReadinessSnapshot.create({
    enrollment_id: enrollmentId,
    track_id: computation.track_id,
    blueprint_version: computation.blueprint_version,
    readiness_policy_version: computation.readiness_policy_version,
    knowledge_scaled: computation.knowledge_scaled,
    evidence_coverage_pct: computation.evidence_coverage_pct,
    sample_confidence: computation.sample_confidence,
    overall_scaled: computation.overall_scaled,
    overall_state: computation.overall_state,
    weights_available: computation.weights_available,
    domain_breakdown: computation.domain_breakdown,
  });

  if (computation.overall_state === 'sustained') {
    await awardSustainedReadiness(enrollmentId, {
      overall_scaled: computation.overall_scaled,
      policy_version: READINESS_POLICY_VERSION,
    });
  }

  return { snapshot, computation };
}

/** Snapshot history, newest first — the instructor's progress view. */
export async function listReadinessHistory(
  enrollmentId: string,
  limit = 30,
): Promise<CertReadinessSnapshot[]> {
  return CertReadinessSnapshot.findAll({
    where: { enrollment_id: enrollmentId },
    order: [['computed_at', 'DESC']],
    limit,
  });
}
