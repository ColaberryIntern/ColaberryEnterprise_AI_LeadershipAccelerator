/**
 * feedTypeAdjustmentPreviewService — the read-only "what would moving this
 * type's more/less slider actually do" projector behind the Feed Control type
 * drawer. Never writes; extends the SAME transparent, rule-based philosophy
 * as feedRanker.ts and feedControlService.simulate() — a disclosed formula
 * with visible inputs, not an opaque/trained model (see
 * docs/spec/cape-adaptive-path-engine.md §9's explainability stance, which
 * this feature deliberately mirrors even though it's a Feed Control feature,
 * not CAPE).
 *
 * HONESTY NOTE (load-bearing): for ANCHORED types, the cadence/freq-cap/
 * cooldown fields this projects are NOT currently consumed by the live
 * ranker (see feedTypeStatsService.ts's TYPE_LEVEL_KNOBS_INERT diagnostic
 * and feedRanker.ts — confirmed by reading the code, not assumed). Every
 * response below carries an explicit caveat saying so: this models the
 * INTENDED effect per the field's own UI help text, not a guaranteed live
 * outcome until that wiring exists or matching per-card overrides are set.
 */
import { getTypeStats, getLaneBreakdown30d, getFeedPolicy, type FeedPolicy } from './feedTypeStatsService';

/** Disclosed, fixed heuristic: each +1 step is a 35% relative increase in
 *  projected daily appearances; each -1 step a 35% relative decrease. This is
 *  a transparent multiplier the admin can see and reason about — not a
 *  trained model — same spirit as feedRanker's fixed pin/priority/recency
 *  multipliers (scoreCandidate in feedRanker.ts). */
export const STEP_FACTOR = 1.35;
export const MIN_STEP = -3;
export const MAX_STEP = 3;

export interface AdjustmentKnobs { cadence: number; frequencyCap: number; cooldownDays: number }
export interface DisplacedType { slug: string; label: string; currentShare30d: number; projectedShare30d: number; deltaPct: number }
export interface TypeAdjustmentPreview {
  slug: string;
  step: number;
  feedMode: 'anchored' | 'ambient';
  baseline: AdjustmentKnobs & { observedPerDay30d: number };
  proposed: AdjustmentKnobs & { projectedPerDay30d: number };
  projectedChangePct: number;
  displaced: DisplacedType[];
  caveats: string[];
}

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round((Number.isFinite(n) ? n : 0) * f) / f;
}

function clampStep(step: number): number {
  return Math.max(MIN_STEP, Math.min(MAX_STEP, Math.round(step)));
}

/** Pure calculation core — no I/O — directly unit-testable without a DB. */
export function computeProjection(
  baseline: { cadence: number; frequencyCap: number; cooldownDays: number; observedPerDay30d: number; poolTotal: number },
  step: number,
): { proposed: AdjustmentKnobs & { projectedPerDay30d: number }; projectedChangePct: number } {
  const clamped = clampStep(step);
  const factor = Math.pow(STEP_FACTOR, clamped);

  // Cadence = items BETWEEN injections (see the drawer's own help text), so
  // "more" (a positive step) means a SMALLER number; floor at 1 (every item).
  const proposedCadence = Math.max(1, Math.round(baseline.cadence / factor));

  // Frequency cap: 0 = unlimited (feedRanker.scoreCandidate: `cap > 0 && ...`).
  // Scaling an unlimited cap UP is a no-op; scaling it DOWN on a "less" step
  // derives a real cap from the observed rate so the slider still visibly
  // does something even when starting from "no cap set".
  const proposedFrequencyCap = baseline.frequencyCap === 0
    ? (clamped < 0 ? Math.max(1, Math.round(baseline.observedPerDay30d * 30 * factor)) : 0)
    : Math.max(0, Math.round(baseline.frequencyCap * factor));

  // Cooldown: "more" means a SHORTER cooldown; floor at 0 (no cooldown).
  const proposedCooldownDays = Math.max(0, Math.round(baseline.cooldownDays / factor));

  const rawProjected = baseline.observedPerDay30d * factor;
  // Never project more distinct daily appearances than the pool could
  // plausibly sustain — clip to the pool size as a generous ceiling.
  const ceiling = baseline.poolTotal > 0 ? baseline.poolTotal : rawProjected;
  const projectedPerDay30d = Math.max(0, Math.min(rawProjected, ceiling));
  const projectedChangePct = baseline.observedPerDay30d > 0
    ? Math.round(((projectedPerDay30d - baseline.observedPerDay30d) / baseline.observedPerDay30d) * 100)
    : (projectedPerDay30d > 0 ? 100 : 0);

  return {
    proposed: {
      cadence: proposedCadence, frequencyCap: proposedFrequencyCap, cooldownDays: proposedCooldownDays,
      projectedPerDay30d: round(projectedPerDay30d),
    },
    projectedChangePct,
  };
}

