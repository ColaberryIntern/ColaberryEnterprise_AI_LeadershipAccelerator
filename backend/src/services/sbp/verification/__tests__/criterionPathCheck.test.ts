/**
 * The one mechanical check that works: a criterion that NAMES a repo path
 * requires that path to be in the tree at verification time.
 *
 * ── WHY ONLY THIS CHECK ─────────────────────────────────────────────────────
 *
 * Placeholder- and inertness-detection were tested and abandoned. Scanning for
 * the word `placeholder` is ~95% false positives, and `"Not built yet"` appears
 * in two real repos as an HONEST status label — a Command Center that says a
 * panel has no data yet is satisfying the trust criterion, not violating it.
 * Any check that reads a student's prose and infers dishonesty from it punishes
 * the students who were most careful.
 *
 * File presence is different in kind. It is a fact about the tree, it has no
 * false positives, and it is exactly the gap Fix 2's rewording exposed: the old
 * C3/C4 were about code BEHAVIOUR with the file as a grammatical object, so an
 * honest student could tick them with the file absent. The reworded criteria
 * state the required state, and this is what makes the statement checkable.
 *
 * ── WHY IT CANNOT REVOKE ANYTHING ───────────────────────────────────────────
 *
 * `student_tasks.verified_at` has exactly one writer,
 * `markTaskVerifiedComplete`, whose first line is `task.verified_at ?? new
 * Date()` — it can only ever rewrite its own existing value, and no code path
 * anywhere sets it back to null (verified across the whole backend, including
 * raw SQL, which touches the column only in WHERE clauses). Whatever this check
 * concludes, a story already banked stays banked.
 *
 * PURE — no GitHub, no database, no clock.
 */
import { repoPathsNamedIn, missingRequiredPaths, PLATFORM_SEEDED_PATHS } from '../criterionPaths';
import { decideStory, PlanStorySpec, CommitFact } from '../verifyDecision';
import { ProgressFile, PROGRESS_SCHEMA_VERSION } from '../progressContract';
import { COMMAND_CENTER_ACCEPTANCE, COMMAND_CENTER_STORY_ID } from '../../commandCenterStory';

describe('repoPathsNamedIn — extraction is conservative on purpose', () => {
  it('finds a dotfile-directory path', () => {
    expect(repoPathsNamedIn('then .colaberry/manifest.json is committed in this repo'))
      .toEqual(['.colaberry/manifest.json']);
  });

  it('finds several paths in one sentence, de-duplicated and in order', () => {
    expect(repoPathsNamedIn('reads .colaberry/plan.json and .colaberry/progress.json and .colaberry/plan.json again'))
      .toEqual(['.colaberry/plan.json', '.colaberry/progress.json']);
  });

  it('finds an ordinary source path in a student-authored criterion', () => {
    expect(repoPathsNamedIn('the roster lives in src/routes/roster.ts and returns 200'))
      .toEqual(['src/routes/roster.ts']);
  });

  it('finds nothing in a criterion that names no path at all', () => {
    expect(repoPathsNamedIn(
      'Trust — no tab shows a number, a connection or a result the project has not actually produced.',
    )).toEqual([]);
  });

  it('does not mistake prose containing a slash for a path', () => {
    expect(repoPathsNamedIn('the sample/real toggle flips and/or resets')).toEqual([]);
  });

  it('does not mistake a URL for a repo path', () => {
    expect(repoPathsNamedIn('it fetches https://api.github.com/repos/x/y.json at runtime')).toEqual([]);
  });

  it('does not mistake a bare host for a repo path', () => {
    expect(repoPathsNamedIn('published at student.github.io/thing.html')).toEqual([]);
  });

  it('does not treat a decimal or a time as a path', () => {
    expect(repoPathsNamedIn('within 1.5 seconds, between 09:00/10:00')).toEqual([]);
  });

  it('requires a file extension, so a directory mention is not a required path', () => {
    expect(repoPathsNamedIn('everything under docs/stories is yours')).toEqual([]);
  });
});

