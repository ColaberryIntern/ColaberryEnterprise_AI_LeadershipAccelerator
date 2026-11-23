/**
 * A milestone that LATCHES must not latch on a guess.
 *
 * ## The defect, found by an independent review of this branch
 *
 * `getProjectCompletions` computes `complete: verified >= ids.length`, and `syncMilestones`
 * writes `project_complete` through `findOrCreate`, where that file's own header says "one
 * already latched stays latched". The row feeds the promotion engine.
 *
 * `connectedDemoMaterializedFor` fails SOFT to `false` on a database error, by design, and that
 * design was argued for pricing and verification: "a throw would take down a whole verification
 * run; returning false degrades exactly one story and the next run pays it."
 *
 * Applied here, unchanged, it was wrong in a way the surrounding comment actively concealed. The
 * comment read "a milestone count that omitted a story the student is being graded on would
 * UNDER-report their completion." It is the reverse: omitting STORY-900 shrinks `ids`, so the
 * project reads complete SOONER. One transient lookup failure therefore marked a build complete
 * with the demo unverified, permanently, and there is no next run to correct a latched row.
 *
 * So the latching path uses `connectedDemoMaterializedForStrict`, which throws, and skips the
 * project for that run. These tests are the ones that were missing.
 *
 * ## Both directions, because the fix is a refusal
 *
 * A skip that happened on every input would be worse than the bug: no student would ever be
 * credited. Every case below has its positive twin.
 */

/*
 * A MODULE, not a script, and that is not cosmetic. This file has no top-level `import` or
 * `export` of its own (every import is a dynamic one inside a test, so `jest.resetModules` can
 * take effect), which under `tsconfig.test.json` makes it a global script: its top-level `const`s
 * land in the shared global scope. `services/__tests__/createLeadBypassPhone.test.ts` also
 * declares `mockFindAll` there, so adding this file made the TEST-TYPECHECK gate report a type
 * error in a file this branch never touched: `TS2451: Cannot redeclare block-scoped variable`.
 *
 * One empty export fixes it at the cause. Renaming the variable would have cleared the symptom
 * and left the next collision waiting for whoever adds the third file.
 */
export {};

const mockCount = jest.fn();
const mockFindAll = jest.fn();
const mockGetPublishedPlan = jest.fn();
const mockCommandCenterSpec = jest.fn();

jest.mock('../../../models/StudentTask', () => ({
  __esModule: true,
  default: { count: (...a: unknown[]) => mockCount(...a) },
}));

jest.mock('../../../models/Project', () => ({
  __esModule: true,
  default: { findAll: (...a: unknown[]) => mockFindAll(...a) },
  Project: { findAll: (...a: unknown[]) => mockFindAll(...a) },
}));

jest.mock('../../sbp/planStore', () => ({
  getPublishedPlan: (...a: unknown[]) => mockGetPublishedPlan(...a),
}));

jest.mock('../../sbp/verification/storyPoints', () => ({
  ...(jest.requireActual('../../sbp/verification/storyPoints') as object),
  commandCenterSpecForProject: (...a: unknown[]) => mockCommandCenterSpec(...a),
}));

/**
 * The plan: two ordinary stories. STORY-900 is appended by `planStorySpecs` only when the demo
 * flag says the project has one, which is the switch under test.
 */
const PLAN = {
  project_name: 'ShiftFill',
  descriptor: 'a demo plan',
  requirements: [{ id: 'REQ-1', text: 'r1', priority: 'must' }],
  releases: [{ key: 'r0', name: 'First', goal: 'g' }],
  stories: [
    { id: 'STORY-001', release: 'r0', title: 'One', narrative: 'n1', fulfills: ['REQ-1'], acceptance: ['a'] },
    { id: 'STORY-002', release: 'r0', title: 'Two', narrative: 'n2', fulfills: ['REQ-1'], acceptance: ['a'] },
  ],
};

