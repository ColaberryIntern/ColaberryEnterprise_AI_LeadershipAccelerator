/**
 * capeLearningValueScorer — Stage 3 of the CAPE Phase 4 learning-value ranker
 * (design doc §9 Stage 3). PURE — no I/O, no Date.now (the caller passes
 * `now`), mirroring `feedRanker.ts`'s testability contract.
 *
 * Implements the exact formula from the design doc:
 *   score = 0.30 x skill-gap fit
 *         + 0.20 x prerequisite/sequence fit
 *         + 0.15 x learner goal/role/industry fit
 *         + 0.10 x evidence-balance need
 *         + 0.10 x freshness/field importance
 *         + 0.05 x time/modality fit
 *         + 0.05 x momentum/continuation value
 *         + 0.05 x live/community urgency
 *         - mismatch penalty
 * Each component is computed 0..1 BEFORE weighting; the weights above sum to
 * exactly 1.0, so the unpenalized score is naturally bounded 0..1 and the
 * final score is clamped 0..1 after the penalty is subtracted.
 *
 * Scope note on the penalty term: the design doc lists "fatigue, repetition,
 * mismatch, and quality" penalties. Fatigue and repetition are inherently
 * LIST-level concerns (how many times has this type/skill appeared already in
 * THIS ranked batch) — this function scores one candidate in isolation and
 * has no list context, so those two penalties are Stage 4's job
 * (`capeLearningValuePolicy.ts`'s crowd-out prevention), not duplicated here.
 * Source-quality scoring has no data field on `TodayFeedItem` yet (deferred
 * to Phase 6 governance per design doc §12) — that leaves "mismatch" as the
 * one penalty this per-item function can and does compute: how far the
 * learner's current placement sits outside the candidate's
 * `recommended_range`.
 */
import type { LearningValueCandidate } from './capeCandidateFeatureService';
import type { LearnerState } from './capeLearnerStateService';

export interface LearningValueScoreResult {
  score: number;
  components: Record<string, number>;
  reasons: string[];
}

const AI_PULSE_TYPES = new Set([
  'ai_news_flash', 'ai_research_digest', 'ai_tool_of_the_day', 'ai_video_stream',
  'ai_quote_of_the_day', 'ai_architecture_breakdown', 'build_breakdown',
  'mcp_server_spotlight', 'claude_code_technique', 'market_intelligence',
]);

const URGENT_TYPES = new Set([
  'live_class', 'event', 'demo_tuesday', 'kes_wednesday', 'marketing_friday',
  'community_live_session', 'study_session',
]);

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function placementFor(learnerState: LearnerState, skillId: string): number {
  return learnerState.skills.find((s) => s.skill_id === skillId)?.placement ?? 0;
}

function proficiencyFor(learnerState: LearnerState, skillId: string): number {
  return learnerState.skills.find((s) => s.skill_id === skillId)?.proficiency ?? 0;
}

/** 0.30 weight. Higher when this candidate's skills are the learner's weakest
 * (unknown skills are treated as a full gap — the most valuable to introduce). */
function skillGapFit(candidate: LearningValueCandidate, learnerState: LearnerState): number {
  const impacts = candidate.skill_mapping.skill_impacts;
  if (!impacts.length) return 0.5; // zero-credit type (design doc §7): neutral, not zero
  let weighted = 0;
  let totalWeight = 0;
  for (const impact of impacts) {
    const gap = clamp01((100 - proficiencyFor(learnerState, impact.skill_id)) / 100);
    weighted += gap * impact.weight;
    totalWeight += impact.weight;
  }
  return totalWeight > 0 ? clamp01(weighted / totalWeight) : 0.5;
}

/** 0.20 weight. 1.0 when the learner's average placement across this
 * candidate's skills sits inside its `recommended_range`; decays with
 * distance outside the range in either direction. */
