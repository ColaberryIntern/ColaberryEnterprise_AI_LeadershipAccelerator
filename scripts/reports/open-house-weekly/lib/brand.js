/**
 * C125: the Colaberry Training brand, as the report and the email both wear it.
 *
 * WHY THIS FILE EXISTS. The report and the email were drawn in navy #1a365d and blue #2b6cb0,
 * described in `styles.js` as "baseline-ui palette". That palette is not Colaberry's: the
 * `baseline-ui` skill's own summary table carried those two hexes and was corrected on
 * 2026-08-25 because neither value appears anywhere in `frontend/src/styles/tokens.css`. So the
 * weekly report about a Colaberry Training landing page was rendered in a color scheme the
 * product does not use, which is fine for an internal read and wrong for anything shown outside.
 *
 * WHERE THESE VALUES COME FROM, and why they are not retyped from a skill summary: they are the
 * `training` entries of `backend/src/services/marketing/landingPageTheme.ts`, which is the same
 * theme the landing page itself renders with, plus that file's `EXTENDED_PALETTES.training`.
 * A reader comparing this email with the page it measures sees one brand, because it IS one
 * brand record. `__tests__/brand.test.js` pins every value back to that file, so a theme edit
 * that is not mirrored here fails the build rather than quietly splitting the two.
 *
 * ON THE TWO REDS. `cherry` (#FB2832) is the brand accent and scores 3.85:1 on white, which is
 * below the 4.5:1 needed for body text. `cherryDeep` (#C20E1E) scores 6.22:1. So cherry is for
 * FILLS and large display type only, and every piece of colored running text uses cherryDeep.
 * Getting this backwards is the single most likely way to make an inaccessible page that still
 * looks right to someone with full color vision.
 *
 * ON THE STATUS COLORS. Green / amber / red are NOT rebranded. They are a traffic light, the
 * report's whole conditional-formatting vocabulary rests on them, and cherry is already a red:
 * painting "on target" in a brand color that also means "below target" would make the report
 * unreadable. They stay semantic and separate, which is why they live in their own block below.
 */
'use strict';

/** The eight base tokens, byte-identical to LANDING_PAGE_THEMES.training. */
const BASE = {
  bg: '#FFFFFF',
  bgElevated: '#F8F8F7',
  fg: '#1A1A1A',
  fgMuted: '#4A4A4A',
  accent: '#FB2832',
  accentContrast: '#FFFFFF',
  accentSoft: '#FFF0F1',
  line: '#E4E4E3',
};

/** The five extended tokens, byte-identical to EXTENDED_PALETTES.training. */
const EXTENDED = {
  accent2: '#5BA63C',   // --green-600, the logo leaf mid
  accent3: '#367895',   // --blue-500, brand berry
  accentDeep: '#C20E1E', // --red-700, the logo core shadow
  bgCool: '#EAF2F6',    // --blue-50
  bgWarm: '#F8F8F7',    // --neutral-50
};

/**
 * The lockups, as served from this host. Both verified 200 on 18 Nov 2026.
 * An email cannot carry a relative path, so these are absolute and must stay absolute.
 */
const LOGO = {
  light: 'https://enterprise.colaberry.ai/colaberry-horizontal.png',
  onDark: 'https://enterprise.colaberry.ai/knowledge/assets/logo/colaberry-horizontal-white.png',
  alt: 'Colaberry',
};

/**
 * The sequential ramp for the scroll heat map: ONE hue, light to dark, five steps.
 *
 * Checked with the dataviz validator's `validateOrdinal` on 18 Nov 2026 and it passes all four:
 * lightness monotone, every adjacent gap >= 0.06 L, light end 2.80:1 against white (the 2:1
 * floor, so the palest band is still visibly a band and not the page), hue spread 8 degrees.
 * The two middle steps are the brand's own `--accent` and `--accent-deep`.
 *
 * DARK MEANS MORE PEOPLE. The palest step is the fewest. A ramp read the other way would say the
 * opposite of what it shows.
 */
const REACH_RAMP = ['#F76B75', '#FB2832', '#C20E1E', '#940B16', '#6B0810'];

/**
 * The click marker. One hue, so there is no adjacent pair to separate; it is the brand berry.
 *
 * The validator marks this hue below its chroma floor ("reads gray") and that is accepted here
 * for two reasons, both of which the dataviz method names as the relief: every marker is
 * DIRECTLY LABELED with its own count, and each one is drawn with a 2px white ring because it
 * overlaps the ramp. The ring is load-bearing, not decoration - against `#C20E1E` this hue has
 * 1.1:1 contrast and would otherwise disappear exactly where the page is busiest.
 */
const MARK = { fill: '#367895', ring: '#FFFFFF', deep: '#2A5F77' };

/** Traffic light. Deliberately not brand colors; see the header. */
const STATUS = {
  good: '#2f855a', goodSoft: '#c6f6d5',
  ok: '#b7791f', okSoft: '#fefcbf',
  bad: '#c53030', badSoft: '#fed7d7',
  low: '#8a8a88', lowSoft: '#EFEFEE',
};

module.exports = {
  ...BASE,
  ...EXTENDED,
  cherry: BASE.accent,
  cherryDeep: EXTENDED.accentDeep,
  leaf: EXTENDED.accent2,
  berry: EXTENDED.accent3,
  ink: BASE.fg,
  inkMuted: BASE.fgMuted,
  /** A quieter ink for small print: 5.33:1 on white, still AA for normal text. */
  inkSoft: '#6B6B6B',
  LOGO,
  REACH_RAMP,
  MARK,
  STATUS,
  BASE,
  EXTENDED,
  WORDMARK: 'Colaberry Training',
};
