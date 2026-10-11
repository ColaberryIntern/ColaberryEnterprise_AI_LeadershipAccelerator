import { renderLandingPage } from '../landingPageRenderer';
import { landingPageSectionSchema, parseLandingPageContent, type LandingPageContentShape } from '../../../schemas/landingPageContentSchema';
import { LANDING_PAGE_THEMES, NEUTRAL_THEME, themeForLandingPage } from '../landingPageTheme';

/**
 * The HTML a stranger receives.
 *
 * This page is built from operator-supplied JSON and served from the same hostname as the admin
 * app, so the escaping tests here are the security boundary, not a formatting preference. The
 * OG tests matter for a different reason: the whole argument for rendering this server-side
 * rather than as a React route is that a crawler can read the card.
 */

const BRAND = { name: 'Colaberry Training', default_theme_key: 'training' };
const FLOTATION = { name: 'AI Flotation', default_theme_key: 'ai-flotation' };
/** A brand whose palette and lockup genuinely have not been agreed. */
const UNBRANDED = { name: 'Colaberry Enterprise', default_theme_key: 'enterprise' };

function render(content: LandingPageContentShape, over: Partial<Parameters<typeof renderLandingPage>[0]> = {}) {
  return renderLandingPage({
    content,
    brand: BRAND,
    siteSlug: 'training',
    pageUrl: 'https://enterprise.colaberry.ai/lp/colaberry-training/six-week-build',
    ...over,
  });
}

/** Parse through the real schema, so a test can never assert on a shape the system would refuse. */
function content(raw: unknown): LandingPageContentShape {
  const r = parseLandingPageContent(raw);
  if (!r.ok) throw new Error(`fixture is not valid content: ${r.problems.join('; ')}`);
  return r.content;
}

const MINIMAL = content({ sections: [{ type: 'hero', headline: 'Ship an AI project in six weeks' }] });

