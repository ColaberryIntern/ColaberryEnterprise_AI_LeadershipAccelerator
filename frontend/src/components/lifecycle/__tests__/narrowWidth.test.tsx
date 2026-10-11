import fs from 'fs';
import path from 'path';

/**
 * The review surface at NARROW width — and an honest account of what this can prove.
 *
 * ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
 * It is NOT a screenshot and not a visual check. jsdom performs no layout: every element reports
 * a zero bounding box, so "does this overflow at 360px" is unanswerable here. The packet asks for
 * desktop and narrow widths both, and the honest position is that the narrow-width evidence in
 * this repository is currently STRUCTURAL, not visual.
 *
 * `playwright` is declared in the root `package.json` but is not resolvable in this worktree —
 * `require('playwright')` throws, which is also the real cause of the four baseline
 * `TS2307 Cannot find module 'playwright'` errors in the backend typecheck. Installing it would
 * mutate another session's live worktree through the `node_modules` junction, which is forbidden.
 * So the visual capture belongs to the post-deploy tasks, where this repo's production
 * screenshot pipeline already exists and works. That is stated rather than substituted with a
 * mockup.
 *
 * ── WHAT THIS DOES PROVE ─────────────────────────────────────────────────────
 * Two structural properties that a narrow viewport punishes and that a reviewer on a phone would
 * notice immediately:
 *
 *   1. No lifecycle component fixes a pixel WIDTH. A fixed width wider than the viewport is the
 *      most common way a card overflows and forces horizontal scrolling.
 *   2. Every flex row WRAPS. A `d-flex` row holding a button and a label will push its label off
 *      the edge at 360px unless it is allowed to wrap. Three such rows were found by this check
 *      and fixed — the change-request controls, the linked-records group header and the header's
 *      badge row.
 */

const DIR = path.join(__dirname, '..');
const PAGE = path.join(__dirname, '..', '..', '..', 'routes', 'lifecycleRoutes.tsx');

const sources = (): Array<{ file: string; text: string }> => {
  const files = fs.readdirSync(DIR)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => path.join(DIR, f));
  return [...files, PAGE].map((f) => ({
    file: path.basename(f),
    text: fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'),
  }));
};

/** Class attributes, with comments stripped so prose cannot satisfy a check. */
const classAttributes = (text: string): string[] => {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  return [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]);
};

describe('the review surface is structurally safe at narrow width', () => {
  const files = sources();

  it('found the components to inspect, so the sweeps below are not vacuous', () => {
    // A path filter would be unsafe here for the same reason it was in the backend sweep: this
    // worktree is `acc-lifecycle-wt`, so every absolute path contains "lifecycle". These are
    // read from one directory listing plus one named file instead.
    expect(files.length).toBeGreaterThanOrEqual(5);
    const names = files.map((f) => f.file);
    expect(names).toContain('BlueprintChangeRequest.tsx');
    expect(names).toContain('LinkedRecords.tsx');
    expect(names).toContain('lifecycleRoutes.tsx');
    expect(files.every((f) => f.text.length > 200)).toBe(true);
  });

  it('fixes no pixel WIDTH anywhere', () => {
    // Font sizes are fine and are present; a WIDTH in px is what overflows a phone.
    const offenders = files.flatMap(({ file, text }) => {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
      return [...code.matchAll(/(?:max|min)?[Ww]idth:\s*['"]?(\d+)px/g)]
        .map((m) => `${file} -> ${m[0]}`);
    });
    expect(offenders).toEqual([]);
  });

  it('POSITIVE CONTROL: the width predicate does flag a real fixed width', () => {
    const synthetic = "<div style={{ width: '720px' }} />";
    const found = [...synthetic.matchAll(/(?:max|min)?[Ww]idth:\s*['"]?(\d+)px/g)].map((m) => m[0]);
    expect(found).toHaveLength(1);
  });

  it('lets every flex row WRAP, so a button and its label never push off the edge', () => {
    const unwrapped = files.flatMap(({ file, text }) => classAttributes(text)
      .filter((cls) => /\bd-flex\b/.test(cls) && !/\bflex-wrap\b/.test(cls))
      .map((cls) => `${file} -> ${cls}`));
    // Named, not counted: which row cannot wrap is the actionable part.
    expect(unwrapped).toEqual([]);
  });

  it('POSITIVE CONTROL: the wrap predicate does flag an unwrapped row', () => {
    // Without this, a class-extraction regex that matched nothing would make the sweep above
    // pass by finding no rows at all.
    const synthetic = '<div className="d-flex align-items-center gap-2">';
    const flagged = classAttributes(synthetic)
      .filter((cls) => /\bd-flex\b/.test(cls) && !/\bflex-wrap\b/.test(cls));
    expect(flagged).toEqual(['d-flex align-items-center gap-2']);
  });

  it('really did find flex rows to check, so the wrap sweep is not empty', () => {
    const flexRows = files.flatMap(({ text }) => classAttributes(text).filter((c) => /\bd-flex\b/.test(c)));
    expect(flexRows.length).toBeGreaterThanOrEqual(4);
  });

  it('uses a responsive container rather than a fixed canvas', () => {
    const containers = files.flatMap(({ text }) => classAttributes(text))
      .filter((c) => /\bcontainer\b/.test(c));
    expect(containers.length).toBeGreaterThanOrEqual(1);
    // `container-fluid` would also be acceptable; what matters is that nothing pins a canvas.
    expect(containers.every((c) => !/\bw-\d+\b/.test(c))).toBe(true);
  });
});
