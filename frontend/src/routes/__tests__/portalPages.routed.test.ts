/**
 * Every file in the portal page tree is reachable from the portal's route
 * table (Growth Journey OS Phase 6, T603).
 *
 * T514 mounted a card in `PortalDashboardPage.tsx`, a page nothing routed to.
 * Every test of the card rendered the card, so every test passed; the bundler
 * dropped the page and production carried no card. T521's route-chain suite
 * closed that for ONE card by walking its importers. This is the same check
 * generalised to the tree: resolve the imports of `routes/portalRoutes.tsx`
 * transitively, and every `.ts`/`.tsx` file under `pages/portal/` must be in
 * the set. A page, panel or helper that nothing on a route can reach is either
 * work in progress nobody can see or code to delete - and either way the next
 * person should have to say which, here, on purpose.
 *
 * The walk reads source (no bundler, no jsdom): relative `from '...'` and
 * `import('...')` specifiers, resolved as CRA resolves them (`.tsx`, `.ts`,
 * `index.tsx`, `index.ts`). Package imports are ignored - nothing under
 * `pages/portal` is reachable through `node_modules`.
 *
 * Comments are stripped before the match, because a COMMENTED-OUT import is the
 * one way this walk could call a dead file alive: the T603 verifier commented a
 * page's lazy import out and the suite stayed green (the build caught it - TS2304
 * on the name the route still used - but a check should not lean on another
 * check for the one shape that fools it).
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..');
const PORTAL = path.join(SRC, 'pages', 'portal');
const ENTRY = path.join(SRC, 'routes', 'portalRoutes.tsx');

/**
 * Unreachable today, each with its own reason, and NOT this task's to delete.
 * The list is asserted exactly: a fourth unreachable file fails this suite.
 *
 * All three predate the Growth Journey run (last touched in #1895, 2026-08-27)
 * and belong to the student-platform work:
 *   - `feed/todayFeed.ts` + `feed/FeedCard.tsx` are a dead pair (the helper
 *     imports the card; nothing imports the helper). The live Today feed is
 *     `today/todayFeedApi.ts` / `today/TodayFeedV2.tsx`, different files.
 *   - `projects/projectWorkspacePrompt.ts` is named only by a COMMENT in
 *     `services/deliveryModes.ts`, never imported.
 * Recorded for their owners rather than removed by a journey task; whoever
 * deletes them deletes the line here in the same commit.
 */
const KNOWN_UNREACHABLE = [
  'pages/portal/feed/FeedCard.tsx',
  'pages/portal/feed/todayFeed.ts',
  'pages/portal/projects/projectWorkspacePrompt.ts',
];

const rel = (p: string) => path.relative(SRC, p).split(path.sep).join('/');

function resolveSpec(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [`${base}.tsx`, `${base}.ts`, path.join(base, 'index.tsx'), path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** The file's source with comments removed, so a specifier inside one is not an import. Strings keep their quotes. */
export function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split(/\r?\n/)
    .map((line) => {
      // `//` outside a quoted string starts a comment; a quote toggles the string it opens.
      let quote: string | null = null;
      for (let i = 0; i < line.length; i += 1) {
        const c = line[i];
        if (quote) {
          if (c === '\\') i += 1;
          else if (c === quote) quote = null;
          continue;
        }
        if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
        if (c === '/' && line[i + 1] === '/') return line.slice(0, i);
      }
      return line;
    })
    .join('\n');
}

const specifiersOf = (file: string): string[] =>
  [...codeOf(fs.readFileSync(file, 'utf8')).matchAll(/from\s+'([^']+)'|import\('([^']+)'\)/g)].map((m) => m[1] || m[2]);

/** Every source file reachable from `entry` by relative imports, transitively. */
function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of specifiersOf(file)) {
      const resolved = resolveSpec(file, spec);
      if (resolved && !seen.has(resolved)) stack.push(resolved);
    }
  }
  return seen;
}

/** Every source file under `dir`, tests excluded. */
function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full);
        continue;
      }
      if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

const reachable = reachableFrom(ENTRY);
const portalFiles = sourceFilesUnder(PORTAL);
const unreachable = portalFiles.filter((f) => !reachable.has(f)).map(rel);

describe('the portal page tree is reachable from the route table', () => {
  it('reads code, not comments: a specifier inside a comment is not an import', () => {
    const line = "const X = lazy(() => import('../pages/portal/PortalLoginPage'));";
    expect(codeOf(`// ${line}`)).not.toContain('PortalLoginPage');
    expect(codeOf(`/* ${line} */`)).not.toContain('PortalLoginPage');
    expect(codeOf(line)).toContain('PortalLoginPage');
    // A `//` inside a string is not a comment, and the line survives whole.
    expect(codeOf("const u = 'https://x/y'; // trailing")).toBe("const u = 'https://x/y'; ");
  });

  it('the walk is not vacuous: it finds the route table, a routed page and a component the shell imports', () => {
    expect(portalFiles.length).toBeGreaterThan(100);
    expect(reachable.has(ENTRY)).toBe(true);
    for (const file of ['pages/portal/today/TodayShell.tsx', 'pages/portal/today/TodayJourneyNudges.tsx', 'pages/portal/PortalLoginPage.tsx', 'pages/portal/SkillMeter.tsx']) {
      expect([...reachable].map(rel)).toContain(file);
    }
  });

  it('every file under pages/portal is reachable, apart from the three named above', () => {
    expect(unreachable).toEqual(KNOWN_UNREACHABLE);
  });

  it('every page directly at pages/portal/*.tsx is reachable - no exceptions there at all', () => {
    const top = portalFiles.filter((f) => path.dirname(f) === PORTAL);
    expect(top.length).toBeGreaterThan(10);
    expect(top.filter((f) => !reachable.has(f)).map(rel)).toEqual([]);
  });

  it('the two pages T514 and T521 found unrouted are gone, and nothing names them', () => {
    for (const gone of ['PortalDashboardPage', 'PortalCurriculumPage']) {
      expect(fs.existsSync(path.join(PORTAL, `${gone}.tsx`))).toBe(false);
      const namedBy = sourceFilesUnder(SRC).filter((f) => fs.readFileSync(f, 'utf8').includes(gone)).map(rel);
      expect(namedBy).toEqual([]);
    }
  });
});
