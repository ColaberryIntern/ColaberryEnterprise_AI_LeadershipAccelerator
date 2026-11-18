import fs from 'fs';
import path from 'path';

/**
 * W18 (Ali, 2026-11-17): "The titles are different sizes. We need more consistency."
 *
 * Every page hero title uses one scale, the home page's. What this pins:
 *  1. One rule sets that scale for every hero kind the v5 pages use.
 *  2. Nothing AFTER that rule re-sizes any of those titles (a later rule of equal
 *     specificity would silently win, which is how the 820px blocks set 68/84/46px).
 *  3. The pages that use the generic page hero opt in with `--page`, so story detail
 *     titles (long sentences) keep their own size.
 */
const CSS = fs.readFileSync(path.join(__dirname, '..', 'fidelityV5.css'), 'utf8');
const SCALE = 'clamp(37px, 5.6vw, 77px)'; // W25: 20% under the old home scale (96/46)
const HEROES = [
  '.cbv2-shell .cbv2-h8__h1',
  '.cbv2-shell .cbv2-shero5 h1',
  '.cbv2-shell .cbv2-svhero5 h1',
  '.cbv2-shell .cbv2-prhero5 h1',
  '.cbv2-shell .cbv2-dp5 h1',
  '.cbv2-shell .cbv2-phero5 h1',
  '.cbv2-shell .cbv2-bookpage5 .cbv2-book__h',
  '.cbv2-shell .cbv2-pagehero--page h1',
];

const start = CSS.indexOf('W18 - ONE TITLE SIZE');
const ruleOpen = CSS.indexOf('{', CSS.indexOf('*/', start));
const selectors = CSS.slice(CSS.indexOf('*/', start) + 2, ruleOpen).split(',').map((s) => s.trim());
const body = CSS.slice(ruleOpen, CSS.indexOf('}', ruleOpen));
const after = CSS.slice(CSS.indexOf('}', ruleOpen) + 1);

describe('W18: one title size on every page', () => {
  it('sets the home scale on every hero title in one rule', () => {
    expect(start).toBeGreaterThan(-1);
    expect(selectors).toEqual(HEROES);
    expect(body).toContain(`font-size: ${SCALE};`);
  });

  it('is not overridden by any later rule', () => {
    const later = after.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const sel of HEROES) {
      const tail = sel.replace('.cbv2-shell ', '');
      expect(later).not.toContain(tail);
    }
  });

  it('opts the Proof, Stories and Privacy page heroes in, and only those', () => {
    const src = (f: string) => fs.readFileSync(path.join(__dirname, '..', '..', '..', 'pages', 'publicV2', f), 'utf8');
    expect(src('StoriesV2.tsx')).toContain('cbv2-pagehero cbv2-pagehero--page');
    expect(src('PrivacyV2.tsx')).toContain('cbv2-pagehero cbv2-pagehero--page');
    expect(src('StoryDetailArticle.tsx')).not.toContain('cbv2-pagehero--page');
  });
});

describe('W23: the Government page title uses the same scale', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'public', 'government', 'index.html'), 'utf8');
  it('heads the page in a .ghero with the breadcrumb, not inside the catalog toolbar', () => {
    const hero = html.slice(html.indexOf('<section class="ghero"'), html.indexOf('<section class="gx"'));
    expect(hero).toContain('<p class="crumb"><a href="/">Home</a> / Government</p>');
    expect(hero).toMatch(/<h1 id="gv-title">/);
    const strip = html.slice(html.indexOf('<div class="wrap gx-strip">'), html.indexOf('<div class="wrap gx-find">'));
    expect(strip).not.toContain('<h1');
    expect((html.match(/<h1[\s>]/g) || []).length).toBe(1);
  });
  it('sizes it at the home scale, in the last style block so nothing overrides it', () => {
    // After the design-system block's own !important title sizes, so it is the rule that applies.
    const rule = html.indexOf('.ghero h1{font-size:clamp(37px,5.6vw,77px)!important;');
    expect(rule).toBeGreaterThan(-1);
    expect(rule).toBeGreaterThan(html.lastIndexOf('.gx-strip h1{font-size:25px!important}'));
  });
});
