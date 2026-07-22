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
 * The short HUD "next" line for a band. A free / points-capped learner still
 * climbing points gets a pts-to-next-rung nudge; at the AI Enabled ceiling they
 * get the build gate. A promoted (build-band) learner gets their next band, or a
 * top-of-ladder note. `total` shares thresholds with BAND_RUNGS.
 */
export function bandHudNext(band: Band, total: number): string {
  const pts = Number.isFinite(total) ? total : 0;
  if (band.cappedByPointsOnly) {
    const next = BAND_RUNGS.find((r) => r.min > pts) || null;
    if (next) return `${(next.min - pts).toLocaleString()} pts to ${next.name}`;
    return 'Build to unlock AI Builder';
  }
  return band.nextBand ? `Next: ${band.nextBand}` : 'Top of the ladder';
}
