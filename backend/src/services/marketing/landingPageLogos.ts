/**
 * The brand lockup for a hosted landing page, keyed by `brands.default_theme_key`.
 *
 * SPLIT FROM `landingPageTheme.ts` on 2026-10-12, when adding the extended palette took that
 * file to fourteen exports against CLAUDE.md's ceiling of twelve. A lockup is not a palette:
 * the two change for different reasons, from different sources, and nothing but the renderer
 * reads this half.
 *
 * REFUSAL TO GUESS, same rule as the palette: a brand appears here only when a real asset
 * exists for it in `frontend/public/`, and anything absent renders its name as text instead.
 * Putting one brand's logo above another brand's page would be a worse failure than showing no
 * logo at all.
 *
 * There is also still **no logo column on `brands`** (`id`, `tenant_id`, `slug`, `name`,
 * `status`, `default_public_url`, `default_theme_key`, `support_email`, `timezone`,
 * `default_journey_program_id`, `metadata`), so a brand's mark has nowhere to live but this
 * table until one exists.
 */

/** The asset a lockup resolves to. */
export interface BrandLockup {
  src: string;
  alt: string;
}

/**
 * The lockup for the light header band.
 *
 * `/colaberry-horizontal.png` is the colour lockup, which is the one that works there. The
 * footer deliberately does not use `colaberry-logo-dark.png`, because that file has an opaque
 * black box baked into it.
 */
export const LANDING_PAGE_LOGOS: Readonly<Record<string, BrandLockup>> = {
  training: { src: '/colaberry-horizontal.png', alt: 'Colaberry' },
};

/**
 * The lockup for a DARK ground, where the normal one disappears.
 *
 * A real white asset exists - `/knowledge/assets/logo/colaberry-horizontal-white.png`, part of
 * the brand asset set already served from this host - so the footer uses it. The alternative
 * considered was matching the footer background to a logo's own baked-in box, which only works
 * until the footer colour changes and is a workaround for an asset that turned out to exist.
 */
export const LANDING_PAGE_LOGOS_ON_DARK: Readonly<Record<string, BrandLockup>> = {
  training: { src: '/knowledge/assets/logo/colaberry-horizontal-white.png', alt: 'Colaberry' },
};

/** The lockup for a brand's key, or null when the page should show the brand name as text. */
export function logoForLandingPage(themeKey: string | null | undefined): BrandLockup | null {
  return themeKey ? LANDING_PAGE_LOGOS[themeKey] ?? null : null;
}

/** The lockup to use on the dark footer. Falls back to the light one, then to text. */
export function logoOnDarkForLandingPage(themeKey: string | null | undefined): BrandLockup | null {
  if (!themeKey) return null;
  return LANDING_PAGE_LOGOS_ON_DARK[themeKey] ?? LANDING_PAGE_LOGOS[themeKey] ?? null;
}
