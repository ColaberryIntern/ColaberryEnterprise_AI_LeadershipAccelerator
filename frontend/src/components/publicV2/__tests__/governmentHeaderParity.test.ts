/**
 * governmentHeaderParity.test.ts -- the government page is a static file with
 * its OWN copy of the header. Until 2026-11-16 that copy had drifted: a
 * different item order, a second "Talk to an Architect" button, the Colaberry
 * Training logo, and "Design proposal - not live" in the footer of a live page.
 * These hold it to the React header so clicking Government never lands a
 * visitor on a different site.
 */
import fs from 'fs';
import path from 'path';
import { V2_NAV } from '../PublicHeaderV2';

const FILE = path.join(__dirname, '..', '..', '..', '..', 'public', 'government', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');
const header = html.slice(html.indexOf('<header class="nav" id="nav">'), html.indexOf('</header>') + 9);
const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>') + 9);
const textOf = (h: string): string => h.replace(/<[^>]*>/g, ' ').replace(/&rarr;/g, '').replace(/\s+/g, ' ').trim();

describe('government page header matches the site header', () => {
  it('carries the same items as V2_NAV, in the same order, plus Log in', () => {
    const nav = header.slice(header.indexOf('<nav'), header.indexOf('</nav>'));
    /* top-level items only: direct <a> children and the menu buttons, not panel links */
    const withoutPanels = nav.replace(/<div class="gn-panel"[\s\S]*?<\/div><\/div><\/div>/g, '');
    const items = [...withoutPanels.matchAll(/<(?:a|button)\b[^>]*data-nav="[^"]+"[^>]*>([\s\S]*?)<\/(?:a|button)>/g)]
      .map((m) => textOf(m[1]));
    expect(items).toEqual([...V2_NAV.map((i) => i.label), 'Log in']);
  });

  it('opens Proof and Government as menus, like the React header', () => {
    expect(header).toMatch(/<button[^>]*data-nav="proof"[^>]*aria-controls="gn-proof"/);
    expect(header).toMatch(/<button[^>]*data-nav="gov"[^>]*aria-controls="gn-gov"/);
    expect(header).toContain('id="gn-proof"');
    expect(header).toContain('id="gn-gov"');
  });

  it('has one call to action, the demo pilot', () => {
    expect(header).not.toContain('Talk to an Architect');
    expect((header.match(/Book a demo pilot/g) || []).length).toBe(1);
  });

  it('draws the Colaberry Enterprise lockup, not an embedded logo image', () => {
    expect(header).toContain('data-enterprise-mark');
    expect(header).toContain('gn-tag">Enterprise<');
    expect(header).not.toContain('data:image');
  });
});

describe('government page footer', () => {
  it('uses the on-dark lockup, not an embedded logo image', () => {
    expect(footer).toContain('gn-lock--dark');
    expect(footer).not.toContain('data:image');
  });

  it('does not tell visitors to a live page that it is "not live"', () => {
    expect(html).not.toMatch(/Design proposal/);
    expect(html).not.toMatch(/not live/i);
  });
});

describe('government page menu wiring', () => {
  it('fills the Government menu from the catalog it already loads, with no second request', () => {
    expect(html).toContain('if (window.gnFillGov) window.gnFillGov(payload);');
    expect((html.match(/fetch\('\/api\/public\/services/g) || []).length).toBe(1);
  });

  it('applies ?family= after the catalog renders, so menu links land filtered', () => {
    const render = html.indexOf('GOV_RENDER();\n    if (window.gnApplyFamily) window.gnApplyFamily();');
    expect(render).toBeGreaterThan(-1);
    expect(html).toContain("new URLSearchParams(location.search).get('family')");
  });
});
