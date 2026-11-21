/**
 * The Connected Demo schema is actually wired into boot.
 *
 * ## Why this test exists
 *
 * `ensureConnectedDemoSchema.ts` was created in one commit and called in another, three commits
 * later. In between, the module existed, was fully unit-tested, and ran nowhere: the three
 * columns would not have been on any environment that had not been migrated by hand. A verifier
 * caught the gap. Nothing failed in the meantime, which is the problem - a schema module with no
 * call site passes every test it has.
 *
 * ## Why it reads the source text
 *
 * Importing `server.ts` would start the application: it opens a database pool, registers crons
 * and binds a port. The property under test is a property of the TEXT - that the call exists, in
 * the right place, wrapped - and `mountLearnerPortalRoutes.test.ts` already establishes this
 * pattern in the repo for exactly that reason.
 */
import fs from 'fs';
import path from 'path';
import { CONNECTED_DEMO_COLUMNS } from '../ensureConnectedDemoSchema';

const SERVER = fs.readFileSync(path.resolve(__dirname, '../../server.ts'), 'utf8');

describe('ensureConnectedDemoSchema is called at boot', () => {
  it('is imported', () => {
    expect(SERVER).toContain(
      "import { ensureConnectedDemoSchema } from './db/ensureConnectedDemoSchema';",
    );
  });

  it('is called exactly once', () => {
    expect(SERVER.split('await ensureConnectedDemoSchema()').length - 1).toBe(1);
  });

  it('runs AFTER the lifecycle schema, which also alters projects', () => {
    const lifecycle = SERVER.indexOf('await ensureProjectLifecycleSchema();');
    const demo = SERVER.indexOf('await ensureConnectedDemoSchema()');
    expect(lifecycle).toBeGreaterThan(-1);
    expect(demo).toBeGreaterThan(lifecycle);
  });

  it('is wrapped, so a demo feature cannot take the platform down on boot', () => {
    // Every other ensure here is wrapped for the same reason. The difference this module makes is
    // that it REJECTS rather than warning, so this catch receives a real failure instead of
    // nothing at all - which is the defect that sits in ensureProjectLifecycleSchema next door.
    const at = SERVER.indexOf('await ensureConnectedDemoSchema()');
    const window = SERVER.slice(Math.max(0, at - 400), at + 400);
    expect(window).toContain('try {');
    expect(window).toMatch(/catch\s*\(/);
    expect(window).toContain('connected demo schema unavailable');
  });

  it('the module it calls still guarantees the three columns the route depends on', () => {
    // Binds the boot call to the thing it is for. If somebody narrows the column list, this
    // fails here as well as in the module's own suite.
    expect([...CONNECTED_DEMO_COLUMNS]).toEqual([
      'demo_share_token',
      'demo_share_enabled',
      'demo_spec',
    ]);
  });

  it('the public route is mounted, so the columns have a reader', () => {
    expect(SERVER).toContain("import demoRoutes from './routes/demoRoutes';");
    expect(SERVER.split('app.use(demoRoutes);').length - 1).toBe(1);
  });
});

/**
 * The producer is reachable from production code, not only from a test.
 *
 * T6's verification flagged that `generateConnectedDemo` had ZERO production importers: fully
 * built, fully tested, and callable by nothing. A module in that state passes every test it has
 * and does nothing at all, which is the "no task writes a row" finding in a different costume.
 *
 * Source-level because the property is about the import GRAPH, and importing the graph to check
 * it would start the application.
 */
describe('generateConnectedDemo has a production call site', () => {
  const SRC = path.resolve(__dirname, '../..');

  /** Every non-test .ts under src that imports the producer. */
  function importers(): string[] {
    const found: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) continue;
        if (full.endsWith(`connectedDemoStore.ts`)) continue; // the module itself
        const text = fs.readFileSync(full, 'utf8');
        if (/from\s+'[^']*connectedDemoStore'/.test(text)) found.push(path.relative(SRC, full));
      }
    };
    walk(SRC);
    return found.sort();
  }

  it('is imported by at least one non-test module', () => {
    const found = importers();
    expect(found.length).toBeGreaterThan(0);
  });

  it('is imported by the publish service specifically', () => {
    expect(importers()).toContain(path.join('services', 'connectedDemoShareService.ts'));
  });

  it('and that service is reachable from a route', () => {
    const routes = fs.readFileSync(path.resolve(SRC, 'routes/projectRoutes.ts'), 'utf8');
    expect(routes).toContain('connectedDemoShareService');
    expect(routes).toContain("router.post('/api/portal/project/demo/share'");
  });

  it('the sweep is not vacuous: it finds no importer for a name that has none', () => {
    // Guards the walk itself. If the traversal silently stopped matching, the assertions above
    // would pass by finding nothing and reporting nothing.
    const text = fs.readFileSync(path.resolve(SRC, 'services/connectedDemoShareService.ts'), 'utf8');
    expect(text).toMatch(/from\s+'[^']*connectedDemoStore'/);
    expect(/from\s+'[^']*noSuchModuleAnywhere'/.test(text)).toBe(false);
  });
});
