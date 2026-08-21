/**
 * The drift signal must not depend on the student having ticked something.
 *
 * ── THE BLIND SPOT ──────────────────────────────────────────────────────────
 *
 * `decideStory` recorded an unmatched criterion only when `passed` was true:
 *
 *     if (!planTexts.has(key)) {
 *       if (c.passed) rejected.push(c.text);   // <- the guard
 *       continue;
 *     }
 *
 * So the platform could see "you claimed something we never asked for" and could
 * not see "the requirements in your file are not our requirements". The second
 * is the state that actually traps people, and it is the state the whole cohort
 * was in: twelve of thirteen student repos are pull-only to us, nothing seeded
 * their `.colaberry/progress.json`, and their agents wrote the criteria out from
 * the prose instead. Paraphrases, all sitting `false`, because nothing had been
 * built yet.
 *
 * That produced `0/N passed` and `rejected_claims: []` — byte-identical to a
 * student who had not started. Across 493 task rows in production, every single
 * `rejected_claims` was empty.
 *
 * ── WHAT THESE TESTS PIN ────────────────────────────────────────────────────
 *
 *   1. A drifted, entirely unticked file produces a NON-EMPTY drift signal.
 *      This is the assertion that fails on main.
 *   2. It is still distinguishable from an untouched file, which produces none.
 *   3. Asserted and unasserted stay APART. A paraphrase nobody ticked is not the
 *      same event as a claim somebody made up, and one number for both would
 *      lose the distinction that made this worth fixing.
 *   4. `rejected_claims` keeps its exact old meaning, because
 *      `verification_json`, `projectTreeDto` and the frontend DTO all read it.
 *
 * Pure functions only — no GitHub, no database, no clock.
 */
import {
  decideStory,
  decideBuild,
  summariseUnrecognisedCriteria,
  CommitFact,
  PlanStorySpec,
} from '../verifyDecision';
import { ProgressFile, PROGRESS_SCHEMA_VERSION } from '../progressContract';

/** The plan's wording. The only wording that counts. */
const PLAN_A = 'Given the roster page, when it loads, then every active member is listed.';
const PLAN_B = 'Given a member who has left, when the roster loads, then they are absent.';

/**
 * What an agent writes when it is told not to retype and has nothing to copy.
 * Same intent, different sentence — which is precisely why it matches nothing.
 */
const DRIFTED_A = 'The roster page shows all active members when you open it';
const DRIFTED_B = 'Members who left do not appear on the roster';

const spec: PlanStorySpec = { id: 'STORY-001', acceptance: [PLAN_A, PLAN_B] };

function progress(stories: ProgressFile['stories']): ProgressFile {
  return { schema_version: PROGRESS_SCHEMA_VERSION, project: 'Test', stories };
}

function story(id: string, criteria: Array<[string, boolean]>): ProgressFile['stories'][number] {
  return {
    id,
    release: 'R1',
    acceptance_total: criteria.length,
    criteria: criteria.map(([text, passed]) => ({ text, passed })),
    files_touched: [],
    tests_added: [],
    notes: null,
    updated_at: null,
  };
}

const commit = (): CommitFact => ({
  sha: 'a'.repeat(40),
  message: 'STORY-001: build the roster\n\nStory: STORY-001',
  changed_files: 2,
  committed_at: '2026-08-18T10:00:00Z',
  author: 'Student',
});

describe('a drifted file that has ticked nothing is still a drifted file', () => {
  /**
   * THE ONE THAT FAILS ON MAIN. Every criterion in the file is the agent's own
   * paraphrase and every one is `false`, which is honest — the student has not
   * finished. On main this verdict is indistinguishable from an empty repo.
   */
  it('records every unmatched criterion even though not one of them is ticked', () => {
    const v = decideStory(
      spec,
      progress([story('STORY-001', [[DRIFTED_A, false], [DRIFTED_B, false]])]),
      [],
    );

    expect(v.unrecognised_criteria).toEqual([
      { text: DRIFTED_A, asserted: false },
      { text: DRIFTED_B, asserted: false },
    ]);
    // And the old field is untouched: nothing was claimed, so nothing is rejected.
    expect(v.rejected_claims).toEqual([]);
  });

  it('is distinguishable from a student who has not started', () => {
    const drifted = decideStory(
      spec,
      progress([story('STORY-001', [[DRIFTED_A, false], [DRIFTED_B, false]])]),
      [],
    );
    const untouched = decideStory(spec, progress([]), []);

    // The pair that was byte-identical on main: same passed count, same empty
    // rejection list. Only the new signal tells them apart.
    expect(drifted.criteria_passed).toBe(untouched.criteria_passed);
    expect(drifted.rejected_claims).toEqual(untouched.rejected_claims);

    expect(drifted.unrecognised_criteria.length).toBeGreaterThan(0);
    expect(untouched.unrecognised_criteria).toEqual([]);
  });

  /**
   * This used to assert `docs/stories/STORY-001.md`, and that assertion was
   * pinning a defect rather than a feature.
   *
   * No `tree` is passed here, so the repo contents are UNKNOWN — and the
   * platform writes `docs/stories/*.md` only into repos it can push to, which
   * is one of the sixteen live student repos. Naming that path on an unknown
   * repo is a coin flip we lose fifteen times out of sixteen, in the one
   * message whose whole job is to get a stuck student unstuck.
   *
   * What the reason must do is unchanged: name the problem and give somewhere
   * to go. So that is what is asserted now — the wording source is required to
   * be present and reachable, and `driftAdviceReachability.test.ts` pins which
   * source is chosen for each repo state, including that the doc IS still cited
   * when the repo genuinely has it.
   */
  it('says so in a reason the student can act on', () => {
    const v = decideStory(
      spec,
      progress([story('STORY-001', [[DRIFTED_A, false], [DRIFTED_B, false]])]),
      [commit()],
    );
    const said = v.reasons.join(' ');
    expect(said).toMatch(/do not match any acceptance criterion/i);
    // Somewhere to get the right wording, that exists for every student.
    expect(said).toContain('.colaberry/progress.seed.json');
    // And never a path we have not confirmed is in their repo.
    expect(said).not.toContain('docs/stories/STORY-001.md');
  });
});

