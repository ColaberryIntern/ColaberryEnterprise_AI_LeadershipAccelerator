/**
 * bandLadder.ts — the ONE canonical public "band" vocabulary that unifies the
 * three historical level systems into a single identity a learner sees.
 *
 * Pure + deterministic (no I/O). Reconciles:
 *   A. Points ladder (pointsService.LEVELS, thresholds 0/150/400/900) — the
 *      FREE bands. Points ALONE can never exceed "AI Enabled".
 *   B. Legacy community tiers (communityService.LEVEL_TIERS, 0/1500/2700/4200) —
 *      being folded onto ladder A behind COMMUNITY_LEVEL_USE_CANONICAL; that
 *      reconcile lives in communityService, not here.
 *   C. Competency promotion ladder (progression seeders.BUILDER_LEVELS, ranks
 *      0-8, evaluated by promotionService, persisted to StudentLevel). This is
 *      the REAL build gate and it OVERRIDES points. Because build evidence is
 *      paid-only (Phase 2), a free learner can never earn a build promotion, so
 *      points can never carry anyone into AI Builder / AI Architect. THAT is the
 *      structural anti-cheat — not a points cap that could be re-tuned, but the
 *      absence of a promotion path for free accounts.
 *
 * Public bands (identity), in order:
 *   AI Aware → AI Enabled → AI Builder → AI Architect
 *   (+ "AI Organization" is an org-level distinction, NOT an individual band.)
 */

export type BandSlug = 'aware' | 'enabled' | 'builder' | 'architect' | 'organization';
export type BandAccess = 'free' | 'paid';

export interface BandDef {
  slug: BandSlug;
  displayName: string;
  index: number;        // ordinal along the ladder (0-based)
  isBuildBand: boolean; // builder/architect are evidence-gated build bands
  access: BandAccess;   // free = points-reachable; paid = requires build evidence
  individual: boolean;  // false only for 'organization' (org-level, not a person)
}

// The ordered 5-band definition. aware/enabled are FREE (points-reachable);
// builder/architect are PAID build bands (require a competency promotion, which
// requires paid build evidence); organization is org-level and excluded from an
// individual's band computation.
export const BANDS: BandDef[] = [
  { slug: 'aware',        displayName: 'AI Aware',        index: 0, isBuildBand: false, access: 'free', individual: true },
  { slug: 'enabled',      displayName: 'AI Enabled',      index: 1, isBuildBand: false, access: 'free', individual: true },
  { slug: 'builder',      displayName: 'AI Builder',      index: 2, isBuildBand: true,  access: 'paid', individual: true },
  { slug: 'architect',    displayName: 'AI Architect',    index: 3, isBuildBand: true,  access: 'paid', individual: true },
  { slug: 'organization', displayName: 'AI Organization', index: 4, isBuildBand: false, access: 'paid', individual: false },
];

const BAND_BY_SLUG: Record<BandSlug, BandDef> =
  BANDS.reduce((m, b) => { m[b.slug] = b; return m; }, {} as Record<BandSlug, BandDef>);

// The individual identity ladder (excludes org-level 'organization'), ordered.
const INDIVIDUAL_BANDS = BANDS.filter((b) => b.individual);

/**
 * Free-band point thresholds — REUSED verbatim from pointsService.LEVELS
 * (0/150/400/900); no new numbers invented here. Points span only AI Aware
 * (I/II) and AI Enabled (I/II) and can NEVER reach a build band. Ordered
 * ascending; the last threshold whose `min <= pointsTotal` wins.
 */
export const POINTS_SUBLEVELS: Array<{ min: number; bandSlug: BandSlug; rungName: string }> = [
  { min: 0,   bandSlug: 'aware',   rungName: 'AI Aware I' },
  { min: 150, bandSlug: 'aware',   rungName: 'AI Aware II' },
  { min: 400, bandSlug: 'enabled', rungName: 'AI Enabled I' },
  { min: 900, bandSlug: 'enabled', rungName: 'AI Enabled II' },
];

