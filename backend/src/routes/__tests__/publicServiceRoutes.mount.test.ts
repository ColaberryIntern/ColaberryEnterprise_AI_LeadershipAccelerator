/**
 * publicServiceRoutes - mount order and router structure.
 *
 * WHY STRUCTURAL AND NOT ONLY HTTP. The failure this guards against - mounting
 * a public router below `adminRoutes`, which mounts an unscoped `requireAdmin`
 * - turns the endpoint into a 401 for every anonymous visitor while every
 * authenticated smoke test still passes. A 200 in a logged-in browser proves
 * nothing about it. So the ordering is asserted against the text of
 * `server.ts`, the path against `router.stack`, and the "never a bare
 * router.use" rule against Express's own `fast_slash` flag.
 *
 * Mirrors publicCaseStudyRoutes.mount.test.ts deliberately: same failure, same
 * shape of guard. No database, no network, no supertest.
 */

import fs from 'fs';
import path from 'path';
import publicServiceRoutes from '../publicServiceRoutes';

const BACKEND = path.join(__dirname, '../../..');
const read = (rel: string): string => fs.readFileSync(path.join(BACKEND, rel), 'utf8');

interface Layer {
  name: string;
  route?: { path: string; methods: Record<string, boolean> };
  regexp: RegExp & { fast_slash?: boolean };
}

const layers = (): Layer[] => (publicServiceRoutes as unknown as { stack: Layer[] }).stack;

describe('the router declares one public read, absolutely', () => {
  it('declares exactly /api/public/services', () => {
    const declared = layers().filter((l) => l.route).map((l) => l.route!.path);
    expect(declared).toEqual(['/api/public/services']);
  });

  it('declares it as a GET and nothing else, so no write can reach it', () => {
    for (const layer of layers()) {
      if (!layer.route) continue;
      expect(Object.keys(layer.route.methods)).toEqual(['get']);
    }
  });

  it('uses an absolute path, so the flat app.use(router) mount resolves it', () => {
    for (const declared of layers().filter((l) => l.route).map((l) => l.route!.path)) {
      expect(declared.startsWith('/api/public/')).toBe(true);
    }
  });
});

describe('no bare router.use()', () => {
  it('every middleware layer is path-scoped', () => {
    const bare = layers().filter((l) => !l.route && l.regexp.fast_slash === true);
    expect(bare).toEqual([]);
  });

  it('the rate limiter is scoped to the services prefix', () => {
    const sources = layers().filter((l) => !l.route).map((l) => String(l.regexp));
    expect(sources.some((s) => s.includes('services'))).toBe(true);
  });

  it('the source carries the warning, so the next editor sees the rule', () => {
    expect(read('src/routes/publicServiceRoutes.ts')).toMatch(/NEVER a bare `router\.use/);
  });
});

describe('mount order in server.ts', () => {
  const server = read('src/server.ts');
  const lineOf = (needle: string): number =>
    server.split('\n').findIndex((l) => l.trim().startsWith(needle));

  it('is mounted at all', () => {
    expect(lineOf('app.use(publicServiceRoutes);')).toBeGreaterThan(-1);
  });

  it('is mounted ABOVE adminRoutes', () => {
    const mount = lineOf('app.use(publicServiceRoutes);');
    const admin = lineOf('app.use(adminRoutes);');
    expect(admin).toBeGreaterThan(-1);
    expect(mount).toBeLessThan(admin);
  });

  it('carries a note saying why it must stay there', () => {
    const idx = server.indexOf('app.use(publicServiceRoutes);');
    const preamble = server.slice(Math.max(0, idx - 400), idx);
    expect(preamble).toMatch(/above adminRoutes|401/i);
  });
});

describe('the public payload cannot carry the internal evidence fields', () => {
  /*
      The reason this router exists rather than an admin route with the guard
      removed. The admin payload carries the evidence score, the inside/outside
      split and the Gov-match counts; a contracting officer must see none of
      them. Asserted against the projection's SOURCE because the shape is
      defined by what it constructs - a runtime test would need a database and
      would only prove it for whatever rows happened to be there.
  */
  const source = read('src/services/factory/publicGovServices.ts');

  it('never puts a score, a split count or a match count in the public type', () => {
    const typeBlock = source.slice(
      source.indexOf('export interface PublicGovService'),
      source.indexOf('export interface PublicGovCatalog'),
    );
    expect(typeBlock.length).toBeGreaterThan(200);
    for (const banned of ['score', 'insideCount', 'outsideCount', 'suggested', 'govMatch', 'openMatches']) {
      expect(typeBlock).not.toContain(banned);
    }
  });

  it('reads only ACTIVE services, never growth', () => {
    expect(source).toContain("loadTenantServices(container.tenant.id, 'active')");
  });

  it('reads only CONFIRMED links, so a machine suggestion cannot reach the page', () => {
    expect(source).toContain("['confirmed']");
    expect(source).not.toContain("'suggested'");
  });

  it('resolves the tenant from the fixed container, never from the request', () => {
    expect(source).toContain('lookupGovContractsContainer');
    expect(source).not.toMatch(/req\.(query|body|params)/);
  });
});
