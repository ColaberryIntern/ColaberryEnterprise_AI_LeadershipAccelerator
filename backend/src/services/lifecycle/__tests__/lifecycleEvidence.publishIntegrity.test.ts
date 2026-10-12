import { applyMeasurements, EVIDENCE_MEASUREMENTS } from '../lifecycleEvidence';
import type { PublishedPlanState } from '../lifecyclePlanReads';
import {
  prerequisiteGaps, blockingGaps, advisoryGaps, satisfied, ADVISORY_RULES,
  type LifecycleEvidence,
} from '../lifecyclePrerequisites';
import { completeEvidence } from './evidenceFixture';

/**
 * P6-T5 — `launch_ready` is FED, not merely implemented.
 *
 * ## Why this file exists
 *
 * P6-T4 attempt 1 was graded FAIL for exactly one thing: the rule had an empty production
 * domain, because nothing filled the field it read. A rule with no feed reports `not_assessed`
 * forever, which LOOKS like a working gate — it blocks — while being incapable of ever
 * reporting the failure it was written for. That is the defect this file is written to make
 * impossible for `launch_ready`:
 *
 *     build_plans  ->  publishedPlanState  ->  EVIDENCE_MEASUREMENTS  ->  launch_ready
 *
 * The leftmost arrow needs a database and is proven in `lifecyclePlanReads.integration`. This
 * file owns the other two, driving the REAL measurement map and the REAL rule, and it drives
 * them to every one of the four verdicts rather than only to the refusal.
 *
 * ## Two fields, not one, and that is the subject of half these tests
 *
 * "Nothing is published" and "the published plan's hash does not match its content" are
 * different findings calling for different human action — publish the reviewed plan, versus
 * find out who edited `plan_json`. A single `publishedPlanSound` boolean would collapse them,
 * and the collapse would be invisible: both states would emit one rule with one message.
 */

const ROW = {
  id: 'lc-1',
  tenant_id: 'tenant-1',
  student_project_id: 'proj-1',
  delivery_project_id: null,
} as unknown as Parameters<typeof applyMeasurements>[2]['row'];

/** A plan body that satisfies the three plan-shape measurements, so they stay out of the way. */
const SOUND_PLAN = {
  requirements: [{ id: 'REQ-1', kind: 'FUNC', priority: 'must' }],
  releases: [{ key: 'r0' }],
  stories: [{
    id: 'S-1', release: 'r0', fulfills: ['REQ-1'], workspace: { kind: 'workspace', ref: 'WS' },
  }],
};

function state(over: Partial<PublishedPlanState>): PublishedPlanState {
  return { plan: SOUND_PLAN as never, publishedCount: 1, hashIntact: true, ...over };
}

/** Drive the real map, then ask the real rule. */
function launch(published: PublishedPlanState | null) {
  const e = applyMeasurements(
    completeEvidence() as LifecycleEvidence,
    EVIDENCE_MEASUREMENTS,
    { row: ROW, refs: null, published },
  );
  return { e, gaps: prerequisiteGaps('launch_ready', e) };
}