describe('asserted and unasserted are different signals and stay apart', () => {
  const mixed = () => decideStory(
    spec,
    progress([story('STORY-001', [
      [PLAN_A, true],            // matches, counted
      [DRIFTED_B, false],        // drifted, not claimed
      ['I decided this counts too', true],  // invented, claimed
    ])]),
    [commit()],
  );

  it('keeps the flag per criterion rather than collapsing to a count', () => {
    expect(mixed().unrecognised_criteria).toEqual([
      { text: DRIFTED_B, asserted: false },
      { text: 'I decided this counts too', asserted: true },
    ]);
  });

  it('leaves rejected_claims as exactly the asserted subset', () => {
    const v = mixed();
    expect(v.rejected_claims).toEqual(['I decided this counts too']);
    expect(v.rejected_claims).toEqual(
      v.unrecognised_criteria.filter((c) => c.asserted).map((c) => c.text),
    );
  });

  it('still counts the criterion that DID match — drift does not poison the story', () => {
    const v = mixed();
    expect(v.criteria_passed).toBe(1);
    expect(v.criteria_total).toBe(2);
    expect(v.state).toBe('submitted');
  });
});

describe('normalisation still applies — this is about wording, not typography', () => {
  it('a reflowed or recased criterion is NOT drift', () => {
    const reflowed = `  GIVEN the roster page, when it loads,\n  then every active member is listed. `;
    const v = decideStory(
      spec,
      progress([story('STORY-001', [[reflowed, false]])]),
      [],
    );
    expect(v.unrecognised_criteria).toEqual([]);
  });
});

describe('summariseUnrecognisedCriteria', () => {
  const build = (stories: ProgressFile['stories']) => decideBuild(
    [spec, { id: 'STORY-002', acceptance: ['Given X, when Y, then Z.'] }],
    progress(stories),
    [],
  );

  it('returns null on a clean build, so no line is logged for nothing', () => {
    const clean = build([story('STORY-001', [[PLAN_A, true], [PLAN_B, false]])]);
    expect(summariseUnrecognisedCriteria(clean.verdicts)).toBeNull();
  });

  it('counts the two kinds separately and names the affected stories', () => {
    const drifted = build([
      story('STORY-001', [[DRIFTED_A, false], [DRIFTED_B, false]]),
      story('STORY-002', [['something invented', true]]),
    ]);

    const s = summariseUnrecognisedCriteria(drifted.verdicts)!;
    expect(s.unasserted).toBe(2);
    expect(s.asserted).toBe(1);
    expect(s.stories_affected).toEqual(['STORY-001', 'STORY-002']);
    expect(s.samples).toContain(DRIFTED_A);
  });

  it('fires on the unticked-only build — the case that produced nothing at all', () => {
    const drifted = build([story('STORY-001', [[DRIFTED_A, false], [DRIFTED_B, false]])]);
    const s = summariseUnrecognisedCriteria(drifted.verdicts);

    expect(s).not.toBeNull();
    expect(s!.asserted).toBe(0);
    expect(s!.unasserted).toBe(2);
  });

  it('caps and truncates the samples so one broken file cannot flood the stream', () => {
    const many = Array.from({ length: 9 }, (_, i): [string, boolean] => [`invented criterion ${i}`, false]);
    const long = 'x'.repeat(500);
    const s = summariseUnrecognisedCriteria(
      build([story('STORY-001', [[long, false], ...many])]).verdicts,
    )!;

    expect(s.unasserted).toBe(10);
    expect(s.samples).toHaveLength(5);
    expect(s.samples[0]).toHaveLength(200);
    expect(s.samples[0].endsWith('…')).toBe(true);
  });
});
