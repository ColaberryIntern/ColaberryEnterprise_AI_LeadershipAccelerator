import { esc } from '../classKit/kitRenderUtils';
import { safeHttpUrl } from '../caseStudy/caseStudyPublicSections';
import { themeCssVars, themeForLandingPage, logoForLandingPage } from './landingPageTheme';
import type { LandingPageContentShape, LandingPageSection } from '../../schemas/landingPageContentSchema';

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
 * NO WEBFONT, ON PURPOSE. This page serves its own CSP: `default-src 'none'`, with no `font-src`
 * and no external `style-src`. A Google Fonts <link> would be blocked and the page would fall
 * back silently, so the stack below is the real typeface and is chosen rather than defaulted.
 */

export interface RenderableBrand {
  name: string;
  default_theme_key: string | null;
}

export interface RenderLandingPageInput {
  content: LandingPageContentShape;
  brand: RenderableBrand;
  /** The row's `site_slug` - becomes the tracker's `data-site`. No tracking without it. */
  siteSlug: string | null;
  /** Absolute URL of this page, for the canonical link and the OG url. */
  pageUrl: string;
}

/** A link target that is safe to put in an href: absolute http(s), or a site-relative path. */
function safeHref(raw: string): string | null {
  const absolute = safeHttpUrl(raw);
  if (absolute) return absolute;
  // `//evil.example.com` is protocol-relative, not site-relative: it leaves our origin.
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return null;
}

type Cta = { label: string; href: string; style?: 'primary' | 'secondary' };

function renderCta(cta: Cta, extraClass = ''): string {
  const href = safeHref(cta.href);
  // A button with nowhere safe to go is dropped, not rendered inert: a dead CTA on a campaign
  // page reads as a broken page, and silence here is caught by the validation gate upstream.
  if (!href) return '';
  const kind = cta.style === 'secondary' ? 'cta cta-secondary' : 'cta';
  return `<a class="${kind}${extraClass}" href="${esc(href)}" data-track-cta="${esc(cta.label)}">`
    + `${esc(cta.label)}<span class="cta-arrow" aria-hidden="true">&rarr;</span></a>`;
}

function renderImage(image: { src: string; alt: string }): string {
  const src = safeHref(image.src);
  if (!src) return '';
  return `<img src="${esc(src)}" alt="${esc(image.alt)}" loading="lazy">`;
}

function renderEyebrow(value: string | undefined): string {
  return value ? `<p class="eyebrow">${esc(value)}</p>` : '';
}

function heading(value: string | undefined): string {
  return value ? `<h2>${esc(value)}</h2>` : '';
}

/**
 * The headline with one phrase painted in the brand accent.
 *
 * Only when the phrase really is a substring. A mismatch loses the emphasis and leaves the
 * sentence exactly as written - the alternatives (appending it, or highlighting a fuzzy match)
 * would silently rewrite a headline somebody approved.
 */
function renderHeadline(headlineText: string, accent: string | undefined): string {
  if (!accent) return esc(headlineText);
  const at = headlineText.indexOf(accent);
  if (at === -1) return esc(headlineText);
  return `${esc(headlineText.slice(0, at))}<span class="hl">${esc(accent)}</span>`
    + `${esc(headlineText.slice(at + accent.length))}`;
}

/**
 * "beginners, working professionals, career switchers, and builders" -> four pills.
 *
 * Splitting on commas only. A string with none stays a single pill, which is the correct
 * degenerate case rather than a bug - no attempt is made to guess at sentence structure.
 */
function renderAudience(audience: string): string {
  const parts = audience
    .split(',')
    .map((p) => p.trim().replace(/^and\s+/i, '').trim())
    .filter(Boolean);
  if (parts.length === 0) return '';
  return `<ul class="pills">${parts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`;
}

const CHECK_ICON = '<svg class="tick" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'
  + '<circle cx="10" cy="10" r="10" fill="currentColor" opacity=".14"></circle>'
  + '<path d="M5.8 10.4l2.7 2.7 5.7-5.7" fill="none" stroke="currentColor" stroke-width="2" '
  + 'stroke-linecap="round" stroke-linejoin="round"></path></svg>';

function renderBulletItems(
  items: ReadonlyArray<{ label: string; detail?: string }>,
  variant: 'cards' | 'checks' | 'steps',
): string {
  const detail = (d: string | undefined) => (d ? `<span class="b-detail">${esc(d)}</span>` : '');

  if (variant === 'checks') {
    return `<ul class="checks">${items.map((i) => `<li>${CHECK_ICON}<span>`
      + `<span class="b-label">${esc(i.label)}</span>${detail(i.detail)}</span></li>`).join('')}</ul>`;
  }
  if (variant === 'steps') {
    return `<ol class="steps">${items.map((i, n) => `<li>`
      + `<span class="step-n">${String(n + 1).padStart(2, '0')}</span>`
      + `<span class="b-label">${esc(i.label)}</span>${detail(i.detail)}</li>`).join('')}</ol>`;
  }
  return `<ul class="cards">${items.map((i) => `<li>`
    + `<span class="b-label">${esc(i.label)}</span>${detail(i.detail)}</li>`).join('')}</ul>`;
}