describe('launch_ready reaches all four verdicts from real measurement data', () => {
  it('ONE published plan with an intact hash: zero gaps', () => {
    const { e, gaps } = launch(state({}));

    // Both fields MEASURED — the half attempt 1 of the sibling task could not reach at all.
    expect(e.assessedFields.has('publishedPlanIsSingular')).toBe(true);
    expect(e.assessedFields.has('publishedPlanHashIntact')).toBe(true);
    expect(e.publishedPlanIsSingular).toBe(true);
    expect(e.publishedPlanHashIntact).toBe(true);

    expect(gaps).toEqual([]);
    expect(satisfied(gaps)).toBe(true);
  });

  it('TWO published plans: refused, and refused as a measured failure', () => {
    // The state `planStore.publishConcurrency.integration` demonstrates is reachable against
    // the shipped schema. THIS IS THE MUTATION TARGET: `publishedCount === 1` written as
    // `publishedCount > 0` would call this healthy, and no other test in this file would notice.
    const { e, gaps } = launch(state({ publishedCount: 2 }));

    expect(e.publishedPlanIsSingular).toBe(false);
    expect(gaps.map((g) => g.rule)).toEqual(['publish_not_exactly_one']);
    expect(gaps.map((g) => g.kind)).toEqual(['unmet']);
    expect(blockingGaps(gaps)).toHaveLength(1);
    expect(satisfied(gaps)).toBe(false);
  });

  it('NO published plan: refused on the count, UNASSESSED on the hash', () => {
    // The two fields diverge here, which is the whole reason they are two. There is nothing to
    // hash, so `hashIntact` is `null` and the measurement declines — reporting `true` would
    // launder "no plan at all" into "an intact plan", the exact direction of bypass the
    // gatherer exists to refuse.
    const { e, gaps } = launch(state({ plan: null, publishedCount: 0, hashIntact: null }));

    expect(e.publishedPlanIsSingular).toBe(false);
    expect(e.assessedFields.has('publishedPlanHashIntact')).toBe(false);

    expect(gaps.map((g) => g.rule)).toEqual(['publish_not_exactly_one', 'publish_hash_mismatch']);
    expect(gaps.map((g) => g.kind)).toEqual(['unmet', 'not_assessed']);
    expect(blockingGaps(gaps)).toHaveLength(2);
  });

  it('ONE published plan whose hash does not match its content: refused on the hash alone', () => {
    const { e, gaps } = launch(state({ hashIntact: false }));

    expect(e.publishedPlanIsSingular).toBe(true);
    expect(gaps.map((g) => g.rule)).toEqual(['publish_hash_mismatch']);
    expect(gaps.map((g) => g.kind)).toEqual(['unmet']);
    expect(gaps[0].message).toContain('not the plan that was reviewed');
  });

  it('NOT READABLE AT ALL: both unassessed, and the stage still refuses', () => {
    // `null` is a delivery project, or a query that threw. Both mean nobody looked, and the
    // honest answer is two `not_assessed` gaps rather than an empty list.
    const { e, gaps } = launch(null);

    expect(e.assessedFields.has('publishedPlanIsSingular')).toBe(false);
    expect(e.assessedFields.has('publishedPlanHashIntact')).toBe(false);
    expect(gaps.map((g) => g.kind)).toEqual(['not_assessed', 'not_assessed']);
    expect(satisfied(gaps)).toBe(false);
  });
});

describe('the two findings stay distinguishable, and neither is waivable', () => {
  it('the four input states produce FOUR distinct rule sets', () => {
    // A collapsed implementation — one field, or one rule covering both — would make two of
    // these identical. Comparing the sets to each other catches that where asserting each one
    // separately would not: a single `publish_unsound` rule satisfies every per-case assertion
    // above if its message is generic enough.
    const sets = [
      state({}),
      state({ publishedCount: 2 }),
      state({ plan: null, publishedCount: 0, hashIntact: null }),
      state({ hashIntact: false }),
    ].map((s) => launch(s).gaps.map((g) => `${g.rule}/${g.kind}`).join('+'));

    expect(new Set(sets).size).toBe(4);
    expect(sets).toEqual([
      '',
      'publish_not_exactly_one/unmet',
      'publish_not_exactly_one/unmet+publish_hash_mismatch/not_assessed',
      'publish_hash_mismatch/unmet',
    ]);
  });

  it('BLOCKING, not advisory — unlike release_review\'s measured half', () => {
    // The contrast is deliberate and the docblock on `launch_ready` argues it:
    // `release_without_user_visible_workflow` is advisory because a blocking release-SHAPE rule
    // would retroactively refuse students whose published plans predate the `workspace` field.
    // These two carry no retroactivity — a project with no published plan, or a stored hash
    // that does not describe its own stored content, was broken under the old code too.
    expect([...ADVISORY_RULES]).not.toContain('publish_not_exactly_one');
    expect([...ADVISORY_RULES]).not.toContain('publish_hash_mismatch');

    for (const s of [state({ publishedCount: 2 }), state({ hashIntact: false })]) {
      const { gaps } = launch(s);
      expect(advisoryGaps(gaps)).toEqual([]);
      expect(blockingGaps(gaps)).toHaveLength(1);
    }
  });

  it('the plan-shape measurements read the SAME state object and still work', () => {
    // One context field holds the plan and the publication facts, so a regression that broke
    // the accessor would take all five measurements down together. Asserted here because the
    // three plan-shape ones have their own file and would not notice this file's refactor.
    const { e } = launch(state({}));
    expect(e.assessedFields.has('storiesWithoutTraceability')).toBe(true);
    expect(e.storiesWithoutTraceability).toEqual([]);
    expect(e.releasesWithoutUserVisibleWorkflow).toEqual([]);
    expect(e.mustHaveRequirementsWithoutStory).toEqual([]);

    // And a state with NO plan body leaves those three unmeasured while the publication facts
    // stay measured: the two concerns travel together but do not contaminate each other.
    const { e: e2 } = launch(state({ plan: null, publishedCount: 2 }));
    expect(e2.assessedFields.has('storiesWithoutTraceability')).toBe(false);
    expect(e2.assessedFields.has('publishedPlanIsSingular')).toBe(true);
  });
});
