import { esc } from '../classKit/kitRenderUtils';
import { safeHttpUrl } from '../caseStudy/caseStudyPublicSections';
import type { LandingPageSection } from '../../schemas/landingPageContentSchema';

/**
 * One render function per section type, plus the small helpers they share.
 *
 * Split out of landingPageRenderer.ts on 2026-10-09, which had reached 542 lines against
 * CLAUDE.md's 500-line ceiling. The document shell (head, header, band loop, footer) stayed
 * behind; everything that draws the INSIDE of a band lives here.
 *
 * EVERYTHING IS STILL ESCAPED. These strings are operator-supplied JSON served from the same
 * hostname as the admin app, so an unescaped field is stored XSS with an admin session one tab
 * away. That property moved with the code and is not weakened by the split.
 */

export type Cta = { label: string; href: string; style?: 'primary' | 'secondary' };

export function safeHref(raw: string): string | null {
  const absolute = safeHttpUrl(raw);
  if (absolute) return absolute;
  // `//evil.example.com` is protocol-relative, not site-relative: it leaves our origin.
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return null;
}


export function renderCta(cta: Cta, extraClass = ''): string {
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

/**
 * The card beside the hero headline: what this thing contains.
 *
 * Not a progress card. See the schema - rows state contents, never a reader's state.
 */
function renderPanel(panel: { title: string; items: Array<{ label: string; note?: string }>; footnote?: string }): string {
  const rows = panel.items.map((i) => `<li><span class="panel-label">${esc(i.label)}</span>`
    + `${i.note ? `<span class="panel-note">${esc(i.note)}</span>` : ''}</li>`).join('');
  return `<aside class="panel">`
    + `<p class="panel-title">${esc(panel.title)}</p>`
    + `<ul class="panel-list">${rows}</ul>`
    + `${panel.footnote ? `<p class="panel-foot">${esc(panel.footnote)}</p>` : ''}`
    + `</aside>`;
}

export function renderSectionBody(section: LandingPageSection): string {
  switch (section.type) {
    case 'hero':
      // Split when there is something to put beside the copy - a panel or an image. With
      // neither, one column reads better than a column plus a gap.
      return `<div class="hero-grid${section.image || section.panel ? ' hero-split' : ''}">
<div class="hero-copy">
${renderEyebrow(section.eyebrow)}
<h1>${renderHeadline(section.headline, section.headlineAccent)}</h1>
${section.subhead ? `<p class="lede">${esc(section.subhead)}</p>` : ''}
${section.audience ? renderAudience(section.audience) : ''}
${section.cta ? `<div class="cta-row">${renderCta(section.cta)}</div>` : ''}
</div>
${section.panel ? renderPanel(section.panel) : ''}${!section.panel && section.image ? `<div class="hero-img">${renderImage(section.image)}</div>` : ''}
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