/** Heading column beside content column; stacks to one column below the breakpoint. */
function split(head: string, body: string): string {
  return `<div class="split"><div class="split-head">${head}</div>`
    + `<div class="split-body">${body}</div></div>`;
}

function renderSectionBody(section: LandingPageSection): string {
  switch (section.type) {
    case 'hero':
      return `<div class="hero-grid${section.image ? ' hero-split' : ''}">
<div class="hero-copy">
${renderEyebrow(section.eyebrow)}
<h1>${renderHeadline(section.headline, section.headlineAccent)}</h1>
${section.subhead ? `<p class="lede">${esc(section.subhead)}</p>` : ''}
${section.audience ? renderAudience(section.audience) : ''}
${section.cta ? `<div class="cta-row">${renderCta(section.cta)}</div>` : ''}
</div>
${section.image ? `<div class="hero-img">${renderImage(section.image)}</div>` : ''}
</div>`;

    case 'text': {
      const prose = `<div class="prose">${section.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}</div>`
        + `${section.kicker ? `<p class="kicker">${esc(section.kicker)}</p>` : ''}`;
      // Heading left, body right. A heading stacked on top of a 42rem column leaves half the
      // page empty at desktop width, which is most of what makes a page read as a document
      // rather than as a designed one. With no heading there is no left column to make.
      return section.heading
        ? split(`${renderEyebrow(section.eyebrow)}${heading(section.heading)}`, prose)
        : `${renderEyebrow(section.eyebrow)}${prose}`;
    }

    case 'bullets': {
      const variant = section.variant ?? 'cards';
      const head = `${renderEyebrow(section.eyebrow)}${heading(section.heading)}`
        + `${section.intro ? `<p class="intro">${esc(section.intro)}</p>` : ''}`;
      const items = renderBulletItems(section.items, variant);
      // A qualifying list is narrow and pairs with its heading; a card or step grid needs the
      // full width and takes its heading above it.
      return variant === 'checks' && section.heading
        ? split(head, items)
        : `${head}${items}`;
    }

    case 'stats':
      // The source is rendered, not merely stored. An outcome figure a reader cannot trace is the
      // thing this project refuses to publish, so the page shows where each number came from.
      return `${renderEyebrow(section.eyebrow)}
${heading(section.heading)}
<div class="stat-grid">${section.items.map((i) => `<div class="stat">`
        + `<span class="stat-value">${esc(i.value)}</span>`
        + `<span class="stat-label">${esc(i.label)}</span>`
        + `<span class="stat-source">${esc(i.source)}</span></div>`).join('')}</div>`;

    case 'quote':
      return `${renderEyebrow(section.eyebrow)}
${heading(section.heading)}
${section.items.map((i) => `<blockquote><p>${esc(i.quote)}</p><footer>${esc(i.attribution)}`
        + `${i.role ? `<span class="role">${esc(i.role)}</span>` : ''}</footer></blockquote>`).join('')}`;

    case 'details':
      return `${renderEyebrow(section.eyebrow)}
${heading(section.heading)}
<dl>${section.rows.map((r) => `<div class="row"><dt>${esc(r.label)}</dt>`
        + `<dd>${esc(r.value)}</dd></div>`).join('')}</dl>`;

    case 'faq':
      // <details> rather than JavaScript: the page needs no script to be usable, and a crawler
      // reads the answers either way.
      return `${renderEyebrow(section.eyebrow)}
${heading(section.heading)}
${section.items.map((i) => `<details><summary>${esc(i.question)}</summary>`
        + `<p>${esc(i.answer)}</p></details>`).join('')}`;

    case 'cta':
      return `<div class="closer">
${renderEyebrow(section.eyebrow)}
<h2>${esc(section.headline)}</h2>
${section.body ? `<p class="lede">${esc(section.body)}</p>` : ''}
<div class="cta-row">${renderCta(section.cta)}</div>
</div>`;

    default: {
      // Exhaustiveness guard: a new section type must be handled above or this fails to compile.
      const unhandled: never = section;
      return unhandled;
    }
  }
}

type Tone = 'default' | 'subtle' | 'inverse' | 'accent';

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

const STYLES = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 "Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,"Helvetica Neue",Arial,sans-serif}
img{max-width:100%;height:auto;display:block}
a{color:inherit}

