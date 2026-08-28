/**
 * publicCaseStudyRoutes - mount order and router structure. T014 AC1, AC7.
 *
 * WHY A STRUCTURAL SUITE AND NOT ONLY AN HTTP ONE. A 401 in production tells you
 * nothing about which layer produced it, and the failure this guards against
 * (mounting a public router below `adminRoutes`) turns every endpoint here into
 * a 401 for anonymous traffic while every authenticated smoke test still passes.
 * So the ordering is asserted against the text of `server.ts`, the route paths
 * are asserted against `router.stack` (a 200 alone does not prove a path is
 * declared where you think it is), and the "never a bare `router.use`" rule is
 * asserted against Express's own `fast_slash` flag.
 *
 * No database, no network, no supertest.
 */

import fs from 'fs';
import path from 'path';
import publicCaseStudyRoutes from '../publicCaseStudyRoutes';

const BACKEND = path.join(__dirname, '../../..');
const read = (rel: string): string => fs.readFileSync(path.join(BACKEND, rel), 'utf8');

interface Layer {
  name: string;
  route?: { path: string; methods: Record<string, boolean> };
  regexp: RegExp & { fast_slash?: boolean };
}

const layers = (): Layer[] => (publicCaseStudyRoutes as unknown as { stack: Layer[] }).stack;

const EXPECTED_PATHS = [
  '/api/public/case-studies',
  '/api/public/case-studies/:slug',
  '/api/public/case-study-taxonomy',
  '/api/public/case-study-collections/:slug',
];

/* --------------------------------------------------------- declared paths --- */

describe('the router declares the spec §19 paths, absolutely', () => {
  it('declares exactly the four public endpoints', () => {
    const declared = layers().filter((l) => l.route).map((l) => l.route!.path);
    expect(declared.sort()).toEqual([...EXPECTED_PATHS].sort());
  });

  it('declares every one of them as a GET, and nothing else', () => {
    for (const layer of layers()) {
      if (!layer.route) continue;
      expect(Object.keys(layer.route.methods)).toEqual(['get']);
    }
  });

  it('uses absolute paths, so the flat `app.use(router)` mount resolves them', () => {
    for (const declared of layers().filter((l) => l.route).map((l) => l.route!.path)) {
      expect(declared.startsWith('/api/public/')).toBe(true);
    }
  });

  it('declares the list route before the :slug route', () => {
    const declared = layers().filter((l) => l.route).map((l) => l.route!.path);
    expect(declared.indexOf('/api/public/case-studies'))
      .toBeLessThan(declared.indexOf('/api/public/case-studies/:slug'));
  });
});

/* ------------------------------------------------------- path-scoped guards --- */

describe('AC7 - no bare router.use()', () => {
  it('every middleware layer is path-scoped', () => {
    const bare = layers().filter((l) => !l.route && l.regexp.fast_slash === true);
    expect(bare).toEqual([]);
  });

  it('the rate limiter is scoped to all three public prefixes', () => {
    const sources = layers().filter((l) => !l.route).map((l) => String(l.regexp));
    for (const prefix of ['case-studies', 'case-study-taxonomy', 'case-study-collections']) {
      expect(sources.some((s) => s.includes(prefix))).toBe(true);
    }
  });

  it('the source carries the warning, so the next editor sees the rule', () => {
    const source = read('src/routes/publicCaseStudyRoutes.ts');
    expect(source).toMatch(/NEVER a bare `router\.use/);
  });
});

/* -------------------------------------------------------------- server.ts --- */

describe('AC1 - mount order in server.ts', () => {
  const server = read('src/server.ts');
  const lineOf = (needle: string): number =>
    server.split('\n').findIndex((l) => l.trim().startsWith(needle));

  it('adminRoutes is still mounted with no path prefix', () => {
    expect(lineOf('app.use(adminRoutes);')).toBeGreaterThan(-1);
  });

  it('the public block still carries the DO-NOT-MOVE note above adminRoutes', () => {
    expect(server).toMatch(/MUST stay mounted BEFORE adminRoutes/);
    expect(server).toMatch(/DO NOT move these below adminRoutes/);
    const note = server.indexOf('DO NOT move these below adminRoutes');
    expect(note).toBeLessThan(server.indexOf('app.use(adminRoutes);'));
  });

  it('publicCaseStudyRoutes, once mounted, is mounted ABOVE adminRoutes', () => {
    const mount = lineOf('app.use(publicCaseStudyRoutes);');
    const admin = lineOf('app.use(adminRoutes);');
    if (mount === -1) {
      // The orchestrator owns the `server.ts` edit for T014 (a concurrent agent
      // is editing the same block for the admin router). Until it lands there is
      // nothing to order; the moment it lands, this assertion becomes the guard
      // that keeps it above `adminRoutes` forever.
      expect(server).not.toMatch(/publicCaseStudyRoutes/);
      return;
    }
    expect(mount).toBeLessThan(admin);
  });
});

/* ------------------------------------------------ the stand-in is faithful --- */

describe('the admin routers really are guarded without a path scope', () => {
  it('several admin sub-routers still call a bare router.use(requireAdmin)', () => {
    const dir = path.join(BACKEND, 'src/routes/admin');
    const bare = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => /^\s*router\.use\(requireAdmin\);/m.test(
        fs.readFileSync(path.join(dir, f), 'utf8'),
      ));
    // This is what makes a public router mounted below `adminRoutes` return 401
    // rather than 404, and therefore what the mount-order rule is protecting
    // against. If this ever drops to zero the rule can be revisited; until then
    // the stand-in used by `publicCaseStudyRoutes.test.ts` is faithful.
    expect(bare.length).toBeGreaterThanOrEqual(5);
  });
});
