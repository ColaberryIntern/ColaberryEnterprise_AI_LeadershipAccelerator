/**
 * pointsHud — the PURE decision behind what the topbar points widget displays.
 *
 * Extracted from PortalShell so it can be tested directly. PortalShell cannot be
 * mounted in this repo's CRA+jest environment (it pulls ~15 modules with their
 * own network and hook dependencies; see the engineering note at the top of
 * __tests__/TodayShell.planGate.test.tsx), and this rule is far too easy to
 * regress to leave unproven. PortalShell imports this function rather than
 * duplicating it, so the two cannot drift.
 *
 * THE RULE: THE HEADER NEVER STATES A VALUE IT HAS NOT BEEN TOLD.
 *
 * MEASURED 2026-08-15, ali@colaberry.com. The widget read
 * `const total = points?.total ?? 0` and fed that to `levelFor(total)`, which
 * returns the FIRST level for 0. So during the ~2s the fetch was outstanding —
 * and permanently if the fetch failed — the header announced "Apprentice · 0
 * pts". That is not a loading state. It is a specific, confident claim, and for
 * a student holding 463 points it read as a demotion on every single page load.
 *
 * A zero default is the wrong shape for an unknown value. This is the same line
 * the rest of the program already holds: the Command Center reports "not
 * measured yet" rather than 0, and status indicators start grey rather than
 * green, precisely so the UI never asserts something untrue. `null` here means
 * "we do not know", and every caller must render an absence for it.
 */
import { levelFor, bandHudNext, type PointsSummary } from '../../../services/onboardingApi';

export interface HudView {
  /** False until the server has actually answered. Drives the placeholder. */
  known: boolean;
  /** The level/band identity, or null while unknown. NEVER a default level. */
  levelName: string | null;
  /** e.g. "463 pts", or null while unknown. NEVER "0 pts" as a stand-in. */
  totalText: string | null;
  /** The "N pts to X" line, or null while unknown. */
  nextLine: string | null;
  /** Progress-bar fill. 0 while unknown, so the bar reads empty, not "just started". */
  pct: number;
  /** Announced to screen readers. Must not claim a level or a total when unknown. */
  ariaLabel: string;
}

const SUFFIX = 'view your points breakdown';

/**
 * @param points       the fetched summary, or null for "not loaded / failed".
 * @param displayTotal the animated count-up value; only read once `points` is
 *                     known, so the animation can never author the number the
 *                     student sees before the server has supplied one.
 */
export function hudView(points: PointsSummary | null, displayTotal: number): HudView {
  // Both "not fetched yet" and "fetch failed" arrive here as null, and they mean
  // the same thing to a reader. Neither may fall back to zero.
  if (points === null) {
    return {
      known: false,
      levelName: null,
      totalText: null,
      nextLine: null,
      pct: 0,
      ariaLabel: `Loading your points — ${SUFFIX}`,
    };
  }

  const total = points.total;
  const lvl = levelFor(total);
  // 5-band re-skin (runtime flag on the points payload). When ON the HUD shows
  // the canonical band rung (e.g. "AI Enabled II") as the level identity; when
  // OFF band is null and the legacy identity is byte-identical.
  const band = points.fiveBandUiEnabled ? points.band ?? null : null;
  const levelName = band ? band.rungName : lvl.name;

  return {
    known: true,
    levelName,
    totalText: `${displayTotal.toLocaleString()} pts`,
    nextLine: band
      ? bandHudNext(band, total)
      : (lvl.next ? `${lvl.next.min - total} pts to ${lvl.next.name}` : 'Max level'),
    pct: lvl.pct,
    ariaLabel: `${total} points, level ${levelName} — ${SUFFIX}`,
  };
}
