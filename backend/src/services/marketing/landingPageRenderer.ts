import { esc } from '../classKit/kitRenderUtils';
import { safeHttpUrl } from '../caseStudy/caseStudyPublicSections';
import { themeCssVars, themeForLandingPage } from './landingPageTheme';
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

function renderCta(cta: { label: string; href: string; style?: 'primary' | 'secondary' }): string {
  const href = safeHref(cta.href);
  // A button with nowhere safe to go is dropped, not rendered inert: a dead CTA on a campaign
  // page reads as a broken page, and silence here is caught by the validation gate upstream.
  if (!href) return '';
  const kind = cta.style === 'secondary' ? 'cta cta-secondary' : 'cta';
  return `<a class="${kind}" href="${esc(href)}" data-track-cta="${esc(cta.label)}">${esc(cta.label)}</a>`;
}

function renderImage(image: { src: string; alt: string }): string {
  const src = safeHref(image.src);
  if (!src) return '';
  return `<img src="${esc(src)}" alt="${esc(image.alt)}" loading="lazy">`;
}

function heading(text: string | undefined, level: 'h2' = 'h2'): string {
  return text ? `<${level}>${esc(text)}</${level}>` : '';
}

function renderSection(section: LandingPageSection): string {
  switch (section.type) {
    case 'hero':
      return `<section class="s s-hero">
  <h1>${esc(section.headline)}</h1>
  ${section.subhead ? `<p class="lede">${esc(section.subhead)}</p>` : ''}
  ${section.audience ? `<p class="audience">${esc(section.audience)}</p>` : ''}
  ${section.image ? `<div class="hero-img">${renderImage(section.image)}</div>` : ''}
  ${section.cta ? `<div class="cta-row">${renderCta(section.cta)}</div>` : ''}
</section>`;

    case 'text':
      return `<section class="s s-text">
  ${heading(section.heading)}
  ${section.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n  ')}
</section>`;

    case 'bullets':
      return `<section class="s s-bullets">
  ${heading(section.heading)}
  <ul>
    ${section.items.map((i) => `<li><span class="b-label">${esc(i.label)}</span>${i.detail ? `<span class="b-detail">${esc(i.detail)}</span>` : ''}</li>`).join('\n    ')}
  </ul>
</section>`;

    case 'stats':
      // The source is rendered, not merely stored. An outcome figure a reader cannot trace is the
      // thing this project refuses to publish, so the page shows where each number came from.
      return `<section class="s s-stats">
  ${heading(section.heading)}
  <div class="stat-grid">
    ${section.items.map((i) => `<div class="stat"><span class="stat-value">${esc(i.value)}</span><span class="stat-label">${esc(i.label)}</span><span class="stat-source">${esc(i.source)}</span></div>`).join('\n    ')}
  </div>
</section>`;

    case 'quote':
      return `<section class="s s-quote">
  ${heading(section.heading)}
  ${section.items.map((i) => `<blockquote><p>${esc(i.quote)}</p><footer>${esc(i.attribution)}${i.role ? `<span class="role">${esc(i.role)}</span>` : ''}</footer></blockquote>`).join('\n  ')}
</section>`;

    case 'details':
      return `<section class="s s-details">
  ${heading(section.heading)}
  <dl>
    ${section.rows.map((r) => `<div class="row"><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join('\n    ')}
  </dl>
</section>`;

    case 'faq':
      // <details> rather than JavaScript: the page needs no script to be usable, and a crawler
      // reads the answers either way.
      return `<section class="s s-faq">
  ${heading(section.heading)}
  ${section.items.map((i) => `<details><summary>${esc(i.question)}</summary><p>${esc(i.answer)}</p></details>`).join('\n  ')}
</section>`;

    case 'cta':
      return `<section class="s s-cta">
  <h2>${esc(section.headline)}</h2>
  ${section.body ? `<p>${esc(section.body)}</p>` : ''}
  <div class="cta-row">${renderCta(section.cta)}</div>
</section>`;

    default: {
      // Exhaustiveness guard: a new section type must be handled above or this fails to compile.
      const unhandled: never = section;
      return unhandled;
    }
  }
}

const STYLES = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%}
.wrap{max-width:46rem;margin:0 auto;padding-block:2.5rem 4rem;padding-left:1.25rem;padding-right:1.25rem}
.wordmark{font-weight:600;letter-spacing:.01em;margin-bottom:2.5rem;color:var(--fg-muted)}
h1{font-size:clamp(1.9rem,5vw,2.75rem);line-height:1.15;margin:0 0 1rem;text-wrap:balance}
h2{font-size:clamp(1.3rem,3.5vw,1.6rem);line-height:1.25;margin:0 0 .85rem;text-wrap:balance}
p{margin:0 0 1rem}
img{max-width:100%;height:auto;display:block;border-radius:.5rem}
.s{margin:0 0 3rem}
.lede{font-size:1.15rem;color:var(--fg-muted)}
.audience{display:inline-block;background:var(--accent-soft);color:var(--fg);padding:.4rem .7rem;border-radius:.35rem;font-size:.92rem;margin:0}
.hero-img{margin:1.5rem 0}
.cta-row{margin-top:1.5rem;display:flex;flex-wrap:wrap;gap:.75rem}
.cta{display:inline-block;background:var(--accent);color:var(--accent-contrast);padding:.75rem 1.4rem;border-radius:.4rem;text-decoration:none;font-weight:600}
.cta:hover{filter:brightness(1.08)}
.cta-secondary{background:transparent;color:var(--accent);border:1px solid var(--line)}
.cta:focus-visible,details summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
ul{list-style:none;padding:0;margin:0}
.s-bullets li{padding:.8rem 0;border-bottom:1px solid var(--line)}
.b-label{display:block;font-weight:600}
.b-detail{display:block;color:var(--fg-muted);margin-top:.2rem}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));gap:1.25rem}
.stat{background:var(--bg-elevated);border:1px solid var(--line);border-radius:.5rem;padding:1.1rem}
.stat-value{display:block;font-size:1.9rem;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}
.stat-label{display:block;margin-top:.25rem}
.stat-source{display:block;margin-top:.5rem;font-size:.78rem;color:var(--fg-muted)}
blockquote{margin:0 0 1.25rem;padding:1.1rem 1.25rem;background:var(--bg-elevated);border-left:3px solid var(--accent);border-radius:0 .4rem .4rem 0}
blockquote p{font-size:1.05rem}
blockquote footer{color:var(--fg-muted);font-size:.9rem}
blockquote .role{display:block}
dl{margin:0}
.s-details .row{display:flex;flex-wrap:wrap;gap:.5rem 1rem;padding:.7rem 0;border-bottom:1px solid var(--line)}
dt{font-weight:600;min-width:9rem;margin:0}
dd{margin:0;color:var(--fg-muted);flex:1 1 14rem}
details{border-bottom:1px solid var(--line);padding:.8rem 0}
summary{cursor:pointer;font-weight:600}
details p{margin:.7rem 0 0;color:var(--fg-muted)}
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

  const hero = content.sections.find((s) => s.type === 'hero');
  const title = content.title ?? (hero && hero.type === 'hero' ? hero.headline : brand.name);
  const description = content.description
    ?? (hero && hero.type === 'hero' ? hero.subhead : undefined);
  const canonical = safeHttpUrl(pageUrl);
  const ogImage = content.socialImage ? safeHttpUrl(content.socialImage.src) : null;

  // No site_slug means no data-site, and track.js fatals without one rather than guessing. An
  // untracked page is a real (logged) gap upstream; emitting a broken script tag would be worse.
  const tracker = siteSlug
    ? `<script src="/v1/track.js" data-site="${esc(siteSlug)}" defer></script>`
    : '<!-- tracking omitted: this page has no site_slug -->';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
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
<div class="wrap">
<div class="wordmark">${esc(brand.name)}</div>
${content.sections.map(renderSection).join('\n')}
</div>
${tracker}
</body>
</html>`;

  return { html, branded };
}
