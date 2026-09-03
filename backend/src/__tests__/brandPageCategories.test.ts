/**
 * Every page of a mapped brand means something to the intent engine.
 *
 * WHY THIS EXISTS. `categorizePagePath` decides what a page is, and almost every intent
 * signal reads that decision. When it does not recognise a path it returns `other`, which
 * is indistinguishable from a page nobody visited: no error, no warning, no failed build.
 * The site looks instrumented, events flow, and the score is zero forever.
 *
 * That is exactly what happened to all three brand apps. Twenty instrumented pages, and
 * the categoriser only knew Colaberry's routes, so eleven of the twenty signal types the
 * scorer defines — including the four strongest — could never fire.
 *
 * A convention would not have caught it. Adding a page is the moment the gap appears, and
 * nothing about adding a page makes anyone think about a scoring table in the backend. So
 * this test walks the pages actually on disk and fails when one of them means nothing.
 *
 * Reads app markup with `fs` rather than importing from `apps/`, so it adds no module
 * coupling and cannot trip the extraction boundary validator.
 */
import fs from 'fs';
import path from 'path';
import { categorizePagePath } from '../services/visitorTrackingService';
import { BRAND_PAGE_CATEGORIES, BRANDS_AWAITING_CATEGORY_MAP } from '../services/pageCategoryMaps';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const APPS_DIR = path.join(REPO_ROOT, 'apps');

/**
 * Pages that legitimately carry no commercial meaning. Each needs a reason, because an
 * empty-by-default exception list is how a guard quietly stops guarding.
 */
const ALLOWED_UNCATEGORISED: Record<string, string> = {
  // (brand:path) -> why
};

interface AppPages {
  app: string;
  brandSlug: string;
  paths: string[];
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.html') ? [full] : [];
  });
}

/** `src/start/index.html` -> `/start`; `src/index.html` -> `/`; `src/a.html` -> `/a`. */
function urlPathFor(srcDir: string, file: string): string {
  const rel = path.relative(srcDir, file).split(path.sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'/index.html'.length);
  return '/' + rel.replace(/\.html$/, '');
}

function appsWithPages(): AppPages[] {
  if (!fs.existsSync(APPS_DIR)) return [];
  return fs
    .readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const appDir = path.join(APPS_DIR, e.name);
      const configPath = path.join(appDir, 'brand.config.js');
      const srcDir = path.join(appDir, 'src');
      if (!fs.existsSync(configPath) || !fs.existsSync(srcDir)) return null;
      const match = fs.readFileSync(configPath, 'utf8').match(/brandSlug:\s*'([^']+)'/);
      if (!match) return null;
      return {
        app: e.name,
        brandSlug: match[1],
        paths: walk(srcDir).map((f) => urlPathFor(srcDir, f)).sort(),
      };
    })
    .filter((x): x is AppPages => x !== null);
}

describe('brand page categories', () => {
  const apps = appsWithPages();
  const mapped = apps.filter((a) => BRAND_PAGE_CATEGORIES[a.brandSlug]);

  it('finds apps, pages and maps at all — a green run over nothing proves nothing', () => {
    expect(apps.length).toBeGreaterThanOrEqual(3);
    expect(apps.reduce((n, a) => n + a.paths.length, 0)).toBeGreaterThanOrEqual(15);
    expect(mapped.length).toBeGreaterThanOrEqual(1);
  });

  describe.each(mapped.map((a) => [a.brandSlug, a] as const))(
    '%s: every page carries a meaning',
    (brandSlug, app) => {
      it.each(app.paths)('%s is not uncategorised', (urlPath) => {
        const category = categorizePagePath(urlPath, brandSlug);
        if (ALLOWED_UNCATEGORISED[`${brandSlug}:${urlPath}`]) {
          expect(category).toBe('other');
          return;
        }
        expect(category).not.toBe('other');
      });
    },
  );

  it('a mapped brand never inherits another brand\'s rules', () => {
    // The original bug in miniature. `/about` is a key in the global Colaberry map,
    // where it means `homepage`. AI Flotation's /about is a company page, and before
    // this change it was confidently mislabelled with Colaberry's answer.
    expect(categorizePagePath('/about', 'ai-flotation')).toBe('about');
    expect(categorizePagePath('/about')).toBe('homepage');

    // A path the platform knows and this brand does not must NOT resolve through the
    // global map just because it happens to exist there.
    expect(categorizePagePath('/stories', 'ai-flotation')).toBe('other');
    expect(categorizePagePath('/stories')).toBe('case_studies');
  });

  it('the conversion page earns the strongest page signal', () => {
    // /start carries the intake form and the submit CTA. `enroll` is strength 45, the
    // highest single page-visit signal the scorer defines. If this regresses to `other`
    // the funnel goes blind again and nothing else fails.
    expect(categorizePagePath('/start', 'ai-flotation')).toBe('enroll');
  });

  it('the platform is untouched when no brand is supplied', () => {
    const unchanged: Array<[string, string]> = [
      ['/', 'homepage'],
      ['/pricing', 'pricing'],
      ['/enroll', 'enroll'],
      ['/stories', 'case_studies'],
      ['/stories/some-slug', 'case_studies'],
      ['/contact', 'contact'],
      ['/advisory', 'advisory'],
      ['/portal/dashboard', 'portal'],
      ['/admin/leads', 'admin'],
      ['/utility-iou', 'pricing'],
      ['/nonsense-route', 'other'],
    ];
    for (const [p, expected] of unchanged) {
      expect([p, categorizePagePath(p)]).toEqual([p, expected]);
      // An unresolved brand must degrade to the same answer, never to nothing.
      expect([p, categorizePagePath(p, undefined)]).toEqual([p, expected]);
    }
  });

  it('trailing slashes and query strings do not change a brand answer', () => {
    expect(categorizePagePath('/start/', 'ai-flotation')).toBe('enroll');
    expect(categorizePagePath('/start?utm_source=x', 'ai-flotation')).toBe('enroll');
  });

  it('names the brands still awaiting a map, so the backlog is visible', () => {
    // Not a failure: these are Phase 2. The assertion is that the list stays honest —
    // a brand cannot be quietly dropped from it without also gaining a real map.
    for (const brandSlug of BRANDS_AWAITING_CATEGORY_MAP) {
      expect(BRAND_PAGE_CATEGORIES[brandSlug]).toBeUndefined();
    }
    const unmapped = apps
      .filter((a) => !BRAND_PAGE_CATEGORIES[a.brandSlug])
      .map((a) => a.brandSlug)
      .sort();
    expect(unmapped).toEqual([...BRANDS_AWAITING_CATEGORY_MAP].sort());
  });
});