describe('a project whose Connected Demo row cannot be read is SKIPPED, not counted', () => {
  beforeEach(() => {
    jest.resetModules();
    mockCount.mockReset();
    mockFindAll.mockReset();
    mockGetPublishedPlan.mockReset();
    mockCommandCenterSpec.mockReset();

    mockFindAll.mockResolvedValue([{ id: 'p-1', name: 'ShiftFill' }]);
    mockGetPublishedPlan.mockResolvedValue({ plan: PLAN });
    // Never null: `commandCenterSpecForProject` fails soft to the bare spec, so the command
    // center story is ALWAYS in the denominator. That is why the totals below are 3 and 4.
    mockCommandCenterSpec.mockResolvedValue({ id: 'STORY-000', acceptance: ['a'] });
  });

  /** `StudentTask.count` serves two different questions here, so the mock answers by story id. */
  const countBy = (opts: { demo: 'throw' | number; verified: number }) =>
    mockCount.mockImplementation((args: { where?: { story_id?: unknown } }) => {
      const storyId = args?.where?.story_id;
      if (storyId === 'STORY-900') {
        if (opts.demo === 'throw') return Promise.reject(new Error('connection terminated'));
        return Promise.resolve(opts.demo);
      }
      return Promise.resolve(opts.verified);
    });

  it('returns NO completion row for the project when the demo lookup fails', async () => {
    /*
     * The case that latched. Every ordinary story is verified, so under the old soft lookup
     * `ids` was 2, `verified` was 2, and `complete` was true with STORY-900 never checked.
     */
    countBy({ demo: 'throw', verified: 2 });
    const { getProjectCompletions } = await import('../milestoneService');

    expect(await getProjectCompletions('enr-1')).toEqual([]);
  });

  it('and with the SAME verified count, a readable lookup DOES produce a row', async () => {
    // The control. Without it the skip above could be unconditional and the test would still
    // pass, which would mean no student is ever credited.
    countBy({ demo: 0, verified: 3 });
    const { getProjectCompletions } = await import('../milestoneService');

    const out = await getProjectCompletions('enr-1');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ projectId: 'p-1', storiesTotal: 3, storiesVerified: 3, complete: true });
  });

  it('a project WITH a demo row needs the demo verified too, so it is not complete at 3 of 4', async () => {
    /*
     * The arithmetic the inverted comment got backwards, asserted directly: adding STORY-900
     * RAISES the denominator, so the same two verified stories are no longer complete.
     */
    countBy({ demo: 1, verified: 3 });
    const { getProjectCompletions } = await import('../milestoneService');

    const out = await getProjectCompletions('enr-1');
    expect(out[0]).toMatchObject({ storiesTotal: 4, storiesVerified: 3, complete: false });
  });

  it('and it IS complete once all four are verified', async () => {
    countBy({ demo: 1, verified: 4 });
    const { getProjectCompletions } = await import('../milestoneService');

    expect((await getProjectCompletions('enr-1'))[0]).toMatchObject({ storiesTotal: 4, complete: true });
  });

  it('the skip is per PROJECT: a readable project beside an unreadable one is still counted', async () => {
    /*
     * The blast radius of the refusal. Skipping the whole enrollment on one bad project would
     * trade a wrong latch for a stalled one, and a student with two builds would lose credit on
     * the good one.
     */
    mockFindAll.mockResolvedValue([
      { id: 'p-bad', name: 'Unreadable' },
      { id: 'p-good', name: 'Readable' },
    ]);
    mockCount.mockImplementation((args: { where?: { project_id?: unknown; story_id?: unknown } }) => {
      if (args?.where?.story_id === 'STORY-900') {
        return args?.where?.project_id === 'p-bad'
          ? Promise.reject(new Error('connection terminated'))
          : Promise.resolve(0);
      }
      return Promise.resolve(3);
    });
    const { getProjectCompletions } = await import('../milestoneService');

    const out = await getProjectCompletions('enr-1');
    expect(out.map((p) => p.projectId)).toEqual(['p-good']);
  });
});

describe('the strict lookup is what makes that possible', () => {
  beforeEach(() => {
    jest.resetModules();
    mockCount.mockReset();
  });

  it('throws ConnectedDemoLookupFailed, naming the project, rather than answering false', async () => {
    mockCount.mockRejectedValue(new Error('connection terminated'));
    const { connectedDemoMaterializedForStrict, ConnectedDemoLookupFailed } =
      await import('../../sbp/connectedDemoFlag');

    await expect(connectedDemoMaterializedForStrict('p-1')).rejects.toBeInstanceOf(ConnectedDemoLookupFailed);
    await expect(connectedDemoMaterializedForStrict('p-1')).rejects.toMatchObject({
      error_class: 'ConnectedDemoLookupFailed',
      projectId: 'p-1',
    });
  });

  it('while the SOFT lookup still answers false, because pricing has a next run', async () => {
    // The two are deliberately different functions, and this is the difference. Deleting the
    // soft path's fallback would break verification runs; deleting the strict path's throw would
    // restore the latch.
    mockCount.mockRejectedValue(new Error('connection terminated'));
    const { connectedDemoMaterializedFor } = await import('../../sbp/connectedDemoFlag');

    await expect(connectedDemoMaterializedFor('p-1')).resolves.toBe(false);
  });

  it('and both agree on the ordinary answers, so they are one question asked two ways', async () => {
    const { connectedDemoMaterializedFor, connectedDemoMaterializedForStrict } =
      await import('../../sbp/connectedDemoFlag');

    mockCount.mockResolvedValue(1);
    expect(await connectedDemoMaterializedFor('p-1')).toBe(true);
    expect(await connectedDemoMaterializedForStrict('p-1')).toBe(true);

    mockCount.mockResolvedValue(0);
    expect(await connectedDemoMaterializedFor('p-1')).toBe(false);
    expect(await connectedDemoMaterializedForStrict('p-1')).toBe(false);

    // A missing project id is an ANSWER, not a failure: nothing can hold a row. Both say so.
    expect(await connectedDemoMaterializedFor(null)).toBe(false);
    expect(await connectedDemoMaterializedForStrict(null)).toBe(false);
  });
});
