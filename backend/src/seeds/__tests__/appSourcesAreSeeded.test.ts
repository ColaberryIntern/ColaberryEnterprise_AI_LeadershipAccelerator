import * as fs from 'fs';
import * as path from 'path';

/**
 * Every (source, entry) a public app posts to must exist in seedLeadSources.
 *
 * This bug has now happened three times. `ecosystemSeedData.ts` declares
 * `lead_source_slugs: ['cpn']`, which reads like it creates the source — it does not, it
 * only tells the backfill which brand an existing source belongs to. So `cpn`,
 * `ai-flotation` and `refactored` all shipped with public forms posting to sources that
 * were never created, and `/api/leads/ingest` answers "Unknown or inactive source".
 *
 * Nothing caught it because nothing connected the two sides: the apps are static HTML the
 * backend never imports, and the seeder is a data file no app references. This test is
 * that connection. It reads the built app markup with `fs` rather than importing anything
 * from `apps/`, so it introduces no module coupling and cannot trip the extraction
 * boundary validator.
 *
 * It fails loudly the next time someone adds a form to a brand site and forgets the
 * source — which is exactly the failure mode that took a live E2E run to notice.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const APPS_DIR = path.join(REPO_ROOT, 'apps');
const SEEDER = path.join(REPO_ROOT, 'backend', 'src', 'seeds', 'seedLeadSources.ts');

/**
 * (source, entry) pairs the seeder defines, parsed from the source file.
 *
 * Parsed as TEXT rather than imported, because `seedLeadSources.ts` calls `run()` at the
 * bottom of the module — importing it would connect to a database and start seeding.
 *
 * The structure it relies on: every `slug:` is indented, and indentation says what kind
 * it is. A source sits at 4 spaces inside the SEEDS array; an entry point sits deeper
 * inside that source's `entry_points`. So the first slug at source depth opens a source,
 * and every deeper slug until the next one is an entry of it.
 */
function seededPairs(): Set<string> {
  const pairs = new Set<string>();
  let source: string | null = null;

  for (const line of fs.readFileSync(SEEDER, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^(\s*)slug: '([a-z0-9_-]+)'/);
    if (!m) continue;
    const [, indent, slug] = m;
    if (indent.length <= 4) source = slug;      // source level
    else if (source) pairs.add(`${source}|${slug}`); // entry point of the current source
  }
  return pairs;
}

/** (source, entry) pairs the apps actually post to, read out of their HTML. */
function appPairs(): Array<{ app: string; file: string; source: string; entry: string }> {
  const found: Array<{ app: string; file: string; source: string; entry: string }> = [];
  if (!fs.existsSync(APPS_DIR)) return found;

  for (const app of fs.readdirSync(APPS_DIR)) {
    const srcDir = path.join(APPS_DIR, app, 'src');
    if (!fs.existsSync(srcDir)) continue;

    for (const file of fs.readdirSync(srcDir)) {
      if (!file.endsWith('.html')) continue;
      const html = fs.readFileSync(path.join(srcDir, file), 'utf8');
      for (const m of html.matchAll(/ingest\?source=([a-z0-9{}.\-]+)&entry=([a-z0-9_]+)/gi)) {
        // `{{brand.sourceSlug}}` is substituted at build time; resolve it from the app's
        // brand config so the assertion is about the real slug, not the token.
        let source = m[1];
        if (source.includes('{{')) {
          const cfg = fs.readFileSync(path.join(APPS_DIR, app, 'brand.config.js'), 'utf8');
          source = (cfg.match(/sourceSlug:\s*'([a-z0-9-]+)'/) || [, ''])[1];
        }
        found.push({ app, file, source, entry: m[2] });
      }
    }
  }
  return found;
}

describe('public app forms post to sources that actually exist', () => {
  const apps = appPairs();
  const seeded = seededPairs();

  it('finds the forms at all — a passing test over zero forms would prove nothing', () => {
    expect(apps.length).toBeGreaterThan(0);
    expect(seeded.size).toBeGreaterThan(0);
  });

  it('every (source, entry) an app posts to is defined in seedLeadSources', () => {
    const missing = apps
      .filter((a) => !seeded.has(`${a.source}|${a.entry}`))
      .map((a) => `${a.app}/${a.file} posts to source=${a.source}&entry=${a.entry}`);

    expect(missing).toEqual([]);
  });

  it('no app posts to the non-existent /api/ingest path', () => {
    // The other half of the same defect: `/api/ingest` is not a route. The real endpoint
    // is `/api/leads/ingest`, and the catch-all /api/* guard answers 401, which reads
    // exactly like an auth bug rather than a wrong path.
    const wrong: string[] = [];
    for (const app of fs.existsSync(APPS_DIR) ? fs.readdirSync(APPS_DIR) : []) {
      const srcDir = path.join(APPS_DIR, app, 'src');
      if (!fs.existsSync(srcDir)) continue;
      for (const file of fs.readdirSync(srcDir)) {
        if (!file.endsWith('.html')) continue;
        const html = fs.readFileSync(path.join(srcDir, file), 'utf8');
        if (/(?<!leads)\/api\/ingest\?/.test(html)) wrong.push(`${app}/${file}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
