/**
 * The palette a hosted landing page renders in.
 *
 * WHY A BACKEND COPY AT ALL. The registry this mirrors lives at
 * `frontend/src/theme/deliveryBrandThemes.ts`, and `scripts/validate-app-boundaries.js` forbids
 * the backend importing from `frontend/`. A landing page is server-rendered HTML, so it cannot
 * reach the React tokens. The duplication is therefore deliberate, and - exactly like the
 * frontend file's own copy of the CSS - it is **pinned by test**: the suite reads
 * `deliveryBrandThemes.ts` and fails if a single value here disagrees with it. If that test
 * fails, the frontend file is the source of truth; change this one.
 *
 * WHY MOST BRANDS RENDER NEUTRAL. Only `ai-flotation` has an agreed token set. The frontend
 * registry states the reason and it applies with more force here, on a public page a stranger
 * will judge the brand by: "inventing one would put a colour in front of a real client that
 * nobody chose." Four of the five seeded theme keys - `enterprise`, `training`, `cpn`,
 * `refactored` - have no palette, so a page for those brands renders in the neutral set below
 * and waits for a real design decision rather than a guessed one.
 *
 * This is a known gap, not an oversight: Ali asked for "brand colors, logo, etc... all picked up
 * by the landing page creation". The colours can be picked up for exactly one brand today, and
 * there is **no logo column on `brands` at all** (`id`, `tenant_id`, `slug`, `name`, `status`,
 * `default_public_url`, `default_theme_key`, `support_email`, `timezone`,
 * `default_journey_program_id`, `metadata`) - so the page shows the brand's NAME as its wordmark
 * until a logo has somewhere to live.
 */

/**
 * The eight tokens a shared design system defines. Names mirror the design system's own, and
 * this is the set the frontend registry copies - so it is the set the parity test compares.
 */
export interface BrandBaseTheme {
  '--bg': string;
  '--bg-elevated': string;
  '--fg': string;
  '--fg-muted': string;
  '--accent': string;
  '--accent-contrast': string;
  '--accent-soft': string;
  '--line': string;
}

/**
 * The five a LANDING PAGE adds on top, and the reason they are declared here rather than in the
 * registry.
 *
 * These were briefly added to `frontend/src/theme/deliveryBrandThemes.ts` and that was wrong.
 * That file's entire job is to be a faithful copy of a vendored design system, and its test says
 * so in as many words: "the CSS file is the source of truth and the TypeScript is the copy." The
 * AI Flotation system defines eight tokens and no second brand colour, so satisfying a
 * thirteen-token shape there meant inventing two hexes and putting them in a file that claims to
 * contain nobody's inventions. The contract test caught it.
 *
 * A second accent is a LANDING PAGE need - the renderer wants a band ground, a quieter heading
 * colour and a deeper accent for the closing band. So it lives in the landing page layer, where
 * each brand's set is either sourced from that brand's own documented ramp or DERIVED from its
 * eight. Nothing here is guessed.
 */
export interface ExtendedPalette {
  '--accent-2': string;
  '--accent-3': string;
  '--accent-deep': string;
  '--bg-cool': string;
  '--bg-warm': string;
}

/** What the renderer actually paints with: the eight, plus the five. */
export type LandingPageTheme = BrandBaseTheme & ExtendedPalette;

/**
 * Keyed by `brands.default_theme_key`. Must stay byte-identical to the frontend registry's
 * `THEMES`; the parity test enforces that.
 */
export const LANDING_PAGE_THEMES: Readonly<Record<string, BrandBaseTheme>> = {
  'ai-flotation': {
    '--bg': '#F7F6F4',
    '--bg-elevated': '#FFFFFF',
    '--fg': '#1A1917',
    '--fg-muted': '#56524B',
    '--accent': '#BA430E',
    '--accent-contrast': '#FFFFFF',
    '--accent-soft': '#FBE4D5',
    '--line': '#DEDAD3',
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
  },
};

