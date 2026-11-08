/**
 * The completion rule, pinned.
 *
 * These are the tests that decide whether a student gets credit, so they are
 * written to be hostile to the implementation: a valid file verifies EXACTLY
 * the stories it legitimately claims and no others; a file naming a story the
 * plan does not have is rejected rather than believed; ticked-but-uncommitted
 * and committed-but-unticked each stay unverified on their own; and partial
 * completion reports which criterion is outstanding instead of failing silently.
 *
 * Pure functions only — no GitHub, no database, no clock.
 */
import {
  decideBuild,
  decideStory,
  commitNamesStory,
  storyCommitMatcher,
  evidenceCommitFor,
  CommitFact,
  PlanStorySpec,
} from '../verifyDecision';
import { ProgressFile, PROGRESS_SCHEMA_VERSION } from '../progressContract';

const CRIT_A = 'The roster endpoint returns 200 with a list of members';
const CRIT_B = 'An unauthenticated caller gets 401';
const CRIT_C = 'A member who left is excluded';

const plan: PlanStorySpec[] = [
  { id: 'STORY-001', acceptance: [CRIT_A, CRIT_B] },
  { id: 'STORY-002', acceptance: [CRIT_C] },
];

function progress(stories: ProgressFile['stories']): ProgressFile {
  return { schema_version: PROGRESS_SCHEMA_VERSION, project: 'Test', stories };
}

function story(id: string, criteria: Array<[string, boolean]>): ProgressFile['stories'][number] {
  return {
    id,
    release: 'R1',
    acceptance_total: criteria.length,
    criteria: criteria.map(([text, passed]) => ({ text, passed })),
    files_touched: ['src/roster.ts'],
    tests_added: [],
    notes: null,
    updated_at: null,
  };
}

function commit(over: Partial<CommitFact> = {}): CommitFact {
  return {
    sha: 'a'.repeat(40),
    message: 'STORY-001: add the roster endpoint\n\nStory: STORY-001',
    changed_files: 3,
    committed_at: '2026-08-10T12:00:00Z',
    author: 'Student',
    ...over,
  };
}

describe('commitNamesStory', () => {
  it('matches the Story: trailer on its own line', () => {
    expect(commitNamesStory('add roster\n\nStory: STORY-001', 'STORY-001')).toBe(true);
    expect(commitNamesStory('add roster\n\nstory:STORY-001', 'STORY-001')).toBe(true);
  });

  it('falls back to the story id in the subject line, which is what our CLAUDE.md asks for', () => {
    expect(commitNamesStory('STORY-001: add the roster endpoint', 'STORY-001')).toBe(true);
  });

  it('does NOT match a mention buried in the body', () => {
    // "this unblocks STORY-004" is not a commit FOR STORY-004.
    expect(commitNamesStory('fix the client\n\nthis unblocks STORY-004 later', 'STORY-004')).toBe(false);
  });

  it('does not let STORY-1 match STORY-10', () => {
    expect(commitNamesStory('STORY-10: something', 'STORY-1')).toBe(false);
  });
});

/**
 * The prefix collision, pinned with the ids that actually exist in production.
 *
 * These are real `student_tasks.story_id` values from the admissions domain, not
 * invented shapes — the bug was originally measured as UNREACHABLE by a query
 * whose pattern guessed the suffix was `:Rn` when it is really `.autonomy:Rn`,
 * so a test written from a guessed shape would pass while the defect shipped.
 *
 * The first test here FAILS without the `planIds` argument threaded through
 * `decideBuild`, and that is the point of it: a guard nobody has watched fail is
 * not yet a guard.
 */
