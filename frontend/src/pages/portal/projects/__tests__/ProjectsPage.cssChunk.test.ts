/**
 * Route-chunk stylesheet reachability — regression test for the Projects
 * "next step" card rendering completely unstyled in production (2026-09-01,
 * reported against enterprise.colaberry.ai/portal/projects).
 *
 * Root cause: `ProjectsNextStepHero.tsx` reuses the Classroom's `.tl-nextweek`
 * markup, whose every rule is written `.tl-de <selector>` in
 * `components/timeline/timeline.css`. The markup correctly carries a `.tl-de`
 * wrapper — the `.tl-de` scope test in `today/__tests__/TodayPlan.cssScope`
 * guards that, and it passed — but `.tl-de` only matters if the stylesheet is
 * LOADED. `/portal/projects` is its own `lazy()` chunk in
 * `routes/portalRoutes.tsx`, and nothing reachable from `ProjectsPage.tsx`
 * imported timeline.css. On a cold load of the Projects tab the browser had no
 * rules for that card at all: centred text, an invisible progress bar, a bare
 * user-agent `Open` button. Navigating in from the Classroom first loaded the
 * stylesheet into the page and hid the bug, which is why review missed it.
 *
 * Why a NEW test rather than extending the `.tl-de` scope test: that one reads
 * `timeline.css` off disk and injects it into jsdom with a `<style>` tag, so it
 * proves selector scoping and is blind, by construction, to whether the real
 * bundle ever ships the file. This test asks the only question that was
 * actually unanswered — is timeline.css inside this route's module graph — by
 * walking relative imports from each lazy route entry, the same way webpack
 * decides what lands in a chunk.
 *
 * The `tl-`/`tld-` class detector is a heuristic, and deliberately a narrow
 * one: it reads `className` values only (never comments, which discuss these
 * class names constantly) and it does not know about timeline.css's unprefixed
 * classes (`fcard`, `mthumb`, `ico`). It is a floor, not a proof of total
 * coverage.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '../../../..');
const ROUTES = path.join(SRC, 'routes/portalRoutes.tsx');
const TIMELINE_CSS = path.join(SRC, 'components/timeline/timeline.css');

const CANDIDATE_SUFFIXES = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.js'];

const readCache = new Map<string, string | null>();
function read(file: string): string | null {
  if (!readCache.has(file)) {
    let text: string | null = null;
    try {
      text = fs.statSync(file).isFile() ? fs.readFileSync(file, 'utf8') : null;
    } catch {
      text = null;
    }
    readCache.set(file, text);
  }
  return readCache.get(file) ?? null;
}

/**
 * Comments must go before anything is scanned. Both the source files here and
 * this test's own fixtures discuss `import '.../timeline.css'` in prose, and a
 * commented-out import that webpack ignores would otherwise read as a real
 * edge — the first draft of this test passed against a deliberately broken
 * tree for exactly that reason. `//` preceded by `:` is left alone so that
 * URLs inside string literals survive.
 */
const codeCache = new Map<string, string>();
function code(file: string): string {
  if (!codeCache.has(file)) {
    const text = read(file) ?? '';
    codeCache.set(file, text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1'));
  }
  return codeCache.get(file) as string;
}

/** Resolve a relative import the way webpack's default extension list would. */
function resolve(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = base + suffix;
    if (suffix === '' && !path.extname(candidate)) continue;
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* keep trying */
    }
  }
  return null;
}

const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*|\brequire\s*\()\s*['"]([^'"]+)['"]/g;

/** Every file reachable from `entry` through relative imports. */
function moduleGraph(entry: string): Set<string> {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift() as string;
    if (file.endsWith('.css')) continue;
    const text = code(file);
    if (!text) continue;
    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT_RE.exec(text)) !== null) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      const target = resolve(file, spec);
      if (target && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return seen;
}

const CLASSNAME_RE = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([\s\S]*?)\})/g;
const TL_CLASS_RE = /\btld?-[a-z]/;

/** Files whose `className` values reference timeline.css's `tl-` / `tld-` classes. */
function timelineClassUsers(graph: Set<string>): string[] {
  const users: string[] = [];
  for (const file of graph) {
    if (!/\.(tsx|jsx)$/.test(file)) continue;
    const text = code(file);
    if (!text) continue;
    CLASSNAME_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CLASSNAME_RE.exec(text)) !== null) {
      const value = m[1] ?? m[2] ?? m[3] ?? '';
      if (TL_CLASS_RE.test(value)) {
        users.push(path.relative(SRC, file).replace(/\\/g, '/'));
        break;
      }
    }
  }
  return users;
}

/** `const Foo = lazy(() => import('../pages/...'))` pairs from portalRoutes.tsx. */
function lazyRouteEntries(): Array<{ name: string; file: string }> {
  const text = code(ROUTES);
  if (!text) throw new Error(`portalRoutes.tsx not found at ${ROUTES}`);
  const re = /const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g;
  const out: Array<{ name: string; file: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const file = resolve(ROUTES, m[2]);
    if (file) out.push({ name: m[1], file });
  }
  return out;
}

describe('portal route chunks ship the stylesheets their markup needs', () => {
  it('finds the lazy route entries and the Projects page among them', () => {
    const entries = lazyRouteEntries();
    expect(entries.length).toBeGreaterThan(5);
    expect(entries.map((e) => e.name)).toContain('ProjectsPage');
  });

  it('Projects reaches timeline.css — the card it borrows from the Classroom is styled on a cold load', () => {
    const entry = lazyRouteEntries().find((e) => e.name === 'ProjectsPage');
    expect(entry).toBeTruthy();
    const graph = moduleGraph((entry as { file: string }).file);

    // Guard the premise: if the hero ever stops using `tl-` classes this test
    // should be deleted, not silently passing on a graph that no longer needs
    // the stylesheet.
    expect(timelineClassUsers(graph)).toContain('pages/portal/projects/ProjectsNextStepHero.tsx');
    expect(graph.has(TIMELINE_CSS)).toBe(true);
  });

  it('every portal route rendering tl- classes imports timeline.css somewhere in its own chunk', () => {
    const offenders: string[] = [];
    for (const { name, file } of lazyRouteEntries()) {
      const graph = moduleGraph(file);
      const users = timelineClassUsers(graph);
      if (users.length && !graph.has(TIMELINE_CSS)) {
        offenders.push(`${name} renders ${users.join(', ')} but its chunk never imports timeline.css`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
