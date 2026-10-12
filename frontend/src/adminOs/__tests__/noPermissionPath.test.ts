import * as fs from 'fs';
import * as path from 'path';

/**
 * T212 acceptance item 4 — "a test asserts no new permission path was introduced."
 *
 * ── WHY THIS FILE EXISTS, AND WHAT IT REPLACES ──────────────────────────────
 *
 * T212 shipped a test named *"the panel introduces no permission path of its
 * own › renders whatever the server sent, consulting no role"*. It asserted
 * that a scored panel renders its numbers. A verifier inserted a REAL frontend
 * role gate into the component and it passed, because a role gate does not stop
 * an ALLOWED role from rendering. That test had no power to detect the thing its
 * name promised, and it has since been deleted rather than left as a decoy.
 *
 * ── ATTEMPT 2 FAILED TOO, AND THIS IS THE IMPORTANT PART ────────────────────
 *
 * Attempt 2 replaced it with a source scan over a HAND-MAINTAINED list of ten
 * files. A verifier drove two real permission gates straight through the gap:
 *
 *   ATTACK A — a role filter inside `PersonProfilePage`'s `useMemo`, built from
 *     this repo's OWN `roleFromAdminToken` helper and the real `admin_token`
 *     key, hiding the Explorer tab from `sales`. 46/46 green, typecheck clean,
 *     no required CI job catches it. `PersonProfilePage.tsx` — the operator view
 *     T212 is NAMED AFTER, and where the tab list is actually assembled — was
 *     not in the list.
 *   ATTACK B — the same storage gate one file sideways, in `TimelineTab.tsx`,
 *     which T212 itself added. Also 46/46 green.
 *
 * And the reason `TimelineTab` was missing is the worst part: it legitimately
 * reads `localStorage.getItem(TIMELINE_VIEW_KEY)` for a chart/table preference,
 * which tripped the old pattern — so the file was dropped from the list instead
 * of the check being taught the difference. That is exactly the "switched off
 * rather than fixed" failure this docblock used to warn about while committing
 * it.
 *
 * Two changes follow from that:
 *
 *   1. THE SCOPE IS DERIVED FROM THE FILESYSTEM, not typed out. Every person
 *      surface is guarded by default, so a new or renamed one cannot be
 *      silently unguarded.
 *   2. A STORAGE READ IS JUDGED BY ITS KEY. A view preference held in a named
 *      constant is allowed; a string-literal key, or any other identifier, is
 *      flagged. That lets `TimelineTab` back in WITH its preference intact
 *      while still catching both attacks.
 *
 * ── WHAT IS ACTUALLY FORBIDDEN ──────────────────────────────────────────────
 *
 * The authority on who may see a panel is
 * `backend/src/services/adminOs/personProfileService.mayReadPanel`. A panel the
 * caller may not see is ABSENT from the payload and named in `withheldPanels`.
 * A frontend that decided for itself would be a SECOND answer to a question the
 * backend already answers — and the danger is not that it hides too much, it is
 * that the two answers disagree and nobody knows which is live.
 */

const SRC = path.join(__dirname, '..', '..');

/**
 * The guarded set, DERIVED. Everything that renders or assembles person data.
 *
 * Hand-maintained lists have a hole the shape of the next file somebody adds,
 * and this one did: it omitted the page the task is named after.
 */
function guardedFiles(): string[] {
  const out: string[] = [];
  const panelDir = path.join(SRC, 'components', 'admin', 'person');
  for (const f of fs.readdirSync(panelDir)) {
    if (/\.tsx?$/.test(f)) out.push(`components/admin/person/${f}`);
  }
  const adminOsDir = path.join(SRC, 'adminOs');
  for (const f of fs.readdirSync(adminOsDir)) {
    if (/^person.*\.tsx?$/.test(f)) out.push(`adminOs/${f}`);
  }
  // The two pages that assemble and filter what the panels show. ATTACK A lived
  // in the first of these.
  out.push('pages/admin/PersonProfilePage.tsx');
  out.push('pages/admin/PeoplePage.tsx');
  return out.sort();
}

