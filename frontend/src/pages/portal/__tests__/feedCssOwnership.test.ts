import fs from 'fs';
import path from 'path';

/**
 * A page that renders `.te-feed-head` must import `feed.css` itself.
 *
 * The rule `.te-feed-head .h svg{width:16px;height:16px}` lives ONLY in
 * `pages/portal/feed/feed.css`. A page that gets the file transitively — via
 * FeedCard, or because the Today chunk happened to load first — renders fine
 * until that path changes. Then a cold load has no rule for the heading's
 * list icon, the unsized `<svg viewBox="0 0 24 24">` fills its container, and
 * the three 2-unit round-capped strokes render as 462px black pills.
 *
 * Happened twice: Today on 2026-08-24 (TodayShell.tsx documents it) and
 * Projects on 2026-09-14, after #2525 replaced FeedCard with TimelineCard and
 * dropped the transitive import. Same icon, same 462px. This test makes the
 * dependency explicit for every page under src/pages/portal so it cannot
 * happen a third time by the same route.
 *
 * Source-level on purpose: jest stubs `.css` imports to an empty module, so a
 * render test cannot see whether a stylesheet is present, and a bundle-level
 * check would need the CRA build. The invariant is about the import graph,
 * and the import graph is text.
 */
const PORTAL = path.join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(p, out); }
    else if (/\.tsx$/.test(entry.name)) out.push(p);
  }
  return out;
}

describe('feed.css ownership', () => {
  const rendersFeedHead = walk(PORTAL).filter((f) => /className=["'`]te-feed-head/.test(fs.readFileSync(f, 'utf8')));

  it('finds the pages this guards (sanity: the rule is not vacuously true)', () => {
    const names = rendersFeedHead.map((f) => path.relative(PORTAL, f).replace(/\\/g, '/'));
    expect(names).toEqual(expect.arrayContaining(['projects/ProjectsPage.tsx', 'today/TodayShell.tsx']));
  });

  it.each(rendersFeedHead.map((f) => [path.relative(PORTAL, f).replace(/\\/g, '/'), f]))(
    '%s renders .te-feed-head and imports feed.css itself',
    (_name, file) => {
      const src = fs.readFileSync(file as string, 'utf8');
      expect(src).toMatch(/import\s+['"][^'"]*feed\/feed\.css['"]/);
    },
  );
});
