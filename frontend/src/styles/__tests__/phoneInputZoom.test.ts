import fs from 'fs';
import path from 'path';

/**
 * C127: on a phone, typing boxes are 16px so iPhone Safari does not zoom the page in.
 *
 * Safari zooms in when a text box under 16px is tapped and stays zoomed after typing. On
 * 2026-11-15 every box in the ad funnel was under 16px, so a learner signing up was left panning
 * around "a piece of the page". The fix is ONE site-wide rule in responsive.css; this file fails if
 * that rule is removed, weakened, or replaced by the accessibility-hostile maximum-scale=1.
 *
 * Source-level on purpose: jest stubs .css imports, so a render test cannot see computed sizes.
 * The live check is scripts/auditPhoneView.js (it reports and fails on boxes under 16px).
 */
const STYLES = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(STYLES, 'responsive.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const INDEX = fs.readFileSync(path.join(STYLES, '..', 'index.tsx'), 'utf8');
const HTML = fs.readFileSync(path.join(STYLES, '..', '..', 'public', 'index.html'), 'utf8');

/** Body of the first @media block whose query matches, braces balanced. */
function mediaBlock(css: string, query: RegExp): string {
  const m = query.exec(css);
  if (!m) return '';
  let depth = 0;
  const start = css.indexOf('{', m.index);
  for (let i = start; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(start + 1, i);
  }
  return '';
}

describe('typing boxes do not zoom an iPhone (C127)', () => {
  const phone = mediaBlock(CSS, /@media\s*\(\s*max-width\s*:\s*767\.98px\s*\)\s*\{(?=[^}]*\binput\b)/);

  it('responsive.css is actually loaded by the app', () => {
    expect(INDEX).toMatch(/import\s+'\.\/styles\/responsive\.css'/);
  });

  it('a phone-width rule sets input, select and textarea to 16px with !important', () => {
    expect(phone).not.toBe('');
    const rule = /([^{}]+)\{([^}]*)\}/g;
    const hits = [...phone.matchAll(rule)].filter(([, sel, body]) =>
      /\binput\b/.test(sel) && /\bselect\b/.test(sel) && /\btextarea\b/.test(sel)
      && /font-size\s*:\s*16px\s*!important/.test(body));
    expect(hits).toHaveLength(1);
  });

  it('text inputs are not excluded (only checkbox/radio-like types are)', () => {
    const sel = [...phone.matchAll(/([^{}]+)\{[^}]*font-size\s*:\s*16px/g)].map((m) => m[1]).join(' ');
    for (const t of ['text', 'email', 'tel', 'search', 'password']) expect(sel).not.toContain(`"${t}"`);
  });

  it('pinch zoom stays available (no maximum-scale / user-scalable=no)', () => {
    const meta = /<meta[^>]+name="viewport"[^>]*>/.exec(HTML)?.[0] || '';
    expect(meta).toMatch(/width=device-width/);
    expect(meta).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/);
  });
});