const GUARDED = guardedFiles();

/**
 * Comments stripped BEFORE matching, because this very docblock names
 * `localStorage`, `adminRole` and `roleFromAdminToken` on purpose. A guard that
 * reads its own prose as evidence is a mistake this phase has made five times.
 */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

/** Authority sources that are never legitimate in a person surface. */
const HARD_AUTHORITY = /\b(?:document\s*\.\s*cookie|useAuth|AuthContext|useAuthContext|adminToken|roleFrom[A-Z]\w*)\b/;

/** Role-shaped identifiers, as identifiers — not the word in a label or ARIA. */
const ROLE_IDENTIFIER = /\b(?:adminRole|userRole|viewerRole|currentRole|isAdmin|isStaff|canView|hasSection|hasAnyPersonScope|mayReadPanel|permissions?)\b/;

/** Every browser-storage access, capturing the key expression. */
const STORAGE_CALL = /\b(?:window\s*\.\s*)?(?:localStorage|sessionStorage)\s*\.\s*(?:get|set|remove)Item\s*\(\s*([^,)]+)/g;

/**
 * A storage key that is a UI preference, not an authority.
 *
 * Must be a NAMED CONSTANT whose name says so. A string literal is never
 * allowed — both of the verifier's attacks used one (`'adminRole'`,
 * `'admin_token'`) — because a literal is how a role lookup is actually
 * written, and a constant named `*_VIEW_KEY` is how a remembered tab is.
 */
const VIEW_PREFERENCE_KEY = /^[A-Z][A-Z0-9_]*(?:VIEW_KEY|_PREF|_PREFERENCE|_TAB_KEY)$/;

/** Returns the offending storage keys in this source, or [] if all are benign. */
export function offendingStorageKeys(code: string): string[] {
  const bad: string[] = [];
  let m = STORAGE_CALL.exec(code);
  while (m !== null) {
    const key = m[1].trim();
    if (!VIEW_PREFERENCE_KEY.test(key)) bad.push(key);
    m = STORAGE_CALL.exec(code);
  }
  STORAGE_CALL.lastIndex = 0;
  return bad;
}

