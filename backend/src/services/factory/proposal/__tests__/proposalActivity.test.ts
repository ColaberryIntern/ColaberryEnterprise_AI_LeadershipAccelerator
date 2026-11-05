/**
 * mergeActivity — the pure core of the B.4 activity feed. Folds typed sources into one newest-first, limit-bounded
 * feed; rows without a timestamp are dropped; garbage ⇒ empty.
 */
import { mergeActivity, type ActivitySources } from '../proposalActivity';

describe('mergeActivity', () => {
  const sources: ActivitySources = {
    versions: [
      { docKey: 'technical', version: 2, authorKind: 'human', changeSummary: 'tightened the approach', createdAt: '2026-11-05T03:00:00.000Z' },
      { docKey: 'technical', version: 1, authorKind: 'agent', changeSummary: null, createdAt: '2026-11-05T01:00:00.000Z' },
      { docKey: 'technical', version: 0, authorKind: 'agent', changeSummary: null, createdAt: null }, // dropped: no timestamp
    ],
    gates: [{ docKey: 'technical', gate: 'pink', status: 'approved', decidedAt: '2026-11-05T04:00:00.000Z' }],
    artifacts: [{ storyId: 'STORY-REQ-1', caption: 'dashboard', capturedAt: '2026-11-05T02:00:00.000Z' }],
    blueprints: [{ version: 1, createdAt: '2026-11-05T00:00:00.000Z' }],
    libraryAnswers: [{ key: 'DUNS number', createdAt: '2026-11-05T05:00:00.000Z' }],
  };

  it('merges all sources newest-first, typed, dropping timestampless rows', () => {
    const feed = mergeActivity(sources);
    expect(feed.map((e) => e.kind)).toEqual(['library_answer', 'gate', 'version', 'artifact', 'version', 'blueprint']);
    expect(feed[0]).toMatchObject({ kind: 'library_answer', summary: 'Answered: DUNS number' });
    expect(feed.find((e) => e.kind === 'version')!.summary).toMatch(/Human version 2: tightened the approach/);
    expect(feed.some((e) => e.at === null || e.at === '')).toBe(false); // the timestampless version row is gone
  });

  it('honors the limit (newest kept)', () => {
    const feed = mergeActivity(sources, 2);
    expect(feed).toHaveLength(2);
    expect(feed.map((e) => e.kind)).toEqual(['library_answer', 'gate']);
  });

  it('is total on empty / garbage', () => {
    expect(mergeActivity({})).toEqual([]);
    expect(mergeActivity(undefined as unknown as ActivitySources)).toEqual([]);
  });
});
