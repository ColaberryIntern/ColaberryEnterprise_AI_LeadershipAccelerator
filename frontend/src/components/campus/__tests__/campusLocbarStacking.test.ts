import fs from 'fs';
import path from 'path';

/**
 * The location bar is sticky at a positive z-index, and the portal header sits in the grid row above it.
 * A positioned ancestor at z-index:auto loses to any positive one whatever its own children bid, so if
 * .te-top does not out-rank .cm-locbar the bar paints over everything the header opens downward -- the
 * bell and message panels among them, which is what Kes reported on 2026-10-27: the top notification
 * was sliced in half by the bar on every campus page.
 *
 * jsdom applies no external stylesheet and resolves no stacking, so no render test can catch this.
 * The stylesheet source is the only place the contract can be checked.
 */
const DIR = path.join(__dirname, '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const LOCBAR = strip(fs.readFileSync(path.join(DIR, 'campusLocbar.css'), 'utf8'));
const CAMPUS = strip(fs.readFileSync(path.join(DIR, 'campus.css'), 'utf8'));

/** The z-index declared on a selector's own rule body, or null when it declares none. */
export function zIndexOf(css: string, selector: string): number | null {
  const body = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`));
  if (!body) return null;
  const z = body[1].match(/z-index:\s*(-?\d+)/);
  return z ? Number(z[1]) : null;
}

const HEADER = '.te-shell.has-locbar .te-top';
const BAR = '.cm-locbar';
/** The full-screen campus surfaces the header must stay underneath. */
const OVERLAYS = ['.cm-layer', '.cm-tabbar'];

describe('the campus header out-ranks the location bar', () => {
  it('found both rules and a real stacking order on the bar', () => {
    expect(zIndexOf(LOCBAR, BAR)).toEqual(expect.any(Number));
    expect(zIndexOf(LOCBAR, HEADER)).toEqual(expect.any(Number));
  });

  it('the header paints above the bar, so panels opened from it are not sliced', () => {
    const header = zIndexOf(LOCBAR, HEADER)!;
    const bar = zIndexOf(LOCBAR, BAR)!;
    expect({ header, bar, headerWins: header > bar }).toEqual({ header, bar, headerWins: true });
  });

  it('the header still sits under every full-screen campus surface', () => {
    const header = zIndexOf(LOCBAR, HEADER)!;
    for (const sel of OVERLAYS) {
      const overlay = zIndexOf(CAMPUS, sel);
      expect({ sel, overlay, aboveHeader: overlay !== null && overlay > header })
        .toEqual({ sel, overlay, aboveHeader: true });
    }
  });

  it('mutation control: dropping the header z-index is caught', () => {
    const broken = LOCBAR.replace(`${HEADER}{position:relative;z-index:22}`, `${HEADER}{position:relative}`);
    expect(broken).not.toEqual(LOCBAR);
    expect(zIndexOf(broken, HEADER)).toBeNull();
  });
});
