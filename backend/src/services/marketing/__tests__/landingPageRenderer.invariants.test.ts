import { renderLandingPage } from '../landingPageRenderer';
import { parseLandingPageContent, type LandingPageContentShape } from '../../../schemas/landingPageContentSchema';

/**
 * The rules every generated page must keep, whatever the content.
 *
 * WHY THIS FILE EXISTS. Aleem's audit brief asks, after each area, to "make a rule in this
 * project, so that if we create new pages this rule should apply all times without any issues or
 * text overflow". A rule written in a document is a rule until somebody forgets it. These are the
 * same rules as assertions over real rendered output, so a page that breaks one fails the build.
 *
 * EVERY TEST HERE FEEDS HOSTILE CONTENT. The interesting failures are not "does a tidy page
 * render" - it does - but what happens to a pasted URL, a 200-character unbroken string, the
 * maximum number of items, and every optional field missing at once. That is where overflow,
 * collisions and empty blocks come from.
 *
 * A note on what is NOT asserted: this cannot measure a contrast ratio or a rendered width,
 * because there is no browser here. It asserts the DECLARATIONS that make those properties hold -
 * which is why each one names the failure it prevents rather than just matching a string.
 */

const BRAND = { name: 'Colaberry Training', default_theme_key: 'training' };

function render(content: LandingPageContentShape) {
  return renderLandingPage({
    content,
    brand: BRAND,
    siteSlug: 'training',
    pageUrl: 'https://enterprise.colaberry.ai/lp/colaberry-training/x',
  });
}

/**
 * Parsed through the real schema, so no test can assert on a shape the system would refuse.
 *
 * THROWS on an invalid fixture rather than casting. The first version of this cast the result
 * object to the content type, which compiled, hid that the fixture broke the schema's length
 * limits, and handed the renderer an object with no `sections` at all.
 */
function content(raw: unknown): LandingPageContentShape {
  const r = parseLandingPageContent(raw);
  if (!r.ok) throw new Error(`fixture is not valid content: ${r.problems.join('; ')}`);
  return r.content;
}

/**
 * Long enough to overflow the narrowest column here (a 14rem card), short enough to be content
 * the schema accepts - a headline is capped at 160, so 200 was simply rejected and tested
 * nothing. The point is an unbroken RUN, not a long string.
 */
const UNBREAKABLE = 'A'.repeat(120);
const LONG_URL = `https://example.com/${'segment-'.repeat(20)}end`;

const HOSTILE = content({
  sections: [
    {
      type: 'hero',
      headline: `Start here ${UNBREAKABLE}`,
      subhead: LONG_URL,
      audience: 'Analysts, engineers, and anyone else',
      cta: { label: 'Start for $0', href: '/apply' },
      panel: {
        title: 'What is inside',
        items: Array.from({ length: 8 }, (_, i) => ({ label: `${UNBREAKABLE.slice(0, 60)} ${i}`, note: `Module ${i + 1}` })),
        footnote: '9 modules',
      },
    },
    { type: 'bullets', heading: UNBREAKABLE, variant: 'cards', items: Array.from({ length: 12 }, () => ({ label: UNBREAKABLE, detail: LONG_URL })) },
    { type: 'bullets', heading: 'Who it is for', variant: 'checks', items: [{ label: UNBREAKABLE }] },
    { type: 'details', rows: [{ label: UNBREAKABLE.slice(0, 100), value: LONG_URL }] },
    { type: 'faq', items: [{ question: UNBREAKABLE, answer: LONG_URL }] },
    { type: 'cta', headline: 'Start today', cta: { label: 'Apply', href: '/apply' } },
  ],
});

/** Every optional field absent - the other end of the range. */
const BARE = content({
  sections: [
    { type: 'hero', headline: 'One line' },
    { type: 'bullets', items: [{ label: 'One' }] },
  ],
});

