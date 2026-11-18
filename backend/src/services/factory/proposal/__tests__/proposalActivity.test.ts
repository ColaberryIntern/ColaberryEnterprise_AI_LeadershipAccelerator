/**
 * mergeActivity — the pure core of the B.4 activity feed. Folds typed sources into one newest-first, limit-bounded
 * feed of PLAIN build-log lines (starting / created a Need / finished); rows without a timestamp are dropped;
 * garbage ⇒ empty. The feed never echoes drafter prose.
 */
import { mergeActivity, type ActivitySources } from '../proposalActivity';

describe('mergeActivity', () => {
  const sources: ActivitySources = {
    runs: [
      { docKey: 'technical', title: 'Technical Proposal', status: 'running', startedAt: '2026-11-05T06:00:00.000Z', finishedAt: null },
      { docKey: 'past_perf', title: 'Past Performance', status: 'passed', startedAt: '2026-11-05T05:30:00.000Z', finishedAt: '2026-11-05T05:45:00.000Z' },
    ],
    needs: [
      { docKey: 'technical', title: 'Technical Proposal', question: 'What is your DUNS number?', createdAt: '2026-11-05T05:50:00.000Z' },
    ],
    versions: [
      { docKey: 'technical', title: 'Technical Proposal', version: 2, authorKind: 'human', createdAt: '2026-11-05T03:00:00.000Z' },
      { docKey: 'technical', title: 'Technical Proposal', version: 1, authorKind: 'agent', createdAt: '2026-11-05T01:00:00.000Z' },
      { docKey: 'technical', title: 'Technical Proposal', version: 0, authorKind: 'agent', createdAt: null }, // dropped: no timestamp
    ],
    gates: [{ docKey: 'technical', title: 'Technical Proposal', gate: 'pink', status: 'approved', decidedAt: '2026-11-05T04:00:00.000Z' }],
    artifacts: [{ storyId: 'STORY-REQ-1', caption: 'dashboard', capturedAt: '2026-11-05T02:00:00.000Z' }],
    blueprints: [{ version: 1, createdAt: '2026-11-05T00:00:00.000Z' }],
    libraryAnswers: [{ key: 'DUNS number', createdAt: '2026-11-05T05:20:00.000Z' }],
  };

  it('narrates the build as factual lifecycle lines, newest-first', () => {
    const feed = mergeActivity(sources);
    expect(feed[0]).toMatchObject({ kind: 'run', summary: 'Starting Technical Proposal' });
    expect(feed.map((e) => e.summary)).toEqual([
      'Starting Technical Proposal',
      'Created a Needs for you: What is your DUNS number?',
      'Finished Past Performance',
      'Starting Past Performance',
      'Answered: DUNS number',
      'Checked Technical Proposal: pink approved',
      'You edited Technical Proposal (v2)',
      'Captured dashboard',
      'Drafted Technical Proposal (v1)',
      'Re-read the solicitation package (v1)',
    ]);
    // No drafter prose, and none of the old "Agent version N: <summary>" lines.
    expect(feed.some((e) => /white glove/i.test(e.summary) || /version \d:/i.test(e.summary))).toBe(false);
    expect(feed.some((e) => e.at === null || e.at === '')).toBe(false); // the timestampless version row is gone
  });

  it('honors the limit (newest kept)', () => {
    const feed = mergeActivity(sources, 2);
    expect(feed).toHaveLength(2);
    expect(feed.map((e) => e.kind)).toEqual(['run', 'need']);
    expect(feed.map((e) => e.summary)).toEqual(['Starting Technical Proposal', 'Created a Needs for you: What is your DUNS number?']);
  });

  it('reports a blocked run as waiting on you, and a failed run as a retry', () => {
    const feed = mergeActivity({
      runs: [
        { docKey: 'a', title: 'Doc A', status: 'blocked', startedAt: null, finishedAt: '2026-11-05T01:00:00.000Z' },
        { docKey: 'b', title: 'Doc B', status: 'failed', startedAt: null, finishedAt: '2026-11-05T02:00:00.000Z' },
      ],
    });
    expect(feed.map((e) => e.summary)).toEqual(['Hit a snag on Doc B, will retry', 'Paused Doc A, waiting on your answers']);
  });

  it('is total on empty / garbage', () => {
    expect(mergeActivity({})).toEqual([]);
    expect(mergeActivity(undefined as unknown as ActivitySources)).toEqual([]);
  });
});
