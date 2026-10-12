import * as fs from 'fs';
import * as path from 'path';

/**
 * T212 acceptance item 4 — "a test asserts no new permission path was introduced."
 *
 * ── WHY THIS FILE EXISTS, AND WHAT IT REPLACES ──────────────────────────────
 *
 * T212 shipped a test named *"the panel introduces no permission path of its
 * own › renders whatever the server sent, consulting no role"*. It asserted
 * that a scored panel renders its numbers. A verifier then inserted a REAL
 * frontend role gate into the component —
 *
 *     const viewerRole = window.localStorage.getItem('adminRole');
 *     if (viewerRole === 'support') return <EmptyPanel>…</EmptyPanel>;
 *
 * — and that test passed. It had no power to detect the thing its name
 * promised. The same was true of a gate inserted into the tab registry reading
 * `sessionStorage`. So acceptance item 4 was unmet, and the test asserting it
 * was the kind that cannot fail.
 *
 * ── WHAT IS ACTUALLY FORBIDDEN ──────────────────────────────────────────────
 *
 * The authority on who may see a panel is
 * `backend/src/services/adminOs/personProfileService.mayReadPanel`. A panel the
 * caller may not see is ABSENT from the payload and named in `withheldPanels`.
 * A frontend that decided for itself would be a SECOND answer to a question the
 * backend already answers — and the dangerous direction is not that it hides
 * too much, it is that the two answers disagree and nobody knows which is live.
 *
 * So these modules may not read an authority SOURCE: browser storage, a cookie,
 * an auth context, or a role-shaped identifier. That is deliberately narrower
 * than "the word role": these files legitimately contain ARIA `role="dialog"`
 * and a `<Field label="Role">` for the person's job title, and a check that
 * tripped on those would be switched off within a release.
 */

const SRC = path.join(__dirname, '..', '..');

/** The modules T212 added or rewrote that render person data. */
const GUARDED = [
  'adminOs/personTabs.ts',
  'adminOs/personStages.ts',
  'components/admin/person/ExplorerScoreTab.tsx',
  'components/admin/person/AcquisitionTab.tsx',
  'components/admin/person/AppointmentsAutomationTab.tsx',
  'components/admin/person/DataTrustTab.tsx',
  'components/admin/person/EnrolmentsTab.tsx',
  'components/admin/person/PaymentRecordTab.tsx',
  'components/admin/person/SiteActivityTab.tsx',
  'components/admin/person/RawEventDrawer.tsx',
];

/**
 * Comments stripped BEFORE matching, because this very docblock names
 * `localStorage` and `adminRole` on purpose. A guard that reads its own prose
 * as evidence is a mistake this phase has now made five times.
 */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

/** Authority SOURCES. Reading any of these is deciding permission locally. */
const AUTHORITY_SOURCE = /\b(?:localStorage|sessionStorage|document\s*\.\s*cookie|useAuth|AuthContext|useAuthContext)\b/;

/** Role-shaped identifiers, as identifiers — not the word in a label or ARIA. */
const ROLE_IDENTIFIER = /\b(?:adminRole|userRole|viewerRole|currentRole|isAdmin|isStaff|canView|hasSection|hasAnyPersonScope|mayReadPanel|permissions?)\b/;

const read = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('T212 — no person panel decides permission for itself', () => {
  it.each(GUARDED)('%s reads no authority source', (rel) => {
    const code = stripComments(read(rel));
    expect(code).not.toMatch(AUTHORITY_SOURCE);
    expect(code).not.toMatch(ROLE_IDENTIFIER);
  });

  it('the POSITIVE controls: both patterns fire on the exact gates a verifier planted', () => {
    // Without these the loop above is a no-op that passes whatever the files
    // contain. These are the two mutants that survived T212 attempt 1, verbatim
    // in shape.
    const m20 = "const viewerRole = window.localStorage.getItem('adminRole');\n"
      + "if (viewerRole === 'support' || viewerRole === 'program') return null;";
    const m21 = "const denied = (window.sessionStorage.getItem('deniedPanels') ?? '').split(',');";
    expect(m20).toMatch(AUTHORITY_SOURCE);
    expect(m20).toMatch(ROLE_IDENTIFIER);
    expect(m21).toMatch(AUTHORITY_SOURCE);
    // And a few other shapes the same mistake could take.
    expect("const { isAdmin } = useAuth();").toMatch(AUTHORITY_SOURCE);
    expect("if (sections.includes('x') && canView) return null;").toMatch(ROLE_IDENTIFIER);
  });

  it('the NEGATIVE controls: ordinary panel code and ARIA are NOT flagged', () => {
    // If the patterns tripped on these, every panel would fail and the check
    // would be switched off rather than fixed.
    expect('<div role="dialog" aria-label="Raw event">').not.toMatch(ROLE_IDENTIFIER);
    expect('<div role="group" aria-label="Timeline view">').not.toMatch(AUTHORITY_SOURCE);
    expect('<Field label="Role" value={acq.role} />').not.toMatch(ROLE_IDENTIFIER);
    expect('if (profile.explorerScore !== undefined) push(tab);').not.toMatch(AUTHORITY_SOURCE);
  });

  it('the stripper removes comments and KEEPS code — both directions', () => {
    // Without this, every assertion above would pass if `stripComments`
    // returned an empty string.
    const src = read('components/admin/person/ExplorerScoreTab.tsx');
    expect(src).toContain('mayReadPanel'); // named in its docblock on purpose
    expect(stripComments(src)).not.toContain('mayReadPanel');
    expect(stripComments(src)).toContain('export default function ExplorerScoreTab');
  });

  it('every guarded file exists and has substance', () => {
    // A moved or renamed file must be loud, not silently unguarded.
    for (const rel of GUARDED) {
      expect(fs.existsSync(path.join(SRC, rel))).toBe(true);
      expect(read(rel).length).toBeGreaterThan(300);
    }
  });
});

describe('T212 — the roster and the profile share ONE stage map', () => {
  it('only personStages defines STAGE_LABEL, and both pages import it', () => {
    // T212 attempt 1 claimed the duplicate map was removed "on the profile AND
    // the roster". It was not: `PeoplePage` kept its own nine-key copy with no
    // `explorer` key, so the roster still rendered the raw enum. This is the
    // assertion that makes the claim executable.
    const stages = read('adminOs/personStages.ts');
    expect(stages).toContain('export const STAGE_LABEL');
    expect(stages).toContain("explorer: 'Explorer ($0 to start)'");

    for (const page of ['pages/admin/PeoplePage.tsx', 'pages/admin/PersonProfilePage.tsx']) {
      const code = stripComments(read(page));
      expect(code).toContain("from '../../adminOs/personStages'");
      // and no private redefinition
      expect(code).not.toMatch(/const\s+STAGE_LABEL\s*:/);
    }
  });
});
