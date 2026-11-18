import {
  fireStoryCelebration,
  storyArtifactMode,
  storyCompletionMode,
  verifyStoryArtifacts,
} from '../storyArtifactVerification';
import { recordStoryArtifacts } from '../storyArtifactVerificationStore';
import { recordStoryCelebration } from '../storyCompletionStore';

jest.mock('../storyArtifactVerificationStore', () => ({
  recordStoryArtifacts: jest.fn(async (input: { matches: Array<{ verdict: string }> }) => ({
    inserted: input.matches.filter(
      (m) => m.verdict === 'satisfied' || m.verdict === 'present_content_unchecked',
    ).length,
    offered: 0,
    skipped: null,
    reason: null,
  })),
  SATISFYING_VERDICTS: ['satisfied', 'present_content_unchecked'],
}));

jest.mock('../storyCompletionStore', () => ({
  recordStoryCelebration: jest.fn(async () => ({ inserted: 1, skipped: null, reason: null })),
}));

/**
 * PHASE A2'S SEQUENCING, with the store mocked so this suite is about WHAT IS ASKED OF THE
 * DATABASE rather than about Postgres. The idempotency claim is not testable here at all, because
 * it is a unique index doing the work: that is
 * `storyArtifactIdempotency.integration.test.ts`, which runs against a real database.
 *
 * The named acceptance for this phase is the first test below: a repository holding ONE of three
 * declared artifacts produces exactly one row and a verdict naming the two that are outstanding.
 */

const recordMock = recordStoryArtifacts as jest.MockedFunction<typeof recordStoryArtifacts>;

const THREE = [
  { key: 'ART-001', name: 'Churn report', type: 'analysis_report', repo_path: 'docs/report.pdf' },
  { key: 'ART-002', name: 'Decision record', type: 'architecture_decision', repo_path: 'docs/adr/1.md' },
  { key: 'ART-003', name: 'The workbook', type: 'data_workbook', repo_path: 'data/book.xlsx' },
];

const blob = (path: string, size = 1024) => ({ path, sha: 'b'.repeat(40), size });

const run = (over: Partial<Parameters<typeof verifyStoryArtifacts>[0]> = {}) =>
  verifyStoryArtifacts({
    projectId: 'p-1',
    stories: [{ id: 'S-001', artifacts: THREE }],
    treeEntries: [blob('docs/report.pdf')],
    headCommitSha: 'c'.repeat(40),
    planVersion: 3,
    mode: 'report_only',
    ...over,
  });

const celebrateMock = recordStoryCelebration as jest.MockedFunction<typeof recordStoryCelebration>;

beforeEach(() => { recordMock.mockClear(); celebrateMock.mockClear(); });