/**
 * The extended palette for brands whose own style guide names one.
 *
 * Colaberry's does. Every value below is a named token in `frontend/src/colaberry/tokens/colors.css`,
 * which is headed "Built from the Colaberry School Style Guide", and each is pinned to the ramp
 * token it came from by test rather than to a bare hex - so a change to the style guide fails
 * loudly instead of leaving landing pages on a stale green.
 *
 * A design brief on 2026-10-09 proposed #2B6A94, #C8102E and #EEF2F5 for three of these. They are
 * near-misses of documented brand values, so the documented ones are used: the point of a style
 * guide is that it decides, and three almost-right reds and blues across a site is how a brand
 * stops looking like one.
 */
export const EXTENDED_PALETTES: Readonly<Record<string, ExtendedPalette>> = {
  training: {
    '--accent-2': '#5BA63C', // --green-600, the logo leaf mid
    '--accent-3': '#367895', // --blue-500, brand berry
    '--accent-deep': '#C20E1E', // --red-700, the logo core shadow
    '--bg-cool': '#EAF2F6', // --blue-50
    '--bg-warm': '#F8F8F7', // --neutral-50
  },
};

/**
 * The extended palette for a brand that has not agreed one, derived from the eight it has.
 *
 * AI Flotation is the case this exists for: its vendored system defines one accent and no second
 * or third brand colour. Deriving means such a page renders SINGLE-ACCENT in the brand's own
 * colours - quieter than the Colaberry pages, and honest - instead of wearing a green and a blue
 * that nobody at that company chose. It is the same refusal-to-guess rule the neutral theme and
 * the logo table already follow, applied one level down.
 */
export function deriveExtendedPalette(base: BrandBaseTheme): ExtendedPalette {
  return {
    '--accent-2': base['--accent'],
    '--accent-3': base['--fg-muted'],
    '--accent-deep': base['--accent'],
    '--bg-cool': base['--bg-elevated'],
    '--bg-warm': base['--bg'],
  };
}

/**
 * What a brand with no agreed palette renders in. Not a guess at anyone's brand - a deliberately
 * plain, high-contrast set that reads as unbranded rather than as the wrong brand.
 */
export const NEUTRAL_THEME: LandingPageTheme = {
  '--bg': '#FFFFFF',
  '--bg-elevated': '#F7F7F8',
  '--fg': '#17181A',
  '--fg-muted': '#5A5E66',
  '--accent': '#1A365D',
  '--accent-contrast': '#FFFFFF',
  '--accent-soft': '#E8EDF4',
  '--line': '#DFE1E5',
  // Navy-and-grey equivalents rather than Colaberry's green and blue: an unbranded page must
  // read as unbranded, not as some other company's palette.
  '--accent-2': '#3E6B4F',
  '--accent-3': '#2F5272',
  '--accent-deep': '#122844',
  '--bg-cool': '#EEF1F5',
  '--bg-warm': '#F7F7F8',
};

export interface ResolvedTheme {
  theme: LandingPageTheme;
  /** False when the brand has no agreed palette and is rendering neutral. */
  branded: boolean;
}

/**
 * The theme for a brand's key. Always returns something renderable - a public page must never
 * fail to paint because a palette has not been agreed yet.
 */
export function themeForLandingPage(themeKey: string | null | undefined): ResolvedTheme {
  const base = themeKey ? LANDING_PAGE_THEMES[themeKey] : undefined;
  if (!base) return { theme: NEUTRAL_THEME, branded: false };
  // Sourced where the brand's style guide names one, derived from its own eight where it does
  // not. Either way the renderer always receives all thirteen, so no stylesheet rule can fall
  // back to an undefined custom property.
  const extended = (themeKey && EXTENDED_PALETTES[themeKey]) || deriveExtendedPalette(base);
  return { theme: { ...base, ...extended }, branded: true };
}

/**
 * The theme as a CSS custom-property block for a `:root` rule.
 *
 * The values are our own hex literals from the table above, never anything an operator typed, so
 * there is nothing here to escape - but they are still filtered to a strict hex pattern, because
 * a token that is not a colour has no business reaching a stylesheet and a future edit to this
 * file should not be the thing that discovers that.
 */
export function themeCssVars(theme: LandingPageTheme): string {
  return Object.entries(theme)
    .filter(([, value]) => /^#[0-9A-Fa-f]{3,8}$/.test(value))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
}
