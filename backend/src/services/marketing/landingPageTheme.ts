import { liftForContrast, resolveToken } from './landingPageContrast';

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

/**
 * The surfaces the stylesheet paints that are NOT a brand colour: a card lifted off its band,
 * the contrast band, the sticky header, the two icon-tile washes.
 *
 * WHY THESE ARE OPTIONAL. Every one of them has a literal fallback written into the stylesheet
 * - `var(--surface-raised,#FFFFFF)` - which is the value that shipped before this type existed.
 * A brand that sets none of them renders byte-identically to before, so adding the concept costs
 * the seven light brands nothing. Only a brand that needs different surfaces declares them.
 *
 * WHY THEY EXIST AT ALL. Rendering the fixture under Refactored's dark system showed what the
 * literals cost: `.band--subtle .panel{background:#FFFFFF}` put a white card under light text,
 * and the hero panel, the icon tiles and two callouts rendered invisible. The brand colours were
 * right and the page was unreadable, because the SURFACES assumed a light ground.
 */
export interface SurfacePalette {
  /** A card lifted off a light band. */
  '--surface-raised': string;
  /** The sticky header's ground. */
  '--head-bg': string;
  /** The contrast band: its ground, its text, its cards, its rules, its muted text. */
  '--contrast-bg': string;
  '--contrast-fg': string;
  '--contrast-raised': string;
  '--contrast-line': string;
  '--contrast-muted': string;
  /** The two tinted icon-tile washes, which carry their own ink. */
  '--tile-wash-b': string;
  '--tile-wash-c': string;
  '--tile-ink-c': string;
  /** The success wash: a reassuring panel and the ink on it. */
  '--ok-wash': string;
  '--ok-ink': string;
  '--ok-line': string;
}

/** What the renderer actually paints with: the eight, plus the five, plus any surface overrides. */
export type LandingPageTheme = BrandBaseTheme & ExtendedPalette & Partial<SurfacePalette>;

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
  /**
   * CPN, copied from apps/cpn-public/src/assets/design/tokens/colors.css.
   *
   * This system has existed in the repo the whole time and was simply never wired, so a CPN
   * page rendered in the navy neutral - which is nobody's brand. Pinned to its source by
   * `deliveryBrandThemes`-style test, same as AI Flotation.
   */
  'cpn': {
    '--bg': '#FFFDF8',
    '--bg-elevated': '#FFFFFF',
    '--fg': '#1C1B18',
    '--fg-muted': '#4E4B42',
    '--accent': '#1D6A4C',
    '--accent-contrast': '#FFFFFF',
    '--accent-soft': '#DFF0E6',
    '--line': '#DDD8CB',
  },
  /**
   * Refactored.ai, copied from apps/refactored-public/src/assets/design/tokens/colors.css.
   *
   * The only DARK-first brand here: its ground is #0C141B and its text is near-white. The
   * renderer's surfaces used to be hardcoded light, so wiring this brand needed the stylesheet
   * tokenised first - see SURFACE_PALETTES.
   */
  'refactored': {
    '--bg': '#0C141B',
    '--bg-elevated': '#14202A',
    '--fg': '#E8F0F6',
    '--fg-muted': '#9FB3C2',
    '--accent': '#5CA7DA',
    '--accent-contrast': '#06202F',
    '--accent-soft': '#123246',
    '--line': '#263743',
  },
  /**
   * Colaberry Enterprise, copied from apps/colaberry-enterprise-design/src/assets/design/tokens/colors.css.
   *
   * FOUR brands resolve to this theme key - advisor, colaberry-enterprise,
   * trustbeforeintelligence and worldoftaxonomy - so it was the single largest source of
   * unbranded pages. Its design system was never vendored into this repo at all (the sync
   * registry carried `target: null`) and so was never read.
   */
  'enterprise': {
    '--bg': '#F8F8F7',
    '--bg-elevated': '#FFFFFF',
    '--fg': '#1A1A1A',
    '--fg-muted': '#6B6B6B',
    '--accent': '#2E6A86',
    '--accent-contrast': '#FFFFFF',
    '--accent-soft': '#EAF2F6',
    '--line': '#D8D8D8',
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
  /**
   * Colaberry Enterprise publishes its own brand colours alongside the eight, so its extended
   * set is SOURCED rather than derived - the same leaf and berry the Training brand uses,
   * because they are the same company's colours.
   *
   * `--accent-deep` is the brand blue itself: this system names no darker variant (only
   * color-mix expressions, which are not hex and cannot be pinned), and the closing band in
   * cherry would borrow Training's accent for an Enterprise page.
   */
  enterprise: {
    '--accent-2': '#77BB4A', // --brand-leaf
    '--accent-3': '#367895', // --brand-berry
    '--accent-deep': '#2E6A86', // --accent, for want of a documented darker one
    '--bg-cool': '#EAF2F6', // --accent-soft, the cool wash
    '--bg-warm': '#F8F8F7', // --bg
  },
  training: {
    '--accent-2': '#5BA63C', // --green-600, the logo leaf mid
    '--accent-3': '#367895', // --blue-500, brand berry
    '--accent-deep': '#C20E1E', // --red-700, the logo core shadow
    '--bg-cool': '#EAF2F6', // --blue-50
    '--bg-warm': '#F8F8F7', // --neutral-50
  },
};

