/**
 * governmentNoSidewaysScroll.test.ts -- /government/ scrolled sideways (Ali, 2026-11-16).
 *
 * Three causes, measured in a browser from 320 to 1,920px wide:
 *  - the industry-coverage table was forced to at least 820px (`min-width:820px`), so it
 *    overflowed into a scrollbar at every width (its natural width was 1,322px);
 *  - the static header kept its full nav down to 820px, pushing "Book a demo pilot" off
 *    the right edge between 820 and ~1,080px;
 *  - the hero grid's one column sized to its widest child (335px on a 320px screen).
 *
 * The browser check lives outside the repo; these hold the CSS that fixed each cause.
 */
import fs from 'fs';
import path from 'path';

const FILE = path.join(__dirname, '..', '..', '..', '..', 'public', 'government', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');
const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const rule = (sel: string): string => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`(?:^|[}\\n])\\s*${esc}\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join(';');
};

describe('/government/ never scrolls sideways', () => {
  it('the coverage table shares the page width instead of forcing a minimum', () => {
    expect(css).not.toMatch(/\.gv-mx table\{[^}]*min-width/);
    expect(rule('.gv-mx table')).toMatch(/table-layout:fixed/);
    expect(rule('.gv-mx')).not.toMatch(/overflow-x:auto/);
  });

  it('the coverage table turns into one card per service on a phone', () => {
    expect(css).toMatch(/@media \(max-width:760px\)\{[\s\S]*?\.gv-mx thead\{display:none\}/);
    /* the render marks empty cells so the phone layout can hide them */
    expect(html).toMatch(/' class="z"'/);
    expect(html).toMatch(/data-l="'\+c\+'"/);
  });

  it('the header switches to the menu button before its links run out of room', () => {
    expect(css).toMatch(/@media \(max-width:1100px\)\{\s*\.nav__links,\.nav__r\{display:none\}\.burger\{display:block\}/);
  });

  it('the hero grid column can shrink below its widest child', () => {
    expect(css).toMatch(/\.gx\{grid-template-columns:minmax\(0,1fr\)\}/);
  });
});
