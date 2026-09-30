/**
 * capeCandidateFeatureService — enriches anchored Today-feed candidates with
 * their RESOLVED Architecture Skill mapping (design doc §7, §9 Stage 1) for
 * the CAPE Phase 4 ranker.
 *
 * Phase 3 already resolves and stamps a `LearningPlacementContract` onto every
 * PUBLISHED `TimelineCard` at publish time (`capeCardSkillMappingService.
 * stampIfPublished`, `models/CurriculumSkillMap.ts`) — this file does NOT
 * re-resolve the card→week→type hierarchy; it just reads the already-stamped
 * `skill_mapping` column in one batched query per candidate list, keeping the
 * ranker's hot path free of the resolution machinery entirely.
 *
 * Candidates without a `card_id` (community posts, session replays) — or a
 * `card_id` whose `TimelineCard` row is missing/unpublished/never stamped —
 * get `EMPTY_CONTRACT`: zero skill impact, no prerequisites, matches design
 * doc §7's "community practice: normally zero/low skill credit" default. This
 * is a safe, explicit default, never a silent crash.
 */
import TimelineCard from '../../models/TimelineCard';
import type { LearningPlacementContract } from '../../models/CurriculumSkillMap';
import type { TodayFeedItem } from '../timeline/todayFeedComposer';

export const EMPTY_CONTRACT: LearningPlacementContract = {
  skill_impacts: [],
  prerequisite_skills: [],
  recommended_range: { min: 0, max: 0 },
  freshness_days: null,
  reviewable: true,
};

export interface LearningValueCandidate extends TodayFeedItem {
  skill_mapping: LearningPlacementContract;
}

/**
 * Batch-enrich a list of anchored candidates. Empty input short-circuits
 * before any DB call (a real cost saver on the common "nothing left to rank"
 * path, and a documented boundary case).
 */
export async function enrichCandidates(candidates: TodayFeedItem[]): Promise<LearningValueCandidate[]> {
  if (!candidates.length) return [];

  const cardIds = Array.from(new Set(candidates.map((c) => c.card_id).filter((id): id is string => !!id)));
  const mappingByCardId = new Map<string, LearningPlacementContract>();

  if (cardIds.length) {
    let rows: Array<{ id: string; skill_mapping: LearningPlacementContract | null }> = [];
    try {
      rows = await TimelineCard.findAll({
        where: { id: cardIds },
        attributes: ['id', 'skill_mapping'],
      }) as any;
    } catch (err: any) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'cape_candidate_feature_lookup_failed',
        error_class: err?.name || 'Error',
        outcome: 'failure',
        context: { card_count: cardIds.length, message: err?.message },
      }));
      rows = []; // fail-soft: every candidate falls back to EMPTY_CONTRACT below, never a throw
    }
    for (const row of rows) {
      mappingByCardId.set(row.id, (row.skill_mapping as LearningPlacementContract | null) ?? EMPTY_CONTRACT);
    }
  }

  return candidates.map((c) => ({
    ...c,
    skill_mapping: (c.card_id && mappingByCardId.get(c.card_id)) || EMPTY_CONTRACT,
  }));
}