/**
 * Competency-rank → build-band mapping. Keys are the `level_slug` values from
 * progression seeders.BUILDER_LEVELS (ranks 0-8). The split was decided by
 * reading the rank NAMES:
 *
 *   rank 0  builder              → (entry default; NOT a promotion — omitted here.
 *                                   An un-promoted learner derives from points.)
 *   rank 1  junior_builder       → AI Builder I
 *   rank 2  practitioner         → AI Builder II
 *   rank 3  developer            → AI Builder III
 *   rank 4  senior_developer     → AI Builder IV
 *   rank 5  engineer             → AI Builder V
 *   rank 6  senior_engineer      → AI Builder VI
 *   rank 7  architect_candidate  → AI Architect
 *   rank 8  architect            → Senior AI Architect
 *
 * WHY this split: the public vocabulary has exactly two build bands (Builder,
 * Architect). Only the two ranks whose NAMES are in the architecture track
 * (architect_candidate, architect) map to AI Architect; every builder / developer
 * / engineer rank is an AI Builder rung. This keeps the public "Architect" claim
 * honest — a learner is only publicly an AI Architect once their competency rank
 * is literally in the architecture track (gated on architecture confidence
 * 0.7-0.75 + leadership + communication + security + documentation). "Principal
 * AI Architect" and "Distinguished AI Architect" are RESERVED seniority rungs for
 * any future ladder extension above rank 8 — no current rank maps to them.
 */
export const RANK_TO_BAND: Record<string, { bandSlug: BandSlug; rungName: string; rank: number }> = {
  junior_builder:      { bandSlug: 'builder',   rungName: 'AI Builder I',        rank: 1 },
  practitioner:        { bandSlug: 'builder',   rungName: 'AI Builder II',       rank: 2 },
  developer:           { bandSlug: 'builder',   rungName: 'AI Builder III',      rank: 3 },
  senior_developer:    { bandSlug: 'builder',   rungName: 'AI Builder IV',       rank: 4 },
  engineer:            { bandSlug: 'builder',   rungName: 'AI Builder V',        rank: 5 },
  senior_engineer:     { bandSlug: 'builder',   rungName: 'AI Builder VI',       rank: 6 },
  architect_candidate: { bandSlug: 'architect', rungName: 'AI Architect',        rank: 7 },
  architect:           { bandSlug: 'architect', rungName: 'Senior AI Architect', rank: 8 },
};

// Reserved architect seniority rungs (documented; no current rank maps here).
export const RESERVED_ARCHITECT_RUNGS = ['Principal AI Architect', 'Distinguished AI Architect'] as const;

// Build rungs ordered by rank — used to find the "next rung" deterministically.
const BUILD_RUNGS = Object.values(RANK_TO_BAND).sort((a, b) => a.rank - b.rank);

// rank 0 default from StudentLevel (`level_slug: 'builder', rank: 0`) — the
// entry state every learner starts in; being here is NOT a promotion.
const ENTRY_BUILD_SLUG = 'builder';

export interface ComputeBandInput {
  pointsTotal: number;
  builderLevelSlug?: string | null;
  builderRank?: number | null;
}

export interface BandResult {
  bandSlug: BandSlug;
  bandName: string;            // display name of the band (e.g. "AI Enabled")
  rungName: string;            // the specific rung within the band (e.g. "AI Enabled II")
  bandIndex: number;           // 0..3 for individual bands
  isBuildBand: boolean;        // true only for builder/architect
  // True when the band was determined by points alone (no build promotion), i.e.
  // the learner is subject to the AI Enabled ceiling. False once a build
  // promotion sets the band.
  cappedByPointsOnly: boolean;
  nextBand: string | null;     // display name of the next individual band, or null at AI Architect
  nextRequirement: string;     // human-readable "what advances you next"
}

/**
 * A learner "has a build promotion" iff their StudentLevel rank is past the
 * entry rank (>= 1) OR their slug is a mapped build rung other than the entry
 * 'builder'. `rank` is the authoritative signal (promotionService writes rank +
 * slug together on every promotion); `slug` is a fallback when only the slug is
 * known. rank 0 / slug 'builder' — the default StudentLevel row — is NOT a
 * promotion.
 */
