import { readFileSync } from 'fs';
import { join } from 'path';
import { renderLandingPage } from '../landingPageRenderer';
import { STYLES } from '../landingPageStyles';
import { parseLandingPageContent, type LandingPageContentShape } from '../../../schemas/landingPageContentSchema';

/**
 * The components added for renderer v2, one assertion each.
 *
 * TWO THINGS EVERY COMPONENT HAS TO GET RIGHT, and they are the only ones worth a test here:
 *
 *   1. ESCAPING. These strings are operator-supplied JSON served from the same hostname as the
 *      admin app. An unescaped field is stored XSS with an admin session one tab away, and each
 *      new component is a new place to forget.
 *   2. THE NON-MATCH. Four features paint an exact substring - headlineAccent, headingAccent,
 *      emphasis, callout highlights. A phrase that is not found must leave the sentence exactly
 *      as written. Appending it, or matching loosely, silently rewrites copy somebody approved.
 *
 * The target fixture is rendered once and asserted against, rather than each test building its
 * own content: the fixture IS the design target, so a component that stops rendering fails here
 * rather than being noticed in a screenshot later.
 */

const BRAND = { name: 'Colaberry Training', default_theme_key: 'training' };
const FIXTURE = join(__dirname, 'fixtures', 'aiLearningPlatform.target.json');

function content(raw: unknown): LandingPageContentShape {
  const r = parseLandingPageContent(raw);
  if (!r.ok) throw new Error(`fixture is not valid content: ${r.problems.join('; ')}`);
  return r.content;
}

function render(c: LandingPageContentShape): string {
  return renderLandingPage({
    content: c,
    brand: BRAND,
    siteSlug: 'colaberry-training',
    pageUrl: 'https://enterprise.colaberry.ai/lp/colaberry-training/x',
  }).html;
}

const TARGET = content(JSON.parse(readFileSync(FIXTURE, 'utf8')));
const html = render(TARGET);

describe('the target fixture is renderable at all', () => {
  it('parses through the real schema', () => {
    // If the design target stops being valid content, every assertion below is meaningless.
    expect(TARGET.sections.length).toBeGreaterThan(5);
  });

  it('advertises no "free", which is the standing rule for every surface', () => {
    expect(/\bfree\b/i.test(html)).toBe(false);
  });
});

describe('each component draws', () => {
  it.each([
    ['hero two-column', 'class="hero-grid hero-split"'],
    ['panel eyebrow', 'panel-eyebrow'],
    ['panel badge', 'panel-badge'],
    ['panel start marker', 'pmark--start'],
    ['icon tile', 'class="tile tile--'],
    ['contrast card', 'class="contrast"'],
    ['contrast chips', 'class="chips"'],
    ['callout', 'class="callout"'],
    ['success callout', 'callout--success'],
    ['grid variant', 'class="gridlist"'],
    ['items label', 'class="items-label"'],
    ['side card', 'class="sidecard"'],
    ['emphasis', 'class="em"'],
    ['cta note', 'class="cta-note"'],
    ['cool band', 'band--cool'],
    ['dark band', 'band--inverse'],
    ['footer logo', 'foot-logo'],
  ])('%s', (_name, needle) => {
    expect(html).toContain(needle);
  });

  it('counts the panel rows rather than asserting a number', () => {
    // "5 modules" because the fixture has five. A literal would drift from the content.
    const hero = TARGET.sections[0];
    const rows = hero.type === 'hero' && hero.panel ? hero.panel.items.length : 0;
    expect(html).toContain(`${rows} modules`);
  });

  it('still makes no claim about the reader', () => {
    // Scoped to the PANEL. The page legitimately contains the word "Complete" - the grid has a
    // step called "Complete checks", where it is a verb. A page-wide assertion failed on that,
    // and loosening it to pass would have been testing nothing; the rule was only ever about
    // what the panel says.
    const panel = /<aside class="panel">[\s\S]*?<\/aside>/.exec(html);
    expect(panel).not.toBeNull();
    ['In progress', 'Complete', 'completed', '% done'].forEach((w) => expect(panel![0]).not.toContain(w));
  });
});

describe('a phrase that is not there changes nothing', () => {
  const base = {
    type: 'text' as const,
    heading: 'AI is no longer just a future skill',
    paragraphs: ['Most people use AI for basic tasks.'],
  };

  it('headingAccent that is not a substring leaves the heading plain', () => {
    const out = render(content({ sections: [{ ...base, headingAccent: 'NOT PRESENT' }] }));
    expect(out).toContain('AI is no longer just a future skill');
    expect(out).not.toContain('NOT PRESENT');
    expect(out).not.toContain('<span class="hl">');
  });

  it('emphasis that is not a substring leaves the paragraph plain', () => {
    const out = render(content({ sections: [{ ...base, emphasis: ['NOT PRESENT'] }] }));
    expect(out).toContain('Most people use AI for basic tasks.');
    expect(out).not.toContain('class="em"');
  });

  it('a callout highlight that is not a substring leaves the text plain', () => {
    const out = render(content({
      sections: [{ ...base, callout: { text: 'A starting point.', highlights: [{ phrase: 'NOPE', color: 'accent' }] } }],
    }));
    expect(out).toContain('A starting point.');
    expect(out).not.toContain('c-accent"');
  });

  it('a phrase that IS a substring is painted, so the tests above are not vacuous', () => {
    const out = render(content({ sections: [{ ...base, headingAccent: 'future skill' }] }));
    expect(out).toContain('<span class="hl">future skill</span>');
  });
});

