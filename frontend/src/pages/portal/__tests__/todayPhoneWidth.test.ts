import fs from 'fs';
import path from 'path';

/**
 * C126: Today must fit a phone.
 *
 * A one-column CSS grid written as `grid-template-columns:1fr` is really
 * `minmax(auto,1fr)`: the track refuses to shrink below the min-content width of
 * its widest child. On 2026-11-14 that made Today 2479px wide on a 390px phone.
 * The browser zoomed its layout out to 1560px, the learner saw "a piece of the big
 * screen", and the video drawer docked off-screen to the right behind its dim layer.
 * Most ad-funnel learners arrive on a phone.
 *
 * Source-level on purpose: jest stubs `.css` imports, so a render test cannot see
 * layout. The live check is scripts/auditPhoneView.js against production.
 */
const CSS = fs.readFileSync(path.join(__dirname, '..', 'today', 'TodayShell.css'), 'utf8');

/** Every grid-template-columns value in the file, comments stripped. */
function columnValues(css: string): string[] {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...noComments.matchAll(/grid-template-columns\s*:\s*([^;}]+)/g)].map((m) => m[1].trim());
}

describe('Today fits a phone (C126)', () => {
  it('finds the grid rules this guards (sanity: not vacuously true)', () => {
    expect(columnValues(CSS).length).toBeGreaterThan(5);
  });

  it('no single-column grid uses a bare 1fr track (it will not shrink on a phone)', () => {
    const bare = columnValues(CSS).filter((v) => /^1fr$/.test(v));
    expect(bare).toEqual([]);
  });

  it('the collapsed Today grid is minmax(0,1fr) and its children may shrink', () => {
    const noComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(noComments).toMatch(/@media\s*\(\s*max-width\s*:\s*1300px\s*\)\s*\{\s*\.te-grid\s*\{\s*grid-template-columns\s*:\s*minmax\(0,\s*1fr\)/);
    expect(noComments).toMatch(/\.te-grid\s*>\s*\*\s*\{\s*min-width\s*:\s*0/);
  });
});
