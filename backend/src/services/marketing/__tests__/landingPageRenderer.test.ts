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
    // No `<img` tag was opened, and no `</style>` escaped the stylesheet.
    expect(html).not.toMatch(/<img(?![^>]*\bloading=)/);
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

describe('theming is honest about what has been decided', () => {
  it('uses the agreed palette for the one brand that has one', () => {
    const { html, branded } = render(MINIMAL, { brand: FLOTATION });
    expect(branded).toBe(true);
    expect(html).toContain(LANDING_PAGE_THEMES['ai-flotation']['--accent']);
  });

  it('renders neutral for a brand with no agreed palette, and says so in the result', () => {
    const { html, branded } = render(MINIMAL);
    expect(branded).toBe(false);
    expect(html).toContain(NEUTRAL_THEME['--accent']);
  });

  it('a brand with no theme key at all still paints', () => {
    const { html } = render(MINIMAL, { brand: { name: 'Nameless', default_theme_key: null } });
    expect(themeForLandingPage(null).branded).toBe(false);
    expect(html).toContain('--bg:');
  });

  it('shows the brand name as the wordmark, because there is no logo column to read', () => {
    expect(render(MINIMAL).html).toContain('>Colaberry Training</div>');
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

  it.each(Object.keys(EXAMPLES))('%s renders its own section element and its text', (type) => {
    const { html } = render(content({ sections: [EXAMPLES[type]] }));
    expect(html).toContain(`class="s s-${type}"`);
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
