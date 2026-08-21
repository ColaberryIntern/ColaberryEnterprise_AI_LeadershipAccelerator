/**
 * The drift-repair advice must name a file the student can actually open.
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────
 *
 * `decideStory` tells a student whose criteria have drifted to "replace them
 * with the exact wording from this story's doc in `docs/stories/<ID>.md`". That
 * citation was unconditional.
 *
 * The platform writes `docs/stories/*.md` into a repo only when it can push to
 * it, and it holds push on ONE of the twelve live student repos. So for eleven
 * students the one message whose entire purpose is to get them unstuck pointed
 * at a path that has never existed in their repository — handed to them at the
 * exact moment they are already stuck, already confused, and least able to
 * absorb another dead end. It is the same class of defect as the STORY-000
 * Step 3 instruction: advice that is correct in our heads and unreachable in
 * theirs.
 *
 * ── WHAT THESE TESTS PIN ────────────────────────────────────────────────────
 *
 *   1. With the story doc genuinely in the repo tree, the citation is kept —
 *      it is the best answer for someone who has the file.
 *   2. With a tree that does NOT contain it, the doc is not cited at all, and
 *      the student is pointed somewhere reachable instead.
 *   3. With no tree context, the safe branch is taken. We do not claim a file
 *      is there on a hunch.
 *   4. The replacement advice names the SEED, and says it covers every story —
 *      the fact that makes it different from a story doc's own JSON block.
 *
 * Pure functions only — no GitHub, no database, no clock.
 */
import { decideStory, CommitFact, PlanStorySpec } from '../verifyDecision';
import { RepoTreeContext } from '../criterionPaths';
import { ProgressFile, PROGRESS_SCHEMA_VERSION } from '../progressContract';

/** The plan's wording — the only wording that counts. */
const PLAN_A = 'Given the roster page, when it loads, then every active member is listed.';
const PLAN_B = 'Given a member who has left, when the roster loads, then they are absent.';

/** What an agent writes when told not to retype and given nothing to copy. */
const DRIFTED_A = 'The roster page shows all active members when you open it';
const DRIFTED_B = 'Members who left do not appear on the roster';

const spec: PlanStorySpec = { id: 'STORY-001', acceptance: [PLAN_A, PLAN_B] };

const STORY_DOC = 'docs/stories/STORY-001.md';

function drifted(): ProgressFile {
  return {
    schema_version: PROGRESS_SCHEMA_VERSION,
    project: 'Test',
    stories: [{
      id: 'STORY-001',
      release: 'R1',
      acceptance_total: 2,
      // Both unticked, which is the state that actually traps people: a file
      // full of somebody else's sentences and nothing claimed yet.
      criteria: [{ text: DRIFTED_A, passed: false }, { text: DRIFTED_B, passed: false }],
      files_touched: [],
      tests_added: [],
      notes: null,
      updated_at: null,
    }],
  };
}

const commits = (): CommitFact[] => [{
  sha: 'a'.repeat(40),
  message: 'STORY-001: build the roster',
  changed_files: 2,
  committed_at: '2026-08-19T12:00:00.000Z',
  author: 'student',
}];

/** A repo tree that holds the story doc — the one student we can push to. */
const treeWithDoc: RepoTreeContext = {
  paths: new Set([STORY_DOC, '.colaberry/progress.json']),
  writeAccess: 'push',
};

/** A pull-only student's repo. Nothing the platform renders was ever committed. */
const treeWithoutDoc: RepoTreeContext = {
  paths: new Set(['.colaberry/progress.json', 'index.html']),
  writeAccess: 'pull_only',
};

/** The whole reason for the message: the drift sentence, wherever it appears. */
function driftReason(reasons: string[]): string {
  const found = reasons.find((r) => r.includes('do not match any acceptance criterion'));
  if (!found) throw new Error(`no drift reason in: ${JSON.stringify(reasons, null, 2)}`);
  return found;
}

describe('drift advice on a repo that HAS the story doc', () => {
  it('still cites the doc, because it is the best answer for someone who has it', () => {
    const verdict = decideStory(spec, drifted(), commits(), treeWithDoc);
    expect(driftReason(verdict.reasons)).toContain(STORY_DOC);
  });
});

describe('drift advice on a repo that does NOT have the story doc', () => {
  it('does not send the student to a file that is not in their repo', () => {
    const verdict = decideStory(spec, drifted(), commits(), treeWithoutDoc);
    expect(driftReason(verdict.reasons)).not.toContain(STORY_DOC);
    // Nor any sibling of it — the whole directory is absent on these repos.
    expect(driftReason(verdict.reasons)).not.toContain('docs/stories/');
  });

  it('points at the seed file, which these students genuinely have', () => {
    const verdict = decideStory(spec, drifted(), commits(), treeWithoutDoc);
    expect(driftReason(verdict.reasons)).toContain('.colaberry/progress.seed.json');
  });

  it('says the seed covers EVERY story, which is what a story doc block does not', () => {
    const verdict = decideStory(spec, drifted(), commits(), treeWithoutDoc);
    expect(driftReason(verdict.reasons)).toContain('every story');
  });

  it('offers the portal too, which needs no files at all', () => {
    const verdict = decideStory(spec, drifted(), commits(), treeWithoutDoc);
    expect(driftReason(verdict.reasons)).toContain('portal');
  });
});

describe('drift advice when the tree was never captured', () => {
  it('takes the self-sufficient branch rather than guessing the file is there', () => {
    const verdict = decideStory(spec, drifted(), commits(), null);
    expect(driftReason(verdict.reasons)).not.toContain(STORY_DOC);
    expect(driftReason(verdict.reasons)).toContain('.colaberry/progress.seed.json');
  });
});

describe('the rest of the decision is untouched', () => {
  it('still reports the drift, and still refuses to verify', () => {
    const verdict = decideStory(spec, drifted(), commits(), treeWithoutDoc);
    expect(verdict.state).not.toBe('verified');
    expect(verdict.criteria_passed).toBe(0);
    expect(verdict.criteria_total).toBe(2);
  });
});