describe('commitNamesStory — a rung commit must not also credit its base story', () => {
  const BASE = 'admissions.CAP.admission_decision_recording';
  const RUNG = 'admissions.CAP.admission_decision_recording.autonomy:R0';
  const IDS = [BASE, RUNG];
  const subject = `${RUNG}: record the decision and emit the audit row`;

  it('NEGATIVE CONTROL: does not credit the base story for a commit naming the rung', () => {
    // `\b` is satisfied by the `.` that starts `.autonomy`, so the un-guarded
    // matcher returns true here and the student is paid twice for one commit.
    expect(commitNamesStory(subject, BASE, IDS)).toBe(false);
  });

  it('still credits the story the commit actually named', () => {
    expect(commitNamesStory(subject, RUNG, IDS)).toBe(true);
  });

  it('proves the un-guarded call is what was broken, so the fix is load-bearing', () => {
    // Same subject, same base id, no plan ids supplied: the old permissive
    // answer. Pinning it keeps the two paths honestly distinguishable rather
    // than letting a future "simplification" quietly drop the argument.
    expect(commitNamesStory(subject, BASE)).toBe(true);
  });

  it('leaves the explicit trailer authoritative even when the subject names the rung', () => {
    // `Story: <base>` is $-anchored and cannot be a prefix of anything. If the
    // student wrote it, they meant that story.
    expect(commitNamesStory(`${subject}\n\nStory: ${BASE}`, BASE, IDS)).toBe(true);
  });

  it('still credits a story named independently alongside a longer one', () => {
    // Stripping rather than rejecting is what makes this work: remove STORY-10
    // and STORY-1 is still there, because it was named on its own.
    expect(commitNamesStory('STORY-1 and STORY-10: both', 'STORY-1', ['STORY-1', 'STORY-10'])).toBe(true);
  });

  it('collapses a whole chain from the outside in', () => {
    const chain = ['a.b', 'a.b.autonomy', 'a.b.autonomy:R1'];
    expect(commitNamesStory('a.b.autonomy:R1: done', 'a.b.autonomy:R1', chain)).toBe(true);
    expect(commitNamesStory('a.b.autonomy:R1: done', 'a.b.autonomy', chain)).toBe(false);
    expect(commitNamesStory('a.b.autonomy:R1: done', 'a.b', chain)).toBe(false);
  });

  it('gives the same answer compiled once as called one-shot, over many messages', () => {
    // The compiled form exists for speed on 189-story plans, and a fast matcher
    // that disagrees with the documented one would be the worst of both. Reused
    // across messages on purpose: the compiled regexes carry `g`, and a stale
    // `lastIndex` between calls is exactly how this kind of cache goes wrong.
    const matcher = storyCommitMatcher(BASE, IDS);
    const messages = [
      subject,
      `${RUNG}: again`,
      `${BASE}: the base story on its own`,
      `${subject}\n\nStory: ${BASE}`,
      'unrelated work',
      `${BASE}.`,
    ];
    for (const m of messages) {
      expect(matcher.names(m)).toBe(commitNamesStory(m, BASE, IDS));
    }
    // And spot-check two of those answers directly, so a bug common to both
    // paths cannot pass by agreeing with itself.
    expect(matcher.names(`${BASE}: the base story on its own`)).toBe(true);
    expect(matcher.names(subject)).toBe(false);
  });
});

describe('decideBuild — one commit cannot verify a story it did not name', () => {
  const BASE = 'admissions.CAP.admission_decision_recording';
  const RUNG = 'admissions.CAP.admission_decision_recording.autonomy:R0';

  it('verifies only the rung story when the commit names only the rung', () => {
    const stories: PlanStorySpec[] = [
      { id: BASE, acceptance: [CRIT_A] },
      { id: RUNG, acceptance: [CRIT_A] },
    ];
    const verdict = decideBuild(
      stories,
      progress([story(BASE, [[CRIT_A, true]]), story(RUNG, [[CRIT_A, true]])]),
      [commit({ message: `${RUNG}: record the decision`, changed_files: 2 })],
    );

    const byId = new Map(verdict.verdicts.map((v) => [v.story_id, v]));
    expect(byId.get(RUNG)?.state).toBe('verified');
    // Criteria are ticked, so this is NOT "not_started" — it is a story waiting
    // for a commit of its own, which is exactly the honest answer.
    expect(byId.get(BASE)?.state).not.toBe('verified');
    expect(verdict.rollup.stories_verified).toBe(1);
  });
});

describe('evidenceCommitFor', () => {
  it('ignores a commit that changed no files', () => {
    expect(evidenceCommitFor('STORY-001', [commit({ changed_files: 0 })])).toBeNull();
  });

  it('pins to the OLDEST qualifying commit so the evidence reference does not move', () => {
    const older = commit({ sha: 'b'.repeat(40), committed_at: '2026-08-01T00:00:00Z' });
    const newer = commit({ sha: 'c'.repeat(40), committed_at: '2026-08-09T00:00:00Z' });
    expect(evidenceCommitFor('STORY-001', [newer, older])?.sha).toBe(older.sha);
    // Order of the input array must not change the answer.
    expect(evidenceCommitFor('STORY-001', [older, newer])?.sha).toBe(older.sha);
  });
});