/* ---- bands ------------------------------------------------------------ */
.band{padding-block:clamp(3rem,7vw,5.5rem)}
.band--subtle{background:var(--bg-elevated)}
.band--inverse{background:#1A1A1A;color:#FFFFFF}
.band--accent{background:var(--accent);color:var(--accent-contrast)}
.band--hero{padding-block:clamp(3rem,8vw,6rem)}
.band--joined{padding-top:0}
.inner{max-width:68rem;margin:0 auto;padding-inline:1.25rem}

/* ---- header / footer --------------------------------------------------- */
.site-head{position:sticky;top:env(safe-area-inset-top,0px);z-index:20;background:rgba(255,255,255,.93);backdrop-filter:saturate(1.6) blur(8px);border-bottom:1px solid var(--line)}
.site-head .inner{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding-block:.7rem}
.brand{display:flex;align-items:center;gap:.55rem;text-decoration:none;font-weight:700;letter-spacing:-.01em;color:var(--fg)}
.brand img{height:30px;width:auto}
.site-foot{background:#1A1A1A;color:#FFFFFF;padding-block:2.5rem}
.site-foot .inner{display:flex;flex-wrap:wrap;gap:1rem 2rem;align-items:center;justify-content:space-between}
.foot-mark{font-weight:700;font-size:1.1rem;letter-spacing:-.01em}
.foot-note{color:#B4B4B4;font-size:.85rem;margin:0}

/* ---- type -------------------------------------------------------------- */
h1{font-size:clamp(2.1rem,5.4vw,3.5rem);line-height:1.07;letter-spacing:-.025em;margin:0 0 1.1rem;text-wrap:balance;font-weight:800}
h2{font-size:clamp(1.6rem,3.4vw,2.35rem);line-height:1.14;letter-spacing:-.02em;margin:0 0 1rem;text-wrap:balance;font-weight:800}
p{margin:0 0 1rem}
/* Small text in the brand colour is darkened toward black for contrast. Colaberry cherry
   #FB2832 measures 3.86:1 on white - fine for a 3.5rem headline (AA large needs 3:1), under the
   4.5:1 AA floor for a .74rem label. Declared twice: a browser without color-mix keeps the plain
   accent, so this degrades to the brand colour rather than to nothing. Surfaces (the buttons, the
   closing band) keep the undarkened brand red - that is a brand decision, not a CSS one. */
.eyebrow{font-size:.74rem;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--accent);color:color-mix(in srgb,var(--accent) 76%,#000);margin:0 0 .85rem}
.band--inverse .eyebrow,.band--accent .eyebrow{color:currentColor;opacity:.78}
.hl{color:var(--accent)}
.band--accent .hl,.band--inverse .hl{color:inherit}
.lede{font-size:clamp(1.05rem,1.6vw,1.2rem);color:var(--fg-muted);max-width:40rem}
.band--inverse .lede,.band--accent .lede{color:currentColor;opacity:.9}
.prose{max-width:42rem;color:var(--fg-muted)}
.band--inverse .prose,.band--accent .prose{color:currentColor;opacity:.9}
.intro{max-width:42rem;color:var(--fg-muted);margin:0 0 2rem}
.band--inverse .intro,.band--accent .intro{color:currentColor;opacity:.9}
.kicker{font-weight:700;color:var(--accent);color:color-mix(in srgb,var(--accent) 76%,#000);max-width:42rem;margin:.25rem 0 0}
.band--inverse .kicker,.band--accent .kicker{color:currentColor}

/* ---- split: heading column beside content column ------------------------ */
.split{display:grid;gap:1.25rem}
@media (min-width:62rem){.split{grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:1rem 4rem;align-items:start}}
.split-head h2{margin-bottom:0}
.split-body .prose,.split-body .intro{max-width:none}
.split-head .intro{margin:.9rem 0 0}

/* ---- hero -------------------------------------------------------------- */
.hero-grid{display:grid;gap:2.5rem}
.hero-split{grid-template-columns:1fr}
@media (min-width:62rem){.hero-split{grid-template-columns:1.05fr .95fr;align-items:center}}
.pills{list-style:none;display:flex;flex-wrap:wrap;gap:.5rem;padding:0;margin:1.4rem 0 0}
.pills li{background:var(--accent-soft);color:var(--fg);border:1px solid var(--line);border-radius:999px;padding:.35rem .85rem;font-size:.85rem;font-weight:600}

/* ---- buttons ----------------------------------------------------------- */
.cta-row{margin-top:1.8rem;display:flex;flex-wrap:wrap;gap:.75rem}
.cta{display:inline-flex;align-items:center;gap:.5rem;background:var(--accent);color:var(--accent-contrast);padding:.85rem 1.6rem;border-radius:.5rem;text-decoration:none;font-weight:700;line-height:1.2;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.cta:hover{filter:brightness(1.07)}
.cta-arrow{transition:transform .15s ease}
.cta:hover .cta-arrow{transform:translateX(3px)}
.cta-secondary{background:transparent;color:var(--accent);border:1.5px solid var(--accent);box-shadow:none}
.band--accent .cta{background:#FFFFFF;color:var(--accent)}
.cta-sm{padding:.55rem 1.1rem;font-size:.9rem}
.cta:focus-visible,details summary:focus-visible,.brand:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.band--accent .cta:focus-visible{outline-color:#FFFFFF}

/* ---- bullets: cards / checks / steps ------------------------------------ */
.cards,.checks,.steps{list-style:none;padding:0;margin:0}
.cards{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}
.cards li{background:var(--bg);border:1px solid var(--line);border-radius:.75rem;padding:1.15rem 1.25rem;border-top:3px solid var(--accent)}
.band--subtle .cards li{background:#FFFFFF}
.band--inverse .cards li{background:#2B2B2B;border-color:#3A3A3A}
.checks{display:grid;gap:.85rem;max-width:46rem}
.checks li{display:flex;gap:.7rem;align-items:flex-start}
.tick{width:1.3rem;height:1.3rem;flex:0 0 auto;margin-top:.14rem;color:#5BA63C}
.steps{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}
.steps li{background:var(--bg);border:1px solid var(--line);border-radius:.75rem;padding:1.15rem 1.25rem}
.band--subtle .steps li{background:#FFFFFF}
.band--inverse .steps li{background:#2B2B2B;border-color:#3A3A3A}
.step-n{display:block;font-size:.78rem;font-weight:800;letter-spacing:.08em;color:var(--accent);color:color-mix(in srgb,var(--accent) 76%,#000);margin-bottom:.4rem;font-variant-numeric:tabular-nums}
.b-label{display:block;font-weight:700}
.b-detail{display:block;color:var(--fg-muted);margin-top:.25rem;font-size:.95rem}
.band--inverse .b-detail,.band--accent .b-detail{color:#D8D8D8}

/* ---- stats / quote / details / faq -------------------------------------- */
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:1.25rem}
.stat{background:var(--bg);border:1px solid var(--line);border-radius:.75rem;padding:1.3rem}
.band--subtle .stat{background:#FFFFFF}
.stat-value{display:block;font-size:2.2rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.05;color:var(--accent)}
.stat-label{display:block;margin-top:.3rem;font-weight:600}
.stat-source{display:block;margin-top:.55rem;font-size:.78rem;color:var(--fg-muted)}
blockquote{margin:0 0 1.25rem;padding:1.4rem 1.5rem;background:var(--bg);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:0 .6rem .6rem 0;max-width:46rem}
.band--subtle blockquote{background:#FFFFFF}
blockquote p{font-size:1.08rem}
blockquote footer{color:var(--fg-muted);font-size:.9rem;font-weight:600}
blockquote .role{display:block;font-weight:400}
dl{margin:0;max-width:46rem}
.row{display:flex;flex-wrap:wrap;gap:.4rem 1.5rem;padding:.9rem 0;border-bottom:1px solid var(--line)}
dt{font-weight:700;min-width:10rem;margin:0}
dd{margin:0;color:var(--fg-muted);flex:1 1 14rem}
details{border-bottom:1px solid var(--line);padding:1rem 0;max-width:46rem}
summary{cursor:pointer;font-weight:700}
details p{margin:.75rem 0 0;color:var(--fg-muted)}

/* ---- closer ------------------------------------------------------------- */
.closer{max-width:44rem;margin:0 auto;text-align:center}
.closer .lede{margin-inline:auto}
.closer .cta-row{justify-content:center}

@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`.trim();

export interface RenderedLandingPage {
  html: string;
  /** True when the brand had an agreed palette; false when the page rendered neutral. */
  branded: boolean;
}

export function renderLandingPage(input: RenderLandingPageInput): RenderedLandingPage {
  const { content, brand, siteSlug, pageUrl } = input;
  const { theme, branded } = themeForLandingPage(brand.default_theme_key);
  const logo = logoForLandingPage(brand.default_theme_key);

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
:root{
${themeCssVars(theme)}
  color-scheme: light;
}
${STYLES}
</style>
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
<span class="foot-mark">${esc(brand.name)}</span>
<p class="foot-note">&copy; ${new Date().getFullYear()} ${esc(brand.name)}</p>
</div>
</footer>
${tracker}
</body>
</html>`;

  return { html, branded };
}