const read = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('T212 — no person surface decides permission for itself', () => {
  it('guards the page the task is named after, and every panel, by derivation', () => {
    // The hole that failed attempt 2. ATTACK A lived in PersonProfilePage and
    // ATTACK B in TimelineTab; both must be in scope, and the list must come
    // from the filesystem so the next file is covered without an edit.
    expect(GUARDED).toContain('pages/admin/PersonProfilePage.tsx');
    expect(GUARDED).toContain('pages/admin/PeoplePage.tsx');
    expect(GUARDED).toContain('components/admin/person/TimelineTab.tsx');
    expect(GUARDED).toContain('adminOs/personTabs.ts');
    // And it is a real set, not an empty one that would pass everything.
    expect(GUARDED.length).toBeGreaterThan(12);
  });

  it.each(GUARDED)('%s reads no authority source', (rel) => {
    const code = stripComments(read(rel));
    expect(code).not.toMatch(HARD_AUTHORITY);
    expect(code).not.toMatch(ROLE_IDENTIFIER);
    expect(offendingStorageKeys(code)).toEqual([]);
  });

  it('the POSITIVE controls: all four known attack shapes are caught', () => {
    // Without these the loop above passes whatever the files contain.
    // M20 / ATTACK B — a storage gate with a literal role key.
    const b = "const viewerRole = window.localStorage.getItem('adminRole');\n"
      + "if (viewerRole === 'support' || viewerRole === 'program') return null;";
    expect(offendingStorageKeys(b)).toEqual(["'adminRole'"]);
    expect(b).toMatch(ROLE_IDENTIFIER);

    // M21 — a sessionStorage denied-list.
    const m21 = "const denied = (window.sessionStorage.getItem('deniedPanels') ?? '').split(',');";
    expect(offendingStorageKeys(m21)).toEqual(["'deniedPanels'"]);

    // ATTACK A — the repo's OWN role helper and the REAL token key, which is
    // the shape a careless engineer would actually write.
    const a = "import { roleFromAdminToken } from '../../utils/adminToken';\n"
      + ".filter((t) => !(t.key === 'explorer'\n"
      + "  && roleFromAdminToken(localStorage.getItem('admin_token')) === 'sales'))";
    expect(a).toMatch(HARD_AUTHORITY);
    expect(offendingStorageKeys(a)).toEqual(["'admin_token'"]);

    // An auth context, the other obvious route.
    expect('const { isAdmin } = useAuth();').toMatch(HARD_AUTHORITY);
  });

  it('the NEGATIVE controls: a UI preference and ARIA are NOT flagged', () => {
    // If these tripped, TimelineTab would be excluded again and the check would
    // be switched off rather than fixed — which is how attempt 2 failed.
    const pref = "const TIMELINE_VIEW_KEY = 'admin_person_timeline_view';\n"
      + 'localStorage.getItem(TIMELINE_VIEW_KEY)\n'
      + 'localStorage.setItem(TIMELINE_VIEW_KEY, v)';
    expect(offendingStorageKeys(pref)).toEqual([]);
    expect(pref).not.toMatch(HARD_AUTHORITY);
    expect(pref).not.toMatch(ROLE_IDENTIFIER);

    expect('<div role="dialog" aria-label="Raw event">').not.toMatch(ROLE_IDENTIFIER);
    expect('<Field label="Role" value={acq.role} />').not.toMatch(ROLE_IDENTIFIER);
    expect('if (profile.explorerScore !== undefined) push(tab);').not.toMatch(HARD_AUTHORITY);
  });

  it('TimelineTab really is in scope AND really does read its preference', () => {
    // The two-way control for the key rule: the file is guarded, it genuinely
    // uses browser storage, and it still passes. Without this, the rule could
    // be "allow everything" and nobody would notice.
    const code = stripComments(read('components/admin/person/TimelineTab.tsx'));
    expect(code).toContain('localStorage.getItem(TIMELINE_VIEW_KEY)');
    expect(offendingStorageKeys(code)).toEqual([]);
  });

  it('the stripper removes comments and KEEPS code — both directions', () => {
    const src = read('components/admin/person/ExplorerScoreTab.tsx');
    expect(src).toContain('mayReadPanel'); // named in its docblock on purpose
    expect(stripComments(src)).not.toContain('mayReadPanel');
    expect(stripComments(src)).toContain('export default function ExplorerScoreTab');
  });

  it('every guarded file exists and has substance', () => {
    for (const rel of GUARDED) {
      expect(fs.existsSync(path.join(SRC, rel))).toBe(true);
      expect(read(rel).length).toBeGreaterThan(200);
    }
  });
});

describe('T212 — the roster and the profile share ONE stage map', () => {
  it('only personStages defines STAGE_LABEL, and both pages import it', () => {
    // T212 attempt 1 claimed the duplicate map was removed "on the profile AND
    // the roster". It was not: `PeoplePage` kept its own nine-key copy with no
    // `explorer` key, so the roster still rendered the raw enum.
    const stages = read('adminOs/personStages.ts');
    expect(stages).toContain('export const STAGE_LABEL');
    expect(stages).toContain("explorer: 'Explorer ($0 to start)'");

    for (const page of ['pages/admin/PeoplePage.tsx', 'pages/admin/PersonProfilePage.tsx']) {
      const code = stripComments(read(page));
      expect(code).toContain("from '../../adminOs/personStages'");
      expect(code).not.toMatch(/const\s+STAGE_LABEL\s*:/);
    }
  });
});