function prerequisiteSequenceFit(candidate: LearningValueCandidate, learnerState: LearnerState): number {
  const { recommended_range: range, skill_impacts: impacts } = candidate.skill_mapping;
  if (!range || (range.min === 0 && range.max === 0) || !impacts.length) return 0.5;
  const avgPlacement = impacts.reduce((sum, i) => sum + placementFor(learnerState, i.skill_id), 0) / impacts.length;
  if (avgPlacement >= range.min && avgPlacement <= range.max) return 1;
  const spread = Math.max(1, range.max - range.min);
  const distance = avgPlacement < range.min ? range.min - avgPlacement : avgPlacement - range.max;
  return clamp01(1 - distance / spread);
}

/** 0.15 weight. Simple, transparent keyword match against the learner's
 * stated goal/role/industry (Phase 2 resume extraction) — matches design doc
 * §9's "start rule-based and transparent" instruction. No signal at all
 * (no resume) is neutral, never a penalty (design doc §15). */
function goalRoleIndustryFit(candidate: LearningValueCandidate, learnerState: LearnerState): number {
  const text = [learnerState.goal, learnerState.role, learnerState.industry].filter(Boolean).join(' ').toLowerCase();
  const impacts = candidate.skill_mapping.skill_impacts;
  if (!text || !impacts.length) return 0.5;
  const matched = impacts.some((i) => {
    const words = i.skill_id.replace(/_/g, ' ').split(' ').filter((w) => w.length > 2);
    return words.some((w) => text.includes(w));
  });
  return matched ? 1 : 0.35;
}

/** 0.10 weight. Only meaningful for candidates that offer application/judgment
 * credit — favors them when the learner has consumed a lot of Knowledge-band
 * content relative to what they've built (the named "evidence-balance need"
 * signal the request calls out explicitly). Neutral for candidates that don't
 * build anything, and for unknown skills (assume balanced, not imbalanced). */
function evidenceBalanceNeed(candidate: LearningValueCandidate, learnerState: LearnerState): number {
  const impacts = candidate.skill_mapping.skill_impacts;
  const buildsSkill = impacts.some((i) => i.bands.includes('application') || i.bands.includes('judgment'));
  if (!buildsSkill || !impacts.length) return 0.5;
  const EVIDENCE_BALANCE_CAP = 5; // matches capeLearnerStateService's cap
  const ratios = impacts.map((i) => learnerState.skills.find((s) => s.skill_id === i.skill_id)?.evidence_balance_ratio ?? 1);
  const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return clamp01(avgRatio / EVIDENCE_BALANCE_CAP);
}

/** 0.10 weight. `TodayFeedItem` doesn't carry a `released_at` timestamp (that
 * field lives only on Feed Control's `RankCandidate`, not the Today composer's
 * item shape) — until that's added, AI-Pulse-tagged types (design doc §7
 * "Intelligence / AI Pulse") get a flat elevated field-importance score and
 * evergreen curriculum types stay neutral. Real, deterministic, complete for
 * the data available today; a coarser signal than full recency decay. */
function freshnessFieldImportance(candidate: LearningValueCandidate): number {
  return AI_PULSE_TYPES.has(candidate.type) ? 0.8 : 0.5;
}

/** 0.05 weight. Favors items that fit inside the ~20-minute default daily
 * budget (design doc §10 Today Plan). */
function timeModalityFit(candidate: LearningValueCandidate): number {
  const t = candidate.estimated_time;
  if (t == null || t <= 0) return 0.7;
  if (t <= 20) return 1;
  if (t <= 45) return 0.6;
  return 0.3;
}

/** 0.05 weight. Favors continuing a skill the learner is actively building
 * (some evidence, not yet mastered) over starting something unrelated. */
function momentumContinuationValue(candidate: LearningValueCandidate, learnerState: LearnerState): number {
  const impacts = candidate.skill_mapping.skill_impacts;
  if (!impacts.length) return 0.5;
  const inProgress = impacts.some((i) => {
    const p = proficiencyFor(learnerState, i.skill_id);
    return p > 0 && p < 80;
  });
  return inProgress ? 1 : 0.5;
}