describe('missingRequiredPaths — who is blamed for an absent file', () => {
  const criterion = 'then .colaberry/manifest.json is committed in this repo';
  const studentCriterion = 'then src/routes/roster.ts returns 200';

  it('names the platform-seeded set explicitly, and it is non-empty', () => {
    expect(PLATFORM_SEEDED_PATHS.length).toBeGreaterThan(0);
    expect(PLATFORM_SEEDED_PATHS).toContain('.colaberry/manifest.json');
  });

  it('finds nothing missing when the file is in the tree', () => {
    expect(missingRequiredPaths(criterion, {
      paths: new Set(['.colaberry/manifest.json']), writeAccess: 'pull_only',
    })).toEqual([]);
  });

  it('BLAMES A PULL-ONLY STUDENT for a platform-seeded file, because we never owed it to them', () => {
    expect(missingRequiredPaths(criterion, { paths: new Set(), writeAccess: 'pull_only' }))
      .toEqual(['.colaberry/manifest.json']);
  });

  it('does NOT blame a push-access student for a platform-seeded file — that absence is our defect', () => {
    expect(missingRequiredPaths(criterion, { paths: new Set(), writeAccess: 'push' })).toEqual([]);
  });

  it('does NOT blame a student whose write access was never recorded', () => {
    // This is every one of the 10 live connections today. Unknown must read as
    // "we cannot say whose job it was", and the cautious direction is the
    // student's. PR #1618 populates this field; until it does, and for any row
    // it cannot resolve, nobody is failed on a guess.
    expect(missingRequiredPaths(criterion, { paths: new Set(), writeAccess: null })).toEqual([]);
  });

  it('always blames the student for a path THEY own, whatever the write access', () => {
    for (const writeAccess of ['push', 'pull_only', null] as const) {
      expect(missingRequiredPaths(studentCriterion, { paths: new Set(), writeAccess }))
        .toEqual(['src/routes/roster.ts']);
    }
  });

  it('enforces nothing at all when no tree was read', () => {
    expect(missingRequiredPaths(studentCriterion, null)).toEqual([]);
  });
});

// ── the check as it lands in the decision ───────────────────────────────────

const spec: PlanStorySpec = {
  id: COMMAND_CENTER_STORY_ID,
  acceptance: [...COMMAND_CENTER_ACCEPTANCE],
};

const allTicked: ProgressFile = {
  schema_version: PROGRESS_SCHEMA_VERSION,
  project: 'Test',
  totals: null,
  stories: [{
    id: COMMAND_CENTER_STORY_ID,
    release: null,
    acceptance_total: COMMAND_CENTER_ACCEPTANCE.length,
    criteria: COMMAND_CENTER_ACCEPTANCE.map((text) => ({ text, passed: true })),
    files_touched: [],
    tests_added: [],
    notes: null,
    updated_at: null,
    verification: null,
  }],
};

const goodCommit: CommitFact = {
  sha: 'c'.repeat(40),
  message: `${COMMAND_CENTER_STORY_ID}: build it`,
  changed_files: 4,
  committed_at: '2026-08-18T09:00:00Z',
  author: 'A Student',
};

const everyPath = new Set([
  '.colaberry/plan.json', '.colaberry/progress.json', '.colaberry/manifest.json',
]);

describe('decideStory applies the path check', () => {
  it('verifies when every named file is really in the tree', () => {
    const v = decideStory(spec, allTicked, [goodCommit], { paths: everyPath, writeAccess: 'pull_only' });
    expect(v.state).toBe('verified');
    expect(v.criteria_passed).toBe(COMMAND_CENTER_ACCEPTANCE.length);
  });

  it('refuses the manifest criterion for a pull-only student whose repo does not have the file', () => {
    const v = decideStory(spec, allTicked, [goodCommit], {
      paths: new Set(['.colaberry/plan.json', '.colaberry/progress.json']),
      writeAccess: 'pull_only',
    });
    expect(v.state).toBe('submitted');
    expect(v.outstanding).toHaveLength(1);
    expect(v.outstanding[0]).toContain('.colaberry/manifest.json');
  });

  it('says WHY in a sentence naming the missing file, not just "not passing"', () => {
    const v = decideStory(spec, allTicked, [goodCommit], {
      paths: new Set(['.colaberry/plan.json', '.colaberry/progress.json']),
      writeAccess: 'pull_only',
    });
    expect(v.reasons.join(' ')).toContain('.colaberry/manifest.json');
  });

  it('does not touch a tick when write access is unrecorded, which is every student today', () => {
    const v = decideStory(spec, allTicked, [goodCommit], { paths: new Set(), writeAccess: null });
    expect(v.state).toBe('verified');
  });

  it('leaves every existing caller alone — omitting the context enforces nothing', () => {
    expect(decideStory(spec, allTicked, [goodCommit]).state).toBe('verified');
  });

  it('never counts a missing-path criterion as a rejected claim — the text matched fine', () => {
    const v = decideStory(spec, allTicked, [goodCommit], { paths: new Set(), writeAccess: 'pull_only' });
    expect(v.rejected_claims).toEqual([]);
  });

  it('does not resurrect a criterion the student left false just because the file exists', () => {
    const oneFalse: ProgressFile = {
      ...allTicked,
      stories: [{
        ...allTicked.stories[0],
        criteria: COMMAND_CENTER_ACCEPTANCE.map((text, i) => ({ text, passed: i !== 0 })),
      }],
    };
    const v = decideStory(spec, oneFalse, [goodCommit], { paths: everyPath, writeAccess: 'push' });
    expect(v.criteria_passed).toBe(COMMAND_CENTER_ACCEPTANCE.length - 1);
  });
});