describe('text cannot push the page sideways', () => {
  it('declares a break rule that applies inside grid and flex children', () => {
    // `break-word` does not apply inside a flex/grid item, and every card, check row and panel
    // row is one. A pasted URL in a card used to widen the whole page.
    expect(render(HOSTILE).html).toContain('overflow-wrap:anywhere');
  });

  it('keeps that rule on the body, so it is inherited rather than opted into per section', () => {
    expect(render(BARE).html).toMatch(/body\{[^}]*overflow-wrap:anywhere/);
  });

  it('never gives anything a min-width wider than a small phone', () => {
    // 320px is the narrowest real viewport. A larger min-width is an element that cannot fit.
    const css = render(HOSTILE).html;
    const minWidths = [...css.matchAll(/min-width:\s*([\d.]+)rem/g)].map((m) => Number(m[1]));
    const inMediaQueries = [...css.matchAll(/@media\s*\(min-width:\s*([\d.]+)rem/g)].map((m) => Number(m[1]));
    const elementMinWidths = minWidths.filter((w) => !inMediaQueries.includes(w));
    elementMinWidths.forEach((w) => expect(w).toBeLessThanOrEqual(20));
  });
});

describe('the page states its own rendering contract', () => {
  it('declares a colour scheme, so a dark-mode browser does not restyle controls against it', () => {
    expect(render(BARE).html).toContain('color-scheme:light');
  });

  it('carries a viewport meta, without which every clamp() and media query is moot', () => {
    expect(render(BARE).html).toMatch(/<meta name="viewport"[^>]*width=device-width/);
  });

  it('honours a reduced-motion preference', () => {
    expect(render(BARE).html).toContain('prefers-reduced-motion');
  });
});

describe('a keyboard can be seen', () => {
  it('gives every link a focus ring, not only the buttons', () => {
    // A link inside prose was reachable and gave no sign of where focus was.
    //
    // BOUNDARY-ANCHORED on purpose. The first version matched /a:focus-visible/, which is a
    // SUBSTRING of `.cta:focus-visible` - so it passed with the link rule deleted, and a mutation
    // run proved it could not fail. The selector has to start at a boundary to be this rule.
    expect(render(HOSTILE).html).toMatch(/(^|[,{}\s])a:focus-visible[^{]*\{[^}]*outline:/m);
  });
});

describe('headings describe a structure, not a size', () => {
  it('has exactly one h1, however many sections there are', () => {
    const html = render(HOSTILE).html;
    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
  });

  it('still has exactly one h1 on a page with almost nothing in it', () => {
    expect((render(BARE).html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
  });

  it('never opens a section at h3 with no h2 above it', () => {
    const html = render(HOSTILE).html;
    if (html.includes('<h3')) expect(html.indexOf('<h2')).toBeLessThan(html.indexOf('<h3'));
  });
});

describe('the hero panel states contents, never a reader\'s progress', () => {
  it('renders the rows it was given', () => {
    expect(render(HOSTILE).html).toContain('What is inside');
    expect(render(HOSTILE).html).toContain('Module 1');
  });

  it('adds no status wording of its own', () => {
    // The reference design ticks modules off as "Complete" / "In progress". On a page a stranger
    // is seeing for the first time those are claims about them that are not true, so the renderer
    // contributes no such word - only what the brief put in a row.
    const html = render(HOSTILE).html;
    ['In progress', 'Complete', 'completed', '% done'].forEach((w) => expect(html).not.toContain(w));
  });

  it('lays the hero out as two columns only when there is something to put beside the copy', () => {
    // Asserted on the APPLIED class, not on the bare string: `hero-split` is also a selector in
    // the inline stylesheet, so `not.toContain('hero-split')` could never pass however the hero
    // was laid out.
    expect(render(HOSTILE).html).toContain('class="hero-grid hero-split"');
    expect(render(BARE).html).toContain('class="hero-grid"');
    expect(render(BARE).html).not.toContain('class="hero-grid hero-split"');
  });
});

describe('nothing renders as an empty shell', () => {
  it('omits the blocks whose content is absent rather than drawing empty ones', () => {
    const html = render(BARE).html;
    expect(html).not.toContain('class="panel"');
    expect(html).not.toContain('class="cta-row"');
    expect(html).not.toContain('<p class="lede"></p>');
  });
});
