import { parseLandingPageContent, landingPageSectionSchema } from '../landingPageContentSchema';

/**
 * The boundary that decides whether a landing page can be served at all.
 *
 * These pages are rendered from operator-supplied JSON onto the same hostname as the admin app,
 * so the schema is the security control, not a convenience. The tests that matter here are the
 * refusals.
 */

const hero = { type: 'hero' as const, headline: 'Ship an AI project in six weeks' };

function content(over: Record<string, unknown> = {}) {
  return { sections: [hero], ...over };
}

describe('a page has to have something on it', () => {
  it('accepts the smallest real page', () => {
    const r = parseLandingPageContent(content());
    expect(r.ok).toBe(true);
  });

  it('refuses zero sections - a published page with none renders a blank URL', () => {
    const r = parseLandingPageContent({ sections: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(' ')).toMatch(/sections/);
  });

  it('refuses a section type it does not know, rather than dropping it silently', () => {
    const r = parseLandingPageContent({ sections: [{ type: 'carousel', slides: [] }] });
    expect(r.ok).toBe(false);
  });

  it('names where the problem is, so the composer can point at it', () => {
    const r = parseLandingPageContent({ sections: [{ type: 'hero' }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.some((p) => p.includes('sections.0.headline'))).toBe(true);
  });

  it('refuses a whitespace-only headline, which would render as an empty hero', () => {
    expect(parseLandingPageContent({ sections: [{ type: 'hero', headline: '   ' }] }).ok).toBe(false);
  });
});

describe('links are the one place a URL is allowed, so they are checked', () => {
  const withCta = (href: string) => ({
    sections: [{ type: 'cta', headline: 'Apply', cta: { label: 'Apply now', href } }],
  });

  it.each([
    'https://enterprise.colaberry.ai/apply',
    'http://localhost:3000/apply',
    '/apply',
  ])('allows %s', (href) => {
    expect(parseLandingPageContent(withCta(href)).ok).toBe(true);
  });

  it.each([
    ['javascript:alert(1)', 'the classic'],
    ['JaVaScRiPt:alert(1)', 'case does not help'],
    ['data:text/html,<script>alert(1)</script>', 'data URLs are markup too'],
    ['//evil.example.com/apply', 'protocol-relative borrows the page scheme'],
    ['vbscript:msgbox(1)', 'any other scheme'],
  ])('refuses %s (%s)', (href) => {
    expect(parseLandingPageContent(withCta(href)).ok).toBe(false);
  });
});

describe('an outcome claim carries its source', () => {
  it('refuses a stat with no source - an unsourced number is what we will not publish', () => {
    const r = parseLandingPageContent({
      sections: [{ type: 'stats', items: [{ value: '92%', label: 'placed within 6 months' }] }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.some((p) => p.includes('source'))).toBe(true);
  });

  it('accepts it once the source is stated', () => {
    const r = parseLandingPageContent({
      sections: [{
        type: 'stats',
        items: [{ value: '92%', label: 'placed within 6 months', source: 'Cohort 11 placement ledger, 2026-09-30' }],
      }],
    });
    expect(r.ok).toBe(true);
  });
});

describe('text is text, never markup', () => {
  it('does not reject markup in copy - it is stored as the literal text it is', () => {
    // The renderer escapes; the schema does not need to censor. Asserting this pins the division
    // of labour: if the schema ever starts stripping tags, the renderer's escaping is what is
    // actually protecting the page, and that has to stay true.
    const r = parseLandingPageContent({
      sections: [{ type: 'text', paragraphs: ['<script>alert(1)</script> is not a tag here'] }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const section = r.content.sections[0];
      expect(section.type).toBe('text');
      if (section.type === 'text') expect(section.paragraphs[0]).toContain('<script>');
    }
  });

  it('keeps paragraphs as separate strings, so newlines are never interpreted', () => {
    const r = parseLandingPageContent({ sections: [{ type: 'text', paragraphs: ['One.', 'Two.'] }] });
    expect(r.ok).toBe(true);
    if (r.ok && r.content.sections[0].type === 'text') {
      expect(r.content.sections[0].paragraphs).toHaveLength(2);
    }
  });
});

describe('every section type in the union actually parses', () => {
  // A new section type added to the union without a valid example here is a type nobody proved
  // can be written - and the renderer's exhaustiveness check would pass regardless.
  const EXAMPLES: Record<string, unknown> = {
    hero: hero,
    text: { type: 'text', paragraphs: ['A paragraph.'] },
    bullets: { type: 'bullets', items: [{ label: 'A thing you get' }] },
    stats: { type: 'stats', items: [{ value: '6', label: 'weeks', source: 'Programme calendar' }] },
    quote: { type: 'quote', items: [{ quote: 'It worked.', attribution: 'A graduate' }] },
    details: { type: 'details', rows: [{ label: 'Starts', value: 'Nov 3' }] },
    faq: { type: 'faq', items: [{ question: 'Is it live?', answer: 'Yes, every session.' }] },
    cta: { type: 'cta', headline: 'Apply', cta: { label: 'Apply', href: '/apply' } },
  };

  const UNION_TYPES = landingPageSectionSchema.options.map((o: any) => o.shape.type.value as string);

  it('the examples cover the union exactly - no type untested, none left over', () => {
    expect(Object.keys(EXAMPLES).sort()).toEqual([...UNION_TYPES].sort());
  });

  it.each(Object.entries(EXAMPLES))('%s parses', (_type, example) => {
    expect(parseLandingPageContent({ sections: [example] }).ok).toBe(true);
  });
});

describe('the social card, which is what a post actually shows', () => {
  it('takes a title, description and image for the link preview', () => {
    const r = parseLandingPageContent(content({
      title: 'Six-week AI build',
      description: 'Ship a working project, not a certificate.',
      socialImage: { src: 'https://enterprise.colaberry.ai/og.png', alt: 'Cohort at work' },
    }));
    expect(r.ok).toBe(true);
  });

  it('refuses a social image with no alt text', () => {
    expect(parseLandingPageContent(content({
      socialImage: { src: 'https://enterprise.colaberry.ai/og.png' },
    })).ok).toBe(false);
  });

  it('refuses an unsafe social image URL like any other', () => {
    expect(parseLandingPageContent(content({
      socialImage: { src: 'javascript:alert(1)', alt: 'x' },
    })).ok).toBe(false);
  });
});