/** 0.05 weight. Live/community/time-sensitive types (design doc §7 "Delivery
 * events") score higher than static content, all else equal. */
function liveCommunityUrgency(candidate: LearningValueCandidate): number {
  return URGENT_TYPES.has(candidate.type) ? 1 : 0.3;
}

/** Penalty term (subtracted, not weighted). See the module doc comment for
 * why only "mismatch" is computed here (fatigue/repetition are Stage 4's
 * job; quality has no data source yet). Capped small (0.15 max) so one
 * component never dominates the whole score. */
function mismatchPenalty(candidate: LearningValueCandidate, learnerState: LearnerState): number {
  const { recommended_range: range, skill_impacts: impacts } = candidate.skill_mapping;
  if (!range || (range.min === 0 && range.max === 0) || !impacts.length) return 0;
  const avgPlacement = impacts.reduce((sum, i) => sum + placementFor(learnerState, i.skill_id), 0) / impacts.length;
  const belowBy = Math.max(0, range.min - avgPlacement);
  return Math.min(0.15, belowBy / 200);
}

/**
 * Score one candidate against one learner state. Never throws, never
 * produces NaN — every component function guards its own division and falls
 * back to a neutral 0.5 (or the documented default) when it lacks enough
 * data, so a zero-evidence learner and a zero-credit candidate both still
 * produce a valid, explainable score.
 */
export function scoreLearningValue(
  candidate: LearningValueCandidate,
  learnerState: LearnerState,
  now: Date,
): LearningValueScoreResult {
  void now; // reserved for a future recency-decay component once TodayFeedItem carries released_at

  const skill_gap_fit = skillGapFit(candidate, learnerState);
  const prerequisite_sequence_fit = prerequisiteSequenceFit(candidate, learnerState);
  const goal_role_industry_fit = goalRoleIndustryFit(candidate, learnerState);
  const evidence_balance_need = evidenceBalanceNeed(candidate, learnerState);
  const freshness_field_importance = freshnessFieldImportance(candidate);
  const time_modality_fit = timeModalityFit(candidate);
  const momentum_continuation_value = momentumContinuationValue(candidate, learnerState);
  const live_community_urgency = liveCommunityUrgency(candidate);
  const mismatch_penalty = mismatchPenalty(candidate, learnerState);

  const components = {
    skill_gap_fit, prerequisite_sequence_fit, goal_role_industry_fit, evidence_balance_need,
    freshness_field_importance, time_modality_fit, momentum_continuation_value, live_community_urgency,
    mismatch_penalty,
  };

  const raw =
    0.30 * skill_gap_fit +
    0.20 * prerequisite_sequence_fit +
    0.15 * goal_role_industry_fit +
    0.10 * evidence_balance_need +
    0.10 * freshness_field_importance +
    0.05 * time_modality_fit +
    0.05 * momentum_continuation_value +
    0.05 * live_community_urgency -
    mismatch_penalty;
  const score = clamp01(raw);

  const reasons: string[] = [];
  if (skill_gap_fit > 0.6) reasons.push('closes a skill gap');
  if (evidence_balance_need > 0.6) reasons.push('evidence-balance: favors building over more consumption');
  if (prerequisite_sequence_fit > 0.8) reasons.push('right difficulty level for you');
  if (goal_role_industry_fit >= 1) reasons.push('matches your stated goal');
  if (live_community_urgency >= 1) reasons.push('time-sensitive');
  if (momentum_continuation_value >= 1) reasons.push('continues a skill in progress');
  if (freshness_field_importance >= 0.8) reasons.push('current AI field update');
  if (mismatch_penalty > 0) reasons.push('below your current readiness for this item');
  if (!reasons.length) reasons.push('general fit');

  return { score, components, reasons };
}
