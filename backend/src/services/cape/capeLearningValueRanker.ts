/**
 * capeLearningValueRanker — the CAPE Phase 4 orchestrator (design doc §9,
 * §16 Phase 4). Composes the 5 stages built across T002-T006 into one entry
 * point the Today feed composer (`todayFeedComposer.ts`) and the Feed
 * Control simulator (`feedControlService.ts`) both call:
 *
 *   Stage 1 (learner state + candidate features): `getLearnerState` +
 *     `enrichCandidates`
 *   Stage 2 (hard eligibility): `filterEligible`
 *   Stage 3 (explainable score): `scoreLearningValue`
 *   Stage 4 (policy rerank): `applyPolicyRerank`
 *   Stage 5 (explanation): stamped onto every returned item as `rank_score`
 *     / `reasons` / `policy_version` / `learner_state_version` — the exact 4
 *     columns `ensureCapeLearningValueRankerSchema.ts` adds to
 *     `today_feed_impressions`.
 *
 * This is the ONLY file in the ranker that does I/O beyond what its stage
 * dependencies already do (via `getLearnerState`/`enrichCandidates`) — every
 * stage function it composes is pure. Never throws: an upstream
 * `CapeLearnerStateError` is allowed to propagate (a genuinely broken skill
 * ledger read should surface loudly, matching `capeLearnerStateService`'s own
 * documented fail-hard choice), but every other stage degrades to a safe
 * empty/neutral result rather than crashing the Today feed.
 */
import type { TodayFeedItem } from '../timeline/todayFeedComposer';
import { getLearnerState } from './capeLearnerStateService';
import { enrichCandidates } from './capeCandidateFeatureService';
import { filterEligible, type EligibilityExclusion } from './capeEligibilityFilter';
import { scoreLearningValue } from './capeLearningValueScorer';
import { applyPolicyRerank, type RankedLearningValueItem } from './capeLearningValuePolicy';
import { env } from '../../config/env';
import { getFeedPolicy, DEFAULT_FEED_POLICY, type FeedPolicy } from '../timeline/feedConfigService';

/**
 * Manually bumped whenever the Stage 3/4 formula changes materially enough
 * that old explanations should be understood as "a different policy scored
 * this." There is no persisted, admin-editable ranker-policy table in this
 * phase (that governance surface is Phase 6 scope, design doc §12) — this is
 * a plain module constant, the same shape as `weights_version` before
 * `ArchitectureSkillEvidenceBandWeights` existed.
 */
export const CAPE_RANKER_POLICY_VERSION = 1;

export interface LearningValueRankResult {
  items: Array<RankedLearningValueItem & {
    rank_score: number;
    policy_version: number;
    learner_state_version: string;
  }>;
  excluded: EligibilityExclusion[];
  policy_version: number;
  learner_state_version: string;
}

/**
 * Rank a list of anchored Today-feed candidates for one enrollment. Returns
 * `{ items: [] , excluded: [...] }` (never a throw) when every candidate is
 * ineligible or the input list is empty — both are real, expected outcomes
 * for a brand-new learner or an exhausted queue, not error states.
 */
export async function rankLearningValue(
  enrollmentId: string,
  candidates: TodayFeedItem[],
  now: Date,
): Promise<LearningValueRankResult> {
  const learnerState = await getLearnerState(enrollmentId);

  if (!candidates.length) {
    return { items: [], excluded: [], policy_version: CAPE_RANKER_POLICY_VERSION, learner_state_version: learnerState.learner_state_version };
  }

  const enriched = await enrichCandidates(candidates);
  const { eligible, excluded } = filterEligible(enriched, learnerState);

  if (!eligible.length) {
    return { items: [], excluded, policy_version: CAPE_RANKER_POLICY_VERSION, learner_state_version: learnerState.learner_state_version };
  }

  const scored: RankedLearningValueItem[] = eligible.map((c) => ({ ...c, ...scoreLearningValue(c, learnerState, now) }));

  const policy: FeedPolicy = env.feedControlEnabled ? await getFeedPolicy() : DEFAULT_FEED_POLICY;
  const ranked = applyPolicyRerank(scored, learnerState, policy, now);

  const items = ranked.map((item) => ({
    ...item,
    rank_score: item.score,
    policy_version: CAPE_RANKER_POLICY_VERSION,
    learner_state_version: learnerState.learner_state_version,
  }));

  return { items, excluded, policy_version: CAPE_RANKER_POLICY_VERSION, learner_state_version: learnerState.learner_state_version };
}