/**
 * Surface overrides, for a brand whose ground is not light.
 *
 * Refactored is the only one. Its system is dark-first - #0C141B ground, #E8F0F6 text - and
 * EVERY value below is one of its own published tokens, so none of this is invented:
 * `--bg-elevated` lifts a card, `--bg-sunk` is the deepest ground and so makes the contrast
 * band, `--line-strong` rules it, `--fg-muted` is its quiet text.
 *
 * THE CONTRAST BAND STAYS DARK rather than inverting to light. On a dark page an inverted light
 * band would be the loudest thing on the screen, and this system publishes no light surface to
 * build one from - I would have had to invent the ground, its rule colour and its muted text.
 * Going a shade DEEPER than the page keeps the band's job (break the rhythm, carry the strongest
 * argument) using only colours the brand has actually decided.
 */
export const SURFACE_PALETTES: Readonly<Record<string, SurfacePalette>> = {
  refactored: {
    '--surface-raised': '#14202A', // --bg-elevated
    '--head-bg': '#0C141B', // --bg; the light default is translucent, this one is solid
    '--contrast-bg': '#0A1016', // --bg-sunk, deeper than the page
    '--contrast-fg': '#E8F0F6', // --fg
    '--contrast-raised': '#14202A', // --bg-elevated
    '--contrast-line': '#354B5C', // --line-strong
    '--contrast-muted': '#9FB3C2', // --fg-muted
    '--tile-wash-b': '#123246', // --accent-soft
    '--tile-wash-c': '#10331F', // --success-soft
    '--tile-ink-c': '#5FD59B', // --success
    '--ok-wash': '#10331F', // --success-soft
    '--ok-ink': '#5FD59B', // --success
    '--ok-line': '#354B5C', // --line-strong
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
  // Surfaces are OPTIONAL and almost always absent: the stylesheet carries a literal fallback
  // for each, so a light brand that declares none renders exactly as it did before surfaces
  // existed. Only a brand whose ground is not light needs to say anything here.
  const surfaces = (themeKey && SURFACE_PALETTES[themeKey]) || undefined;
  const theme = { ...base, ...extended, ...surfaces };
  return { theme: { ...theme, ...onDarkAccents(theme) }, branded: true };
}

/**
 * The two accents as they must appear ON THE INVERSE BAND, derived from the brand's own.
 *
 * WHY THIS EXISTS. `.band--inverse` repaints a section dark and then draws `--accent-2` on it for
 * the eyebrow and `--accent` for the highlighted words in a heading. Measured 2026-10-22, that is
 * unreadable for three of the five brands: CPN's eyebrow sits at 2.67:1 where AA wants 4.5, AI
 * Flotation's at 3.23:1, and Enterprise's heading highlight at 2.92:1 where AA wants 3. The text
 * is there, the page looks designed, and nobody can read it.
 *
 * WHY DERIVED AND NOT CHOSEN. Those accents are the brands' real documented colours and are
 * correct everywhere else. `liftForContrast` blends toward white only as far as the threshold
 * requires, so each value is reproducible from the brand's own hex, keeps its hue, and follows
 * the brand if the accent ever changes. Nothing here is a hand-picked replacement, which is the
 * same discipline the extended palette above is held to.
 *
 * WHY THE PASSING BRANDS DO NOT MOVE. The lift returns its input unchanged when the ratio already
 * clears, so Training and Refactored resolve these to exactly their own accents and render
 * byte-identically. Only the three brands that actually fail change.
 */
function onDarkAccents(theme: Readonly<Record<string, string>>): Record<string, string> {
  // The band's ground: the brand's own where it declares one, the stylesheet's fallback
  // otherwise - the same resolution the browser itself performs.
  const ground = resolveToken(theme, '--contrast-bg') ?? '#1A1A1A';
  return {
    // The eyebrow is body-sized, so AA wants 4.5:1.
    '--accent-2-on-dark': liftForContrast(theme['--accent-2'], ground, 4.5),
    // The highlight sits inside an h1/h2, so it is large text and AA wants 3:1.
    '--accent-on-dark': liftForContrast(theme['--accent'], ground, 3),
  };
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
