/**
 * capeLearningValuePolicy — Stage 4 of the CAPE Phase 4 learning-value ranker
 * (design doc §9 Stage 4). PURE — no I/O, no Date.now (the caller passes
 * `now`), same testability contract as `feedRanker.ts` and
 * `capeLearningValueScorer.ts`.
 *
 * Re-ranks an already-scored (Stage 3) list under non-negotiable feed
 * constraints, mirroring `feedRanker.rankCandidates`'s greedy diversity-pass
 * shape but implementing the fuller Stage 4 rule set from the design doc:
 *   - no more than 2 items of the same type consecutively;
 *   - no more than 2 passive items before a check/reflection/action item
 *     (ACTIVE_TYPES, imported from the Stage 3 scorer — one source of truth);
 *   - an exploration reserve (~`policy.explorationPct`, the SAME constant
 *     Feed Control already uses — not a new number) that periodically
 *     surfaces a moderate-scoring item instead of always taking the single
 *     highest score, so the path doesn't collapse onto one narrow score peak;
 *   - at most 1 stretch item (candidate below its `recommended_range.min`)
 *     in the first 5 positions when the learner just failed a diagnostic;
 *   - a skill whose spaced review is due (`next_review_at` in the past) gets
 *     pulled toward the front among candidates that touch it;
 *   - urgent items (live/community/time-sensitive types, same `URGENT_TYPES`
 *     Stage 3 uses) are preserved near the top regardless of score;
 *   - no single skill_id may account for more than 2 of the first 5
 *     positions (crowd-out prevention).
 *
 * This function NEVER drops a candidate — every input candidate appears
 * exactly once in the output, just reordered. Caps are advisory during
 * ordering, not filters (Stage 2 already owns filtering); if every remaining
 * candidate would violate a soft cap, the least-bad one is taken rather than
 * stalling (mirrors `feedRanker.rankCandidates`'s own `idx < 0 -> 0`
 * fallback), so this can never infinite-loop or under-return.
 *
 * CAPE Phase 6 (design doc §12 "Pacing controls"): the 4 cap values below were
 * plain module constants through Phase 4/5. They are now the DEFAULT values of
 * an optional `caps: RerankCaps` parameter, sourced live from
 * `capeGovernancePolicyService.getCurrentGovernancePolicy()` by the caller
 * (`capeLearningValueRanker.ts`) when the governance table has been
 * initialized. `DEFAULT_RERANK_CAPS` below is BYTE-IDENTICAL to the original
 * hardcoded values, so any existing call site that omits the 5th argument
 * (including every test written before this phase) keeps its exact prior
 * behavior — this function's own pure/no-I/O contract is unchanged; it still
 * never reads config itself, it only accepts it as a parameter.
 */
import type { LearningValueCandidate } from './capeCandidateFeatureService';
import type { LearnerState } from './capeLearnerStateService';
import type { LearningValueScoreResult } from './capeLearningValueScorer';
import { ACTIVE_TYPES, URGENT_TYPES } from './capeLearningValueScorer';
import type { FeedPolicy } from '../timeline/feedConfigService';

export type RankedLearningValueItem = LearningValueCandidate & LearningValueScoreResult;

/** CAPE Phase 6 governable Stage-4 rerank caps. Field names match
 * `GovernancePolicyValues` in `capeGovernancePolicyService.ts` 1:1 (minus the
 * pacing-only fields that file also carries) so the ranker orchestrator can
 * pass the governance-policy read straight through without remapping. */
export interface RerankCaps {
  sameTypeMaxStreak: number;
  passiveMaxStreak: number;
  crowdOutMaxPerSkill: number;
  /** Also controls the "max 1 stretch item in first N" position boundary —
   * see execution-contract.md Assumption 4: both checks shared the same
   * value (5) before this phase, one as a named constant, one as 2 separate
   * inline literals; both are now driven by this single field. */
  crowdOutWindow: number;
  stretchCapFirstFive: number;
}

/** Byte-identical to the original hardcoded constants
 * (CROWD_OUT_WINDOW=5, CROWD_OUT_MAX_PER_SKILL=2, SAME_TYPE_MAX_STREAK=2,
 * PASSIVE_MAX_STREAK=2, and the inline stretch-cap literal `>= 1`). */
export const DEFAULT_RERANK_CAPS: RerankCaps = {
  sameTypeMaxStreak: 2,
  passiveMaxStreak: 2,
  crowdOutMaxPerSkill: 2,
  crowdOutWindow: 5,
  stretchCapFirstFive: 1,
};

function primarySkillId(c: LearningValueCandidate): string | null {
  return c.skill_mapping.skill_impacts[0]?.skill_id ?? null;
}

/** A "stretch" item is one the learner isn't ready for yet (below
 * `recommended_range.min`) OR one that has already been outgrown (comfortably
 * above `.max` — no longer a meaningful stretch, but still flagged so Stage 4
 * doesn't burn a "recent failure" learner's limited attention on either
 * extreme when they need solid-footing items instead). `.max === 0` (the
 * `EMPTY_CONTRACT` default, meaning "no range declared") is never treated as
 * "above max" — only a genuinely declared, positive ceiling counts. */
function isStretchItem(c: LearningValueCandidate, learnerState: LearnerState): boolean {
  const { recommended_range: range, skill_impacts: impacts } = c.skill_mapping;
  // (min===0 AND max===0) is the EMPTY_CONTRACT sentinel for "no range
  // declared" (same convention capeLearningValueScorer.ts uses) — that's the
  // only case with nothing to check. A range like {min:0, max:10} is a REAL,
  // meaningful ceiling and must still be checked, so the guard must not
  // short-circuit on `min <= 0` alone (that was the bug this fixed).
  if (!range || (range.min === 0 && range.max === 0) || !impacts.length) return false;
  const avgPlacement = impacts.reduce((sum, i) => {
    const s = learnerState.skills.find((x) => x.skill_id === i.skill_id);
    return sum + (s ? s.placement : 0);
  }, 0) / impacts.length;
  if (range.min > 0 && avgPlacement < range.min) return true;
  return range.max > 0 && avgPlacement > range.max;
}

