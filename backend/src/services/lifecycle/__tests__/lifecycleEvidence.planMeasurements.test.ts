import { applyMeasurements, EVIDENCE_MEASUREMENTS, type PlanLike } from '../lifecycleEvidence';
import {
  prerequisiteGaps, blockingGaps, advisoryGaps, satisfied,
  type LifecycleEvidence,
} from '../lifecyclePrerequisites';
import { completeEvidence } from './evidenceFixture';

/**
 * P6-T4 — the WIRING, end to end and without a database.
 *
 * The predicates have their own suite. This one proves the chain they sit in actually connects:
 *
 *     a published plan  ->  EVIDENCE_MEASUREMENTS  ->  assessedFields  ->  release_review  ->  a gap
 *
 * Every link is exercised with the REAL measurement map and the REAL prerequisite rule. Nothing is
 * mocked, because nothing here needs to be: `applyMeasurements` is pure and synchronous, and the
 * plan arrives in the context rather than being read inside a measurement. The only thing a
 * database would add is the SELECT, and `latestPublishedPlan` returning `null` on failure is
 * covered by the `plan: null` case below.
 *
 * ## Why this file exists at all
 *
 * `applyMeasurements`' own header records what happened last time this wiring went untested: the
 * loop was inlined, the only test for it iterated the real map, the real map was EMPTY — so the
 * test body never executed and **deleting the whole loop left 850 of 850 tests green.** A verifier
 * found it. The map is no longer empty, which is precisely when that class of defect stops being
 * theoretical, so each measurement is driven with data that makes it return something different
 * from its placeholder.
 */

const ROW = {
  tenant_id: 'tenant-1',
  student_project_id: 'proj-1',
  delivery_project_id: null,
} as unknown as Parameters<typeof applyMeasurements>[2]['row'];

const base = (): LifecycleEvidence => completeEvidence();

/** Drive the real map with a plan, then ask the real rule. */
function gapsFor(plan: PlanLike | null, stage = 'release_review') {
  const e = applyMeasurements(base(), EVIDENCE_MEASUREMENTS, { row: ROW, refs: null, plan });
  return { e, gaps: prerequisiteGaps(stage as never, e) };
}

const ws = (kind: 'workspace' | 'headless') => ({
  business_task_ids: [], blueprint: { revision: 1 }, workspace: { kind, ref: 'X' },
});

describe('P6-T4 wiring — a plan reaches release_review', () => {
  it('a headless-only release is MEASURED and reported as the advisory failure', () => {
    const { e, gaps } = gapsFor({
      requirements: [], releases: [{ key: 'r0' }],
      stories: [{ id: 'S-1', release: 'r0', fulfills: ['REQ-1'], references: ws('headless') }],
    });

    // The field became assessed — the value and the set move together, which is the property
    // `applyMeasurements` was rewritten to make observable.
    expect(e.assessedFields.has('releasesWithoutUserVisibleWorkflow')).toBe(true);
    expect(e.releasesWithoutUserVisibleWorkflow).toEqual(['r0']);

    expect(gaps.map((g) => g.rule)).toEqual(['release_without_user_visible_workflow']);
    expect(gaps.map((g) => g.kind)).toEqual(['unmet']);
    // Advisory: it surfaces to a reviewer but does not refuse the stage. Phase 8 promotes it, once
    // the affected-student count is known.
    expect(advisoryGaps(gaps)).toHaveLength(1);
    expect(blockingGaps(gaps)).toHaveLength(0);
    expect(satisfied(gaps)).toBe(true);
  });

  it('a release with a real workspace is measured as having no gap', () => {
    const { e, gaps } = gapsFor({
      requirements: [], releases: [{ key: 'r0' }],
      stories: [
        { id: 'S-1', release: 'r0', references: ws('headless') },
        { id: 'S-2', release: 'r0', references: ws('workspace') },
      ],
    });
    expect(e.assessedFields.has('releasesWithoutUserVisibleWorkflow')).toBe(true);
    expect(e.releasesWithoutUserVisibleWorkflow).toEqual([]);
    expect(gaps).toEqual([]);
  });

  it('A LEGACY PLAN IS NOT MEASURED, and release_review BLOCKS rather than passing', () => {
    // The case that matters most, because it is every plan generated before P6-T3. No story
    // declares a workspace, so nobody has looked — and the honest result is a blocking
    // `not_assessed`, not an empty gap list.
    const { e, gaps } = gapsFor({
      requirements: [{ id: 'REQ-1', kind: 'FUNC', priority: 'must' }],
      releases: [{ key: 'r0' }],
      stories: [{ id: 'S-1', release: 'r0', fulfills: ['REQ-1'] }],
    });

    expect(e.assessedFields.has('releasesWithoutUserVisibleWorkflow')).toBe(false);
    expect(gaps.map((g) => g.rule)).toEqual(['release_workflow_unassessed']);
    expect(gaps.map((g) => g.kind)).toEqual(['not_assessed']);
    expect(blockingGaps(gaps)).toHaveLength(1);
    expect(satisfied(gaps)).toBe(false);

    // But the OTHER two measurements still work on the same legacy plan: `fulfills` has always
    // existed, so traceability is assessable where workspace coverage is not. One unmeasurable
    // field must not take the measurable ones down with it.
    expect(e.assessedFields.has('storiesWithoutTraceability')).toBe(true);
    expect(e.storiesWithoutTraceability).toEqual([]);
    expect(e.assessedFields.has('mustHaveRequirementsWithoutStory')).toBe(true);
    expect(e.mustHaveRequirementsWithoutStory).toEqual([]);
  });

  it('NO PLAN measures nothing, so every plan-derived prerequisite blocks', () => {
    // `latestPublishedPlan` returns null for a delivery project, for a project with no published
    // plan, and for a read that failed. All three are the same answer: nobody looked.
    const { e, gaps } = gapsFor(null);
    for (const f of [
      'releasesWithoutUserVisibleWorkflow', 'storiesWithoutTraceability',
      'mustHaveRequirementsWithoutStory',
    ] as const) {
      expect(e.assessedFields.has(f)).toBe(false);
    }
    expect(gaps.map((g) => g.rule)).toEqual(['release_workflow_unassessed']);
    expect(satisfied(gaps)).toBe(false);

    const planGaps = prerequisiteGaps('plan_ready' as never, e);
    expect(planGaps.map((g) => g.kind)).toEqual(['not_assessed', 'not_assessed']);
    expect(satisfied(planGaps)).toBe(false);
  });
});

