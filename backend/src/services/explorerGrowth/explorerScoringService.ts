import { EXPLORER_SIGNAL_DEFINITIONS } from './explorerSignalDefinitions';
import type {
  ExplorerEngagementSubBand,
  ExplorerSignalReadout,
} from '../../types/explorerGrowth';

/**
 * Explorer Growth OS — E/I/F scoring. Plan §7.2-7.4, EPIC 3 T001.
 *
 * Turns the reader's raw decayed contributions into three 0-100 scores. PURE:
 * no I/O, no wall clock. Everything time-dependent already happened in the
 * reader, which decays against an injectable `asOf`.
 *
 * THE TWO INVARIANTS THIS FILE EXISTS TO ENFORCE:
 *
 *  1. Each engagement sub-band caps INDEPENDENTLY (§7.2: achievement 35,
 *     progress 35, recency 30). A learner who only earns points cannot reach
 *     100 on achievement alone — "engaged" means breadth, not one loud signal.
 *
 *  2. Intent is TIER-GATED. Twenty pricing-page views is not readiness. A
 *     learner whose best RECENT signal is tier-1 caps at 40 however much view
 *     weight they accumulate, because the alternative is emailing "ready to
 *     enrol?" to someone who just browsed.
 *
 * KNOWN DEVIATION FROM §7.2, recorded rather than silently resolved (CLAUDE.md
 * requires deviations be written down with reasoning):
 *
 *   §7.2 specifies PER-SUB-BAND half-lives — achievement 21d, progress 21d,
 *   recency 7d. The shipped table uses PER-SIGNAL half-lives that already
 *   contradict those (`live_session_attended` 30d vs 7d,
 *   `first_card_interacted` 21d vs 7d), and the reader decays BEFORE this
 *   service sees anything, so the sub-band curve cannot be re-applied here
 *   without double-decaying.
 *
 *   Kept: the shipped per-signal decay. It is live, deployed, and already
 *   scoring production data.
 *
 *   THE BIAS THIS INTRODUCES, stated so EPIC 4 does not inherit it unlabelled:
 *   the two heaviest recency signals decay SLOWER than §7.2 intends, which
 *   OVER-SCORES STALE LEARNERS. A live session 30 days ago contributes
 *   `12 * 2^(-30/30) = 6.0` here versus `12 * 2^(-30/7) = 0.6` under §7.2 —
 *   5.4 points into a 30-point band, enough to flip a borderline learner across
 *   ENGAGED_LEARNER (45) or INTERNSHIP_READY (50).
 *
 *   COMPENSATING CONTROL: the DORMANT overlay is derived from
 *   `readout.lastEngagementAt` (a real 14-day clock), NOT from the E score, so
 *   an inactive learner is still correctly marked dormant even while their E
 *   decays too slowly. Do not remove that control without revisiting this.
 */

/** §7.2 band structure. Independent caps are the point — do not sum then clamp. */
export const ENGAGEMENT_SUB_BAND_CAPS: Record<ExplorerEngagementSubBand, number> = {
  achievement: 35,
  progress: 35,
  recency: 30,
};

/**
 * Ceiling for a learner whose best recent intent signal is a mere view.
 *
 * 40 sits deliberately below every §8 intent threshold — CONSIDERING_NEXT_STEP
 * needs 45, HIGH_INTENT 60, ENROLLMENT_READY 70 — so tier-1 traffic alone can
 * never reach a commercial state no matter how much of it accumulates.
 */
export const TIER_1_INTENT_CEILING = 40;

export interface ExplorerScores {
  e: number;
  i: number;
  f: number;
  bands: {
    engagement: Record<ExplorerEngagementSubBand, number>;
    intent: { raw: number; tierCapped: boolean };
    friction: { raw: number };
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * E — engagement. Three independently-capped sub-bands, summed to 0-100.
 *
 * A signal with no `subBand` is skipped rather than defaulted into a band: a
 * silent default would let a mis-declared signal inflate a score invisibly. The
 * definitions guard test asserts every engagement signal carries one, so an
 * unclassified signal is a test failure, not a runtime surprise.
 */
function scoreEngagement(
  readout: ExplorerSignalReadout,
): Record<ExplorerEngagementSubBand, number> {
  const sub: Record<ExplorerEngagementSubBand, number> = {
    achievement: 0,
    progress: 0,
    recency: 0,
  };

  for (const s of readout.bands.engagement.signals) {
    const def = EXPLORER_SIGNAL_DEFINITIONS[s.signal];
    if (!def?.subBand) continue;
    sub[def.subBand] += s.contribution;
  }

  for (const key of Object.keys(sub) as ExplorerEngagementSubBand[]) {
    sub[key] = clamp(sub[key], 0, ENGAGEMENT_SUB_BAND_CAPS[key]);
  }
  return sub;
}

/**
 * I — intent, gated on the RECENT tier.
 *
 * Uses `recentIntentTier` (14-day window) rather than `highestIntentTier`
 * (lifetime). A learner who filled in an enrolment form a year ago and has done
 * nothing since is not ready today, and the lifetime maximum would exempt them
 * from this ceiling permanently.
 */
function scoreIntent(readout: ExplorerSignalReadout): { i: number; tierCapped: boolean } {
  const raw = clamp(readout.bands.intent.total, 0, 100);
  const tierCapped = readout.recentIntentTier <= 1;
  return { i: tierCapped ? Math.min(raw, TIER_1_INTENT_CEILING) : raw, tierCapped };
}

/**
 * F — friction. High is BAD; F >= 25 suppresses commercial action (§6.3).
 *
 * No decay is applied here. Friction signals whose condition is unresolved
 * (`email_hard_bounce`, `support_case_open`) already carry `halfLifeDays: null`
 * in the definitions table, so the reader hands them over at full weight and
 * re-applying anything would double-count.
 */
function scoreFriction(readout: ExplorerSignalReadout): number {
  return clamp(readout.bands.friction.total, 0, 100);
}

/** Score one learner. Pure — same readout in, same scores out, always. */
export function scoreLearner(readout: ExplorerSignalReadout): ExplorerScores {
  const engagement = scoreEngagement(readout);
  const intent = scoreIntent(readout);
  const f = scoreFriction(readout);

  return {
    e: clamp(engagement.achievement + engagement.progress + engagement.recency, 0, 100),
    i: intent.i,
    f,
    bands: {
      engagement,
      intent: { raw: readout.bands.intent.total, tierCapped: intent.tierCapped },
      friction: { raw: readout.bands.friction.total },
    },
  };
}
