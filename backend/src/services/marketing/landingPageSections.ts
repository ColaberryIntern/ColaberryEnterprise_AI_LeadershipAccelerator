import { esc } from '../classKit/kitRenderUtils';
import { safeHttpUrl } from '../caseStudy/caseStudyPublicSections';
import type { LandingPageSection } from '../../schemas/landingPageContentSchema';
import { iconFor, tileTone } from './landingPageIcons';

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
/**
 * Paint one exact substring, leaving the rest escaped and untouched.
 *
 * The single rule behind headlineAccent, headingAccent, text emphasis and callout highlights.
 * A phrase that is not found returns the plain escaped string: the alternatives - appending it,
 * or matching fuzzily - would silently rewrite a sentence somebody approved. Written once so
 * four features cannot drift into four behaviours.
 */
function paintPhrase(whole: string, phrase: string | undefined, cls: string): string {
  if (!phrase) return esc(whole);
  const at = whole.indexOf(phrase);
  if (at === -1) return esc(whole);
  return `${esc(whole.slice(0, at))}<span class="${cls}">${esc(phrase)}</span>`
    + `${esc(whole.slice(at + phrase.length))}`;
}

function renderHeadline(headlineText: string, accent: string | undefined): string {
  return paintPhrase(headlineText, accent, 'hl');
}

/** A heading with one accented phrase. Same rule as the headline. */
function headingWith(value: string | undefined, accent: string | undefined): string {
  return value ? `<h2>${paintPhrase(value, accent, 'hl')}</h2>` : '';
}