describe('verifyStoryArtifacts', () => {
  it('records the one artifact that is there and names the two that are not', async () => {
    // THE PHASE'S STATED ACCEPTANCE.
    const result = await run();

    expect(result.mode).toBe('report_only');
    expect(result.stories_with_contract).toBe(1);
    expect(result.satisfied_total).toBe(1);
    expect(result.outstanding_total).toBe(2);

    const report = result.reports[0];
    expect(report.story_id).toBe('S-001');
    expect(report.satisfied).toEqual(['ART-001']);
    expect(report.outstanding).toEqual(['ART-002', 'ART-003']);
    expect(report.rows_inserted).toBe(1);

    // Exactly one row was OFFERED, and it was the one that exists. An outstanding key is
    // deliberately not a row: absence is what "not handed over yet" means.
    expect(recordMock).toHaveBeenCalledTimes(1);
    const offered = recordMock.mock.calls[0][0];
    expect(offered.matches.filter((m) => m.verdict === 'satisfied').map((m) => m.key))
      .toEqual(['ART-001']);
    expect(offered.commitSha).toBe('c'.repeat(40));
    expect(offered.planVersion).toBe(3);
    expect(offered.mode).toBe('report_only');
  });

  it('is off by default and asks the database for nothing', async () => {
    // The flag has to be read, not assumed, and off has to mean off.
    const result = await verifyStoryArtifacts({
      projectId: 'p-1',
      stories: [{ id: 'S-001', artifacts: THREE }],
      treeEntries: [blob('docs/report.pdf')],
      headCommitSha: 'c'.repeat(40),
      planVersion: 3,
      mode: 'off',
    });
    expect(result.mode).toBe('off');
    expect(result.reports).toEqual([]);
    expect(result.stories_with_contract).toBe(0);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('reads the flag from the environment, and only the exact value switches it on', () => {
    expect(storyArtifactMode({})).toBe('off');
    expect(storyArtifactMode({ STORY_ARTIFACT_VERIFICATION: 'report_only' })).toBe('report_only');
    // Anything else is off. A check that awards or withholds nothing yet should not be
    // switchable on by a typo, and there is no enforcing mode to reach by guessing.
    for (const v of ['enforcing', 'on', 'true', '1', 'REPORT_ONLY', '']) {
      expect(storyArtifactMode({ STORY_ARTIFACT_VERIFICATION: v })).toBe('off');
    }
  });

  it('records NOTHING when the tree could not be read', async () => {
    const result = await run({ treeEntries: null });
    expect(result.tree_unreadable).toBe(true);
    expect(result.satisfied_total).toBe(0);
    expect(result.outstanding_total).toBe(0);
    expect(result.reports[0].unverifiable).toEqual(['ART-001', 'ART-002', 'ART-003']);
    expect(result.reports[0].rows_inserted).toBe(0);
    // The important half: a tree we could not read must not write rows claiming anything.
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('records nothing when there is no commit to key a row to', async () => {
    const result = await run({ headCommitSha: null });
    expect(result.commit_sha).toBeNull();
    // The match still happens and is still reported, so the student is told where they stand.
    expect(result.reports[0].satisfied).toEqual(['ART-001']);
    // But a row keyed to no commit could never be idempotent, so none is offered.
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('reports a malformed stored contract by its refusal codes instead of throwing', async () => {
    // A stored plan is never re-validated on read, so this is a real state rather than a defect.
    const result = await run({
      stories: [{ id: 'S-001', artifacts: [{ key: 'ART-001', name: 'No type given' }] }],
    });
    expect(result.stories_with_contract).toBe(1);
    expect(result.reports[0].contract_refused).toContain('type_missing');
    expect(result.reports[0].satisfied).toEqual([]);
    expect(result.reports[0].outstanding).toEqual([]);
    expect(recordMock).not.toHaveBeenCalled();

    // An empty array is refused too, separately from an absent block: absent is not empty.
    const empty = await run({ stories: [{ id: 'S-001', artifacts: [] }] });
    expect(empty.reports[0].contract_refused).toContain('contract_empty');
  });

  it('skips a story that declares no contract, and does not count it', async () => {
    const result = await run({
      stories: [
        { id: 'S-001', artifacts: THREE },
        { id: 'S-002' },
        { id: 'S-003', artifacts: null },
      ],
    });
    expect(result.stories_with_contract).toBe(1);
    expect(result.reports.map((r) => r.story_id)).toEqual(['S-001']);
  });

  it('skips a story with no id rather than keying rows to an empty string', async () => {
    const result = await run({ stories: [{ artifacts: THREE }] });
    expect(result.stories_with_contract).toBe(0);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('counts across several stories, and asks the database once per story', async () => {
    const result = await run({
      stories: [
        { id: 'S-001', artifacts: THREE },
        { id: 'S-002', artifacts: [THREE[0]] },
      ],
      treeEntries: [blob('docs/report.pdf')],
    });
    expect(result.stories_with_contract).toBe(2);
    expect(result.satisfied_total).toBe(2);
    expect(result.outstanding_total).toBe(2);
    expect(recordMock).toHaveBeenCalledTimes(2);
    expect(recordMock.mock.calls.map((c) => c[0].storyId)).toEqual(['S-001', 'S-002']);
  });

  it('never claims a row was inserted when the store says it inserted none', async () => {
    // A re-sync of the same commit returns inserted: 0, and the report must say 0 rather than
    // re-deriving the number from what it hoped to write.
    recordMock.mockResolvedValueOnce({ inserted: 0, offered: 1, skipped: null, reason: null });
    const result = await run();
    expect(result.reports[0].rows_inserted).toBe(0);
    // The verdict is unchanged by the row count: the artifact is still handed over.
    expect(result.reports[0].satisfied).toEqual(['ART-001']);
  });

  it('counts a present_content_unchecked artifact as handed over, and says so', async () => {
    const result = await run({
      stories: [{
        id: 'S-001',
        artifacts: [{ ...THREE[0], must_contain: ['confusion matrix'] }],
      }],
    });
    expect(result.reports[0].satisfied).toEqual(['ART-001']);
    expect(result.reports[0].matches[0].verdict).toBe('present_content_unchecked');
    expect(result.reports[0].rows_inserted).toBe(1);
  });
});


describe('phase A3 inside the orchestrator', () => {
  const satisfied = () => run({ completionMode: 'celebrate' });

  it('computes nothing about completion when A3 is off', async () => {
    const r = await run({ completionMode: 'off' });
    expect(r.completion_mode).toBe('off');
    expect(r.held).toEqual([]);
    expect(r.reports[0].completion).toBeNull();
    expect(r.reports[0].celebration).toBeNull();
    expect(celebrateMock).not.toHaveBeenCalled();
  });

  it('reads its own flag, separately from A2, and only exact values switch it on', () => {
    expect(storyCompletionMode({})).toBe('off');
    expect(storyCompletionMode({ STORY_COMPLETION_GATE: 'celebrate' })).toBe('celebrate');
    expect(storyCompletionMode({ STORY_COMPLETION_GATE: 'enforce' })).toBe('enforce');
    for (const v of ['on', 'true', '1', 'ENFORCE', '']) {
      expect(storyCompletionMode({ STORY_COMPLETION_GATE: v })).toBe('off');
    }
    // And it is a DIFFERENT flag from A2's, so one cannot switch on the other.
    expect(storyArtifactMode({ STORY_COMPLETION_GATE: 'enforce' })).toBe('off');
    expect(storyCompletionMode({ STORY_ARTIFACT_VERIFICATION: 'report_only' })).toBe('off');
  });

  it('holds a story whose contract is not satisfied, and reports which', async () => {
    // The fixture has one of three artifacts present, so this story cannot complete.
    const r = await satisfied();
    expect(r.completion_mode).toBe('celebrate');
    expect(r.held).toEqual(['S-001']);
    expect(r.reports[0].completion!.verdict).toBe('artifacts_outstanding');
    expect(r.reports[0].completion!.may_complete).toBe(false);
    // Nothing is celebrated for a story that cannot complete.
    expect(r.reports[0].celebration).toBeNull();
    expect(celebrateMock).not.toHaveBeenCalled();
  });

  it('computes the celebration on the transition and does NOT write it', async () => {
    // The write belongs to the caller, AFTER the acceptance criteria are known: this function
    // runs before the story loop, so writing here would congratulate someone whose scenarios
    // then failed.
    const r = await run({
      completionMode: 'celebrate',
      treeEntries: [blob('docs/report.pdf'), blob('docs/adr/1.md'), blob('data/book.xlsx')],
    });
    expect(r.held).toEqual([]);
    expect(r.reports[0].completion!.verdict).toBe('artifacts_satisfied');
    expect(r.reports[0].completion!.is_transition).toBe(true);
    expect(r.reports[0].celebration!.headline)
      .toBe('Your Churn report, Decision record and The workbook are in your repository.');
    expect(r.reports[0].celebration_rows).toBe(0);
    // THE assertion.
    expect(celebrateMock).not.toHaveBeenCalled();
  });

  it('names the artifact in the celebration, not the key', async () => {
    const r = await run({
      completionMode: 'celebrate',
      treeEntries: [blob('docs/report.pdf'), blob('docs/adr/1.md'), blob('data/book.xlsx')],
    });
    const head = r.reports[0].celebration!.headline;
    // The contract's names, which are what the person made...
    expect(head).toContain('Churn report');
    expect(head).toContain('The workbook');
    // ...and not the keys, which are only how the platform cites them.
    for (const key of ['ART-001', 'ART-002', 'ART-003']) expect(head).not.toContain(key);
  });

  it('computes no transition for a story that was already complete', async () => {
    const r = await run({
      completionMode: 'celebrate',
      completedStoryIds: new Set(['S-001']),
      treeEntries: [blob('docs/report.pdf'), blob('docs/adr/1.md'), blob('data/book.xlsx')],
    });
    expect(r.reports[0].completion!.verdict).toBe('already_complete');
    expect(r.reports[0].completion!.is_transition).toBe(false);
    expect(r.reports[0].celebration).toBeNull();
    expect(r.held).toEqual([]);
  });

  it('never revokes: an already-complete story is not held even with nothing in the tree', async () => {
    const r = await run({
      completionMode: 'enforce',
      completedStoryIds: new Set(['S-001']),
      treeEntries: [],
    });
    expect(r.reports[0].completion!.may_complete).toBe(true);
    expect(r.held).toEqual([]);

    // The control: the same empty tree on a story NOT yet complete IS held.
    const fresh = await run({ completionMode: 'enforce', treeEntries: [] });
    expect(fresh.held).toEqual(['S-001']);
  });

  it('holds nothing when the tree could not be read, and records nothing either', async () => {
    const r = await run({ completionMode: 'enforce', treeEntries: null });
    // Held, because "I could not check" must not resolve wider than "the check says no".
    expect(r.held).toEqual(['S-001']);
    expect(r.reports[0].completion!.verdict).toBe('unverifiable');
    // But no audit row and no celebration were written on an unanswered question.
    expect(recordMock).not.toHaveBeenCalled();
    expect(celebrateMock).not.toHaveBeenCalled();
  });

  it('fireStoryCelebration is the only path that writes one', async () => {
    const r = await run({
      completionMode: 'celebrate',
      treeEntries: [blob('docs/report.pdf'), blob('docs/adr/1.md'), blob('data/book.xlsx')],
    });
    const rows = await fireStoryCelebration({
      projectId: 'p-1',
      storyId: 'S-001',
      commitSha: 'c'.repeat(40),
      planVersion: 3,
      celebration: r.reports[0].celebration!,
    });
    expect(rows).toBe(1);
    expect(celebrateMock).toHaveBeenCalledTimes(1);
    expect(celebrateMock.mock.calls[0][0].storyId).toBe('S-001');
  });
});
