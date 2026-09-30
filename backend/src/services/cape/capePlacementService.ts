/**
 * capePlacementService — computes `student_architecture_skill.placement_score`
 * (the dotted-polygon / "resume-indicated" number on the radar, design doc §4
 * "one learner profile, two scores"; §11) from the CURRENT-version resume
 * claim plus the most recent diagnostic outcome for a skill. This is a
 * SEPARATE score path from the verified claim/knowledge/application/judgment
 * bands in `student_skill_evidence` — nothing here reads or writes that
 * table, and nothing here is reachable from `capeEvidenceLedgerService.ts`
 * (design doc §5 "resume-only contribution to any displayed verified skill is
 * capped at zero"; §17 AC 2).
 *
 * Called by `capeProficiencyService.recomputeStudentArchitectureSkill()` on
 * every full-replace recompute, so placement — like the verified bands — is
 * always DERIVED FRESH from source (current resume_skill_claims +
 * diagnostic_attempts history), never an independently-mutated stored field
 * that could drift (design doc §13 "all learner skill state is recomputed
 * from the append-only ledger").
 */
import { DiagnosticAttempt } from '../../models';
import { getCurrentResumeSkillClaims } from './capeResumeClaimService';
import type { DiagnosticOutcome } from '../../models/DiagnosticAttempt';

const PLACEMENT_CAP = 100;

// §5 "Adaptive confirmation" outcomes adjust the resume-only base score:
//   confirmed        -> advance placement (floor raised toward architect-track territory)
//   partial           -> a moderate nudge toward the midpoint (bridge lesson recommended)
//   not_confirmed     -> capped low (foundation sequencing), never punitive/zeroed ("no shaming")
function applyDiagnosticOutcome(base: number, outcome: DiagnosticOutcome | null): number {
  if (outcome === 'confirmed') return Math.max(base, 70);
  if (outcome === 'partial') return Math.round(((base + 50) / 2) * 100) / 100;
  if (outcome === 'not_confirmed') return Math.min(base, 20);
  return base;
}

async function latestDiagnosticOutcome(enrollmentId: string, skillId: string): Promise<DiagnosticOutcome | null> {
  const row = await DiagnosticAttempt.findOne({
    where: { enrollment_id: enrollmentId, skill_id: skillId },
    order: [['created_at', 'DESC']],
  });
  return row ? (row as any).outcome : null;
}

/**
 * 0-100 placement score for one (enrollment, skill). No resume claim and no
 * diagnostic history -> 0 (design doc §17 AC 1's zero-placement invariant for
 * a learner who never uploaded a resume; also correct for a skill a resume
 * simply never touched on).
 */
export async function computePlacementScore(enrollmentId: string, skillId: string): Promise<number> {
  const claims = await getCurrentResumeSkillClaims(enrollmentId, skillId);
  const base = claims.length ? Math.max(...claims.map((c: any) => Number(c.credit_weight) || 0)) : 0;

  const outcome = await latestDiagnosticOutcome(enrollmentId, skillId);
  const adjusted = applyDiagnosticOutcome(base, outcome);

  return Math.max(0, Math.min(PLACEMENT_CAP, Math.round(adjusted * 100) / 100));
}
