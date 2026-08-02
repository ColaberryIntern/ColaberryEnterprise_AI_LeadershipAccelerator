/**
 * capeProficiencyService — recompute-from-ledger proficiency engine (design doc
 * §4, §6, §13). `student_architecture_skill` is a derived CACHE: every call to
 * `recomputeStudentArchitectureSkill` reads 100% of that enrollment+skill's
 * `student_skill_evidence` rows and rewrites the cache row as a FULL REPLACE —
 * never an in-place increment. This is what "recomputed from the append-only
 * ledger, never mutated in place" means operationally.
 *
 * `placement_score` (Phase 2, design doc §16) is likewise recomputed fresh
 * every call, via `capePlacementService.computePlacementScore()` — from
 * `resume_skill_claims` + `diagnostic_attempts`, NEVER from
 * `student_skill_evidence`. The two scores share a recompute cycle but stay
 * fully independent data paths (design doc §4 "one learner profile, two
 * scores"; §17 AC 2, AC 12).
 */
import { Op } from 'sequelize';
import StudentSkillEvidence from '../../models/StudentSkillEvidence';
import StudentArchitectureSkill from '../../models/StudentArchitectureSkill';
import ArchitectureSkillDefinition from '../../models/ArchitectureSkillDefinition';
import ArchitectureSkillEvidenceBandWeights from '../../models/ArchitectureSkillEvidenceBandWeights';
import type { EvidenceBand } from '../../models/StudentSkillEvidence';
import type { ArchitectureSkillId } from '../../constants/architectureSkills';
import { computePlacementScore } from './capePlacementService';

const BAND_CAP = 100; // a single band's summed credit is capped so no band alone can dominate proficiency
const REVIEW_INTERVAL_DAYS = 30; // Assumption 5 — placeholder review cadence; full spaced-review scheduling is Phase 4/6

export interface CurrentWeights {
  version: number;
  claim: number;
  knowledge: number;
  application: number;
  judgment: number;
}

/** Reads the single current evidence-band-weights row. Falls back to the design-doc
 * default (20/25/35/20) if none exists yet (defensive — seeding should always run
 * at boot, but this keeps the computation pure and never-throwing on a cold DB). */
export async function getCurrentWeights(): Promise<CurrentWeights> {
  const row = await ArchitectureSkillEvidenceBandWeights.findOne({ where: { is_current: true } });
  if (!row) {
    return { version: 0, claim: 0.2, knowledge: 0.25, application: 0.35, judgment: 0.2 };
  }
  return {
    version: row.version,
    claim: Number(row.claim_weight),
    knowledge: Number(row.knowledge_weight),
    application: Number(row.application_weight),
    judgment: Number(row.judgment_weight),
  };
}

function sumBand(rows: Array<{ band: EvidenceBand; credit: number }>, band: EvidenceBand): number {
  const sum = rows.filter((r) => r.band === band).reduce((acc, r) => acc + Number(r.credit), 0);
  return Math.min(BAND_CAP, sum);
}

/** Simple monotonic confidence from evidence volume — more independent evidence
 * events raise confidence toward 1.0. Not a statistical model; a placeholder that
 * is explicitly not the review-scheduling engine (Assumption 5). */
function confidenceFromEvidenceCount(n: number): number {
  return Math.min(1, n / 10);
}

/**
 * Full recompute-and-replace of one (enrollment, skill) derived row. Idempotent:
 * calling this twice with an unchanged ledger produces byte-identical output.
 */
