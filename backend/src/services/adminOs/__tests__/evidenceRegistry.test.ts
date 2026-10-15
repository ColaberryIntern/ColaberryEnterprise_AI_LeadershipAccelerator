import * as fs from 'fs';
import * as path from 'path';

/**
 * PHASE 3 ENTRY GATE, Gap 1 of §H — a test that FAILS when an evidence group
 * silently loses its evidence.
 *
 * WHY THIS EXISTS. `PHASE_2_CHECKPOINT.md` §H names this as the first thing
 * Phase 3 must close, and §A question 4 answers "yes, with named gaps" partly
 * because of it: of roughly twenty evidence groups the Person 360 spec names,
 * **nothing failed if a group stopped being populated.** Delete
 * `profile.community = community;` and every suite in this repo stayed green —
 * the panel simply vanished from the response, and the Sales Readiness Score
 * would then be computed over a person whose community evidence had quietly
 * gone missing. A confident number about the wrong evidence is worse than no
 * number.
 *
 * WHAT "LOSING ITS EVIDENCE" MEANS, PRECISELY. A group is intact only when BOTH
 * halves are present in `personProfileService.ts`:
 *
 *   1. the assignment  — `profile.<group> = ...`
 *   2. the backing call — the loader or query that produces the value
 *
 * Either half alone is a false pass. Keeping the assignment while replacing the
 * loader with `[]` is exactly how a panel goes dark without anything failing,
 * and asserting only on the loader would miss a panel that is loaded and then
 * never attached to the response.
 *
 * WHY A FROZEN REGISTRY WITH NOTHING UNCLASSIFIED. The repo's banned-word
 * scanner earns its keep by refusing to leave anything unplaced, and T212's
 * lesson was the opposite: a hand-maintained guard list omitted the main file
 * and nobody noticed. So this file derives the assigned keys FROM THE SOURCE and
 * requires every one to be declared either EVIDENCE or DERIVED. A new panel
 * added without a decision fails this suite rather than joining it silently.
 *
 * WHY THE PURE FUNCTIONS ARE DRIVEN WITH SYNTHETIC SOURCE. The real file is
 * intact by construction the moment the registry is correct, so a test that only
 * reads the real file cannot demonstrate it is able to fail. Every rule below is
 * therefore exercised against hand-built source in both directions first, and
 * only then applied to the tree.
 */

const SERVICE = path.resolve(__dirname, '../personProfileService.ts');

/**
 * group -> the substring that proves its value was actually produced.
 *
 * These are call sites, not identifiers, so a type-only import or a dead
 * reference cannot satisfy one. Four groups are backed by inline SQL rather than
 * a named loader; each is pinned to a token from its own statement, which is the
 * nearest thing to a call site that inline SQL has.
 */
const EVIDENCE: Readonly<Record<string, string>> = {
  acquisition: 'loadAcquisition(',
  learning: 'LearningPanel>(',
  billing: 'BillingPanel>(',
  engagement: 'visitor_sessions',
  appointments: 'loadAppointments(',
  automation: 'loadAutomation(',
  classActivity: 'loadClassActivity(',
  curriculum: 'loadCurriculum(',
  work: 'loadWork(',
  skills: 'loadSkills(',
  mentor: 'loadMentor(',
  content: 'loadContent(',
  community: 'loadCommunity(',
  profileContext: 'loadProfileContext(',
  account: 'loadAccount(',
  billingDetail: 'loadBillingDetail(',
  communications: 'loadCommunications(',
  history: 'loadCcppHistory(',
  timeline: 'getPersonTimeline(',
  journey: 'buildJourney(',
  explorerScore: 'loadExplorerScore(',
  trust: 'buildTrust(',
};

/**
 * Assigned on the profile but NOT evidence: each is computed from values already
 * loaded, so it has no backing call of its own and must not be demanded one.
 * Listed explicitly rather than skipped by a pattern, so that promoting one to a
 * real loader is a visible edit here.
 */
const DERIVED: readonly string[] = ['intentSuppressedReason', 'timelineDomains'];

/** Every `profile.<key> =` in the source, deduped and sorted. */
export function assignedKeys(src: string): string[] {
  const out = new Set<string>();
  for (const line of src.split('\n')) {
    // Comments describe the code; they are not the code. Without this the
    // docblock above a panel could satisfy the guard that panel is meant to fail.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    const m = line.match(/\bprofile\.([a-zA-Z][a-zA-Z0-9]*)\s*=(?!=)/);
    if (m) out.add(m[1]);
  }
  return [...out].sort();
}

