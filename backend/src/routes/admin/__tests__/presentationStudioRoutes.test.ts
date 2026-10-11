import fs from 'fs';
import path from 'path';

/**
 * The instructor control surface, checked as source text.
 *
 * Two things this defends, both named by the build spec:
 *
 *   1. EVERY route is `requireAdmin` — PER ROUTE. The repo's route-auth lint is per
 *      FILE, so one guarded route would let an unguarded sibling through.
 *   2. The bulk session map is PLAN and COMMIT, never one endpoint with a flag. A
 *      single `dryRun` boolean is one forgotten `if` away from rebinding a whole
 *      cohort's demo slots.
 */

const ROUTES = path.join(__dirname, '..', 'presentationStudioRoutes.ts');
const SRC = fs.readFileSync(ROUTES, 'utf8');

/** Every `router.<verb>(...)` registration line. */
const REGISTRATIONS = SRC.split('\n').filter((l) => /^\s*router\.(get|post|put|patch|delete)\(/.test(l));

describe('the instructor surface is admin-only, per route', () => {
  it('positive control: found a real set of routes', () => {
    expect(REGISTRATIONS.length).toBeGreaterThanOrEqual(6);
    expect(SRC).toContain('required-template');
    expect(SRC).toContain('readiness');
  });

  it.each(REGISTRATIONS)('%s carries requireAdmin on its own line', (line) => {
    expect(line).toContain('requireAdmin');
  });

  it('every route is behind the Studio flag', () => {
    // `gate(res)` 404s when the Studio is off — a flagged-off feature does not exist
    // rather than existing-but-forbidden.
    const gateCount = (SRC.match(/if \(!gate\(res\)\) return;/g) || []).length;
    expect(gateCount).toBe(REGISTRATIONS.length);
  });
});

describe('the session map is a dry run and a separate commit', () => {
  it('exposes plan and commit as two routes, both POST', () => {
    const plan = REGISTRATIONS.filter((l) => l.includes('session-map/plan'));
    const commit = REGISTRATIONS.filter((l) => l.includes('session-map/commit'));
    expect(plan).toHaveLength(1);
    expect(commit).toHaveLength(1);
    expect(plan[0]).toContain('router.post(');
    expect(commit[0]).toContain('router.post(');
  });

  // A flag on one endpoint is exactly the shape this avoids.
  it('takes no dryRun flag anywhere', () => {
    expect(SRC).not.toMatch(/dry_?[Rr]un\s*:\s*z\.boolean/);
    expect(SRC).not.toMatch(/dryRun\s*=/);
  });

  it('the plan route calls only the read function, and commit only the writer', () => {
    const planBlock = SRC.slice(SRC.indexOf("session-map/plan'"), SRC.indexOf("session-map/commit'"));
    expect(planBlock).toContain('planSessionMap');
    expect(planBlock).not.toContain('commitSessionMap');

    const commitBlock = SRC.slice(SRC.indexOf("session-map/commit'"));
    expect(commitBlock).toContain('commitSessionMap');
  });

  /**
   * The plan is handed to the client and comes back as input, so it is untrusted on
   * the return trip. The schema shape-checks it; the SERVICE re-proves every row's
   * cohort and story against the database. This test pins that the route does not
   * quietly become the authority instead.
   */
  it('validates the returned plan with a strict schema and does not re-derive it', () => {
    const commitBlock = SRC.slice(SRC.indexOf('const commitBody'));
    expect(commitBlock).toContain('.strict()');
    expect(commitBlock).toContain('z.literal(true)');
    expect(commitBlock).toContain('uuid()');
    // Row count is bounded: an unbounded array is a free denial-of-service.
    // Anchored on the ROWS array close specifically. A bare /\.max\(\d+\)/ passes
    // against the .max(60) on storyId, which is how this assertion was vacuous when
    // first written - deleting the real bound broke no test.
    expect(commitBlock).toContain('})).max(');
  });

  it('records WHO committed, from the session rather than the body', () => {
    const commitBlock = SRC.slice(SRC.indexOf("session-map/commit'"));
    expect(commitBlock).toContain('req as any).admin');
    expect(commitBlock).not.toMatch(/actorId:\s*b\./);
  });
});

describe('nothing on this surface completes a task or pays anyone', () => {
  it('never reaches the completion writer or the points award', () => {
    for (const forbidden of ['markTaskVerifiedComplete', 'payPrepTask', 'award(']) {
      expect(SRC).not.toContain(forbidden);
    }
  });
});
