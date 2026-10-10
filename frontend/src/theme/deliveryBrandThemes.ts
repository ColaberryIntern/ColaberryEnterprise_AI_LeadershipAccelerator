/**
 * Per-brand theming for the delivery client surface.
 *
 * WHY THIS EXISTS
 *
 * A client room is not Colaberry's room. It is the room of whichever brand owns the
 * engagement - AI Flotation, Refactored.ai, CPN. `brands.default_theme_key` has been
 * seeded for all five brands since the ecosystem seed was written, and until now nothing
 * consumed it: there was no theme registry, no per-theme values and no consumer, so the
 * field was deliberately withheld from the client payload rather than projecting a
 * promise the surface could not honour.
 *
 * This is that registry. It is the consumer that makes projecting the key honest.
 *
 * THE SAFETY PROPERTY THAT MATTERS
 *
 * A brand with no theme key, or a key with no entry here, gets `null` - and a null theme
 * renders exactly what the surface rendered before this file existed. Adding AI Flotation
 * must not change what a Colaberry or Refactored.ai client sees. That is asserted in
 * deliveryBrandThemes.test.ts rather than left as an intention.
 *
 * SOURCE OF TRUTH
 *
 * The AI Flotation values are NOT authored here. They are the Forge (variant A) light
 * tokens from the vendored design system at
 * `apps/ai-flotation-public/src/assets/design/colors.css`, which is itself verbatim from
 * the Multi-Brand Tokens source. They are duplicated because `frontend/` cannot import
 * from `apps/` - that edge is exactly what scripts/validate-app-boundaries.js forbids, so
 * an import would trade a drift risk for a boundary violation.
 *
 * The duplication is therefore pinned by test: deliveryBrandThemes.test.ts parses that
 * CSS file and fails if a single value here disagrees with it. Change the design system,
 * and the test tells you to change this. Do not "fix" a failure by editing the expected
 * value - the CSS file is the source of truth, this is the copy.
 */

/** The token set a themed surface can rely on. Names mirror the design system's own. */
export interface BrandTheme {
  '--bg': string;
  '--bg-elevated': string;
  '--fg': string;
  '--fg-muted': string;
  '--accent': string;
  '--accent-contrast': string;
  '--accent-soft': string;
  '--line': string;
  '--accent-2': string;
  '--accent-3': string;
  '--accent-deep': string;
  '--bg-cool': string;
  '--bg-warm': string;
}

/**
 * Keyed by `brands.default_theme_key`. Seeded keys today: `enterprise`, `training`,
 * `cpn`, `ai-flotation`, `refactored`.
 *
 * `enterprise`, `cpn` and `refactored` are absent on purpose rather than filled with
 * guesses: no token set has been agreed for them, and inventing one would put a colour in
 * front of a real client that nobody chose. They render neutral until their own design
 * systems land here the way these two did.
 *
 * `training` is NOT a guess. Every value below is lifted from this repo's own
 * `frontend/src/colaberry/tokens/colors.css`, whose header reads "Built from the Colaberry
 * School Style Guide": Cherry Red #FB2832, brand black #1A1A1A, brand gray #4A4A4A, light
 * gray ramp #E4E4E3. Sourcing an existing, documented palette is the opposite of inventing
 * one - the rule above exists to stop colours nobody chose, not to stop the brand's own.
 */
const THEMES: Readonly<Record<string, BrandTheme>> = {
  'ai-flotation': {
    '--bg': '#F7F6F4',
    '--bg-elevated': '#FFFFFF',
    '--fg': '#1A1917',
    '--fg-muted': '#56524B',
    '--accent': '#BA430E',
    '--accent-contrast': '#FFFFFF',
    '--accent-soft': '#FBE4D5',
    '--line': '#DEDAD3',
    // No second or third brand colour has been agreed for AI Flotation, so these resolve to
    // its own accent and neutrals rather than borrowing Colaberry's green and blue. A page
    // under this brand stays single-accent, which is honest, instead of wearing another
    // brand's palette.
    '--accent-2': '#BA430E',
    '--accent-3': '#56524B',
    '--accent-deep': '#93350B',
    '--bg-cool': '#F1EEE9',
    '--bg-warm': '#F7F6F4',
  },
  'training': {
    '--bg': '#FFFFFF',
    '--bg-elevated': '#F8F8F7',
    '--fg': '#1A1A1A',
    '--fg-muted': '#4A4A4A',
    '--accent': '#FB2832',
    '--accent-contrast': '#FFFFFF',
    '--accent-soft': '#FFF0F1',
    '--line': '#E4E4E3',
    // The other two logo colours, and two band grounds. Every value is lifted from
    // `src/colaberry/tokens/colors.css`, which is built from the Colaberry School Style Guide -
    // the same sourcing rule as the eight above. Named there as: Leaf Green #77BB4A with
    // #5BA63C the logo leaf mid, Berry Blue #367895, #C20E1E the logo core shadow.
    //
    // A design brief on 2026-10-09 proposed #2B6A94, #C8102E and #EEF2F5 for three of these.
    // They are near-misses of documented brand values, so the documented ones are used: the
    // point of a style guide is that it decides, and three almost-right reds and blues across
    // a site is how a brand stops looking like one.
    '--accent-2': '#5BA63C',
    '--accent-3': '#367895',
    '--accent-deep': '#C20E1E',
    '--bg-cool': '#EAF2F6',
    '--bg-warm': '#F8F8F7',
  },
};

/** The theme for a brand's key, or null when the surface should stay neutral. */
export function themeForBrand(themeKey: string | null | undefined): BrandTheme | null {
  if (!themeKey) return null;
  return THEMES[themeKey] ?? null;
}

/**
 * A theme as inline custom properties, ready for a `style` prop.
 *
 * Returns an empty object for a null theme so a caller can always spread the result -
 * `style={{ ...themeStyle(theme) }}` - without branching, and without emitting empty
 * custom properties that would override an inherited value with nothing.
 */
export function themeStyle(theme: BrandTheme | null): React.CSSProperties {
  if (!theme) return {};
  return Object.fromEntries(Object.entries(theme)) as React.CSSProperties;
}
