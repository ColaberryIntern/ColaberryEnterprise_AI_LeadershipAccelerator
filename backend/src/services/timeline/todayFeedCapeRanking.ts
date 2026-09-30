/**
 * todayFeedCapeRanking — CAPE Phase 4's learning-value ranking seam, split out of
 * todayFeedComposer.ts (2026-08-12, daily-refresh build) purely to keep that file
 * under CLAUDE.md's 500-line hard ceiling. Re-exported from todayFeedComposer.ts
 * so no existing `from './todayFeedComposer'` import site needed to change.
 */
import { type TodayFeedItem } from './todayFeedTypes';
import { env } from '../../config/env';
import { rankLearningValue } from '../cape/capeLearningValueRanker';

/** CAPE Phase 4 Stage 5 explanation (design doc §9 Stage 5, §13) — present only
 * when `env.capeLearningValueRankerEnabled` is on and ranking succeeded for
 * this item; absent (all 4 columns stay NULL/[]) otherwise, including every
 * flag-off write. */
export interface CapeExplanation {
  rank_score: number;
  reasons: string[];
  policy_version: number;
  learner_state_version: string;
}

/** Extracts a CAPE explanation from a ranked candidate, if present. Ranked
 * items carry `rank_score`/`reasons`/`policy_version`/`learner_state_version`
 * at runtime (stamped by `capeLearningValueRanker.rankLearningValue`) even
 * though `TodayFeedItem`'s own type doesn't declare them — this is the one
 * place that bridges the two, via an explicit runtime check
 * (`typeof rank_score === 'number'`), never an unchecked cast. Returns
 * `undefined` for every flag-off item, so `persistImpression` writes NULL/[]
 * for all 4 new columns exactly as it did before this task. */
export function extractCapeExplanation(cand: TodayFeedItem): CapeExplanation | undefined {
  const c = cand as TodayFeedItem & Partial<CapeExplanation>;
  if (typeof c.rank_score !== 'number') return undefined;
  return {
    rank_score: c.rank_score,
    reasons: Array.isArray(c.reasons) ? c.reasons : [],
    policy_version: c.policy_version ?? 0,
    learner_state_version: c.learner_state_version ?? '',
  };
}

/**
 * CAPE Phase 4 flag-ON ranking step (design doc §9, §16 Phase 4). Applied
 * AFTER `selectAnchoredOrder` (which stays a pure passthrough — see its own
 * doc comment) so the flag-off contract that function's tests prove is
 * completely unaffected by this function's existence. A ranking failure
 * (thrown `CapeLearnerStateError`, a DB blip, anything) is caught and logged
 * here — the feed falls back to the unranked precedence/week-bound order
 * rather than breaking, matching this file's own "fail-soft throughout"
 * contract.
 */
export async function applyCapeRankingIfEnabled(enrollmentId: string, anchoredQueue: TodayFeedItem[]): Promise<TodayFeedItem[]> {
  if (!env.capeLearningValueRankerEnabled || !anchoredQueue.length) return anchoredQueue;
  try {
    const ranked = await rankLearningValue(enrollmentId, anchoredQueue, new Date());
    return ranked.items;
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'cape_learning_value_ranking_failed',
      error_class: err?.name || 'Error',
      outcome: 'failure',
      context: { enrollment_id: enrollmentId, candidate_count: anchoredQueue.length, message: err?.message },
    }));
    return anchoredQueue;
  }
}

/**
 * CAPE Phase 4 wiring seam (design doc §9, §16 Phase 4). The single call site
 * both `extendFeed` and `composeReadOnlyPage` route the precedence/week-bound
 * queue through before consumption. Flag OFF (the default, everywhere
 * including production) returns the SAME array, SAME order `gatherAnchored`
 * produced — a pure passthrough, proven by identity (`toBe`, not just
 * `toEqual`) in `todayFeedComposer.capeFlagOff.test.ts`, so this is
 * byte-identical to pre-Phase-4 behavior. Flag ON routes through
 * `applyCapeRankingIfEnabled` (a separate function layered on top — see its
 * own doc comment) which delegates to the CAPE learning-value ranker.
 */
export function selectAnchoredOrder(anchoredQueue: TodayFeedItem[], capeEnabled: boolean): TodayFeedItem[] {
  return anchoredQueue;
}
