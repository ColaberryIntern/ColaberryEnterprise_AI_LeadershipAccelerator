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
