import { esc } from '../classKit/kitRenderUtils';
import { safeHttpUrl } from '../caseStudy/caseStudyPublicSections';
import { themeCssVars, themeForLandingPage } from './landingPageTheme';
import { logoForLandingPage, logoOnDarkForLandingPage } from './landingPageLogos';
import { fontCssFor } from './landingPageFonts';
import { metaPixelHead } from './landingPagePixel';
import { normalizeHeadingCase } from './landingPageHeadingCase';
import type { LandingPageContentShape, LandingPageSection } from '../../schemas/landingPageContentSchema';
import { STYLES } from './landingPageStyles';
import { renderCta, renderSectionBody, type Cta } from './landingPageSections';
import { SNACKBAR_STYLES, snackbarScriptTag, type SnackbarRenderInput } from './landingPageSnackbar';

/**
 * A hosted landing page, as the HTML a stranger's browser receives.
 *
 * SERVER-RENDERED, NOT A REACT ROUTE. These pages are the destination of social posts, so the
 * first thing that fetches one is usually Facebook's or LinkedIn's crawler asking for OG tags.
 * A CRA route cannot answer that - `index.html` is static, so every page would share the app's
 * generic card, and the link preview for every campaign would look the same. That is the whole
 * reason this is a backend renderer. (It also means no bundle to download before the first
 * paint, on a page whose entire job is to be read by someone who just tapped a link.)
 *
 * EVERYTHING IS ESCAPED. The content is operator-supplied JSON served from the same hostname as
 * the admin app, so an unescaped field here is stored XSS with an admin session one tab away.
 * Text goes through `esc`; the only URLs allowed are an absolute http(s) one (via `safeHttpUrl`)
 * or a site-relative path, checked again here even though the schema already checked on write -
 * the same "validate at both ends" rule the tracked-link redirect follows, and for the same
 * reason: a row can be written by a path that bypassed the schema, and validating only on write
 * grandfathers every existing row past any future fix.
 *
 * THE SWITCH IS EXHAUSTIVE. `never` in the default branch means a ninth section type fails the
 * build here rather than rendering as nothing on a live page.
 *
 * TRACKING IS THE REAL TRACKER, NOT A HAND-ROLLED BEACON. The page loads
 * `/v1/track.js` with `data-site` set from the row's own `site_slug`. That script already
 * computes the fingerprint the rest of the pipeline identifies visitors by, so a landing-page
 * view joins the same visitor and session as that person's other pages. A bespoke inline beacon
 * would have had to re-implement that fingerprint, and any disagreement would have silently
 * created a brand-new visitor per view - which is exactly the "full tracking" Ali asked for,
 * broken in a way nobody would notice. CTAs carry `data-track-cta`, which that script already
 * watches for.
 *
 * -- WHY THIS LOOKS LIKE A LANDING PAGE AND NOT A DOCUMENT --------------------------------
 *
 * Ali, 2026-10-05, holding the first real page next to one he had designed himself: "Yours is
 * the Hello World version." He was right, and the cause was structural rather than cosmetic -
 * the old renderer had exactly one layout (stacked blocks in a 46rem column) and no way for
 * content to say anything about its own shape. Three things changed:
 *
 *   1. BANDS. Every section paints a full-bleed band and the tone alternates, so a long page
 *      reads as chapters. `inverse` and `accent` carry their own foreground colours, so contrast
 *      is a property of the band rather than something each section has to remember.
 *   2. EYEBROWS. A real brief already carries them - Sohail's draft headed every block with both
 *      a label and a headline - and the schema used to throw the label away.
 *   3. BULLET VARIANTS. A qualifying list ("this is for you if"), an ordered sequence and a
 *      capability grid are three different things that were all rendering as the same <ul>.
 *
 * THE BRAND TYPEFACE, SELF-HOSTED. This page serves its own CSP, which until 2026-10-11 had no
 * `font-src` at all - so the comment here said there was deliberately no webfont, and the page
 * fell back to a system stack. That was a constraint, not a decision: `colaberry/tokens/
 * fonts.css` names Roboto as the brand spec, and the woff2 was already in this repo.
 *
 * So the CSP now allows `font-src 'self'` and nothing else - no Google Fonts link, which would
 * still be blocked and would leak a request to a third party before anyone consented. The file
 * is served from our own origin, declared with `font-display: swap` so the page is readable
 * before it arrives, and the old system stack remains the fallback.
 */

export interface RenderableBrand {
  name: string;
  default_theme_key: string | null;
  /**
   * The brand's Meta Pixel ID, or null when the brand is not advertised.
   *
   * Optional so that every existing caller - tests, the preview route, the fixture script -
   * keeps compiling and keeps rendering a page with NO third-party script, which is the right
   * default for a brand nobody is running ads for.
   */
  meta_pixel_id?: string | null;
}

export interface RenderLandingPageInput {
  content: LandingPageContentShape;
  brand: RenderableBrand;
  /** The row's `site_slug` - becomes the tracker's `data-site`. No tracking without it. */
  siteSlug: string | null;
  /** Absolute URL of this page, for the canonical link and the OG url. */
  pageUrl: string;
  /**
   * Per-response CSP nonce, supplied by the route that also sets the header.
   *
   * The renderer does not mint it: the nonce in the markup and the nonce in the policy have to
   * be the same string, and the only way to guarantee that is for one caller to own both.
   */
  cspNonce?: string;
  /**
   * The "just signed up" snack bar, when it is on for this page (brand default or page override,
   * resolved by the caller). Optional so every existing caller renders exactly as before.
   */
  snackbar?: SnackbarRenderInput | null;
}

