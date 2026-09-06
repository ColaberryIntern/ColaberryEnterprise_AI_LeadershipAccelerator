import { readFileSync } from 'fs';
import { join } from 'path';
import { pathToSection } from '../mgmtSectionGate';

/**
 * /api/admin/people is enforced by its route, not by this table.
 *
 * The gate maps ONE section per path. The People roster legitimately serves five
 * — leads, revenue, students, program, career_review — so any single mapping
 * would 403 four of them. Picking 'students' locks out the revenue and
 * admissions roles that personScope says should see people.
 *
 * So it sits in AGNOSTIC, and peopleRoutes does the real check. The frontend
 * mirrors this with API_ENFORCED_PATHS, and these tests exist to stop the two
 * sides drifting apart — a disagreement between them is what produces a link
 * that renders for someone the API then refuses, or a page refused to someone
 * the API would have served.
 */
describe('the People path is enforced by its route', () => {
  it('is not mapped to a single section in this gate', () => {
    // If someone adds a PATH_SECTION row for it, this fails — deliberately.
    expect(pathToSection('/api/admin/people')).toBeNull();
  });

  it('is listed as agnostic here, so scoped roles are not denied before the route runs', () => {
    const source = readFileSync(join(__dirname, '..', 'mgmtSectionGate.ts'), 'utf8');
    const agnostic = source.slice(source.indexOf('const AGNOSTIC'), source.indexOf('function matchesPrefix'));
    expect(agnostic).toContain("'/api/admin/people'");
  });

  it('is matched by the frontend guard as an API-enforced path', () => {
    // The mirror. The frontend cannot import backend code, so agreement is
    // asserted rather than shared.
    const navSource = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'frontend', 'src', 'components', 'Layout', 'adminNav.ts'),
      'utf8',
    );
    expect(navSource).toContain("export const API_ENFORCED_PATHS");
    expect(navSource).toContain("'/admin/people'");
  });

  it('still enforces scope in the route rather than nowhere', () => {
    // The whole justification for the exemption. If this check is ever removed,
    // the path becomes genuinely ungated.
    const routeSource = readFileSync(
      join(__dirname, '..', '..', 'routes', 'admin', 'peopleRoutes.ts'),
      'utf8',
    );
    expect(routeSource).toContain('hasAnyPersonScope');
    expect(routeSource).toContain('adminAllowedSections(req.admin!)');
    // Sections must come from the TOKEN, never from the query string.
    expect(routeSource).not.toMatch(/req\.query\.sections/);
  });
});
