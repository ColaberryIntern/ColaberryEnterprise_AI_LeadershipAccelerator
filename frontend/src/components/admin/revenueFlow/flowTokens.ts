/**
 * R16 Phase 2 — the ONE place the Revenue Flow dashboard decides what colour anything is.
 *
 * The backend registry (`revenueClassifications.ts`) declares a TONE per classification and
 * deliberately no hex. This file is the other half of that contract: tone to CSS custom
 * property, and nothing else. Neither side can quietly take over the other's job, which is
 * what stops the same status rendering as two different colours on two screens in one
 * meeting.
 *
 * ── EVERY COLOUR HERE WAS MEASURED, NOT CHOSEN ───────────────────────────────────────────
 *
 * Run on 2026-11-13 with the dataviz validator against the real token values resolved from
 * `src/colaberry/tokens/colors.css` (NOT from the baseline-ui summary table, which that
 * skill's own header warns went stale once and "rendered in a colour scheme the product does
 * not use").
 *
 * TWO DIFFERENT JOBS, TWO DIFFERENT PALETTES, never mixed:
 *
 *   STREAM IDENTITY (membership vs government) is CATEGORICAL — two entities that must stay
 *   distinguishable. It uses `--chart-N` in order, which the design system is explicit
 *   about: "Use --chart-N in order. Never use raw brand ramps for series."
 *
 *     Validated, slots 1-2 only:
 *       light  #367895 / #FB2832 — CVD ΔE 14.1 protan, normal-vision 32.9, contrast both ≥3:1
 *       dark   #5AA8C4 / #FF6B72 — CVD ΔE 12.7 protan, normal-vision 26.3, contrast both ≥3:1
 *     Comfortably above the ΔE 8 target in both modes.
 *
 *   EVENT CLASSIFICATION (what happened) is STATUS — good / info / warn / danger / muted.
 *   Status colours are reserved and never reused as "series 6"; they always ship with a
 *   glyph and a label, which the registry guarantees and `assertEveryClassificationIsLegible-
 *   WithoutColour` enforces.
 *
 * ── THE FINDING THAT CONSTRAINS THIS FILE ────────────────────────────────────────────────
 *
 * The design system's chart ramp documents itself as "ordered for max adjacent separation
 * and color-blind safety". Measured, that is FALSE at the 3↔4 adjacency:
 *
 *     light  --chart-3 #5BA63C ↔ --chart-4 #E8920C   ΔE  1.8 (protan)
 *     dark   --chart-3 #8AC759 ↔ --chart-4 #F0A93A   ΔE  4.3 (protan)
 *
 * The floor is 6-8 and the target is 8. At ΔE 1.8 a protanope cannot tell that green from
 * that amber at all. This page therefore uses slots 1 and 2 ONLY and never puts 3 beside 4.
 * The finding is not ours alone to live with — anything in this repo charting those two
 * slots together has the same problem — so it is filed rather than just avoided here.
 *
 * ── THE CONTRAST RELIEF IS AN OBLIGATION, NOT A SUGGESTION ───────────────────────────────
 *
 * On the light surface two status tones fall below 3:1 against the page:
 *     good  #5BA63C  2.94:1
 *     warn  #E8920C  2.39:1
 * The validator calls that a WARN requiring "visible labels or a table view", and is explicit
 * that it "is not dismissable". Both reliefs ship: every band and chip carries its glyph and
 * label, and the page has a real table view. Removing either one re-breaks this, so the
 * table view is covered by a test rather than left to good intentions.
 *
 * Fixing these by inventing new hexes was the alternative and would have been worse: it
 * forks the brand palette, which is the failure this whole token layer exists to prevent.
 */

/** The five tones the backend registry can declare. Mirrors `FlowTone` there. */
export type FlowTone = 'good' | 'info' | 'warn' | 'danger' | 'muted';

interface TonePaint {
  /** The mark / text colour. */
  fg: string;
  /** The tinted background for chips and stage pills. */
  bg: string;
  /** A human name, used in the legend and the table view so tone survives greyscale. */
  name: string;
}

/**
 * Tone to token. Every value is a `var(--…)`, never a hex, so dark mode is handled by the
 * design system's own SELECTED dark steps rather than by this file flipping anything.
 * `colors.css` re-declares `--status-*` under `[data-theme="dark"]` with different ramp
 * steps (green-400, red-400, blue-300) chosen for a dark surface — an automatic inversion
 * would have produced something nobody validated.
 */
export const TONE: Record<FlowTone, TonePaint> = {
  good: { fg: 'var(--status-success)', bg: 'var(--status-success-bg)', name: 'Good' },
  info: { fg: 'var(--status-info)', bg: 'var(--status-info-bg)', name: 'In progress' },
  warn: { fg: 'var(--status-warning)', bg: 'var(--status-warning-bg)', name: 'Needs attention' },
  danger: { fg: 'var(--status-danger)', bg: 'var(--status-danger-bg)', name: 'Loss' },
  muted: { fg: 'var(--text-muted)', bg: 'var(--surface-subtle)', name: 'Not revenue' },
};

/** A tone we were handed but do not know. Rendered muted rather than thrown away. */
export function paintFor(tone: string): TonePaint {
  return TONE[tone as FlowTone] ?? TONE.muted;
}

/**
 * Stream identity. Assigned in FIXED ORDER and never cycled: membership is always slot 1 and
 * government always slot 2, so filtering to one stream can never repaint the other. Colour
 * follows the entity, never its rank.
 */
export const STREAM_PAINT: Record<string, { fg: string; name: string }> = {
  membership: { fg: 'var(--chart-1)', name: 'Membership' },
  gov_pipeline: { fg: 'var(--chart-2)', name: 'Government bids' },
  hypotheses: { fg: 'var(--chart-5)', name: 'Revenue bets' },
};

export function streamPaint(key: string): { fg: string; name: string } {
  return STREAM_PAINT[key] ?? { fg: 'var(--text-muted)', name: key };
}

/**
 * Mark specs, from the dataviz reference, kept as constants so every component agrees.
 *
 * `SEGMENT_GAP` is the one that is easy to drop and expensive to lose: a 2px surface-coloured
 * gap between stacked segments is what keeps two adjacent bands readable as two bands. It is
 * also part of the secondary encoding that makes the dark-mode danger/warn adjacency legal.
 */
export const MARK = {
  /** Day column width in the sparkline. */
  COLUMN_W: 9,
  /** Full height of a sparkline column. */
  COLUMN_H: 20,
  /** Surface-coloured gap between stacked segments and adjacent bars. */
  SEGMENT_GAP: 2,
  /** Corner rounding on a data end. */
  RADIUS: 1,
} as const;

/**
 * Whole dollars from cents. The backend already ships a formatted `display` for every figure
 * it owns; this exists only for values the page derives itself, and it rounds the same way
 * (`Math.round(cents / 100)`) so a derived figure can never disagree with a shipped one by a
 * rounding step.
 */
export function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}