function reviewDue(c: LearningValueCandidate, learnerState: LearnerState, now: Date): boolean {
  return c.skill_mapping.skill_impacts.some((i) => {
    const s = learnerState.skills.find((x) => x.skill_id === i.skill_id);
    return !!(s?.next_review_at && new Date(s.next_review_at).getTime() <= now.getTime());
  });
}

interface RerankState {
  lastType: string | null;
  typeStreak: number;
  passiveStreak: number;
  stretchUsedInFirst5: number;
  skillCountsInFirst5: Map<string, number>;
}

function violatesCaps(c: LearningValueCandidate, state: RerankState, position: number, learnerState: LearnerState, recentFailure: boolean, caps: RerankCaps): boolean {
  if (c.type === state.lastType && state.typeStreak >= caps.sameTypeMaxStreak) return true;
  if (!ACTIVE_TYPES.has(c.type) && state.passiveStreak >= caps.passiveMaxStreak) return true;
  if (position < caps.crowdOutWindow && recentFailure && isStretchItem(c, learnerState) && state.stretchUsedInFirst5 >= caps.stretchCapFirstFive) return true;
  if (position < caps.crowdOutWindow) {
    const skillId = primarySkillId(c);
    if (skillId && (state.skillCountsInFirst5.get(skillId) ?? 0) >= caps.crowdOutMaxPerSkill) return true;
  }
  return false;
}

function applyPick(c: LearningValueCandidate, state: RerankState, position: number, learnerState: LearnerState, caps: RerankCaps) {
  state.typeStreak = c.type === state.lastType ? state.typeStreak + 1 : 1;
  state.lastType = c.type;
  state.passiveStreak = ACTIVE_TYPES.has(c.type) ? 0 : state.passiveStreak + 1;
  if (position < caps.crowdOutWindow && isStretchItem(c, learnerState)) state.stretchUsedInFirst5 += 1;
  if (position < caps.crowdOutWindow) {
    const skillId = primarySkillId(c);
    if (skillId) state.skillCountsInFirst5.set(skillId, (state.skillCountsInFirst5.get(skillId) ?? 0) + 1);
  }
}

/**
 * Re-rank a Stage-3-scored candidate list under Stage 4's policy constraints.
 * `policy` supplies the exploration reserve (`explorationPct`) — pass
 * `getFeedPolicy()`'s result when `env.feedControlEnabled`, else
 * `DEFAULT_FEED_POLICY`, exactly like the composer already does for the
 * legacy ranker.
 *
 * `caps` (CAPE Phase 6, optional, defaults to `DEFAULT_RERANK_CAPS`) supplies
 * the 4 previously-hardcoded Stage-4 caps. Omitting it (every call site/test
 * written before Phase 6) reproduces the exact prior behavior.
 */
export function applyPolicyRerank(
  scored: RankedLearningValueItem[],
  learnerState: LearnerState,
  policy: FeedPolicy,
  now: Date,
  caps: RerankCaps = DEFAULT_RERANK_CAPS,
): RankedLearningValueItem[] {
  const byScoreDesc = [...scored].sort((a, b) => b.score - a.score);
  const lowerHalf = new Set(byScoreDesc.slice(Math.ceil(byScoreDesc.length / 2)).map((c) => c.ref));

  // Urgent + review-due items are pulled to the front of the pool (still
  // internally sorted by score) before the greedy pass runs, so they win ties
  // against the caps below rather than getting stuck behind a full streak.
  const pool = [...byScoreDesc].sort((a, b) => {
    const aPriority = (URGENT_TYPES.has(a.type) || reviewDue(a, learnerState, now)) ? 1 : 0;
    const bPriority = (URGENT_TYPES.has(b.type) || reviewDue(b, learnerState, now)) ? 1 : 0;
    return bPriority - aPriority;
  });

  const explorationEvery = policy.explorationPct > 0 ? Math.max(2, Math.round(1 / policy.explorationPct)) : Infinity;

  const state: RerankState = { lastType: null, typeStreak: 0, passiveStreak: 0, stretchUsedInFirst5: 0, skillCountsInFirst5: new Map() };
  const out: RankedLearningValueItem[] = [];
  let sincePick = 0;

  while (pool.length) {
    const position = out.length;
    let idx = -1;
    let wasExplorationPick = false;

    // Exploration pull: due, and a lower-half candidate exists that doesn't
    // violate any cap — surface it instead of always taking the top score.
    if (sincePick >= explorationEvery) {
      idx = pool.findIndex((c) => lowerHalf.has(c.ref) && !violatesCaps(c, state, position, learnerState, learnerState.recent_failure, caps));
      if (idx >= 0) wasExplorationPick = true;
    }
    // Normal pass: highest-scored candidate (pool is score-sorted, urgent-first) that respects caps.
    if (idx < 0) idx = pool.findIndex((c) => !violatesCaps(c, state, position, learnerState, learnerState.recent_failure, caps));
    // Relax: every remaining candidate violates a soft cap — take the best remaining rather than stall.
    if (idx < 0) idx = 0;

    const picked = pool.splice(idx, 1)[0];
    applyPick(picked, state, position, learnerState, caps);
    out.push(picked);
    sincePick = wasExplorationPick ? 0 : sincePick + 1;
  }

  return out;
}