/** Assigned keys that are neither declared evidence nor declared derived. */
export function unclassified(src: string): string[] {
  return assignedKeys(src).filter(
    (k) => !Object.prototype.hasOwnProperty.call(EVIDENCE, k) && !DERIVED.includes(k),
  );
}

/**
 * Registered groups that have lost a half, named with which half went.
 *
 * Reports rather than throws, so the failure message lists every broken group at
 * once instead of stopping at the first.
 */
export function lostEvidence(
  src: string,
  registry: Readonly<Record<string, string>> = EVIDENCE,
): string[] {
  const assigned = new Set(assignedKeys(src));
  const failures: string[] = [];
  for (const group of Object.keys(registry).sort()) {
    const hasAssignment = assigned.has(group);
    const hasBacking = src.includes(registry[group]);
    if (!hasAssignment && !hasBacking) {
      failures.push(`${group}: GONE — no \`profile.${group} =\` and no \`${registry[group]}\``);
    } else if (!hasAssignment) {
      failures.push(`${group}: loaded but NEVER ATTACHED — \`profile.${group} =\` is missing`);
    } else if (!hasBacking) {
      failures.push(`${group}: attached but NOT LOADED — \`${registry[group]}\` is gone`);
    }
  }
  return failures;
}

// ─── the rules, proven against synthetic source in both directions ───────────

describe('the evidence guard can actually fail', () => {
  const INTACT = [
    'profile.community = community;',
    'const c = await loadCommunity(ids);',
    'profile.timeline = await getPersonTimeline(x);',
  ].join('\n');

  const REG = { community: 'loadCommunity(', timeline: 'getPersonTimeline(' };

  it('passes on intact source — the control, without which every case below is theatre', () => {
    expect(lostEvidence(INTACT, REG)).toEqual([]);
  });

  it('CATCHES a group whose assignment was deleted', () => {
    const src = INTACT.replace('profile.community = community;', '');
    expect(lostEvidence(src, REG)).toEqual([
      'community: loaded but NEVER ATTACHED — `profile.community =` is missing',
    ]);
  });

  it('CATCHES a loader swapped for a literal, which is how a panel really goes dark', () => {
    const src = INTACT
      .replace('const c = await loadCommunity(ids);', '')
      .replace('profile.community = community;', 'profile.community = [];');
    expect(lostEvidence(src, REG)).toEqual([
      'community: attached but NOT LOADED — `loadCommunity(` is gone',
    ]);
  });

  it('CATCHES a group deleted outright', () => {
    expect(lostEvidence('profile.timeline = await getPersonTimeline(x);', REG)).toEqual([
      'community: GONE — no `profile.community =` and no `loadCommunity(`',
    ]);
  });

  it('is not satisfied by a COMMENT naming the panel', () => {
    const src = [
      '// profile.community = community;',
      ' * profile.community = community;',
      'const c = await loadCommunity(ids);',
    ].join('\n');
    expect(lostEvidence(src, REG)).toContain(
      'community: loaded but NEVER ATTACHED — `profile.community =` is missing',
    );
  });

  it('does not mistake a comparison for an assignment', () => {
    expect(assignedKeys('if (profile.community === null) return;')).toEqual([]);
  });

  it('reports an undeclared panel rather than ignoring it', () => {
    expect(unclassified('profile.somethingBrandNew = await loadX();')).toEqual([
      'somethingBrandNew',
    ]);
  });
});

// ─── applied to the real service ─────────────────────────────────────────────

describe('personProfileService carries every evidence group it is registered for', () => {
  const src = fs.readFileSync(SERVICE, 'utf8');

  it('reads a real file, not an empty string', () => {
    // Guards the whole suite against a path that silently returns nothing, which
    // would make every assertion below vacuously true.
    expect(src.length).toBeGreaterThan(5000);
    expect(src).toContain('PERSON_VIEW_ROLE');
  });

  it('has no profile assignment that is neither evidence nor declared derived', () => {
    expect(unclassified(src)).toEqual([]);
  });

  it('attaches AND loads every registered evidence group', () => {
    expect(lostEvidence(src)).toEqual([]);
  });

  it('registers every group the file actually assigns', () => {
    // The other direction: a group dropped from EVIDENCE while still assigned
    // would otherwise go unguarded for as long as nobody re-read this file.
    const assigned = assignedKeys(src).filter((k) => !DERIVED.includes(k));
    expect(assigned).toEqual(Object.keys(EVIDENCE).sort());
  });

  it('guards the number of groups the checkpoint claims', () => {
    // §A question 4 says "roughly twenty evidence groups". A drift to half that
    // means panels were removed without this registry being revisited.
    expect(Object.keys(EVIDENCE).length).toBe(22);
  });
});