describe('decideStory — Ali\'s rule: all criteria AND a commit', () => {
  it('verifies when every criterion passes and a commit names the story', () => {
    const v = decideStory(
      plan[0],
      progress([story('STORY-001', [[CRIT_A, true], [CRIT_B, true]])]),
      [commit()],
    );
    expect(v.state).toBe('verified');
    expect(v.criteria_passed).toBe(2);
    expect(v.outstanding).toEqual([]);
    expect(v.commit_sha).toBe('a'.repeat(40));
    expect(v.reasons).toEqual([]);
  });

  it('TICKED BUT NOT COMMITTED is not done — and says so', () => {
    const v = decideStory(
      plan[0],
      progress([story('STORY-001', [[CRIT_A, true], [CRIT_B, true]])]),
      [],
    );
    expect(v.state).toBe('submitted');
    expect(v.criteria_passed).toBe(2);
    expect(v.commit_sha).toBeNull();
    expect(v.reasons.join(' ')).toMatch(/No commit in the repo names STORY-001/);
  });

  it('COMMITTED BUT NOT TICKED is not done either', () => {
    const v = decideStory(plan[0], progress([]), [commit()]);
    expect(v.state).toBe('in_progress');
    expect(v.criteria_passed).toBe(0);
    expect(v.reasons.join(' ')).toMatch(/None of the 2 acceptance criteria/);
  });

  it('partial completion is a first-class state that names what is outstanding', () => {
    const v = decideStory(
      plan[0],
      progress([story('STORY-001', [[CRIT_A, true], [CRIT_B, false]])]),
      [commit()],
    );
    expect(v.state).toBe('submitted');
    expect(v.criteria_passed).toBe(1);
    expect(v.criteria_total).toBe(2);
    expect(v.outstanding).toEqual([CRIT_B]);
    expect(v.reasons.join(' ')).toContain(CRIT_B);
  });

  it('a story with nothing claimed and no commit is not_started', () => {
    expect(decideStory(plan[0], progress([]), []).state).toBe('not_started');
  });

  it('a criterion the plan does not have is REJECTED, never counted', () => {
    const v = decideStory(
      plan[0],
      progress([story('STORY-001', [
        [CRIT_A, true],
        [CRIT_B, false],
        ['I decided this one also counts', true],
      ])]),
      [commit()],
    );
    expect(v.state).toBe('submitted');
    expect(v.criteria_passed).toBe(1);
    expect(v.rejected_claims).toEqual(['I decided this one also counts']);
  });

  it('deleting criteria from the file cannot shrink the bar — the PLAN is the authority', () => {
    // The file claims one criterion, passing. The plan says there are two.
    const v = decideStory(
      plan[0],
      progress([story('STORY-001', [[CRIT_A, true]])]),
      [commit()],
    );
    expect(v.criteria_total).toBe(2);
    expect(v.state).toBe('submitted');
    expect(v.outstanding).toEqual([CRIT_B]);
  });

  it('tolerates reformatting: whitespace and case do not break the match', () => {
    const reflowed = `  the roster endpoint  returns 200\n   with a list of MEMBERS `;
    const v = decideStory(
      plan[0],
      progress([story('STORY-001', [[reflowed, true], [CRIT_B, true]])]),
      [commit()],
    );
    expect(v.state).toBe('verified');
  });

  it('a contradictory file (same criterion true and false) resolves pessimistically', () => {
    const v = decideStory(
      plan[0],
      progress([story('STORY-001', [[CRIT_A, true], [CRIT_A, false], [CRIT_B, true]])]),
      [commit()],
    );
    expect(v.state).toBe('submitted');
    expect(v.outstanding).toEqual([CRIT_A]);
  });

  it('a story the plan gave no acceptance criteria can never be vacuously verified', () => {
    const v = decideStory(
      { id: 'STORY-009', acceptance: [] },
      progress([story('STORY-009', [])]),
      [commit({ message: 'STORY-009: done', sha: 'd'.repeat(40) })],
    );
    expect(v.state).not.toBe('verified');
    expect(v.reasons.join(' ')).toMatch(/no acceptance criteria in the published plan/);
  });
});

describe('decideBuild', () => {
  it('verifies exactly the stories legitimately claimed, and no others', () => {
    const result = decideBuild(
      plan,
      progress([
        story('STORY-001', [[CRIT_A, true], [CRIT_B, true]]),
        story('STORY-002', [[CRIT_C, true]]),   // ticked, but no commit names it
      ]),
      [commit()],
    );
    const byId = Object.fromEntries(result.verdicts.map((v) => [v.story_id, v]));
    expect(byId['STORY-001'].state).toBe('verified');
    expect(byId['STORY-002'].state).toBe('submitted');
    expect(result.rollup.stories_verified).toBe(1);
    expect(result.rollup.stories_submitted).toBe(1);
    expect(result.rollup.criteria_passed).toBe(3);
    expect(result.rollup.criteria_total).toBe(3);
  });

  it('a story id the plan does not have is reported as unknown and never verified', () => {
    const result = decideBuild(
      plan,
      progress([
        story('STORY-001', [[CRIT_A, true], [CRIT_B, true]]),
        story('STORY-777', [['I invented this story', true]]),
      ]),
      [commit(), commit({ sha: 'e'.repeat(40), message: 'STORY-777: invented\n\nStory: STORY-777' })],
    );
    expect(result.unknown_stories).toEqual(['STORY-777']);
    expect(result.verdicts.map((v) => v.story_id)).toEqual(['STORY-001', 'STORY-002']);
    expect(result.rollup.stories_verified).toBe(1);
  });

  it('with no readable progress file, nothing verifies even with perfect commits', () => {
    const result = decideBuild(plan, null, [commit()]);
    expect(result.rollup.stories_verified).toBe(0);
    expect(result.verdicts[0].state).toBe('in_progress');
  });
});
