/**
 * capeCardEnrichmentService — CAPE Phase 5 card-treatment chips: Why this /
 * Level / Proof (design doc §11 "Card treatment", §16 Phase 5). Read-only;
 * never writes.
 *
 * "Why this" fallback (execution-contract.md Assumption 2, logged): when a
 * candidate carries a real Phase 4 `CapeExplanation.reasons` (only possible
 * when `CAPE_LEARNING_VALUE_RANKER_ENABLED` is on — confirmed OFF in
 * production right now), use `reasons[0]` verbatim — this is the
 * future-proofed path, engaging automatically once Phase 4 ships live traffic
 * without any change here. Otherwise derive a reason from the Phase 3
 * `resolveSkillMapping()` result, which IS live today.
 *
 * "Level" (Assumption 3): Foundation/Working/Stretch/Architect from the
 * learner's placement+proficiency on the card's PRIMARY (highest-weight)
 * mapped skill, compared against the mapping's own `recommended_range`.
 *
 * "Proof" (Assumption 4): deterministic mapping from the resolved mapping's
 * `bands` array + the curriculum type's `ai_evaluation` flag.
 */
import { resolveSkillMapping } from './capeCurriculumSkillMapService';
import { getLearnerSkillProfile } from './capeProficiencyService';
import { resolve as resolveType } from '../timeline/typeRegistry';
import type { ArchitectureSkillImpact } from '../../models/CurriculumSkillMap';

function logWarn(event: string, context: Record<string, unknown>, err: any) {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event,
    error_class: err?.name || 'Error', outcome: 'failure', context: { ...context, message: err?.message },
  }));
}

export type CardLevel = 'Foundation' | 'Working' | 'Stretch' | 'Architect';
export type CardProof = 'Learn' | 'Check' | 'Build' | 'Decide';

export interface CardChips {
  why_this: string;
  level: CardLevel;
  proof: CardProof;
}

/** Minimal shape this service needs from a candidate — matches the fields of
 * `TodayFeedItem` (todayFeedComposer.ts) it's always called with, kept local
 * so this file has no import-time dependency on that (much larger) module. */
export interface EnrichableCardInput {
  card_id: string | null;
  type: string;
  week: number | null;
}

/** Matches todayFeedComposer.ts's `CapeExplanation` shape (Phase 4). Declared
 * locally (not imported) for the same reason as EnrichableCardInput above. */
export interface CapeExplanationInput {
  reasons: string[];
}

function skillLabel(skillId: string): string {
  return skillId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The highest-weight skill impact in a resolved contract, or null when the
 * contract has no impacts (source:'none' or an explicit zero-credit type). */
function primaryImpact(impacts: ArchitectureSkillImpact[]): ArchitectureSkillImpact | null {
  if (!impacts.length) return null;
  return impacts.reduce((best, cur) => (cur.weight > best.weight ? cur : best), impacts[0]);
}

function deriveWhyThisFallback(
  source: 'card_override' | 'week_blueprint' | 'type_default' | 'none',
  impact: ArchitectureSkillImpact | null,
): string {
  if (!impact) return 'Current AI update';
  const label = skillLabel(impact.skill_id);
  if (source === 'card_override') return `Matches this card's ${label} focus`;
  if (source === 'week_blueprint') return `This week's ${label} focus`;
  return `Builds your ${label} skill`;
}

function deriveLevel(
  impact: ArchitectureSkillImpact | null,
  range: { min: number; max: number },
  placement: number,
  proficiency: number,
): CardLevel {
  if (!impact) return 'Working'; // no resolved mapping — neutral, not a governance-relevant guess
  const readiness = Math.max(placement, proficiency);
  if (readiness < range.min) return 'Foundation';
  if (readiness <= range.max) return 'Working';
  if (readiness <= range.max + 20) return 'Stretch';
  return 'Architect';
}

function deriveProof(impact: ArchitectureSkillImpact | null, typeSlug: string): CardProof {
  if (!impact || !impact.bands.length) return 'Learn';
  if (impact.bands.includes('application')) return 'Build';
  if (impact.bands.includes('judgment')) return 'Decide';
  if (impact.bands.includes('knowledge')) {
    const def = resolveType(typeSlug);
    return def?.ai_evaluation ? 'Check' : 'Learn';
  }
  return 'Learn'; // claim-only
}

/**
 * Compute the 3 card-treatment chips for one candidate. Never throws — a
 * missing/unresolved mapping (source:'none') or a skill-profile lookup
 * failure both degrade to safe, neutral chips rather than blocking the
 * caller (capeTodayPlanService assembles a whole plan; one bad card must
 * never break the rest).
 */
export async function enrichCard(
  enrollmentId: string,
  item: EnrichableCardInput,
  capeExplanation?: CapeExplanationInput,
): Promise<CardChips> {
  // Phase 4 ranker path (capeExplanation present): level/proof are STILL
  // computed from the real Phase 3 mapping below — the ranker only produces
  // rank_score/reasons, never level/proof — so only why_this branches on it.
  let resolved;
  try {
    resolved = await resolveSkillMapping({ cardId: item.card_id, typeSlug: item.type, weekNumber: item.week });
  } catch (err: any) {
    logWarn('cape_card_enrichment_resolve_mapping_failed', { enrollment_id: enrollmentId, card_id: item.card_id, type: item.type }, err);
    resolved = { contract: { skill_impacts: [], prerequisite_skills: [], recommended_range: { min: 0, max: 0 }, freshness_days: null, reviewable: true }, source: 'none' as const, map_id: null, version: null };
  }

  const impact = primaryImpact(resolved.contract.skill_impacts);
  const why_this = capeExplanation?.reasons?.length
    ? capeExplanation.reasons[0]
    : deriveWhyThisFallback(resolved.source, impact);

  let placement = 0;
  let proficiency = 0;
  if (impact) {
    try {
      const profile = await getLearnerSkillProfile(enrollmentId);
      const entry = profile.skills.find((s) => s.skill_id === impact.skill_id);
      if (entry) {
        placement = entry.placement;
        proficiency = entry.proficiency;
      }
    } catch (err: any) {
      // fail-soft — placement/proficiency stay 0, which deriveLevel below
      // resolves to a safe default (typically Foundation, since most
      // recommended_range.min values are > 0), never a thrown error.
      logWarn('cape_card_enrichment_profile_lookup_failed', { enrollment_id: enrollmentId, skill_id: impact.skill_id }, err);
    }
  }

  return {
    why_this,
    level: deriveLevel(impact, resolved.contract.recommended_range, placement, proficiency),
    proof: deriveProof(impact, item.type),
  };
}
