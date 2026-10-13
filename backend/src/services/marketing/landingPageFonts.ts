/**
 * The typefaces a hosted landing page renders in, per brand.
 *
 * WHY THIS EXISTS. Ali, 2026-10-13, after building a CPN page: "it didn't even use the correct
 * branding. That should be wired into this process." The palette was half the answer - the other
 * half is that every page was set in Roboto, which is COLABERRY's typeface. A CPN page in Roboto
 * is wrong even when its colours are right, because the brand is a serif/humanist pairing and
 * Roboto says Colaberry to anyone who knows either brand.
 *
 * SOURCED, NOT CHOSEN, exactly like the palette. Each stack below is copied from that brand's own
 * vendored `tokens/typography.css`, and the woff2 files are the ones that ship in the same design
 * system - already in this repo, already licensed, copied to `frontend/public/fonts/` so the page
 * self-hosts them rather than calling Google (the page's CSP has no third-party font-src).
 * `landingPageFonts.test.ts` pins each stack to its source file.
 *
 * A BRAND WITH NO ENTRY GETS ROBOTO, which is what every page used before this file existed, so
 * adding it changes nothing for a brand that has not been wired. The fallback stack is always
 * real: if the woff2 fails, the page lands on a system face of the same character, never on
 * whatever the browser defaults to.
 */

export interface BrandFonts {
  /** The display stack, used for h1/h2 and anything that reads as a headline. */
  heading: string;
  /** The reading stack, used for body copy and UI text. */
  body: string;
  /** Self-hosted faces to declare. `src` is a path under `frontend/public/`. */
  faces: Array<{ family: string; weight: string; src: string }>;
}

/** Latin subset only, matching how Roboto was already done - these are landing pages, not books. */
const ROBOTO: BrandFonts = {
  heading: `Roboto,"Segoe UI",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif`,
  body: `Roboto,"Segoe UI",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif`,
  faces: [{ family: 'Roboto', weight: '400 700', src: '/fonts/roboto-latin.woff2' }],
};

export const BRAND_FONTS: Readonly<Record<string, BrandFonts>> = {
  // Colaberry: "Brand spec: Roboto (display + body)" per colaberry/tokens/fonts.css.
  training: ROBOTO,
  /**
   * CPN, from apps/cpn-public/src/assets/design/tokens/typography.css:
   *   --font-heading:'Bitter', Georgia, serif;
   *   --font-body:'Atkinson Hyperlegible', system-ui, sans-serif;
   * Bitter ships as one variable latin file covering 400-700; Atkinson ships the two weights
   * separately, so both are declared.
   */
  cpn: {
    heading: `Bitter,Georgia,"Times New Roman",serif`,
    body: `"Atkinson Hyperlegible",system-ui,-apple-system,"Segoe UI",sans-serif`,
    faces: [
      { family: 'Bitter', weight: '400 700', src: '/fonts/bitter-latin.woff2' },
      { family: 'Atkinson Hyperlegible', weight: '400', src: '/fonts/atkinson-hyperlegible-400-latin.woff2' },
      { family: 'Atkinson Hyperlegible', weight: '700', src: '/fonts/atkinson-hyperlegible-700-latin.woff2' },
    ],
  },
};

/** The faces and family tokens for a brand, as CSS. Falls back to Roboto for an unwired brand. */
export function fontCssFor(themeKey: string | null | undefined): string {
  const fonts = (themeKey && BRAND_FONTS[themeKey]) || ROBOTO;
  // font-display:swap so the page is readable while the face arrives, and the fallback stack
  // above is what renders if the request fails outright.
  const faces = fonts.faces.map((f) => [
    `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};`,
    `font-display:swap;src:url('${f.src}') format('woff2')}`,
  ].join('')).join('\n');
  return `${faces}\n:root{--font-heading:${fonts.heading};--font-body:${fonts.body}}`;
}
