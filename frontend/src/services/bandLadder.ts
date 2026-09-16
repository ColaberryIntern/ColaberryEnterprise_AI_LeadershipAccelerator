/**
 * bandLadder.ts (frontend mirror) — the public 5-band identity a learner sees:
 * AI Aware → AI Enabled → AI Builder → AI Architect. Pure + presentational; no
 * network, no side effects (the test imports this file directly).
 *
 * Only the FREE, points-reachable rungs are mirrored here — they key to the SAME
 * point thresholds as onboardingApi.LEVELS / backend pointsService.LEVELS
 * (0/150/400/900). Build bands (AI Builder / AI Architect) are NEVER derived on
 * the client: the server `band` object is the sole source for those, which keeps
 * the backend anti-cheat invariant intact (points alone can never reach a build
 * band). See backend/src/services/progression/bandLadder.ts for the authority.
 */

export type BandSlug = 'aware' | 'enabled' | 'builder' | 'architect' | 'organization';

/**
 * The server-computed canonical band (mirrors backend bandLadder.BandResult).
 * Delivered on the GET /api/portal/points payload (additive).
 */
export interface Band {
  bandSlug: BandSlug;
  bandName: string;            // e.g. "AI Enabled"
  rungName: string;            // e.g. "AI Enabled II"
  bandIndex: number;           // 0..3 for individual bands
  isBuildBand: boolean;        // true only for builder/architect
  cappedByPointsOnly: boolean; // a free account subject to the AI Enabled ceiling
  nextBand: string | null;     // display name of the next band, or null at the top
  nextRequirement: string;     // human-readable "what advances you next"
}

// Free rungs, ascending, keyed to the LEVELS thresholds (0/150/400/900). The last
// rung whose `min` <= points wins. Build rungs are intentionally absent.
export const BAND_RUNGS: Array<{ name: string; min: number }> = [
  { name: 'AI Aware I', min: 0 },
  { name: 'AI Aware II', min: 150 },
  { name: 'AI Enabled I', min: 400 },
  { name: 'AI Enabled II', min: 900 },
];

/** Free points-band rung for a points total (deterministic, pure). */
export function bandRungForPoints(points: number): string {
  const pts = Number.isFinite(points) ? points : 0;
  let rung = BAND_RUNGS[0];
  for (const r of BAND_RUNGS) if (pts >= r.min) rung = r;
  return rung.name;
}

/** Free points-band rung for a numeric level (1..4 → rung); clamps out of range. */
export function bandRungForLevel(level: number): string {
  const n = Number.isFinite(level) ? Math.round(level) : 1;
  const idx = Math.min(BAND_RUNGS.length, Math.max(1, n)) - 1;
  return BAND_RUNGS[idx].name;
}

/**
 * Build rungs by competency slug — the ONE frontend copy of the backend's
 * RANK_TO_BAND (bandLadder.ts). Rank-0 "builder" is the entry default, not a
 * promotion, so it has no rung name and resolves to ''. Used wherever a server
 * payload still carries a raw slug (the readiness lens, the company drill-down).
 */
export const BUILD_RUNG_BY_SLUG: Record<string, string> = {
  junior_builder: 'AI Builder I',
  practitioner: 'AI Builder II',
  developer: 'AI Builder III',
  senior_developer: 'AI Builder IV',
  engineer: 'AI Builder V',
  senior_engineer: 'AI Builder VI',
  architect_candidate: 'AI Architect',
  architect: 'Senior AI Architect',
  // The milestone ladder (docs/POINTS_LADDER_DECISIONS.md): same public names,
  // earned by milestones. `builder_iv` carries the "Program Graduate" label.
  builder_i: 'AI Builder I',
  builder_ii: 'AI Builder II',
  builder_iii: 'AI Builder III',
  builder_iv: 'AI Builder IV · Program Graduate',
  ai_architect: 'AI Architect',
  senior_ai_architect: 'Senior AI Architect',
};

/** "junior_builder" → "AI Builder I"; an unknown slug is humanised, never shown raw. */
export function buildRungForSlug(slug: string | null | undefined): string {
  if (!slug) return '';
  return BUILD_RUNG_BY_SLUG[slug] || slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Copy for a points-capped learner at the AI Enabled ceiling, by entitlement. */
export const CEILING_NEXT_ENTITLED = 'Ship your first build to reach AI Builder I';
export const CEILING_NEXT_FREE = 'Join the program to unlock AI Builder';

/**
 * The short HUD "next" line for a band. A free / points-capped learner still
 * climbing points gets a pts-to-next-rung nudge. At the AI Enabled ceiling the
 * line depends on whether they are already in the program: someone entitled to
 * build is told to ship; only a confirmed free Explorer is told to join. A
 * promoted (build-band) learner gets their next band, or a top-of-ladder note.
 * `total` shares thresholds with BAND_RUNGS. `buildEntitled` defaults to true
 * (fail open) so an older backend that omits it never shows a paying student
 * the join prompt.
 */
export function bandHudNext(band: Band, total: number, buildEntitled: boolean = true): string {
  const pts = Number.isFinite(total) ? total : 0;
  if (band.cappedByPointsOnly) {
    const next = BAND_RUNGS.find((r) => r.min > pts) || null;
    if (next) return `${(next.min - pts).toLocaleString()} pts to ${next.name}`;
    return buildEntitled ? CEILING_NEXT_ENTITLED : CEILING_NEXT_FREE;
  }
  return band.nextBand ? `Next: ${band.nextBand}` : 'Top of the ladder';
}

/**
 * Should the "Become an AI Builder — join the program" card show? Only for a
 * confirmed free account sitting at the points ceiling (AI Enabled II) with no
 * build promotion. Never for anyone entitled to build: they are already in.
 */
export function showJoinToBuildCard(band: Band | null | undefined, total: number, buildEntitled: boolean | undefined): boolean {
  if (!band || buildEntitled !== false) return false;
  const pts = Number.isFinite(total) ? total : 0;
  const ceiling = BAND_RUNGS[BAND_RUNGS.length - 1].min;
  return band.cappedByPointsOnly && band.bandSlug === 'enabled' && pts >= ceiling;
}
