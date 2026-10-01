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

/** The token set a themed surface can rely on. Names mirror the design system's own. */
export interface LandingPageTheme {
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
 * Keyed by `brands.default_theme_key`. Must stay byte-identical to the frontend registry's
 * `THEMES`; the parity test enforces that.
 */
export const LANDING_PAGE_THEMES: Readonly<Record<string, LandingPageTheme>> = {
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
};

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
  const found = themeKey ? LANDING_PAGE_THEMES[themeKey] : undefined;
  return found ? { theme: found, branded: true } : { theme: NEUTRAL_THEME, branded: false };
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
