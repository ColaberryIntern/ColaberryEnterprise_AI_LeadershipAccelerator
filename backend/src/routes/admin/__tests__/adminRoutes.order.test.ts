import * as fs from 'fs';
import * as path from 'path';

/**
 * Mount order in `adminRoutes.ts`, where order is behaviour (Phase 6, T604).
 *
 * `growthJourneyRoutes` applies `requireGrowthJourneyEnabled` with
 * `router.use(BASE, ...)` over the whole `/api/admin/growth-journey` prefix.
 * Express matches middleware in mount order, so the status registry answers
 * 200 with the master flag off ONLY while its router is mounted above that one.
 * `growthJourneyStatusRoutes.access.test.ts` proves the consequence by mounting
 * both routers and asking for both paths; this suite pins the cause, in the
 * file where a later reorder would happen, so the reason travels with the line.
 *
 * It reads source rather than the built router because the property is textual:
 * which `router.use(...)` line comes first.
 */

const ADMIN_ROUTES = path.join(__dirname, '..', '..', 'adminRoutes.ts');
const SOURCE = fs.readFileSync(ADMIN_ROUTES, 'utf8');

/** The index of a mount line, asserted present so a rename cannot make this vacuous. */
function mountIndex(router: string): number {
  const at = SOURCE.indexOf(`router.use(${router});`);
  expect(at).toBeGreaterThan(-1);
  return at;
}

describe('the Growth Journey status router is mounted before the flag-gated one', () => {
  it('status above journey', () => {
    expect(mountIndex('growthJourneyStatusRoutes')).toBeLessThan(mountIndex('growthJourneyRoutes'));
  });

  it('each is mounted exactly once, with no path prefix (the sub-routers declare full paths)', () => {
    for (const router of ['growthJourneyStatusRoutes', 'growthJourneyRoutes']) {
      expect(SOURCE.match(new RegExp(`router\\.use\\(${router}\\)`, 'g'))).toHaveLength(1);
      expect(SOURCE).not.toMatch(new RegExp(`router\\.use\\('[^']*',\\s*${router}\\)`));
    }
  });

  it('the line carries the reason, so a reorder has to argue with a comment', () => {
    const statusAt = mountIndex('growthJourneyStatusRoutes');
    const preceding = SOURCE.slice(0, statusAt);
    expect(preceding).toContain('MUST STAY ABOVE');
  });

  it('the flag guard this ordering exists for is still applied over the whole prefix', () => {
    const journey = fs.readFileSync(path.join(__dirname, '..', 'growthJourneyRoutes.ts'), 'utf8');
    expect(journey).toContain('router.use(BASE, requireGrowthJourneyEnabled);');
    const status = fs.readFileSync(path.join(__dirname, '..', 'growthJourneyStatusRoutes.ts'), 'utf8');
    // It may NAME the guard (its header explains the ordering); it must not apply it or import it.
    expect(status).not.toMatch(/router\.use\([^)]*requireGrowthJourneyEnabled/);
    expect(status).not.toMatch(/^import .*requireGrowthJourneyEnabled/m);
    expect(status).toContain('router.use(BASE, requireAdmin);');
  });
});
