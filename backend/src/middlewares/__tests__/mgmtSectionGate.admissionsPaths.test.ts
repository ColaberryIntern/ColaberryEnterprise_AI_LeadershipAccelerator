/**
 * The admissions operating surface, and the gap that hid it.
 *
 * `admissionsRoutes.ts` mounts nine routes under `/api/admin/admissions`, each guarded by
 * `requireAdmin`. None of them was classified in `PATH_SECTION` until 2026-11-12, which made
 * the whole surface deny-by-default for every scoped management token.
 *
 * ## Why neither standing guard caught it
 *
 * `guardedPathsAreClassified.test.ts` walks back from each `requireSection` call to the router
 * it guards. These nine carry only `requireAdmin`, so there was no `requireSection` to walk
 * back from — the test cannot see a route that never asks for a section.
 *
 * `unlistedPaths.test.ts` pins a fixed list of surfaces someone had already noticed.
 *
 * So the failure mode is a route that looks complete in its own file. The asymmetry that makes
 * it a bug lives in the gate, not the route: an unmapped path PASSES for a legacy admin (no
 * `mgmt_role`, so the gate returns on its first branch) and for `mgmt_role === 'admin'` (whose
 * branch denies only mapped-and-forbidden paths), and is REFUSED for every scoped role. It
 * works for everyone wide enough not to notice.
 *
 * This file is the per-surface guard, in the shape `mgmtSectionGate.brandPaths.test.ts` uses.
 */

import { pathToSection } from '../mgmtSectionGate';
import { sectionsForRole } from '../../services/access/mgmtRoles';

/** Every route in `admissionsRoutes.ts`, by path. Nine, and the count is asserted below. */
const ADMISSIONS_ROUTES = [
  '/api/admin/admissions/stats',
  '/api/admin/admissions/conversations',
  '/api/admin/admissions/knowledge',
  '/api/admin/admissions/knowledge/123',
  '/api/admin/admissions/operations',
  '/api/admin/admissions/callbacks',
  '/api/admin/admissions/call-log',
  '/api/admin/admissions/documents',
];

describe('the admissions surface is classified', () => {
  it.each(ADMISSIONS_ROUTES)('%s resolves to lead_ingestion', (path) => {
    expect(pathToSection(path)).toBe('lead_ingestion');
  });

  it('classifies the bare prefix and any deeper route under it', () => {
    // The nine routes are all sub-paths, but a prefix row must hold for paths added later too,
    // or the next admissions route reintroduces the same latent 403.
    expect(pathToSection('/api/admin/admissions')).toBe('lead_ingestion');
    expect(pathToSection('/api/admin/admissions/some/deeper/route')).toBe('lead_ingestion');
  });

  it('does not claim a neighbour that merely shares the prefix string', () => {
    // `matchesPrefix` requires an exact match or a '/' boundary. Without that, a future
    // '/api/admin/admissions-review' would be silently swallowed into lead_ingestion.
    expect(pathToSection('/api/admin/admissionsomething')).not.toBe('lead_ingestion');
    expect(pathToSection('/api/admin/admissions-review')).not.toBe('lead_ingestion');
  });
});

describe('who the row admits, and who it does not', () => {
  /**
   * The point of the row: the two roles that own the intake funnel can now reach the surface
   * their own domain runs on. `lead_intake` is the narrow half of the admissions split and is
   * what the admissions domain's manager is granted.
   */
  it.each(['admissions', 'lead_intake'])('%s holds the section this surface needs', (role) => {
    expect(sectionsForRole(role)).toContain('lead_ingestion');
  });

  it('still refuses a scoped role from another domain', () => {
    // Classifying a path is not widening it. A role without lead_ingestion is refused by the
    // gate's final test exactly as before — the row changes the REASON, not the answer.
    for (const role of ['marketing', 'curriculum', 'product_experience', 'support', 'mentor']) {
      expect(sectionsForRole(role)).not.toContain('lead_ingestion');
    }
  });

  it('takes the surface away from nobody, because nobody could reach it before', () => {
    // The condition brandPaths.test.ts names for adding a classification safely: every role
    // that legitimately reaches a surface must be checked in the same change. Before this row
    // the path was unmapped, so EVERY scoped role was denied by default and none can regress.
    // owner and admin derive from ALL_SECTIONS / ADMIN_EXCEPT_INBOX and both hold it.
    expect(sectionsForRole('owner')).toContain('lead_ingestion');
    expect(sectionsForRole('admin')).toContain('lead_ingestion');
  });
});

describe('the route file and this list have not drifted apart', () => {
  it('still has exactly nine routes', () => {
    // Read from source rather than trusted: a tenth route added without a thought for this
    // gate is the failure this whole file documents, and it should fail here loudly.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'routes', 'admin', 'admissionsRoutes.ts'),
      'utf8',
    );
    const routes = src.match(/^router\.(get|post|put|patch|delete)\(/gm) ?? [];
    expect(routes).toHaveLength(9);
  });

  it('classifies every path the route file actually declares', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'routes', 'admin', 'admissionsRoutes.ts'),
      'utf8',
    );
    const declared = [...src.matchAll(/router\.(?:get|post|put|patch|delete)\(\s*'([^']+)'/g)]
      .map((m) => m[1]);
    expect(declared.length).toBe(9);
    for (const decl of declared) {
      // Express params cannot appear in a static prefix table, so substitute a value.
      const concrete = decl.replace(/:[A-Za-z0-9_]+/g, '123');
      expect(pathToSection(concrete)).toBe('lead_ingestion');
    }
  });
});
