/**
 * promotionService — the ONE entry point every trigger calls to (re)evaluate a
 * student's build rank. Two ladders live behind it, selected by
 * `env.milestoneLadderEnabled`:
 *
 *   OFF (legacy)     the nine-rank evidence ladder below: clears the NEXT
 *                    BuilderLevel gate (competency + evidence counts + AI
 *                    approval) one rank per call.
 *   ON  (milestone)  milestonePromotion: program milestones (curriculum + three
 *                    verified projects) and a staff-approved certification,
 *                    recomputed to the highest cleared rung, latched. See
 *                    docs/POINTS_LADDER_DECISIONS.md.
 *
 * Both paths persist to the same `student_level` row and both are
 * recompute-safe. Promotion never uses XP or points alone on either ladder.
 */
import BuilderLevel from '../../models/BuilderLevel';
import StudentLevel from '../../models/StudentLevel';
import StudentCompetency from '../../models/StudentCompetency';
import EvidenceRecord from '../../models/EvidenceRecord';
import AttendanceRecord from '../../models/AttendanceRecord';
import { env } from '../../config/env';
import { evaluatePromotion, computeReadiness, PromotionInput, LevelGate, PromotionVerdict } from './scoring';
import { evaluateMilestonePromotion, getMilestonePromotionStatus } from './milestonePromotion';

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

export interface PromotionStatus {
  level: string;
  rank: number;
  readiness: number;
  next_level: string | null;
  at_max: boolean;
  gaps: string[];
  /** Which ladder produced this status. Consumers that render gaps can key on it. */
  ladder: 'legacy' | 'milestone';
}

/**
 * Read-only view of where a student stands against the NEXT level's gate — the
 * current level, readiness, and the explicit remaining gaps. Unlike
 * `evaluateForEnrollment`, this NEVER writes (safe for GET drill-downs). Returns
 * a permissive/empty status if progression isn't provisioned for this student.
 */
export async function getPromotionStatus(enrollmentId: string): Promise<PromotionStatus> {
  if (env.milestoneLadderEnabled) {
    // Readiness (the competency mean) is still reported: it is a display on
    // the Points page, no longer a gate. Gaps come back as student sentences.
    const [st, competencyRows] = await Promise.all([
      getMilestonePromotionStatus(enrollmentId),
      StudentCompetency.findAll({ where: { enrollment_id: enrollmentId } }),
    ]);
    const readiness = computeReadiness(competencyRows.map((c) => ({ domain_id: c.domain_id, confidence: c.confidence, weight: 1 })));
    return {
      level: st.level,
      rank: st.rank,
      readiness,
      next_level: st.next_level,
      at_max: st.at_max,
      gaps: st.gaps.map((g) => g.text),
      ladder: 'milestone',
    };
  }

  const [current] = await StudentLevel.findOrCreate({
    where: { enrollment_id: enrollmentId },
    defaults: { enrollment_id: enrollmentId, level_slug: 'builder', rank: 0 },
  });

  const competencyRows = await StudentCompetency.findAll({ where: { enrollment_id: enrollmentId } });
  const readiness = computeReadiness(competencyRows.map((c) => ({ domain_id: c.domain_id, confidence: c.confidence, weight: 1 })));
  const domainCfg = await BuilderLevel.findOne({ where: { rank: current.rank + 1, is_active: true } });

  if (!domainCfg) {
    return { level: current.level_slug, rank: current.rank, readiness, next_level: null, at_max: true, gaps: [], ladder: 'legacy' };
  }

  const evidence = await EvidenceRecord.findAll({ where: { enrollment_id: enrollmentId, validated: true } });
  const bySource = (t: string) => evidence.filter((e) => e.source_type === t).length;
  const attendance = await AttendanceRecord.count({ where: { enrollment_id: enrollmentId, status: 'present' } });

  const input: PromotionInput = {
    competencies: competencyRows.map((c) => ({ domain_id: c.domain_id, confidence: c.confidence })),
    evidence_count: evidence.length,
    artifact_count: bySource('artifact'),
    github_count: bySource('github_commit') + bySource('github_pr'),
    evaluation_count: bySource('instructor_review') + bySource('peer_review'),
    implementation_count: bySource('implementation') + bySource('deliverable'),
    attendance_count: attendance,
    // The read path must describe what the WRITE path would do. The write path
    // asks `defaultAiApprover`, which approves everyone (the real approver was
    // never wired), so a read that reports "AI review — pending" describes a
    // gate that does not exist. When a real approver ships, thread it through
    // both paths together; until then the two agree.
    ai_approved: domainCfg.requires_ai_approval ? await defaultAiApprover(enrollmentId, domainCfg.slug) : true,
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
  return {
    level: current.level_slug,
    rank: current.rank,
    readiness,
    next_level: domainCfg.slug,
    at_max: false,
    gaps: verdict.gaps,
    ladder: 'legacy',
  };
}

export async function evaluateForEnrollment(
  enrollmentId: string,
  aiApprover: AiApprover = defaultAiApprover
): Promise<PromotionOutcome> {
  if (env.milestoneLadderEnabled) {
    // The competency mean is still refreshed on the row so the readiness
    // display keeps moving; it does not decide the rank.
    const competencyRows = await StudentCompetency.findAll({ where: { enrollment_id: enrollmentId } });
    const readiness = computeReadiness(competencyRows.map((c) => ({ domain_id: c.domain_id, confidence: c.confidence, weight: 1 })));
    const out = await evaluateMilestonePromotion(enrollmentId);
    await StudentLevel.update({ architect_readiness: readiness }, { where: { enrollment_id: enrollmentId } });
    return {
      promoted: out.promoted,
      level: out.level,
      rank: out.rank,
      readiness,
      verdict: { eligible: out.promoted, gaps: [] },
    };
  }

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