describe('nothing an operator types becomes markup', () => {
  const EVIL = '<script>alert(1)</script>';
  // Short fields reject the long payload before rendering, so the probe has to fit the field.
  // `badge` is text(20); escaping is still the thing under test.
  const EVIL_SHORT = '<b>x</b>';

  it.each([
    ['hero body', { type: 'hero', headline: 'H', body: EVIL }],
    ['hero kicker', { type: 'hero', headline: 'H', kicker: EVIL }],
    ['hero ctaNote', { type: 'hero', headline: 'H', ctaNote: EVIL }],
    ['panel eyebrow', { type: 'hero', headline: 'H', panel: { eyebrow: EVIL, title: 'T', items: [{ label: 'a' }, { label: 'b' }] } }],
    ['panel badge', { type: 'hero', headline: 'H', panel: { title: 'T', badge: EVIL_SHORT, items: [{ label: 'a' }, { label: 'b' }] } }],
    ['itemsLabel', { type: 'bullets', items: [{ label: 'a' }], itemsLabel: EVIL }],
    ['callout text', { type: 'bullets', items: [{ label: 'a' }], callout: { text: EVIL } }],
    ['callout lead', { type: 'bullets', items: [{ label: 'a' }], callout: { lead: EVIL, text: 't' } }],
    ['contrast chip', { type: 'text', paragraphs: ['p'], contrast: { title: 'T', chips: [EVIL, 'b'], resultLine: 'r' } }],
    ['contrast result', { type: 'text', paragraphs: ['p'], contrast: { title: 'T', chips: ['a', 'b'], resultLine: EVIL } }],
    ['aside item', { type: 'text', paragraphs: ['p'], aside: { title: 'T', items: [EVIL, 'b'] } }],
    ['cta subhead', { type: 'cta', headline: 'H', subhead: EVIL, cta: { label: 'go', href: '/x' } }],
  ])('%s is escaped', (_name, section) => {
    const out = render(content({ sections: [section] }));
    expect(out).not.toContain(EVIL);
    expect(out).not.toContain(EVIL_SHORT);
    expect(out).toMatch(/&lt;(script|b)&gt;/);
  });

  it('footerNote is escaped', () => {
    const out = render(content({ footerNote: EVIL, sections: [{ type: 'hero', headline: 'H' }] }));
    expect(out).not.toContain(EVIL);
  });
});

describe('every image is sized by the stylesheet', () => {
  /**
   * A class name in the markup is not a component. `.foot-logo` was emitted, asserted above,
   * and had NO rule behind it - so the white Colaberry wordmark rendered at its intrinsic
   * 1200px and filled the bottom of the page. The class-name assertion passed the whole time.
   * An unsized <img> is the one case where that gap is always a visible defect, so it gets a
   * check that reads the stylesheet rather than the markup.
   */
  it('each <img> carrying a class has a height or width rule for it', () => {
    const classes = [...html.matchAll(/<img[^>]*class="([^"]+)"/g)].map((m) => m[1].trim());
    expect(classes.length).toBeGreaterThan(0);
    classes.forEach((cls) => {
      expect(STYLES).toMatch(new RegExp(`\\.${cls}\\{[^}]*(height|width):`));
    });
  });

  it('the header logo, which carries no class, is sized through its parent', () => {
    // Named separately because the test above cannot see it - it is `.brand img`, not a class.
    expect(STYLES).toMatch(/\.brand img\{[^}]*height:/);
  });
});

describe('a page written before any of this still renders', () => {
  it('parses and renders content using none of the new fields', () => {
    // Every new field is optional. A published row from before this work must be unaffected -
    // there are twenty of them in production.
    const old = content({
      sections: [
        { type: 'hero', headline: 'Ship an AI project in six weeks' },
        { type: 'bullets', heading: 'What you get', items: [{ label: 'Mentor review' }] },
        { type: 'cta', headline: 'Apply', cta: { label: 'Apply', href: '/apply' } },
      ],
    });
    const out = render(old);
    expect(out).toContain('Ship an AI project in six weeks');
    expect(out).toContain('Mentor review');
    // The hero stays one column with nothing to put beside it.
    expect(out).not.toContain('class="hero-grid hero-split"');
  });
});
