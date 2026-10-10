import {
  requirementsWithoutStory,
  storiesWithoutTraceability,
  releasesWithoutUserVisibleWorkflow,
  type StoryLike,
} from '../storyTraceability';

/**
 * P6-T4 — the traceability predicates, driven directly.
 *
 * These are pure functions over arrays, so every case here is the real function rather than a
 * mock of it. The thing most worth testing is not the happy path: it is that **absence is never
 * reported as a finding**, in either direction. Two of the three functions can be asked about data
 * nobody has measured, and the honest answer is "not assessable", not "no problems found".
 */

const story = (over: Partial<StoryLike> = {}): StoryLike => ({
  id: 'STORY-001', release: 'r0', fulfills: [], ...over,
});

/** A workspace-declaring reference block. */
const ws = (kind: 'workspace' | 'headless', ref = 'WS-1') => ({
  business_task_ids: [], blueprint: { revision: 1 }, workspace: { kind, ref },
});

describe('requirementsWithoutStory', () => {
  it('names the requirements no story fulfils', () => {
    const stories = [story({ id: 'S-1', fulfills: ['REQ-1'] })];
    expect(requirementsWithoutStory(['REQ-1', 'REQ-2'], stories)).toEqual(['REQ-2']);
  });

  it('counts coverage from ANY story, not only the first', () => {
    const stories = [
      story({ id: 'S-1', fulfills: ['REQ-1'] }),
      story({ id: 'S-2', fulfills: ['REQ-2', 'REQ-3'] }),
    ];
    expect(requirementsWithoutStory(['REQ-1', 'REQ-2', 'REQ-3'], stories)).toEqual([]);
  });

  it('treats a missing or null fulfills as covering nothing, not as covering everything', () => {
    // The dangerous direction: `(s.fulfills ?? [])` getting inverted would report full coverage
    // for a plan whose stories cite no requirements at all.
    expect(requirementsWithoutStory(['REQ-1'], [story({ fulfills: null })])).toEqual(['REQ-1']);
    expect(requirementsWithoutStory(['REQ-1'], [{ id: 'S-9' }])).toEqual(['REQ-1']);
  });

  it('does not decide WHICH requirements need coverage', () => {
    // That judgement is `planContract.requiresStoryCoverage`, mirrored in
    // `adapters/sbpAdapter.requirementsNeedingCoverage`. Passing an empty need-set must yield no
    // gaps even when stories cover nothing — otherwise this function is quietly re-deciding it,
    // and that predicate has already been wrong once (it omitted the must-have half).
    expect(requirementsWithoutStory([], [story({ fulfills: [] })])).toEqual([]);
  });
});

describe('storiesWithoutTraceability', () => {
  it('accepts any ONE of the three citations', () => {
    expect(storiesWithoutTraceability([story({ fulfills: ['REQ-1'] })])).toEqual([]);
    expect(storiesWithoutTraceability([story({
      references: { business_task_ids: ['BT-1'] },
    })])).toEqual([]);
    expect(storiesWithoutTraceability([story({
      references: { blueprint: { revision: 2 } },
    })])).toEqual([]);
  });

  it('names a story citing none of the three', () => {
    expect(storiesWithoutTraceability([story({ id: 'S-ORPHAN' })])).toEqual(['S-ORPHAN']);
  });

  it('does not accept revision 0 as a blueprint reference', () => {
    // Revisions start at 1. A `!= null` check would accept 0, and 0 is what an uninitialised
    // counter looks like — so it would read a default as a citation.
    expect(storiesWithoutTraceability([story({
      id: 'S-ZERO', references: { blueprint: { revision: 0 } },
    })])).toEqual(['S-ZERO']);
  });

  it('is assessable on a LEGACY plan, where no story has references at all', () => {
    // Deliberately NOT null-returning. `fulfills` has always existed, so a pre-references plan
    // whose stories carry requirements is genuinely traceable — and reporting it as unassessable
    // would block every legacy project for a gap it does not have.
    const legacy = [story({ id: 'S-1', fulfills: ['REQ-1'] }), story({ id: 'S-2', fulfills: ['REQ-2'] })];
    expect(storiesWithoutTraceability(legacy)).toEqual([]);
  });

  it('tolerates an empty references block without reading it as a citation', () => {
    expect(storiesWithoutTraceability([story({
      id: 'S-EMPTY', references: { business_task_ids: [], blueprint: null },
    })])).toEqual(['S-EMPTY']);
  });
});

describe('releasesWithoutUserVisibleWorkflow', () => {
  it('returns null when NOTHING declares a workspace — nobody has looked', () => {
    // The load-bearing case, and the reason this returns `string[] | null`. Every legacy plan is
    // this. `null` becomes NOT_MEASURED, which leaves the prerequisite unassessed and the stage
    // blocked on `release_workflow_unassessed` — rather than passing with "no gaps found".
    expect(releasesWithoutUserVisibleWorkflow(['r0', 'r1'], [
      story({ id: 'S-1', release: 'r0', fulfills: ['REQ-1'] }),
      story({ id: 'S-2', release: 'r1', fulfills: ['REQ-2'] }),
    ])).toBeNull();
  });

  it('names a release whose every declared story is headless', () => {
    // The measured production failure: releases layered by pipeline stage, nothing reaching
    // user-visible output.
    expect(releasesWithoutUserVisibleWorkflow(['r0'], [
      story({ id: 'S-1', release: 'r0', references: ws('headless', 'ingest-job') }),
      story({ id: 'S-2', release: 'r0', references: ws('headless', 'reconcile-job') }),
    ])).toEqual(['r0']);
  });

  it('passes a release with at least one real workspace, headless alongside', () => {
    // `headless` is a legitimate answer, so a release is not condemned for containing background
    // work — only for containing nothing else.
    expect(releasesWithoutUserVisibleWorkflow(['r0'], [
      story({ id: 'S-1', release: 'r0', references: ws('headless', 'job') }),
      story({ id: 'S-2', release: 'r0', references: ws('workspace', 'WS-intake') }),
    ])).toEqual([]);
  });

  it('assesses release by release, not plan by plan', () => {
    // r0 declares and fails; r1 declares nothing and is therefore unassessable — it must not be
    // swept into the failure list just because a sibling release was measurable.
    expect(releasesWithoutUserVisibleWorkflow(['r0', 'r1'], [
      story({ id: 'S-1', release: 'r0', references: ws('headless') }),
      story({ id: 'S-2', release: 'r1', fulfills: ['REQ-1'] }),
    ])).toEqual(['r0']);
  });

  it('skips a release with no stories rather than failing it', () => {
    // An empty release is the plan gate's business (`dangling_release`), not this rule's. Failing
    // it here would report the same defect twice under two different names.
    expect(releasesWithoutUserVisibleWorkflow(['r0', 'r-empty'], [
      story({ id: 'S-1', release: 'r0', references: ws('workspace') }),
    ])).toEqual([]);
  });

  it('ignores a story whose release key matches nothing in the release list', () => {
    // A dangling story reference is also the plan gate's business. This rule iterates releases, so
    // the behaviour is asserted rather than assumed.
    expect(releasesWithoutUserVisibleWorkflow(['r0'], [
      story({ id: 'S-1', release: 'r0', references: ws('workspace') }),
      story({ id: 'S-X', release: 'r-nonexistent', references: ws('headless') }),
    ])).toEqual([]);
  });
});
