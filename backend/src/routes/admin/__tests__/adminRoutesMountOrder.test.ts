/**
 * adminRoutes mount order — `mgmtSectionGate` must run BEFORE every sub-router.
 *
 * WHY THIS SUITE EXISTS. Independent verification of T013 hoisted
 * `router.use(caseStudyAdminRoutes)` above `router.use(mgmtSectionGate)` in
 * `adminRoutes.ts` and ran fifty suites: **1055 passed, identical to the control
 * run**. A one-line reorder silently disables the section gate for that
 * sub-router and nothing in the repository notices.
 *
 * The failure mode is the nastiest kind. Legacy admin tokens and mgmt
 * `owner`/`admin` pass either way, so it looks correct to whoever tests it — the
 * damage is that scoped management roles (curriculum, revenue, admissions,
 * support, community_organizer) stop being scoped and reach routes their section
 * does not grant. It fails OPEN, and only for the accounts least likely to be
 * used for a manual check.
 *
 * `publicCaseStudyRoutes.mount.test.ts` already does this for the public/admin
 * boundary in `server.ts`. This is the same guard for the gate/sub-router
 * boundary inside `adminRoutes.ts`.
 *
 * It reads the SOURCE rather than the router stack, because Express flattens
 * `router.use` layers into an array whose relative order is what matters and
 * whose provenance is not recoverable at runtime.
 */
import * as fs from 'fs';
import * as path from 'path';

const ADMIN_ROUTES = path.join(__dirname, '..', '..', 'adminRoutes.ts');
const SOURCE = fs.readFileSync(ADMIN_ROUTES, 'utf8');

/** Line index of a `router.use(x);` call, ignoring comments. */
function useIndex(name: string): number {
  const lines = SOURCE.split('\n');
  return lines.findIndex((line) => {
    const code = line.split('//')[0];
    return new RegExp(`router\\.use\\(\\s*${name}\\s*\\)`).test(code);
  });
}

describe('adminRoutes — the section gate runs before every sub-router', () => {
  it('mounts mgmtSectionGate at all', () => {
    // Non-vacuity for every ordering assertion below: if the gate were removed
    // entirely, `useIndex` would return -1 and a naive `gate < router` check
    // would pass trivially.
    expect(useIndex('mgmtSectionGate')).toBeGreaterThanOrEqual(0);
  });

  it('mounts caseStudyAdminRoutes AFTER mgmtSectionGate', () => {
    const gate = useIndex('mgmtSectionGate');
    const caseStudies = useIndex('caseStudyAdminRoutes');

    expect(caseStudies).toBeGreaterThanOrEqual(0);
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(caseStudies).toBeGreaterThan(gate);
  });

  it('mounts EVERY sub-router after mgmtSectionGate, not just the Case Study one', () => {
    // The bug class is not specific to this feature. Any sub-router hoisted
    // above the gate escapes section scoping, so the invariant is asserted over
    // all of them — a future sub-router added in the wrong place fails here.
    const gate = useIndex('mgmtSectionGate');
    const lines = SOURCE.split('\n');

    const before: string[] = [];
    lines.slice(0, gate).forEach((line) => {
      const code = line.split('//')[0];
      const match = code.match(/router\.use\(\s*(\w+)\s*\)/);
      // auditMiddleware legitimately precedes the gate: it records the attempt,
      // it does not authorise it.
      if (match && match[1] !== 'auditMiddleware') before.push(match[1]);
    });

    expect(before).toEqual([]);
  });

  it('keeps the explanatory comment that tells the next reader why order matters', () => {
    // A guard whose reason is undocumented gets "tidied" by someone reorganising
    // imports. The test protects the explanation as well as the line.
    expect(SOURCE).toMatch(/mgmtSectionGate/);
    expect(SOURCE.toLowerCase()).toMatch(/before every admin sub-router|below router\.use\(mgmtsectiongate\)/);
  });
});