export function hasBuildPromotion(builderRank?: number | null, builderLevelSlug?: string | null): boolean {
  if (typeof builderRank === 'number' && builderRank >= 1) return true;
  if (builderLevelSlug && builderLevelSlug !== ENTRY_BUILD_SLUG && builderLevelSlug in RANK_TO_BAND) return true;
  return false;
}

/** Resolve the free (points-derived) sublevel — the last threshold reached. */
function pointsSublevelFor(pointsTotal: number): { min: number; bandSlug: BandSlug; rungName: string } {
  const pts = Number.isFinite(pointsTotal) ? pointsTotal : 0;
  let cur = POINTS_SUBLEVELS[0];
  for (const s of POINTS_SUBLEVELS) if (pts >= s.min) cur = s;
  return cur;
}

/** Resolve the build rung for a promoted learner (slug first, rank fallback). */
function buildRungFor(
  builderLevelSlug?: string | null,
  builderRank?: number | null,
): { bandSlug: BandSlug; rungName: string; rank: number } {
  if (builderLevelSlug && RANK_TO_BAND[builderLevelSlug]) return RANK_TO_BAND[builderLevelSlug];
  // Slug unknown but rank says promoted: highest mapped rung with rank <= builderRank.
  const r = typeof builderRank === 'number' ? builderRank : 1;
  let cur = BUILD_RUNGS[0]; // AI Builder I — never resolve below the entry build rung
  for (const rung of BUILD_RUNGS) if (r >= rung.rank) cur = rung;
  return cur;
}

/** Next individual band up the ladder, or null at AI Architect (top individual band). */
function nextBandName(bandIndex: number): string | null {
  const next = INDIVIDUAL_BANDS.find((b) => b.index === bandIndex + 1);
  return next ? next.displayName : null;
}

/**
 * Combine points (free bands) and the competency promotion (build bands) into a
 * single canonical band. Pure + deterministic.
 *
 * Rule:
 *   if the learner has a build promotion → use RANK_TO_BAND (AI Builder / AI
 *     Architect); points are IGNORED (the promotion is the identity).
 *   else → derive from pointsTotal via POINTS_SUBLEVELS and NEVER return a build
 *     band (the invariant: points alone cannot exceed AI Enabled).
 */
export function computeBand(input: ComputeBandInput): BandResult {
  const promoted = hasBuildPromotion(input.builderRank, input.builderLevelSlug);

  if (promoted) {
    const rung = buildRungFor(input.builderLevelSlug, input.builderRank);
    const band = BAND_BY_SLUG[rung.bandSlug];
    const nextRung = BUILD_RUNGS.find((r) => r.rank === rung.rank + 1) ?? null;
    const nextRequirement = nextRung
      ? `Clear the next build-competency gate to reach ${nextRung.rungName}.`
      : 'Top of the individual ladder — AI Organization is an org-level distinction, not an individual band.';
    return {
      bandSlug: band.slug,
      bandName: band.displayName,
      rungName: rung.rungName,
      bandIndex: band.index,
      isBuildBand: true,
      cappedByPointsOnly: false,
      nextBand: nextBandName(band.index),
      nextRequirement,
    };
  }

  // No build promotion → derive from points. This branch can only ever return
  // aware/enabled (POINTS_SUBLEVELS holds no build band) — the anti-cheat invariant.
  const sub = pointsSublevelFor(input.pointsTotal);
  const band = BAND_BY_SLUG[sub.bandSlug];
  const pts = Number.isFinite(input.pointsTotal) ? input.pointsTotal : 0;
  const nextThreshold = POINTS_SUBLEVELS.find((s) => s.min > pts) ?? null;
  const nextRequirement = nextThreshold
    ? `Earn ${nextThreshold.min - pts} more points to reach ${nextThreshold.rungName}.`
    // At AI Enabled II — the points ceiling. The only way forward is a build
    // promotion, which requires paid build evidence. This is the anti-cheat line.
    : 'Points alone cannot advance past AI Enabled. AI Builder requires build evidence (a paid entitlement).';

  return {
    bandSlug: band.slug,
    bandName: band.displayName,
    rungName: sub.rungName,
    bandIndex: band.index,
    isBuildBand: false,
    cappedByPointsOnly: true,
    nextBand: nextBandName(band.index),
    nextRequirement,
  };
}
