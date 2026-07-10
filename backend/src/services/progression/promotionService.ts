/**
 * promotionService — evaluates whether a student clears the NEXT Builder
 * level's gate and, if so, promotes them. Promotion never uses XP alone; it
 * uses the pure `evaluatePromotion` gate over competency + evidence + counts +
 * AI approval. Recompute-safe: re-evaluating an already-eligible student just
 * re-affirms the same level.
 */
import BuilderLevel from '../../models/BuilderLevel';
import StudentLevel from '../../models/StudentLevel';
import StudentCompetency from '../../models/StudentCompetency';
import EvidenceRecord from '../../models/EvidenceRecord';
import AttendanceRecord from '../../models/AttendanceRecord';
import { evaluatePromotion, computeReadiness, PromotionInput, LevelGate, PromotionVerdict } from './scoring';

/** AI approval hook. Phase 2 default is permissive; wire the gpt-4o-mini
 *  approver behind a flag in a follow-up without touching callers. */
export type AiApprover = (enrollmentId: string, levelSlug: string) => Promise<boolean>;
const defaultAiApprover: AiApprover = async () => true;

export interface PromotionOutcome {
  promoted: boolean;
  level: string;
  rank: number;
  readiness: number;
  verdict: PromotionVerdict;
}

export async function evaluateForEnrollment(
  enrollmentId: string,
  aiApprover: AiApprover = defaultAiApprover
): Promise<PromotionOutcome> {
  const [current] = await StudentLevel.findOrCreate({
    where: { enrollment_id: enrollmentId },
    defaults: { enrollment_id: enrollmentId, level_slug: 'builder', rank: 0 },
  });

  const competencyRows = await StudentCompetency.findAll({ where: { enrollment_id: enrollmentId } });
  const domainCfg = await BuilderLevel.findOne({ where: { rank: current.rank + 1, is_active: true } });

  // Readiness is a weighted mean of confidences (weight 1 each here — domain
  // weights live in competency_domains and can be joined in a later pass).
  const readiness = computeReadiness(competencyRows.map((c) => ({ domain_id: c.domain_id, confidence: c.confidence, weight: 1 })));

  if (!domainCfg) {
    await current.update({ architect_readiness: readiness });
    return { promoted: false, level: current.level_slug, rank: current.rank, readiness, verdict: { eligible: false, gaps: ['at max level'] } };
  }

  const evidence = await EvidenceRecord.findAll({ where: { enrollment_id: enrollmentId, validated: true } });
  const bySource = (t: string) => evidence.filter((e) => e.source_type === t).length;
  const attendance = await AttendanceRecord.count({ where: { enrollment_id: enrollmentId, status: 'present' } });
  const ai_approved = domainCfg.requires_ai_approval ? await aiApprover(enrollmentId, domainCfg.slug) : true;

  const input: PromotionInput = {
    competencies: competencyRows.map((c) => ({ domain_id: c.domain_id, confidence: c.confidence })),
    evidence_count: evidence.length,
    artifact_count: bySource('artifact'),
    github_count: bySource('github_commit') + bySource('github_pr'),
    evaluation_count: bySource('instructor_review') + bySource('peer_review'),
    implementation_count: bySource('implementation') + bySource('deliverable'),
    attendance_count: attendance,
    ai_approved,
  };
  const gate: LevelGate = {
    slug: domainCfg.slug,
    required_competencies: (domainCfg.required_competencies || []) as LevelGate['required_competencies'],
    min_evidence: domainCfg.min_evidence,
    min_artifacts: domainCfg.min_artifacts,
    min_github: domainCfg.min_github,
    min_evaluations: domainCfg.min_evaluations,
    min_implementation: domainCfg.min_implementation,
    min_attendance: domainCfg.min_attendance,
    requires_ai_approval: domainCfg.requires_ai_approval,
  };

  const verdict = evaluatePromotion(input, gate);
  if (verdict.eligible) {
    await current.update({
      level_slug: domainCfg.slug,
      rank: domainCfg.rank,
      architect_readiness: readiness,
      promotion_evidence: input,
      ai_approval: { approved: ai_approved, level: domainCfg.slug },
      promoted_at: new Date(),
    });
    return { promoted: true, level: domainCfg.slug, rank: domainCfg.rank, readiness, verdict };
  }

  await current.update({ architect_readiness: readiness });
  return { promoted: false, level: current.level_slug, rank: current.rank, readiness, verdict };
}
