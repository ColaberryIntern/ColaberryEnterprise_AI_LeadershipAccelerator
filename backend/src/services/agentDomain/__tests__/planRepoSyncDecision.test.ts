import { decidePlanRepoSync, PlanRepoSyncInput } from '../planRepoSyncDecision';

/**
 * The rule behind the plan-to-repo sweep.
 *
 * The tests that matter most here are not the ones proving it pushes. They are the ones
 * proving it reports drift it must not act on, and that it stays quiet when there is
 * nothing published to compare against: a sweep that cried drift on every unpublished
 * project would be ignored within a week, and the whole point of the signal is that
 * somebody reads it.
 */

const base: PlanRepoSyncInput = {
  domainKey: 'platform',
  projectId: '9424aa6e-f754-521a-ace7-ae17fb2a5ff4',
  hasRepo: true,
  hasPublishedPlan: true,
  publishedStoryIds: ['platform.CAP.a', 'platform.GATE.R0.1'],
  boardStoryIds: ['platform.CAP.a', 'platform.GATE.R0.1'],
};

const decide = (over: Partial<PlanRepoSyncInput> = {}) => decidePlanRepoSync({ ...base, ...over });

describe('what the sweep should do', () => {
  it('pushes when there is a repo and a published plan', () => {
    const v = decide();
    expect(v.action).toBe('push');
    expect(v.drift.drifted).toBe(false);
    expect(v.domainKey).toBe('platform');
    expect(v.projectId).toBe(base.projectId);
  });

  it('skips a project with no GitHub connection, because there is nowhere to write', () => {
    expect(decide({ hasRepo: false }).action).toBe('skip_no_repo');
  });

  it('skips a project with no published plan, because nothing is authoritative yet', () => {
    expect(decide({ hasPublishedPlan: false }).action).toBe('skip_no_plan');
  });

  it('reports the missing repo ahead of the missing plan, so one project is counted once', () => {
    expect(decide({ hasRepo: false, hasPublishedPlan: false }).action).toBe('skip_no_repo');
  });
});

describe('board versus published plan drift', () => {
  it('names the stories the board has and the plan has never heard of', () => {
    // This is the 19 November case: the ladder migration put four rows on the board and
    // nothing republished, so buildVerificationService could not credit them.
    const v = decide({
      boardStoryIds: [
        'platform.CAP.a',
        'platform.GATE.R0.1',
        'platform.CAP.a.L0-CHOOSE',
        'platform.CAP.a.L0-SCOPE-SHEET',
      ],
    });
    expect(v.drift.drifted).toBe(true);
    expect(v.drift.onlyOnBoard).toEqual(['platform.CAP.a.L0-CHOOSE', 'platform.CAP.a.L0-SCOPE-SHEET']);
    expect(v.drift.onlyInPlan).toEqual([]);
  });

  it('names the stories the plan still carries that the board has dropped', () => {
    const v = decide({ boardStoryIds: ['platform.CAP.a'] });
    expect(v.drift.drifted).toBe(true);
    expect(v.drift.onlyInPlan).toEqual(['platform.GATE.R0.1']);
    expect(v.drift.onlyOnBoard).toEqual([]);
  });

  it('still reports drift on a project it is going to skip, because the republish is owed either way', () => {
    const v = decide({ hasRepo: false, boardStoryIds: ['platform.CAP.a', 'platform.CAP.new'] });
    expect(v.action).toBe('skip_no_repo');
    expect(v.drift.drifted).toBe(true);
    expect(v.drift.onlyOnBoard).toEqual(['platform.CAP.new']);
  });

  it('claims no drift when nothing is published, rather than calling every board story a difference', () => {
    const v = decide({ hasPublishedPlan: false, publishedStoryIds: [], boardStoryIds: ['a', 'b', 'c'] });
    expect(v.drift.drifted).toBe(false);
    expect(v.drift.onlyOnBoard).toEqual([]);
    expect(v.drift.onlyInPlan).toEqual([]);
  });

  it('is quiet when both sides are empty', () => {
    const v = decide({ publishedStoryIds: [], boardStoryIds: [] });
    expect(v.drift.drifted).toBe(false);
    expect(v.action).toBe('push');
  });
});

describe('normalizing the two id lists', () => {
  it('ignores order, duplicates, blanks, surrounding space and nulls', () => {
    const v = decide({
      publishedStoryIds: ['  platform.GATE.R0.1 ', 'platform.CAP.a', 'platform.CAP.a', null, '', '   '],
      boardStoryIds: ['platform.CAP.a', undefined, 'platform.GATE.R0.1'],
    });
    expect(v.drift.drifted).toBe(false);
  });

  it('returns differences sorted, so an identical state never reads as a change', () => {
    const v = decide({ boardStoryIds: ['platform.CAP.a', 'platform.GATE.R0.1', 'zz', 'aa', 'mm'] });
    expect(v.drift.onlyOnBoard).toEqual(['aa', 'mm', 'zz']);
  });

  it('treats a non-string id as absent rather than coercing it', () => {
    const v = decide({ boardStoryIds: [null, undefined] as any, publishedStoryIds: [] });
    expect(v.drift.drifted).toBe(false);
  });
});
