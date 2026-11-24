import { pathToSection } from '../mgmtSectionGate';
import { roleCanAccessSection, MGMT_ROLE_DEFS } from '../../services/access/mgmtRoles';

/**
 * The orchestration-health read set is its own section key, split out of `program` on
 * 2026-11-24.
 *
 * ## Why the split
 *
 * Quincy Nkwain Ninying owns the `platform` agent domain. Step 2 of his capability
 * (orchestration_health_watch) asks him to read the curriculum content health output in the
 * running product. The only key that reached it was `program`, which also carries the
 * accelerator, community roles, the curriculum composer, the AI org, the brain and projects:
 * curriculum's entire department, handed over so he could read three numbers. That over-grant
 * is the exact thing AF2.3 exists to prevent, and the precedent for splitting instead is
 * `brands`, carved out of `campaigns` for Mihret Netsereab in October.
 *
 * ## The condition the brands split named, met here
 *
 * `brandPaths.test.ts` argued that minting a key "would mean every scoped role that
 * legitimately reaches [the surface] loses it until each role definition is edited - a
 * permissions change disguised as a routing change." That names a condition rather than
 * forbidding the split. Here: `owner` and `admin` derive from ALL_SECTIONS and pick the key up
 * for free, and `curriculum` lists it explicitly in the same diff. Production was checked on
 * 2026-11-24 for the case code cannot see - nobody holds `program` as an extra section - so
 * the role literals are the whole regression surface. The third test below asserts this rather
 * than asking anyone to trust this paragraph.
 *
 * ## Why these three paths and not the prefix above them
 *
 * `pathToSection` returns the FIRST matching row, and `matchesPrefix` is `/`-delimited. The
 * three rows therefore sit AHEAD of `['/api/admin/orchestration', 'program']`. The ordering is
 * the mechanism, so there is a test for it: move the rows below the broad one and this suite
 * goes red instead of the key silently doing nothing.
 *
 * The read set is deliberately spelled out to the leaf. `/api/admin/orchestration/monitoring`
 * would have been shorter and is WRONG, because the `/`-delimited matcher would read it as
 * also covering `POST /api/admin/orchestration/monitoring/scan` - an on-demand health scan,
 * i.e. a run action, in a key whose entire purpose is read-only access. The last test holds
 * that line.
 */

/** Exactly what HealthDashboardTab calls, and nothing else. */
const HEALTH_READS = [
  '/api/admin/orchestration/health-report',
  '/api/admin/orchestration/health-snapshots/latest',
  '/api/admin/orchestration/monitoring/agents',
];

/** Siblings under the same prefix that must KEEP requiring `program`. */
const STILL_PROGRAM = [
  '/api/admin/orchestration',
  '/api/admin/orchestration/monitoring/scan',   // a RUN, explicitly excluded from the request
  '/api/admin/orchestration/health-snapshots',  // the time-series, wider than the tab needs
  '/api/admin/orchestration/programs',
  '/api/admin/orchestration/skills',
  '/api/admin/orchestration/prompts',
  '/api/admin/orchestration/blueprint/rollback',
];

describe('mgmtSectionGate classifies the orchestration health reads', () => {
  it('maps every health read to orchestration_health', () => {
    for (const p of HEALTH_READS) {
      expect(pathToSection(p)).toBe('orchestration_health');
    }
  });

  it('keeps the surface around them on program', () => {
    for (const p of STILL_PROGRAM) {
      expect(pathToSection(p)).toBe('program');
    }
  });

  it('did not take the health reads away from anyone who already had them', () => {
    // Everyone who could read these through `program` before the split must still reach them.
    for (const role of ['owner', 'admin', 'curriculum'] as const) {
      expect(roleCanAccessSection(role, 'program')).toBe(true);
      expect(roleCanAccessSection(role, 'orchestration_health')).toBe(true);
    }
  });

  it('is a different key from the department it was split out of', () => {
    // The point of the split: holding one must not imply holding the other. `platform` is
    // Quincy's role and is the proof - it reaches neither by role, and is granted
    // orchestration_health per member through extra sections.
    expect(roleCanAccessSection('platform', 'program')).toBe(false);
    expect(roleCanAccessSection('platform', 'orchestration_health')).toBe(false);
    expect(MGMT_ROLE_DEFS.platform.sections).not.toContain('program');
  });

  it('grants no write or run endpoint along with the reads', () => {
    // The request this key serves asked for "no enable, disable, run or edit". A prefix one
    // segment shorter would have broken that promise, so assert the promise, not the spelling.
    expect(pathToSection('/api/admin/orchestration/monitoring/scan')).not.toBe('orchestration_health');
    expect(pathToSection('/api/admin/orchestration/monitoring')).not.toBe('orchestration_health');
  });

  it('resolves sub-paths of a granted read the same way', () => {
    // matchesPrefix is exact-or-slash-delimited, so a deeper path under a granted read stays
    // granted rather than falling through to the broad program row.
    expect(pathToSection('/api/admin/orchestration/health-report/latest')).toBe('orchestration_health');
  });

  it('does not capture a similarly named sibling', () => {
    // `health-reporting` shares a textual prefix with `health-report` but no `/` boundary, so
    // the matcher must not treat it as the same surface.
    expect(pathToSection('/api/admin/orchestration/health-reporting')).toBe('program');
  });
});