describe('nothing an operator types can become markup', () => {
  it('escapes angle brackets in a headline', () => {
    const { html } = render(content({
      sections: [{ type: 'hero', headline: '<script>alert(1)</script>' }],
    }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes quotes, so copy cannot break out of an attribute', () => {
    const { html } = render(content({
      sections: [{ type: 'cta', headline: 'Apply', cta: { label: '" onmouseover="alert(1)', href: '/apply' } }],
    }));
    expect(html).not.toContain('onmouseover="alert(1)"');
    expect(html).toContain('&quot;');
  });

  it('escapes an image alt attribute', () => {
    const { html } = render(content({
      sections: [{
        type: 'hero', headline: 'H',
        image: { src: 'https://cdn.example.com/a.png', alt: '"><script>alert(1)</script>' },
      }],
    }));
    expect(html).not.toMatch(/alt="">/);
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes the OG description, which is an attribute a crawler reads', () => {
    const { html } = render(content({
      sections: [{ type: 'hero', headline: 'H' }],
      description: 'Great value" /><meta property="og:title" content="pwned',
    }));
    const ogTitles = html.match(/property="og:title"/g) ?? [];
    // One, from us. If the description injected a second, the card could be rewritten.
    expect(ogTitles).toHaveLength(1);
  });

  it('leaves no raw unescaped angle bracket from any text field anywhere', () => {
    // NOTE on how this is asserted. `onerror=alert(1)` contains no character `esc` touches, so
    // it survives escaping verbatim as inert text - searching for it would fail on correct
    // output. What makes the payload dangerous is the raw `<` that would open a tag, so that is
    // what is asserted: every `<` in the document must belong to markup the renderer wrote.
    const nasty = '</style><img src=x onerror=alert(1)>';
    const { html } = render(content({
      title: nasty,
      description: nasty,
      sections: [
        { type: 'hero', headline: nasty, subhead: nasty, audience: nasty },
        { type: 'text', paragraphs: [nasty] },
        { type: 'bullets', items: [{ label: nasty, detail: nasty }] },
        { type: 'stats', items: [{ value: nasty, label: nasty, source: nasty }] },
        { type: 'quote', items: [{ quote: nasty, attribution: nasty, role: nasty }] },
        { type: 'details', rows: [{ label: nasty, value: nasty }] },
        { type: 'faq', items: [{ question: nasty, answer: nasty }] },
        { type: 'cta', headline: nasty, body: nasty, cta: { label: nasty, href: '/apply' } },
      ],
    }));
    // No `<img` tag was opened by the payload, and no `</style>` escaped the stylesheet.
    //
    // Asserted against the SRC rather than against `loading=`. The header now carries the brand
    // lockup, which is an `<img>` the renderer emitted and deliberately does NOT lazy-load - it
    // is the first thing above the fold. So the property worth pinning is that every `<img>` in
    // the document has a src the renderer validated, and that the payload's bare `src=x` never
    // becomes one.
    const imgTags = html.match(/<img[^>]*>/g) ?? [];
    expect(imgTags.every((tag) => /\ssrc="(\/|https?:\/\/)[^"]*"/.test(tag))).toBe(true);
    expect(html).not.toMatch(/<img[^>]*\ssrc=x/);
    expect(html).not.toContain('</style><img');
    // The payload IS present, escaped - proving the text was rendered and merely defanged,
    // rather than silently dropped, which would make this test pass for the wrong reason.
    expect(html).toContain('&lt;/style&gt;&lt;img src=x onerror=alert(1)&gt;');

    // The only `<` characters are tag openers the renderer itself emitted. Strip every tag and
    // nothing resembling a tag may remain in the text.
    const textOnly = html.replace(/<[^>]*>/g, '');
    expect(textOnly).not.toContain('<');
  });
});

describe('links', () => {
  it('keeps an absolute https CTA', () => {
    const { html } = render(content({
      sections: [{ type: 'cta', headline: 'Go', cta: { label: 'Apply', href: 'https://enterprise.colaberry.ai/apply' } }],
    }));
    expect(html).toContain('href="https://enterprise.colaberry.ai/apply"');
  });

  it('keeps a site-relative CTA, which safeHttpUrl alone would reject', () => {
    const { html } = render(content({
      sections: [{ type: 'cta', headline: 'Go', cta: { label: 'Apply', href: '/apply' } }],
    }));
    expect(html).toContain('href="/apply"');
  });

  it('drops a protocol-relative href rather than rendering an off-origin link', () => {
    // The schema refuses this on write; the renderer refuses it again, because a row can be
    // written by a path that bypassed the schema.
    const { html } = renderLandingPage({
      content: { sections: [{ type: 'cta', headline: 'Go', cta: { label: 'Apply', href: '//evil.example.com' } }] } as LandingPageContentShape,
      brand: BRAND, siteSlug: 'training', pageUrl: 'https://enterprise.colaberry.ai/lp/b/s',
    });
    expect(html).not.toContain('evil.example.com');
  });

  it('drops a javascript: href', () => {
    const { html } = renderLandingPage({
      content: { sections: [{ type: 'cta', headline: 'Go', cta: { label: 'Apply', href: 'javascript:alert(1)' } }] } as LandingPageContentShape,
      brand: BRAND, siteSlug: 'training', pageUrl: 'https://enterprise.colaberry.ai/lp/b/s',
    });
    expect(html).not.toContain('javascript:');
  });

  it('marks every CTA with data-track-cta, which is what track.js watches', () => {
    const { html } = render(content({
      sections: [{ type: 'cta', headline: 'Go', cta: { label: 'Apply now', href: '/apply' } }],
    }));
    expect(html).toContain('data-track-cta="Apply now"');
  });
});

describe('the social card, which is the reason this is server-rendered', () => {
  it('sets og:title from the hero when no explicit title is given', () => {
    const { html } = render(MINIMAL);
    expect(html).toContain('<meta property="og:title" content="Ship an AI project in six weeks">');
    expect(html).toContain('<title>Ship an AI project in six weeks</title>');
  });

  it('prefers the explicit title', () => {
    const { html } = render(content({ title: 'Six-week AI build', sections: [{ type: 'hero', headline: 'H' }] }));
    expect(html).toContain('<title>Six-week AI build</title>');
  });

  it('uses summary_large_image only when there is actually an image', () => {
    expect(render(MINIMAL).html).toContain('name="twitter:card" content="summary"');
    const withImage = render(content({
      sections: [{ type: 'hero', headline: 'H' }],
      socialImage: { src: 'https://enterprise.colaberry.ai/og.png', alt: 'Cohort' },
    }));
    expect(withImage.html).toContain('content="summary_large_image"');
    expect(withImage.html).toContain('<meta property="og:image" content="https://enterprise.colaberry.ai/og.png">');
    expect(withImage.html).toContain('property="og:image:alt"');
  });

  it('sets a canonical url', () => {
    expect(render(MINIMAL).html).toContain('<link rel="canonical" href="https://enterprise.colaberry.ai/lp/colaberry-training/six-week-build">');
  });
});

describe('tracking', () => {
  it('loads the real tracker with data-site from the row, not a hand-rolled beacon', () => {
    const { html } = render(MINIMAL);
    expect(html).toContain('<script src="/v1/track.js" data-site="training" defer></script>');
  });

  it('omits the tracker rather than emitting one track.js will fatal on', () => {
    // track.js logs a FATAL and does nothing without data-site, so a tag with an empty
    // attribute would look installed and track nothing.
    const { html } = render(MINIMAL, { siteSlug: null });
    expect(html).not.toContain('/v1/track.js');
    expect(html).toContain('tracking omitted');
  });

  it('carries no inline script, so the CSP never needs unsafe-inline for scripts', () => {
    const { html } = render(MINIMAL);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/);
  });
});

/**
 * The page is a designed document, not a stack of blocks. Ali, 2026-10-05, holding it next to a
 * page he had designed himself: "Yours is the Hello World version."
 */
describe('the page has a structure a reader can navigate', () => {
  it('opens with a sticky header carrying the lockup and the page CTA', () => {
    const { html } = render(content({
      sections: [{ type: 'hero', headline: 'Start here', cta: { label: 'Sign up', href: '/portal/signup' } }],
    }));
    expect(html).toContain('<header class="site-head">');
    expect(html).toContain('colaberry-horizontal.png');
    // The header reuses the page's own first CTA rather than inventing a second destination.
    expect(html.match(/href="\/portal\/signup"/g)).toHaveLength(2);
  });

  it('a page with no CTA anywhere gets a header with no button, not an invented one', () => {
    const { html } = render(MINIMAL);
    expect(html).toContain('<header class="site-head">');
    expect(html).not.toContain('data-track-cta');
  });

  it('closes with a footer', () => {
    expect(render(MINIMAL).html).toContain('<footer class="site-foot">');
  });

  it('alternates bands so a long page reads as chapters rather than one column', () => {
    const { html } = render(content({
      sections: [
        { type: 'hero', headline: 'H' },
        { type: 'text', paragraphs: ['One.'] },
        { type: 'text', paragraphs: ['Two.'] },
        { type: 'cta', headline: 'Go', cta: { label: 'Apply', href: '/apply' } },
      ],
    }));
    const bands = [...html.matchAll(/<section class="band band--([a-z]+)/g)].map((m) => m[1]);
    // Hero opens tinted, the closer takes the brand colour, the middle alternates.
    expect(bands).toEqual(['subtle', 'default', 'subtle', 'accent']);
  });

  it('never paints two auto-assigned bands the same colour in a row', () => {
    // The bug this pins: resolving per-index, `index % 2` did not know the hero had been forced
    // to `subtle`, so the section after it computed `subtle` too and the two merged into one
    // grey slab with a dead gap in it. Alternation is a property of the run, not of the index.
    const { html } = render(content({
      sections: [
        { type: 'hero', headline: 'H' },
        ...Array.from({ length: 6 }, (_, i) => ({ type: 'text', paragraphs: [`P${i}`] })),
      ],
    }));
    const bands = [...html.matchAll(/<section class="band band--([a-z]+)/g)].map((m) => m[1]);
    expect(bands).toHaveLength(7);
    const adjacentRepeats = bands.filter((b, i) => i > 0 && bands[i - 1] === b);
    expect(adjacentRepeats).toEqual([]);
  });

  it('drops the seam between two bands the author deliberately gave the same tone', () => {
    // A dark block holding copy AND cards is two sections but one visual object; full padding on
    // both sides of the seam reads as a gulf.
    const { html } = render(content({
      sections: [
        { type: 'text', tone: 'inverse', paragraphs: ['Lead-in.'] },
        { type: 'bullets', tone: 'inverse', variant: 'steps', items: [{ label: 'One' }] },
      ],
    }));
    // Counted on the section tags only. A bare /band--joined/g also matches the CSS rule that
    // defines the class, so it reports one more than the number of joined sections.
    const joinedSections = html.match(/<section class="band [^"]*band--joined/g) ?? [];
    // Only the second one is joined - the first still opens the block normally.
    expect(joinedSections).toHaveLength(1);
    expect(html).toContain('.band--joined{padding-top:0}');
  });

  it('lets the content override the band, which is how a dark section happens', () => {
    const { html } = render(content({
      sections: [{ type: 'text', tone: 'inverse', paragraphs: ['On black.'] }],
    }));
    expect(html).toContain('band--inverse');
  });

  it('is deterministic - the same content renders byte-identically twice', () => {
    // A tone chosen at random, or from the clock, would make two publishes of one draft disagree.
    const c = content({
      sections: [
        { type: 'hero', headline: 'H' }, { type: 'text', paragraphs: ['A.'] },
        { type: 'bullets', items: [{ label: 'B' }] },
      ],
    });
    expect(render(c).html).toBe(render(c).html);
  });
});

describe('sections carry the shape the brief gave them', () => {
  it('renders the eyebrow, which the schema used to throw away', () => {
    const { html } = render(content({
      sections: [{ type: 'text', eyebrow: 'Why start now?', heading: 'H', paragraphs: ['P.'] }],
    }));
    expect(html).toContain('<p class="eyebrow">Why start now?</p>');
  });

  it.each([
    ['checks', 'class="checks"'],
    ['steps', 'class="steps"'],
    ['cards', 'class="cards"'],
  ])('draws %s bullets as their own thing', (variant, marker) => {
    const { html } = render(content({
      sections: [{ type: 'bullets', variant, items: [{ label: 'An item' }] }],
    }));
    expect(html).toContain(marker);
    expect(html).toContain('An item');
  });

  it('numbers steps from 01, so the sequence is readable as a sequence', () => {
    const { html } = render(content({
      sections: [{ type: 'bullets', variant: 'steps', items: [{ label: 'First' }, { label: 'Second' }] }],
    }));
    expect(html).toContain('<span class="step-n">01</span>');
    expect(html).toContain('<span class="step-n">02</span>');
  });

  it('bullets with no variant still render, because variant is optional', () => {
    const { html } = render(content({ sections: [{ type: 'bullets', items: [{ label: 'Plain' }] }] }));
    expect(html).toContain('class="cards"');
    expect(html).toContain('Plain');
  });

  it('splits the audience into pills on commas', () => {
    const { html } = render(content({
      sections: [{ type: 'hero', headline: 'H', audience: 'beginners, working professionals, and builders' }],
    }));
    expect(html).toContain('<li>beginners</li>');
    expect(html).toContain('<li>working professionals</li>');
    // The leading "and" is stripped rather than rendered as part of the last pill.
    expect(html).toContain('<li>builders</li>');
    expect(html).not.toContain('and builders');
  });

  it('an audience with no commas stays one pill instead of being guessed apart', () => {
    const { html } = render(content({
      sections: [{ type: 'hero', headline: 'H', audience: 'working data analysts' }],
    }));
    expect(html).toContain('<li>working data analysts</li>');
  });

  it('paints the accent phrase inside the headline', () => {
    const { html } = render(content({
      sections: [{ type: 'hero', headline: 'Start learning AI today', headlineAccent: 'learning AI' }],
    }));
    expect(html).toContain('Start <span class="hl">learning AI</span> today');
  });

  it('leaves the headline untouched when the accent phrase is not in it', () => {
    // The dangerous failure would be appending it, or highlighting a near-match: either silently
    // rewrites a headline somebody approved.
    const { html } = render(content({
      sections: [{ type: 'hero', headline: 'Start learning AI today', headlineAccent: 'nowhere near it' }],
    }));
    expect(html).toContain('<h1>Start learning AI today</h1>');
    expect(html).not.toContain('nowhere near it');
  });

  it('escapes an accent phrase rather than letting it open a tag', () => {
    const { html } = render(content({
      sections: [{ type: 'hero', headline: 'Before <img src=x> after', headlineAccent: '<img src=x>' }],
    }));
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toMatch(/<img[^>]*\ssrc=x/);
  });
});

describe('theming is honest about what has been decided', () => {
  it('uses the agreed palette for the one brand that has one', () => {
    const { html, branded } = render(MINIMAL, { brand: FLOTATION });
    expect(branded).toBe(true);
    expect(html).toContain(LANDING_PAGE_THEMES['ai-flotation']['--accent']);
  });

  it('renders neutral for a brand with no agreed palette, and says so in the result', () => {
    // `enterprise`, not the default BRAND: `training` HAS an agreed palette now (the Colaberry
    // School Style Guide), so using it here would assert the opposite of what it says.
    const { html, branded } = render(MINIMAL, { brand: UNBRANDED });
    expect(branded).toBe(false);
    expect(html).toContain(NEUTRAL_THEME['--accent']);
  });

  it('paints Colaberry cherry red, not the neutral navy, for the training brand', () => {
    const { html, branded } = render(MINIMAL);
    expect(branded).toBe(true);
    expect(html).toContain('#FB2832');
    expect(html).not.toContain(NEUTRAL_THEME['--accent']);
  });

  it('a brand with no theme key at all still paints', () => {
    const { html } = render(MINIMAL, { brand: { name: 'Nameless', default_theme_key: null } });
    expect(themeForLandingPage(null).branded).toBe(false);
    expect(html).toContain('--bg:');
  });

  it('shows the agreed lockup for a brand that has one', () => {
    expect(render(MINIMAL).html).toContain('<img src="/colaberry-horizontal.png" alt="Colaberry">');
  });

  it('falls back to the brand name for a brand with no agreed lockup, rather than borrowing one', () => {
    // The failure this guards against is worse than showing no logo: putting Colaberry's mark
    // above a different client's page.
    const { html } = render(MINIMAL, { brand: UNBRANDED });
    expect(html).not.toContain('colaberry-horizontal.png');
    expect(html).toContain('>Colaberry Enterprise</span>');
  });
});

describe('every section type renders something', () => {
  const UNION_TYPES = landingPageSectionSchema.options.map((o: any) => o.shape.type.value as string);
  const EXAMPLES: Record<string, unknown> = {
    hero: { type: 'hero', headline: 'Hero headline' },
    text: { type: 'text', heading: 'Text heading', paragraphs: ['A paragraph.'] },
    bullets: { type: 'bullets', items: [{ label: 'A bullet label' }] },
    stats: { type: 'stats', items: [{ value: '6', label: 'weeks', source: 'Programme calendar' }] },
    quote: { type: 'quote', items: [{ quote: 'It worked.', attribution: 'A graduate' }] },
    details: { type: 'details', rows: [{ label: 'Starts', value: 'Nov 3' }] },
    faq: { type: 'faq', items: [{ question: 'Is it live?', answer: 'Every session.' }] },
    cta: { type: 'cta', headline: 'Apply today', cta: { label: 'Apply', href: '/apply' } },
  };

  it('the examples cover the union exactly', () => {
    expect(Object.keys(EXAMPLES).sort()).toEqual([...UNION_TYPES].sort());
  });

  /** The visible copy each example above puts on the page, so "and its text" is really checked. */
  const EXAMPLE_TEXT: Record<string, string> = {
    hero: 'Hero headline',
    text: 'A paragraph.',
    bullets: 'A bullet label',
    stats: 'Programme calendar',
    quote: 'It worked.',
    details: 'Nov 3',
    faq: 'Every session.',
    cta: 'Apply today',
  };

  it('the text map covers the union too, so no type is checked for its class alone', () => {
    expect(Object.keys(EXAMPLE_TEXT).sort()).toEqual([...UNION_TYPES].sort());
  });

  it.each(Object.keys(EXAMPLES))('%s renders its own section element and its text', (type) => {
    const { html } = render(content({ sections: [EXAMPLES[type]] }));
    // Its own band, carrying the type as a class...
    expect(html).toMatch(new RegExp(`<section class="band band--[a-z]+ s-${type}[^"]*">`));
    // ...and the copy actually on the page. The previous version of this test asserted only the
    // class, so a section that rendered an empty shell would have passed it.
    expect(html).toContain(EXAMPLE_TEXT[type]);
  });

  it('renders a stat source on the page, not just in the database', () => {
    const { html } = render(content({
      sections: [{ type: 'stats', items: [{ value: '92%', label: 'placed', source: 'Cohort 11 ledger' }] }],
    }));
    expect(html).toContain('Cohort 11 ledger');
  });

  it('keeps the sections in the order they were authored', () => {
    const { html } = render(content({
      sections: [
        { type: 'hero', headline: 'First' },
        { type: 'text', paragraphs: ['Second'] },
        { type: 'cta', headline: 'Third', cta: { label: 'Go', href: '/go' } },
      ],
    }));
    expect(html.indexOf('First')).toBeLessThan(html.indexOf('Second'));
    expect(html.indexOf('Second')).toBeLessThan(html.indexOf('Third'));
  });
});

describe('the document itself', () => {
  it('is a complete html document with a charset and a viewport', () => {
    const { html } = render(MINIMAL);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('width=device-width, initial-scale=1');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('has exactly one h1 - the hero', () => {
    const { html } = render(content({
      sections: [{ type: 'hero', headline: 'The one' }, { type: 'cta', headline: 'Also big', cta: { label: 'Go', href: '/go' } }],
    }));
    expect((html.match(/<h1>/g) ?? [])).toHaveLength(1);
  });
});