describe('P6-T4 wiring — traceability measurements read the plan, not a guess', () => {
  it('counts a must-have requirement with no story, and ignores should and constraints', () => {
    // The predicate is borrowed from `requirementsNeedingCoverage`, which P6-T4 corrected: it had
    // been omitting the must-have half, so `should` items would have been reported as gaps.
    const { e } = gapsFor({
      requirements: [
        { id: 'M-1', kind: 'FUNC', priority: 'must' },
        { id: 'S-1', kind: 'FUNC', priority: 'should' },
        { id: 'C-1', kind: 'CONSTRAINT', priority: 'must' },
        { id: 'N-1', kind: 'FUNC' },
      ],
      releases: [{ key: 'r0' }],
      stories: [{ id: 'STORY-1', release: 'r0', fulfills: [] }],
    });
    expect(e.mustHaveRequirementsWithoutStory).toEqual(['M-1']);
  });

  it('names a story that cites nothing at all', () => {
    const { e } = gapsFor({
      requirements: [], releases: [{ key: 'r0' }],
      stories: [
        { id: 'S-CITED', release: 'r0', fulfills: ['REQ-1'] },
        { id: 'S-ORPHAN', release: 'r0', fulfills: [] },
      ],
    });
    expect(e.storiesWithoutTraceability).toEqual(['S-ORPHAN']);
    // And plan_ready now REFUSES for a measured reason rather than an unassessed one.
    const gaps = prerequisiteGaps('plan_ready' as never, e);
    expect(gaps.map((g) => g.rule)).toContain('story_without_traceability');
    expect(gaps.find((g) => g.rule === 'story_without_traceability')?.kind).toBe('unmet');
    expect(gaps.find((g) => g.rule === 'story_without_traceability')?.subject).toBe('S-ORPHAN');
  });

  it('treats a malformed plan as unmeasured rather than empty', () => {
    // `plan_json` is JSONB and nothing validates it on read, so a plan missing `stories` entirely
    // is reachable. Reporting that as "no gaps" is the shape of bypass this whole file guards.
    const { e } = gapsFor({ requirements: [{ id: 'M-1', priority: 'must' }] } as PlanLike);
    expect(e.assessedFields.has('storiesWithoutTraceability')).toBe(false);
    expect(e.assessedFields.has('mustHaveRequirementsWithoutStory')).toBe(false);
    expect(e.assessedFields.has('releasesWithoutUserVisibleWorkflow')).toBe(false);
  });
});
