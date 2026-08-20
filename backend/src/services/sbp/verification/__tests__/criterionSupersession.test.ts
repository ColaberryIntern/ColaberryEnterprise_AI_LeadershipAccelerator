/**
 * Superseded criterion wordings — the proof that rewording STORY-000's criteria
 * does not invalidate a file a student already committed.
 *
 * ── WHY THIS SUITE EXISTS ───────────────────────────────────────────────────
 *
 * `COMMAND_CENTER_ACCEPTANCE` is a hardcoded constant shared by every student in
 * the cohort, and their `.colaberry/progress.json` files — committed in THEIR
 * repos, on branches the platform frequently cannot push to — carry the
 * criterion text as it read on the day their agent wrote it.
 *
 * Two independent paths would have destroyed those ticks if the text were simply
 * edited in place:
 *
 *   1. `decideStory` matches a claim to a plan criterion by normalised text and
 *      files anything unmatched into `rejected_claims`. Reworded criteria ⇒
 *      every existing tick rejected ⇒ stories drop out of `verified`.
 *   2. `mergeProgressFile` carries the student's `passed` flag across a
 *      republish by the same normalised text. Reworded criteria ⇒ the flag is
 *      not carried ⇒ the next sync silently resets their ticks to `false`.
 *
 * Both are closed by the same mechanism: a SUPERSESSION TABLE that maps a
 * historical wording onto the criterion it became. The tests below pin the
 * historical sentences as LITERALS — deliberately not read from the constant,
 * because the constant is the thing that changed. A literal is the only pin that
 * still means something after the rewrite.
 *
 * ── WHY THE TABLE IS PERMANENT, NOT A TRANSITION WINDOW ─────────────────────
 *
 * The obvious alternative — accept both texts for a while, then drop the old one
 * — assumes we can eventually rewrite the student's file. We cannot. Those files
 * live in repos where `platform_can_push` is false or unrecorded, and on a
 * pull-only repo no sync we ever run will rewrite that sentence. The old wording
 * is therefore load-bearing forever, and an entry is only ever added here, never
 * removed.
 *
 * Matching on a stable criterion ID was considered and rejected: `progress.json`
 * criteria carry `{text, passed, evidence}` and no id, so every file already
 * committed would need the text path anyway. An id helps files written from
 * tomorrow and does nothing for the nine that already exist.
 *
 * PURE — no GitHub, no database, no clock.
 */
import {
  normaliseCriterion,
  resolveCriterionKey,
  SUPERSEDED_CRITERIA,
} from '../criterionIdentity';
import {
  ProgressFile,
  PROGRESS_SCHEMA_VERSION,
  mergeProgressFile,
  renderProgressFile,
  serialiseProgressFile,
} from '../progressContract';
import { decideStory, PlanStorySpec, CommitFact } from '../verifyDecision';
import { COMMAND_CENTER_ACCEPTANCE, COMMAND_CENTER_STORY_ID } from '../../commandCenterStory';

/**
 * The EXACT sentences shipped in `COMMAND_CENTER_ACCEPTANCE` before this change,
 * with `PLAN_FILE_PATH` / `PROGRESS_FILE_PATH` / `MANIFEST_FILE_PATH` already
 * interpolated — i.e. byte-for-byte what is sitting in the nine students'
 * committed `.colaberry/progress.json` files right now.
 *
 * Captured by running the shipping constant on `origin/main` at b33d24a0 and
 * dumping it through `JSON.stringify`, not retyped by hand.
 */
const COMMITTED_C3 =
  'Given the data files, when any tab renders, then its content comes from .colaberry/plan.json '
  + 'and .colaberry/progress.json read at runtime rather than from hard-coded values.';
const COMMITTED_C4 =
  'Given .colaberry/manifest.json, when any tab is shown, then it displays how old the data is '
  + 'and warns when that age exceeds a week.';

/** The three criteria this change does NOT touch, also as committed. */
const COMMITTED_C1 =
  'Given the Command Center, when it is opened, then every tab is reachable and every card drills down one level.';
const COMMITTED_C2 =
  'Given sample mode, when any tab is shown, then the sample data is visibly labelled as sample.';
const COMMITTED_C5 =
  'Trust — no tab shows a number, a connection or a result the project has not actually produced.';

/** A whole student file, exactly as committed: five criteria, the OLD wording, all ticked. */
const COMMITTED_STUDENT_FILE: ProgressFile = {
  schema_version: PROGRESS_SCHEMA_VERSION,
  project: 'Architect Workspace',
  totals: null,
  stories: [{
    id: COMMAND_CENTER_STORY_ID,
    release: null,
    acceptance_total: 5,
    criteria: [
      { text: COMMITTED_C1, passed: true },
      { text: COMMITTED_C2, passed: true },
      { text: COMMITTED_C3, passed: true },
      { text: COMMITTED_C4, passed: true },
      { text: COMMITTED_C5, passed: true },
    ],
    files_touched: ['index.html', 'command-center/app.js'],
    tests_added: [],
    notes: null,
    updated_at: '2026-08-16T11:04:00Z',
    verification: null,
  }],
};

