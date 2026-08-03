/**
 * capeTimelineEvidenceBridge — the ONE real evidence-writing integration point for
 * CAPE Phase 0-1 (design doc §16 Phase 1: "few real writers" is expected and
 * correct at this stage). Turns a completed Timeline card into
 * `student_skill_evidence` rows via a small, EXPLICITLY TEMPORARY default
 * type->skill/band/credit map (Assumption 1, execution-contract.md) — this is NOT
 * the Phase 3 `curriculum_skill_maps` contract (card override -> week blueprint ->
 * type default -> AI-suggested draft resolution hierarchy, design doc §7). It is
 * a placeholder derived from the existing type registry's `competencies` /
 * `evidence_required` / `ai_evaluation` flags, fully replaceable when Phase 3 ships.
 *
 * Wired into progressionService.onCardCompleted() as a single additive,
 * NON-FATAL call — a CAPE evidence-write failure never blocks card completion,
 * XP, or points (Failure-First Design: this module owns its own try/catch and
 * structured error logging; the caller never needs to guard against it throwing).
 *
 * Because this only runs from onCardCompleted() — which already gates on
 * lock/watch/field-guide/dwell requirements before it's ever called — click,
 * dwell, and streak signals ALONE can never reach this module (design doc §17 AC 7).
 */
import { CardTypeDef, resolve as resolveType } from '../timeline/typeRegistry';
import type { ArchitectureSkillId } from '../../constants/architectureSkills';
import type { EvidenceBand } from '../../models/StudentSkillEvidence';
import { recordSkillEvidence, buildIdempotencyKey } from './capeEvidenceLedgerService';
import { recomputeStudentArchitectureSkill } from './capeProficiencyService';

/**
 * Deterministic, single-valued inverse of the design doc §3 crosswalk table, used
 * ONLY by this placeholder bridge to turn a card's existing (11-domain) promotion
 * competency tags into Architecture Skill ids. Several competencies legitimately
 * crosswalk to more than one Architecture Skill (see capeSeeders.ts); this picks
 * one deterministic primary per competency so a card's evidence distribution is
 * reproducible. Phase 3's real `curriculum_skill_maps` supersedes this entirely.
 */
const COMPETENCY_TO_SKILL: Record<string, ArchitectureSkillId> = {
  prompt_engineering: 'prompting',
  context_engineering: 'context_engineering',
  architecture: 'system_design',
  testing: 'eval_guardrails',
  debugging: 'eval_guardrails',
  deployment: 'deploy_ops',
  github: 'deploy_ops',
  communication: 'governance',
  leadership: 'governance',
  security: 'governance',
  documentation: 'system_design',
  claude_code: 'agents_mcp',
  systems_thinking: 'system_design',
  decision_making: 'system_design',
  tradeoffs: 'system_design',
  ai_governance: 'governance',
};

export interface SkillImpact {
  skill_id: ArchitectureSkillId;
  band: EvidenceBand;
  credit: number;
}

/**
 * design doc §6 credit-speed table, simplified to 3 tiers for this placeholder:
 *   evidence_required (labs/artifacts)         -> application, ~12 (bracket: 10-20)
 *   ai_evaluation only (checks/quizzes)         -> knowledge, ~4   (bracket: 3-5)
 *   everything else with a mapped competency    -> knowledge, ~2   (bracket: 1-2, light exposure)
 *   no mapped competency (system/event/community)-> [] (zero credit, §7 defaults)
 * Credit is split evenly across the resolved (deduped) Architecture Skill ids so a
 * multi-skill card can't inflate any single axis (§6 "distributed by weights that
 * total 1.0").
 */
export function defaultSkillImpactForType(typeSlug: string): SkillImpact[] {
  const def = resolveType(typeSlug);
  if (!def) return [];
  const skillIds = resolveSkillIds(def);
  if (skillIds.length === 0) return [];

  const { band, totalCredit } = bandAndCreditFor(def);
  if (totalCredit <= 0) return [];

  const perSkill = Math.round((totalCredit / skillIds.length) * 100) / 100;
  return skillIds.map((skill_id) => ({ skill_id, band, credit: perSkill }));
}

/**
 * Known Phase 0-1 gap, logged rather than silently accepted: several registered
 * types (e.g. `knowledge_check`) have an EMPTY `competencies` array in
 * typeRegistry.ts today, because that field was authored for the pre-existing
 * 11-domain promotion system and was never required to be populated for every
 * type. Those types resolve to zero Architecture Skill ids here and therefore
 * write zero CAPE evidence, even though design doc §7 says checks/quizzes
 * should carry real Knowledge/Judgment credit. Real per-type/card skill
 * mapping is Phase 3's `curriculum_skill_maps` contract — this placeholder does
 * not attempt to guess a mapping typeRegistry itself doesn't declare.
 */
function resolveSkillIds(def: CardTypeDef): ArchitectureSkillId[] {
  const seen = new Set<ArchitectureSkillId>();
  for (const c of def.competencies || []) {
    const skill = COMPETENCY_TO_SKILL[c];
    if (skill) seen.add(skill);
  }
  return Array.from(seen);
}

function bandAndCreditFor(def: CardTypeDef): { band: EvidenceBand; totalCredit: number } {
  if (def.evidence_required) return { band: 'application', totalCredit: 12 };
  if (def.ai_evaluation) return { band: 'knowledge', totalCredit: 4 };
  return { band: 'knowledge', totalCredit: 2 };
}

/**
 * Writes CAPE evidence for a just-completed card and recomputes the touched
 * skills. Never throws — a failure is logged (structured, with error_class) and
 * swallowed so it can never block the caller's card-completion flow.
 */
export async function recordCapeEvidenceForCompletedCard(
  enrollmentId: string,
  card: { id: string; type: string }
): Promise<void> {
  try {
    const impacts = defaultSkillImpactForType(card.type);
    if (impacts.length === 0) return;

    const touchedSkills = new Set<string>();
    for (const impact of impacts) {
      const idempotency_key = buildIdempotencyKey.timeline(enrollmentId, card.id, impact.skill_id);
      await recordSkillEvidence({
        enrollment_id: enrollmentId,
        skill_id: impact.skill_id,
        band: impact.band,
        credit: impact.credit,
        source: 'timeline',
        source_ref: card.id,
        idempotency_key,
      });
      touchedSkills.add(impact.skill_id);
    }
    for (const skillId of touchedSkills) {
      await recomputeStudentArchitectureSkill(enrollmentId, skillId);
    }
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'cape_evidence_write_failed',
      error_class: err?.name || 'Error',
      outcome: 'failure',
      context: { enrollment_id: enrollmentId, card_id: card.id, card_type: card.type, message: err?.message },
    }));
  }
}