/** The read-only preview the slider calls on every tick (debounced client-side).
 *  Reuses getTypeStats (same 404-on-unknown-slug contract) so this endpoint
 *  never duplicates validation or diverges from the stats panel's numbers. */
export async function previewTypeAdjustment(slug: string, step: number): Promise<TypeAdjustmentPreview> {
  const stats = await getTypeStats(slug); // throws {status:404} for unknown slug
  const policy: FeedPolicy = await getFeedPolicy();
  const clamped = clampStep(step);

  const baselineCadence = stats.routing.cadence ?? policy.todayCadence;
  const baselineFrequencyCap = stats.routing.frequencyCap ?? policy.defaultFrequencyCap;
  const baselineCooldownDays = stats.routing.cooldownDays ?? policy.defaultCooldownDays;
  const observedPerDay30d = stats.velocity.perDay30d;

  const { proposed, projectedChangePct } = computeProjection(
    { cadence: baselineCadence, frequencyCap: baselineFrequencyCap, cooldownDays: baselineCooldownDays, observedPerDay30d, poolTotal: stats.pool.total },
    clamped,
  );

  // Displacement: zero-sum reallocation within the same lane, weighted by
  // each sibling's REAL current 30-day share (not an assumed equal split) —
  // grounded in the same aggregate query the stats panel's LOW_LANE_SHARE
  // diagnostic already runs.
  const deltaImpressions30d = (proposed.projectedPerDay30d - observedPerDay30d) * 30;
  const siblings = await getLaneBreakdown30d(stats.home_surface, slug);
  const siblingTotal30d = siblings.reduce((sum, sib) => sum + sib.impressions30d, 0);
  const displaced: DisplacedType[] = siblings
    .filter((sib) => sib.impressions30d > 0 || siblingTotal30d === 0)
    .map((sib) => {
      const theirShareOfRemaining = siblingTotal30d > 0 ? sib.impressions30d / siblingTotal30d : (siblings.length ? 1 / siblings.length : 0);
      const theirDelta = -deltaImpressions30d * theirShareOfRemaining;
      const theirCurrent = sib.impressions30d;
      const projectedTotal = Math.max(1, siblingTotal30d + deltaImpressions30d);
      return {
        slug: sib.slug, label: sib.label,
        currentShare30d: round(sib.share30d, 3),
        projectedShare30d: round(Math.max(0, theirCurrent + theirDelta) / projectedTotal, 3),
        deltaPct: theirCurrent > 0 ? Math.round((theirDelta / theirCurrent) * 100) : (theirDelta !== 0 ? Math.sign(theirDelta) * 100 : 0),
      };
    })
    .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
    .slice(0, 5);

  const caveats: string[] = [];
  if (stats.feed_mode === 'anchored') {
    caveats.push(
      "Cadence/Freq cap/Cooldown at the TYPE level are not currently consumed by the live ranker for anchored cards (only a CARD's own override is) — this projects the INTENDED effect per the field's own help text, not a guaranteed live outcome until that wiring exists or matching per-card overrides are set. See the TYPE_LEVEL_KNOBS_INERT stat diagnostic.",
    );
  } else {
    caveats.push(
    "This type rotates via the Global Policy's shared ambientProviders + todayCadence, not a per-type cadence field — this projects the estimated effect of shifting its relative weight in that shared rotation, not a directly-wired per-type mechanism.",
    );
  }
  caveats.push(`Estimate uses a disclosed fixed multiplier (${STEP_FACTOR}x per step) applied to the observed last-30-day rate — a transparent heuristic, not a trained predictive model.`);
  if (displaced.length) {
    caveats.push("Displaced-type shares are weighted by each sibling type's real current 30-day share of the lane, redistributing this type's projected change proportionally — a simplification of the ranker's real score-based competition, but grounded in real current data.");
  }

  return {
    slug, step: clamped, feedMode: stats.feed_mode,
    baseline: { cadence: baselineCadence, frequencyCap: baselineFrequencyCap, cooldownDays: baselineCooldownDays, observedPerDay30d },
    proposed, projectedChangePct, displaced, caveats,
  };
}