/** A link target that is safe to put in an href: absolute http(s), or a site-relative path. */

type Tone = 'default' | 'subtle' | 'inverse' | 'accent' | 'cool';

/**
 * Which band each section paints on, resolved for the whole page in one pass.
 *
 * The hero opens on the tinted band and a closing `cta` takes the brand colour; everything
 * between alternates. Resolved as a sequence rather than per-index because `index % 2` does not
 * know what the section before it actually got: with the hero forced to `subtle`, a plain
 * section at index 1 also computed `subtle` and the two bands merged into one grey slab with a
 * dead gap in the middle of it. Alternation is a property of the run, not of the index.
 *
 * Deterministic from content alone, so the same draft always renders the same page - a random
 * or time-dependent choice would make two publishes of one draft disagree.
 */
function resolveTones(sections: ReadonlyArray<LandingPageSection>): Tone[] {
  let previous: Tone | null = null;
  return sections.map((section) => {
    let tone: Tone;
    if (section.tone) tone = section.tone;
    else if (section.type === 'hero') tone = 'subtle';
    else if (section.type === 'cta') tone = 'accent';
    // Flip away from whatever the band above actually painted.
    else tone = previous === 'subtle' ? 'default' : 'subtle';
    previous = tone;
    return tone;
  });
}

/** The first CTA anywhere in the content, reused in the sticky header. */
function firstCta(content: LandingPageContentShape): Cta | null {
  for (const section of content.sections) {
    if (section.type === 'hero' && section.cta) return section.cta;
    if (section.type === 'cta') return section.cta;
  }
  return null;
}


export interface RenderedLandingPage {
  html: string;
  /** True when the brand had an agreed palette; false when the page rendered neutral. */
  branded: boolean;
}

export function renderLandingPage(input: RenderLandingPageInput): RenderedLandingPage {
  const { brand, siteSlug, pageUrl, cspNonce, snackbar } = input;
  // Sentence case at the boundary, so no page can be SERVED in Title Case whenever it was
  // written. The generator normalises too, but pages built before that existed are already in
  // the database and already live, and this fixes those without a migration. The function is
  // idempotent, so the two passes cannot fight.
  const content = normalizeHeadingCase(input.content);
  const { theme, branded } = themeForLandingPage(brand.default_theme_key);
  const logo = logoForLandingPage(brand.default_theme_key);
  const darkLogo = logoOnDarkForLandingPage(brand.default_theme_key);

  const hero = content.sections.find((s) => s.type === 'hero');
  const title = content.title ?? (hero && hero.type === 'hero' ? hero.headline : brand.name);
  const description = content.description
    ?? (hero && hero.type === 'hero' ? hero.subhead : undefined);
  const canonical = safeHttpUrl(pageUrl);
  const ogImage = content.socialImage ? safeHttpUrl(content.socialImage.src) : null;
  const headCta = firstCta(content);

  // No site_slug means no data-site, and track.js fatals without one rather than guessing. An
  // untracked page is a real (logged) gap upstream; emitting a broken script tag would be worse.
  const tracker = siteSlug
    ? `<script src="/v1/track.js" data-site="${esc(siteSlug)}" defer></script>`
    : '<!-- tracking omitted: this page has no site_slug -->';

  // The brand lockup. An agreed logo renders as the image; a brand without one renders its name,
  // which is the same refusal-to-guess the palette registry makes.
  const brandMark = logo
    ? `<img src="${esc(logo.src)}" alt="${esc(logo.alt)}">`
    : `<span>${esc(brand.name)}</span>`;

  const tones = resolveTones(content.sections);
  const body = content.sections.map((section, index) => {
    const tone = tones[index];
    const heroClass = section.type === 'hero' ? ' band--hero' : '';
    // Two deliberately-same-tone bands in a row are one block visually, so the seam between them
    // drops its padding instead of showing as a double gap. This is how a dark block holds its
    // copy and its cards without a gulf between them.
    const joined = index > 0 && tones[index - 1] === tone ? ' band--joined' : '';
    return `<section class="band band--${tone} s-${section.type}${heroClass}${joined}">
<div class="inner">
${renderSectionBody(section)}
</div>
</section>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
${description ? `<meta property="og:description" content="${esc(description)}">` : ''}
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ''}
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
${ogImage && content.socialImage ? `<meta property="og:image:alt" content="${esc(content.socialImage.alt)}">` : ''}
<meta property="og:site_name" content="${esc(brand.name)}">
<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">
<style>
${fontCssFor(brand.default_theme_key)}
:root{
${themeCssVars(theme)}
  color-scheme: light;
}
${STYLES}
${snackbar ? SNACKBAR_STYLES : ''}
</style>
${cspNonce ? metaPixelHead(brand.meta_pixel_id, cspNonce) : ''}
</head>
<body>
<header class="site-head">
<div class="inner">
<a class="brand" href="/">${brandMark}</a>
${headCta ? renderCta(headCta, ' cta-sm') : ''}
</div>
</header>
<main>
${body}
</main>
<footer class="site-foot">
<div class="inner">
${darkLogo
  ? `<img class="foot-logo" src="${esc(darkLogo.src)}" alt="${esc(darkLogo.alt)}">`
  : `<span class="foot-mark">${esc(brand.name)}</span>`}
<p class="foot-note">${content.footerNote
  ? esc(content.footerNote)
  : `&copy; ${new Date().getFullYear()} ${esc(brand.name)}`}</p>
</div>
</footer>
${tracker}
${snackbar ? snackbarScriptTag(snackbar) : ''}
</body>
</html>`;

  return { html, branded };
}