export async function recomputeStudentArchitectureSkill(
  enrollmentId: string,
  skillId: ArchitectureSkillId | string
): Promise<StudentArchitectureSkill> {
  const evidenceRows = await StudentSkillEvidence.findAll({
    where: { enrollment_id: enrollmentId, skill_id: skillId },
    attributes: ['band', 'credit', 'created_at'],
  });
  const rows = evidenceRows.map((r) => ({ band: r.band, credit: Number(r.credit), created_at: r.created_at }));

  const claim = sumBand(rows, 'claim');
  const knowledge = sumBand(rows, 'knowledge');
  const application = sumBand(rows, 'application');
  const judgment = sumBand(rows, 'judgment');

  const weights = await getCurrentWeights();
  const proficiency = Math.round(
    (weights.claim * claim + weights.knowledge * knowledge + weights.application * application + weights.judgment * judgment) * 100
  ) / 100;

  const evidenceCount = rows.length;
  const confidence = Math.round(confidenceFromEvidenceCount(evidenceCount) * 1000) / 1000;

  const lastEvidenceAt = rows.length
    ? rows.reduce((latest, r) => (r.created_at > latest ? r.created_at : latest), rows[0].created_at)
    : null;

  const knowledgeRows = rows.filter((r) => r.band === 'knowledge');
  const nextReviewAt = knowledgeRows.length
    ? new Date(
        Math.max(...knowledgeRows.map((r) => r.created_at.getTime())) + REVIEW_INTERVAL_DAYS * 24 * 60 * 60 * 1000
      )
    : null;

  // CAPE Phase 2: placement is DERIVED FRESH from current resume claims +
  // diagnostic history on every recompute, exactly like the 4 verified bands
  // above — never a stored field that could drift independently (design doc
  // §13). A resume-only score never crosses into claim/knowledge/application/
  // judgment (design doc §17 AC 2) — computePlacementScore() only ever reads
  // resume_skill_claims/diagnostic_attempts, never student_skill_evidence.
  const placementScore = await computePlacementScore(enrollmentId, String(skillId));

  const [row] = await StudentArchitectureSkill.findOrCreate({
    where: { enrollment_id: enrollmentId, skill_id: skillId },
    defaults: {
      enrollment_id: enrollmentId,
      skill_id: skillId,
      placement_score: placementScore,
      claim_score: claim,
      knowledge_score: knowledge,
      application_score: application,
      judgment_score: judgment,
      proficiency,
      confidence,
      evidence_count: evidenceCount,
      last_evidence_at: lastEvidenceAt,
      next_review_at: nextReviewAt,
      weights_version: weights.version || null,
      computed_at: new Date(),
    },
  });

  // Full replace — every derived field rewritten together, never a partial/
  // incrementing update.
  await row.update({
    placement_score: placementScore,
    claim_score: claim,
    knowledge_score: knowledge,
    application_score: application,
    judgment_score: judgment,
    proficiency,
    confidence,
    evidence_count: evidenceCount,
    last_evidence_at: lastEvidenceAt,
    next_review_at: nextReviewAt,
    weights_version: weights.version || null,
    computed_at: new Date(),
  });

  return row;
}

export interface SkillProfileEntry {
  skill_id: string;
  name: string;
  axis_order: number;
  placement: number;
  claim: number;
  knowledge: number;
  application: number;
  judgment: number;
  proficiency: number;
  confidence: number;
  next_review_at: string | null;
}

export interface LearnerSkillProfile {
  skills: SkillProfileEntry[];
  overall_placement: number;
  overall_proficiency: number;
  weights_version: number | null;
}

/**
 * The learner-facing profile: all 10 current skill definitions, each paired with
 * its derived state — recomputed on read if the cached row is missing or stamped
 * with a stale (non-current) weights_version, so a weight-config edit is
 * reflected the next time anyone reads a profile without requiring a bulk backfill
 * job. Ordered by axis_order (the radar's visual order).
 */
export async function getLearnerSkillProfile(enrollmentId: string): Promise<LearnerSkillProfile> {
  const defs = await ArchitectureSkillDefinition.findAll({
    where: { is_current: true, is_active: true },
    order: [['axis_order', 'ASC']],
  });
  const weights = await getCurrentWeights();

  const existing = await StudentArchitectureSkill.findAll({
    where: { enrollment_id: enrollmentId, skill_id: { [Op.in]: defs.map((d) => d.skill_id) } },
  });
  const bySkill = new Map(existing.map((r) => [r.skill_id, r]));

  const skills: SkillProfileEntry[] = [];
  for (const def of defs) {
    let row = bySkill.get(def.skill_id);
    if (!row || row.weights_version !== weights.version) {
      row = await recomputeStudentArchitectureSkill(enrollmentId, def.skill_id);
    }
    skills.push({
      skill_id: def.skill_id,
      name: def.name,
      axis_order: def.axis_order,
      placement: Number(row.placement_score),
      claim: Number(row.claim_score),
      knowledge: Number(row.knowledge_score),
      application: Number(row.application_score),
      judgment: Number(row.judgment_score),
      proficiency: Number(row.proficiency),
      confidence: Number(row.confidence),
      next_review_at: row.next_review_at ? row.next_review_at.toISOString() : null,
    });
  }

  const overall_placement = skills.length ? Math.round((skills.reduce((s, r) => s + r.placement, 0) / skills.length) * 100) / 100 : 0;
  const overall_proficiency = skills.length ? Math.round((skills.reduce((s, r) => s + r.proficiency, 0) / skills.length) * 100) / 100 : 0;

  return { skills, overall_placement, overall_proficiency, weights_version: weights.version || null };
}