/** Several phrases inside one paragraph, each set bold in the tertiary colour. */
function paintMany(whole: string, phrases: ReadonlyArray<string> | undefined): string {
  if (!phrases || phrases.length === 0) return esc(whole);
  // One phrase at a time against the ESCAPED-SAFE split, so a phrase cannot match inside the
  // markup a previous phrase introduced.
  let parts: Array<{ text: string; painted: boolean }> = [{ text: whole, painted: false }];
  for (const phrase of phrases) {
    if (!phrase) continue;
    const next: typeof parts = [];
    for (const part of parts) {
      if (part.painted) { next.push(part); continue; }
      const at = part.text.indexOf(phrase);
      if (at === -1) { next.push(part); continue; }
      if (at > 0) next.push({ text: part.text.slice(0, at), painted: false });
      next.push({ text: phrase, painted: true });
      const rest = part.text.slice(at + phrase.length);
      if (rest) next.push({ text: rest, painted: false });
    }
    parts = next;
  }
  return parts.map((p) => (p.painted ? `<em class="em">${esc(p.text)}</em>` : esc(p.text))).join('');
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
  items: ReadonlyArray<{ label: string; detail?: string; icon?: string }>,
  variant: 'cards' | 'checks' | 'steps' | 'grid',
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
  if (variant === 'grid') {
    // One bordered block with hairlines between cells, not separate cards. The reference uses
    // this for an 8-item sequence, where eight shadowed cards would read as eight products.
    return `<ol class="gridlist">${items.map((i, n) => `<li>`
      + `<span class="grid-n">${String(n + 1).padStart(2, '0')}</span>`
      + `<span class="b-label">${esc(i.label)}</span>${detail(i.detail)}</li>`).join('')}</ol>`;
  }
  return `<ul class="cards">${items.map((i, n) => `<li>`
    + `<span class="tile tile--${tileTone(n)}">${iconFor(i.icon, n)}</span>`
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
function renderPanel(panel: {
  eyebrow?: string; title: string; badge?: string;
  items: Array<{ label: string; note?: string }>; footnote?: string;
}): string {
  // Each row carries an index marker. The FIRST is filled, as a start-here cue and nothing
  // more, labelled for a screen reader as exactly that. The reference fills markers to show
  // modules a reader has finished; on a page a stranger just opened that is a claim about them
  // which is untrue, and this renderer does not make it.
  const rows = panel.items.map((row, n) => {
    const mark = n === 0
      ? '<span class="pmark pmark--start"><span class="vh">Start here</span>'
        + '<span aria-hidden="true">&#10003;</span></span>'
      : `<span class="pmark" aria-hidden="true">${n + 1}</span>`;
    const note = row.note ? `<span class="panel-note">${esc(row.note)}</span>` : '';
    return `<li>${mark}<span class="panel-label">${esc(row.label)}</span>${note}</li>`;
  }).join('');

  // The TRUE count, taken from the rows. Never a percentage, never a progress figure.
  const total = panel.items.length;
  const bar = panel.items.map((_row, n) => `<span class="seg${n === 0 ? ' seg--on' : ''}"></span>`).join('');
  const eyebrowEl = panel.eyebrow ? `<p class="panel-eyebrow">${esc(panel.eyebrow)}</p>` : '';
  const badgeEl = panel.badge ? `<span class="panel-badge">${esc(panel.badge)}</span>` : '';
  const footEl = panel.footnote ? `<p class="panel-note-l">${esc(panel.footnote)}</p>` : '';

  return `<aside class="panel">`
    + `<div class="panel-head"><div>${eyebrowEl}`
    + `<p class="panel-title">${esc(panel.title)}</p></div>${badgeEl}</div>`
    + `<ul class="panel-list">${rows}</ul>`
    + `<div class="panel-foot"><span class="panel-foot-l">Your path</span>`
    + `<span class="panel-count">${total} ${total === 1 ? 'module' : 'modules'}</span>`
    + `<span class="panel-bar" aria-hidden="true">${bar}</span></div>`
    + footEl + `</aside>`;
}

/** A takeaway strip under a list, with up to three brand-coloured phrases. */
function renderCallout(c: {
  lead?: string; text: string; tone?: 'plain' | 'success';
  highlights?: ReadonlyArray<{ phrase: string; color: 'accent' | 'accent-2' | 'accent-3' }>;
}): string {
  // Painted one phrase at a time over the already-split pieces, so a highlight cannot match
  // inside the markup an earlier highlight introduced.
  let parts: Array<{ text: string; cls: string | null }> = [{ text: c.text, cls: null }];
  for (const h of c.highlights ?? []) {
    const next: typeof parts = [];
    for (const part of parts) {
      if (part.cls) { next.push(part); continue; }
      const at = part.text.indexOf(h.phrase);
      if (at === -1 || !h.phrase) { next.push(part); continue; }
      if (at > 0) next.push({ text: part.text.slice(0, at), cls: null });
      next.push({ text: h.phrase, cls: `c-${h.color}` });
      const rest = part.text.slice(at + h.phrase.length);
      if (rest) next.push({ text: rest, cls: null });
    }
    parts = next;
  }
  const body = parts.map((p) => (p.cls ? `<span class="${p.cls}">${esc(p.text)}</span>` : esc(p.text))).join('');
  const tone = c.tone === 'success' ? ' callout--success' : '';
  return `<div class="callout${tone}">`
    + `${c.lead ? `<span class="callout-lead">${esc(c.lead)}</span>` : ''}`
    + `<span class="callout-text">${body}</span></div>`;
}

/** What people do today, then what becomes possible. */
function renderContrast(c: {
  title: string; chips: ReadonlyArray<string>; caption?: string;
  resultEyebrow?: string; resultLine: string;
}): string {
  return `<div class="contrast">`
    + `<div class="contrast-card"><p class="contrast-title">${esc(c.title)}</p>`
    + `<ul class="chips">${c.chips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
    + `${c.caption ? `<p class="contrast-cap">${esc(c.caption)}</p>` : ''}</div>`
    + `<div class="contrast-arrow" aria-hidden="true">&darr;</div>`
    + `<div class="contrast-result">`
    + `${c.resultEyebrow ? `<p class="eyebrow">${esc(c.resultEyebrow)}</p>` : ''}`
    + `<p class="contrast-line">${esc(c.resultLine)}</p></div></div>`;
}

/** A supporting card beside prose: "in the full program, learners...". */
function renderAside(a: { title: string; items: ReadonlyArray<string> }): string {
  return `<aside class="sidecard"><p class="sidecard-title">${esc(a.title)}</p>`
    + `<ul class="sidecard-list">${a.items.map((x, n) => `<li>`
    + `<span class="dot dot--${tileTone(n)}" aria-hidden="true"></span>${esc(x)}</li>`).join('')}</ul></aside>`;
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
${section.body ? `<p class="prose">${esc(section.body)}</p>` : ''}
${section.kicker ? `<p class="hero-kicker">${esc(section.kicker)}</p>` : ''}
${section.cta ? `<div class="cta-row">${renderCta(section.cta)}</div>` : ''}
${section.ctaNote ? `<p class="cta-note">${esc(section.ctaNote)}</p>` : ''}
${section.audience ? renderAudience(section.audience) : ''}
</div>
${section.panel ? renderPanel(section.panel) : ''}${!section.panel && section.image ? `<div class="hero-img">${renderImage(section.image)}</div>` : ''}
</div>`;

    case 'text': {
      const prose = `<div class="prose">${section.paragraphs
        .map((para) => `<p>${paintMany(para, section.emphasis)}</p>`).join('')}</div>`
        + `${section.kicker ? `<p class="kicker">${esc(section.kicker)}</p>` : ''}`
        + `${section.cta ? `<div class="cta-row">${renderCta(section.cta)}</div>` : ''}`;
      // Heading left, body right. A heading stacked on top of a 42rem column leaves half the
      // page empty at desktop width, which is most of what makes a page read as a document
      // rather than as a designed one. With no heading there is no left column to make.
      const head = `${renderEyebrow(section.eyebrow)}${headingWith(section.heading, section.headingAccent)}`;
      const tail = section.callout ? renderCallout(section.callout) : '';
      // A contrast visual or a side card claims the right column, so the prose moves LEFT under
      // the heading. With neither, the original shape stands: heading left, prose right.
      if (section.contrast) return split(`${head}${prose}`, renderContrast(section.contrast)) + tail;
      if (section.aside) return split(`${head}${prose}`, renderAside(section.aside)) + tail;
      return (section.heading ? split(head, prose) : `${head}${prose}`) + tail;
    }

    case 'bullets': {
      const variant = section.variant ?? 'cards';
      const head = `${renderEyebrow(section.eyebrow)}${headingWith(section.heading, section.headingAccent)}`
        + `${section.intro ? `<p class="intro">${esc(section.intro)}</p>` : ''}`
        + `${(section.paragraphs ?? []).map((para) => `<p class="prose">${esc(para)}</p>`).join('')}`
        + `${section.kicker ? `<p class="kicker">${esc(section.kicker)}</p>` : ''}`;
      const items = `${section.itemsLabel ? `<p class="items-label">${esc(section.itemsLabel)}</p>` : ''}`
        + renderBulletItems(section.items, variant)
        + `${section.cta ? `<div class="cta-row">${renderCta(section.cta)}</div>` : ''}`;
      const after = section.callout ? renderCallout(section.callout) : '';
      // A qualifying list is narrow and pairs with its heading; a card or step grid needs the
      // full width and takes its heading above it.
      // A qualifying list, or a section that argues before it lists, pairs with its heading in
      // two columns. A card, step or grid block needs the full width, with the heading above.
      const paired = (variant === 'checks' || (section.paragraphs?.length ?? 0) > 0) && Boolean(section.heading);
      return (paired ? split(head, items) : `${head}${items}`) + after;
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
${section.subhead ? `<p class="closer-sub">${esc(section.subhead)}</p>` : ''}
${section.body ? `<p class="lede">${esc(section.body)}</p>` : ''}
<div class="cta-row">${renderCta(section.cta)}</div>
${section.ctaNote ? `<p class="cta-note">${esc(section.ctaNote)}</p>` : ''}
</div>`;

    default: {
      // Exhaustiveness guard: a new section type must be handled above or this fails to compile.
      const unhandled: never = section;
      return unhandled;
    }
  }
}