const spec: PlanStorySpec = {
  id: COMMAND_CENTER_STORY_ID,
  acceptance: [...COMMAND_CENTER_ACCEPTANCE],
};

const goodCommit: CommitFact = {
  sha: 'b'.repeat(40),
  message: `${COMMAND_CENTER_STORY_ID}: build the command center\n\nStory: ${COMMAND_CENTER_STORY_ID}`,
  changed_files: 7,
  committed_at: '2026-08-16T11:05:00Z',
  author: 'A Student',
};

/**
 * Every path in a finished student's repo, so the Fix-3 path check is satisfied
 * and this suite only ever measures the WORDING question.
 */
const fullTree = {
  paths: new Set([
    'index.html',
    'command-center/app.js',
    '.colaberry/plan.json',
    '.colaberry/progress.json',
    '.colaberry/manifest.json',
  ]),
  writeAccess: null,
};

describe('the supersession table itself', () => {
  it('is non-empty, so nothing below passes vacuously', () => {
    expect(SUPERSEDED_CRITERIA.length).toBeGreaterThan(0);
  });

  it('only ever points at a sentence that is really in the current acceptance set', () => {
    const current = new Set(COMMAND_CENTER_ACCEPTANCE.map(normaliseCriterion));
    for (const entry of SUPERSEDED_CRITERIA) {
      expect(current.has(normaliseCriterion(entry.now))).toBe(true);
    }
  });

  it('never maps a wording onto itself, which would be a no-op entry hiding a missed rewrite', () => {
    for (const entry of SUPERSEDED_CRITERIA) {
      expect(normaliseCriterion(entry.was)).not.toEqual(normaliseCriterion(entry.now));
    }
  });

  it('maps each historical wording to exactly one successor', () => {
    const keys = SUPERSEDED_CRITERIA.map((e) => normaliseCriterion(e.was));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('carries both criteria this change reworded', () => {
    const was = SUPERSEDED_CRITERIA.map((e) => normaliseCriterion(e.was));
    expect(was).toContain(normaliseCriterion(COMMITTED_C3));
    expect(was).toContain(normaliseCriterion(COMMITTED_C4));
  });
});

describe('resolveCriterionKey', () => {
  const planKeys = new Set(COMMAND_CENTER_ACCEPTANCE.map(normaliseCriterion));

  it('resolves a current wording to itself', () => {
    for (const c of COMMAND_CENTER_ACCEPTANCE) {
      expect(resolveCriterionKey(c, planKeys)).toEqual(normaliseCriterion(c));
    }
  });

  it('resolves the committed C3 wording onto the criterion it became', () => {
    expect(resolveCriterionKey(COMMITTED_C3, planKeys)).not.toBeNull();
  });

  it('resolves the committed C4 wording onto the criterion it became', () => {
    expect(resolveCriterionKey(COMMITTED_C4, planKeys)).not.toBeNull();
  });

  it('still refuses a genuinely reworded criterion the table does not know', () => {
    expect(resolveCriterionKey('Given whatever, when I say so, then it passes.', planKeys)).toBeNull();
  });

  it('refuses a superseded wording when the plan does not carry its successor', () => {
    // A student story that never had these criteria must not gain them via the
    // table. The alias may only ever land on a criterion the plan really asks for.
    expect(resolveCriterionKey(COMMITTED_C3, new Set(['something else entirely']))).toBeNull();
  });

  it('tolerates the punctuation drift the normaliser already forgives, on the OLD wording too', () => {
    expect(resolveCriterionKey(COMMITTED_C4.replace(/\.$/, ''), planKeys)).not.toBeNull();
  });
});

describe('a progress.json already committed by a student still verifies', () => {
  it('counts all five ticks and reaches verified on the OLD wording', () => {
    const v = decideStory(spec, COMMITTED_STUDENT_FILE, [goodCommit], fullTree);
    expect(v.criteria_total).toBe(COMMAND_CENTER_ACCEPTANCE.length);
    expect(v.criteria_passed).toBe(COMMAND_CENTER_ACCEPTANCE.length);
    expect(v.outstanding).toEqual([]);
    expect(v.state).toBe('verified');
  });

  it('files none of the committed criteria into rejected_claims', () => {
    const v = decideStory(spec, COMMITTED_STUDENT_FILE, [goodCommit], fullTree);
    expect(v.rejected_claims).toEqual([]);
  });

  it('reaches verified on the NEW wording too, so a fresh file is not penalised', () => {
    const fresh: ProgressFile = {
      ...COMMITTED_STUDENT_FILE,
      stories: [{
        ...COMMITTED_STUDENT_FILE.stories[0],
        criteria: COMMAND_CENTER_ACCEPTANCE.map((text) => ({ text, passed: true })),
      }],
    };
    const v = decideStory(spec, fresh, [goodCommit], fullTree);
    expect(v.state).toBe('verified');
    expect(v.rejected_claims).toEqual([]);
  });

  it('honours a MIXED file — old wording on one line, new on the other', () => {
    const mixed: ProgressFile = {
      ...COMMITTED_STUDENT_FILE,
      stories: [{
        ...COMMITTED_STUDENT_FILE.stories[0],
        criteria: [
          { text: COMMITTED_C1, passed: true },
          { text: COMMITTED_C2, passed: true },
          { text: COMMITTED_C3, passed: true },                    // old
          { text: COMMAND_CENTER_ACCEPTANCE[3], passed: true },    // new
          { text: COMMITTED_C5, passed: true },
        ],
      }],
    };
    const v = decideStory(spec, mixed, [goodCommit], fullTree);
    expect(v.state).toBe('verified');
    expect(v.rejected_claims).toEqual([]);
  });

  it('does not let a superseded wording flip a criterion the student left FALSE', () => {
    const partial: ProgressFile = {
      ...COMMITTED_STUDENT_FILE,
      stories: [{
        ...COMMITTED_STUDENT_FILE.stories[0],
        criteria: [
          { text: COMMITTED_C1, passed: true },
          { text: COMMITTED_C2, passed: true },
          { text: COMMITTED_C3, passed: false },
          { text: COMMITTED_C4, passed: true },
          { text: COMMITTED_C5, passed: true },
        ],
      }],
    };
    const v = decideStory(spec, partial, [goodCommit], fullTree);
    expect(v.criteria_passed).toBe(4);
    expect(v.state).toBe('submitted');
  });

  it('takes the pessimistic answer when the OLD and NEW wording of one criterion disagree', () => {
    const contradictory: ProgressFile = {
      ...COMMITTED_STUDENT_FILE,
      stories: [{
        ...COMMITTED_STUDENT_FILE.stories[0],
        criteria: [
          { text: COMMITTED_C1, passed: true },
          { text: COMMITTED_C2, passed: true },
          { text: COMMITTED_C3, passed: true },                     // old says yes
          { text: COMMAND_CENTER_ACCEPTANCE[2], passed: false },    // new says no
          { text: COMMITTED_C4, passed: true },
          { text: COMMITTED_C5, passed: true },
        ],
      }],
    };
    const v = decideStory(spec, contradictory, [goodCommit], fullTree);
    expect(v.criteria_passed).toBe(4);
    expect(v.state).toBe('submitted');
  });
});

describe('a republish does not wipe a tick written against the old wording', () => {
  /** What `repoWriter` does on every publish: render fresh, merge the repo's copy over it. */
  const republish = (existing: ProgressFile): ProgressFile => mergeProgressFile(
    renderProgressFile(
      [{ id: COMMAND_CENTER_STORY_ID, release: null, acceptance: [...COMMAND_CENTER_ACCEPTANCE] }],
      'Architect Workspace',
    ),
    serialiseProgressFile(existing),
  );

  it('carries every passed flag across the rewording', () => {
    const merged = republish(COMMITTED_STUDENT_FILE);
    const story = merged.stories.find((s) => s.id === COMMAND_CENTER_STORY_ID)!;
    expect(story.criteria).toHaveLength(COMMAND_CENTER_ACCEPTANCE.length);
    expect(story.criteria.every((c) => c.passed)).toBe(true);
  });

  it('rewrites the criterion TEXT to the new wording, because the plan side is ours', () => {
    const merged = republish(COMMITTED_STUDENT_FILE);
    const story = merged.stories.find((s) => s.id === COMMAND_CENTER_STORY_ID)!;
    expect(story.criteria.map((c) => c.text)).toEqual([...COMMAND_CENTER_ACCEPTANCE]);
  });

  it('still verifies after the republish, so the merge and the matcher agree', () => {
    const v = decideStory(spec, republish(COMMITTED_STUDENT_FILE), [goodCommit], fullTree);
    expect(v.state).toBe('verified');
  });

  it('is idempotent — merging the merged file again changes nothing', () => {
    const once = republish(COMMITTED_STUDENT_FILE);
    const twice = republish(once);
    expect(serialiseProgressFile(twice)).toEqual(serialiseProgressFile(once));
  });

  it('does not carry a tick from a criterion that was genuinely REWORDED without an entry', () => {
    const invented: ProgressFile = {
      ...COMMITTED_STUDENT_FILE,
      stories: [{
        ...COMMITTED_STUDENT_FILE.stories[0],
        criteria: [{ text: 'Given my own idea, when I like it, then it counts.', passed: true }],
      }],
    };
    const merged = republish(invented);
    const story = merged.stories.find((s) => s.id === COMMAND_CENTER_STORY_ID)!;
    expect(story.criteria.every((c) => c.passed === false)).toBe(true);
  });
});
