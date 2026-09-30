/**
 * milestonePromotion — the I/O half of the milestone ladder. Syncs milestones,
 * computes the rank they justify, applies the latch, and persists to
 * `student_level` — the same row `computeBand` reads, so every surface that
 * already shows a band picks the new rung up unchanged.
 *
 * FULL RECOMPUTE TO THE HIGHEST CLEARED RUNG. The legacy evaluator checked only
 * rank+1 per trigger, so a student holding rank-4 evidence needed three more
 * lucky triggers. This one lands them where they belong in one pass.
 *
 * NEVER LOWERS. `latchRank` keeps whatever the row already holds — including a
 * legacy rank, mapped through `legacyRankToMilestoneRank` so a Junior Builder
 * stays AI Builder I on the day the flag flips (decision D5).
 *
 * `promotion_evidence` on the row records the milestone state that justified
 * the write, plus the previous slug/rank, so the backfill and any later audit
 * can see exactly what moved whom.
 */
import StudentLevel from '../../models/StudentLevel';
import { syncMilestones, getMilestoneState } from './milestoneService';
import {
  ENTRY_SLUG, MilestoneState, MilestoneGap, latchRank, legacyRankToMilestoneRank,
  milestoneGaps, rankForMilestones, rungForRank, rungNameForRank,
} from './milestoneLadder';

export interface MilestonePromotionOutcome {
  promoted: boolean;
  level: string;
  rank: number;
  previous: { level: string; rank: number };
  state: MilestoneState;
  newlyLatched: Array<{ type: string; source_ref: string }>;
}

/**
 * Sync milestones, then promote to the highest cleared rung. Idempotent:
 * re-running with the same truth re-affirms the same row and writes nothing.
 */
export async function evaluateMilestonePromotion(enrollmentId: string): Promise<MilestonePromotionOutcome> {
  const [current] = await StudentLevel.findOrCreate({
    where: { enrollment_id: enrollmentId },
    defaults: { enrollment_id: enrollmentId, level_slug: ENTRY_SLUG, rank: 0 },
  });
  const previous = { level: current.level_slug, rank: current.rank };

  const sync = await syncMilestones(enrollmentId);
  const held = legacyRankToMilestoneRank(current.level_slug, current.rank);
  const computed = rankForMilestones(sync.state);
  const target = latchRank(held, computed);

  const rung = rungForRank(target);
  const targetSlug = rung ? rung.slug : ENTRY_SLUG;
  const changed = targetSlug !== current.level_slug || target !== current.rank;

  if (changed) {
    await current.update({
      level_slug: targetSlug,
      rank: target,
      promotion_evidence: {
        ladder: 'milestone',
        state: sync.state,
        computed_rank: computed,
        held_rank: held,
        previous,
        newly_latched: sync.newlyLatched,
      },
      promoted_at: target > previous.rank ? new Date() : current.promoted_at,
    });
  }

  return {
    promoted: target > held,
    level: targetSlug,
    rank: target,
    previous,
    state: sync.state,
    newlyLatched: sync.newlyLatched,
  };
}

export interface MilestonePromotionStatus {
  level: string;
  rank: number;
  rungName: string;
  next_level: string | null;
  next_rung_name: string | null;
  at_max: boolean;
  state: MilestoneState;
  gaps: MilestoneGap[];
}

/**
 * Read-only view for the Points page and the company drill-down: where the
 * student stands and, in milestone language, what is left. Never writes.
 * Reads the LATCHED milestones only; a milestone the student has satisfied but
 * that no trigger has latched yet shows up on the next sync, which every
 * completion and push runs.
 */
export async function getMilestonePromotionStatus(enrollmentId: string): Promise<MilestonePromotionStatus> {
  const [current] = await StudentLevel.findOrCreate({
    where: { enrollment_id: enrollmentId },
    defaults: { enrollment_id: enrollmentId, level_slug: ENTRY_SLUG, rank: 0 },
  });
  const state = await getMilestoneState(enrollmentId);
  const rank = legacyRankToMilestoneRank(current.level_slug, current.rank);
  const next = rungForRank(rank + 1);
  const atMax = !next || next.manualOnly;
  return {
    level: current.level_slug,
    rank,
    rungName: rungNameForRank(rank),
    next_level: atMax ? null : next!.slug,
    next_rung_name: atMax ? null : rungNameForRank(next!.rank),
    at_max: atMax,
    state,
    gaps: milestoneGaps(state, rank),
  };
}
