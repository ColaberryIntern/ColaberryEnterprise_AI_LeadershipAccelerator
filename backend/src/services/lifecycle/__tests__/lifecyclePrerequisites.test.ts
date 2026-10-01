/**
 * Prerequisites must name WHAT is missing, and must refuse rather than shrug.
 *
 * The positive-control discipline here is specific: for each stage, a clean evidence snapshot
 * must produce zero gaps AND a deliberately-broken one must produce the exact rule expected.
 * A predicate that returns `[]` for everything would pass the first half of that and is the
 * failure mode worth guarding against — it is the same shape as a gate that passes because it
 * is scanning nothing.
 */
import { LIFECYCLE_STAGES } from '../lifecycleStages';
import {
  prerequisiteGaps,
  blockingGaps,
  advisoryGaps,
  satisfied,
  stagesWithPrerequisites,
  type LifecycleEvidence,
} from '../lifecyclePrerequisites';

/** An evidence snapshot with nothing wrong with it. */
function clean(): LifecycleEvidence {
  return {
    tenantId: 'tenant-1',
    requirementCount: 12,
    requirementsWithoutProvenance: [],
    uncitedRequirementSourceBlocks: [],
    unresolvedSourceBlocks: [],
    processesWithoutTasks: [],
    graphHasStart: true,
    graphHasEnd: true,
    unreachableTasks: [],
    unboundedReworkLoops: [],
    tasksWithoutExecutionClass: [],
    tasksWithoutAccountableHuman: [],
    agentTasksAccountableForThemselves: [],
    tasksUnmappedToSurface: [],
    screensWithoutRationale: [],
    selectedDesignRef: 'design-v3',
    manifestContentHash: 'a'.repeat(64),
    unknownAllocationCount: 0,
    effortCoverageDisclosed: true,
    proposedBy: 'architect@example.test',
    approval: {
      approvedBy: 'owner@example.test',
      approvedByRole: 'DELIVERY_OWNER',
      revision: 4,
      contentSha256: 'a'.repeat(64),
      superseded: false,
    },
    currentManifestRevision: 4,
    actorStillAuthorized: true,
    mustHaveRequirementsWithoutStory: [],
    storiesWithoutTraceability: [],
  };
}

describe('coverage: every stage has a predicate', () => {
  it('declares a prerequisite predicate for all thirteen stages', () => {
    expect(stagesWithPrerequisites()).toHaveLength(13);
    expect([...stagesWithPrerequisites()].sort()).toEqual([...LIFECYCLE_STAGES].sort());
  });

  it('a clean snapshot satisfies every stage, so the fixture itself is not the thing failing', () => {
    for (const s of LIFECYCLE_STAGES) {
      expect(satisfied(prerequisiteGaps(s, clean()))).toBe(true);
    }
  });
});

describe('each stage refuses for its own specific reason', () => {
  const cases: Array<[Parameters<typeof prerequisiteGaps>[0], Partial<LifecycleEvidence>, string]> = [
    ['discovery', { tenantId: null }, 'no_tenant'],
    ['requirements_ready', { requirementCount: 0 }, 'no_requirements'],
    ['requirements_ready', { requirementsWithoutProvenance: ['REQ-3'] }, 'requirement_without_provenance'],
    ['requirements_ready', { uncitedRequirementSourceBlocks: ['SB-9'] }, 'source_block_uncited'],
    ['requirements_ready', { unresolvedSourceBlocks: ['SB-2'] }, 'source_block_unresolved'],
    ['process_ready', { processesWithoutTasks: ['P-1'] }, 'process_without_tasks'],
    ['process_ready', { graphHasStart: false }, 'graph_no_start'],
    ['process_ready', { graphHasEnd: false }, 'graph_no_end'],
    ['process_ready', { unreachableTasks: ['T-7'] }, 'task_unreachable'],
    ['process_ready', { unboundedReworkLoops: ['L-1'] }, 'rework_unbounded'],
    ['allocation_ready', { tasksWithoutExecutionClass: ['T-2'] }, 'task_without_execution_class'],
    ['allocation_ready', { tasksWithoutAccountableHuman: ['T-4'] }, 'task_without_accountable_human'],
    ['allocation_ready', { agentTasksAccountableForThemselves: ['T-5'] }, 'agent_accountable_for_itself'],
    ['design_ready', { tasksUnmappedToSurface: ['T-8'] }, 'task_unmapped_to_surface'],
    ['design_ready', { selectedDesignRef: null }, 'design_variant_not_selected'],
    ['awaiting_blueprint_approval', { manifestContentHash: null }, 'manifest_hash_missing'],
    ['awaiting_blueprint_approval', { unknownAllocationCount: 3 }, 'allocation_unknown'],
    ['awaiting_blueprint_approval', { effortCoverageDisclosed: false }, 'effort_coverage_undisclosed'],
    ['awaiting_blueprint_approval', { proposedBy: null }, 'proposer_unrecorded'],
    ['blueprint_approved', { approval: null }, 'approval_missing'],
    ['plan_ready', { mustHaveRequirementsWithoutStory: ['REQ-1'] }, 'requirement_uncovered_by_story'],
    ['plan_ready', { storiesWithoutTraceability: ['STORY-003'] }, 'story_without_traceability'],
    ['planning', { actorStillAuthorized: false }, 'authority_revoked'],
  ];

  it.each(cases)('%s refuses with %#: expects rule from the broken field', (stage, broken, rule) => {
    const gaps = prerequisiteGaps(stage, { ...clean(), ...broken } as LifecycleEvidence);
    expect(gaps.map((g) => g.rule)).toContain(rule);
    expect(satisfied(gaps)).toBe(false);
  });

  it('names the offending id in the gap, so the message is actionable', () => {
    const gaps = prerequisiteGaps('allocation_ready', { ...clean(), tasksWithoutAccountableHuman: ['T-42'] });
    const gap = gaps.find((g) => g.rule === 'task_without_accountable_human')!;
    expect(gap.subject).toBe('T-42');
    expect(gap.message).toContain('T-42');
  });

  it('reports one gap per offending id rather than collapsing them into a count', () => {
    const gaps = prerequisiteGaps('allocation_ready', {
      ...clean(),
      tasksWithoutExecutionClass: ['T-1', 'T-2', 'T-3'],
    });
    expect(gaps.filter((g) => g.rule === 'task_without_execution_class')).toHaveLength(3);
  });
});

describe('separation of duty cannot be satisfied by a missing proposer', () => {
  it('refuses when the approver is also the proposer', () => {
    const e = clean();
    e.proposedBy = 'owner@example.test'; // same human as approval.approvedBy
    const gaps = prerequisiteGaps('blueprint_approved', e);
    expect(gaps.map((g) => g.rule)).toContain('approval_self_approved');
    expect(gaps.find((g) => g.rule === 'approval_self_approved')!.message).toContain('owner@example.test');
  });

  it('ALSO refuses when no proposer is recorded — a null must not pass silently', () => {
    // This is the ceremonial-loophole case. The equivalent check elsewhere in the repo
    // short-circuits on a null identity, which would pass every legacy row. Here it refuses.
    const e = clean();
    e.proposedBy = null;
    const gaps = prerequisiteGaps('blueprint_approved', e);
    expect(gaps.map((g) => g.rule)).toContain('approval_self_approved');
    expect(satisfied(gaps)).toBe(false);
  });

  it('accepts when proposer and approver are different humans', () => {
    expect(satisfied(prerequisiteGaps('blueprint_approved', clean()))).toBe(true);
  });
});

describe('approval staleness and supersession', () => {
  it('refuses a superseded approval', () => {
    const e = clean();
    e.approval = { ...e.approval!, superseded: true };
    expect(prerequisiteGaps('blueprint_approved', e).map((g) => g.rule)).toContain('approval_superseded');
  });

  it('refuses when the manifest revision moved past the approved one', () => {
    const e = clean();
    e.currentManifestRevision = 5; // approval is for 4
    const gaps = prerequisiteGaps('blueprint_approved', e);
    expect(gaps.map((g) => g.rule)).toContain('approval_revision_moved');
    expect(gaps.find((g) => g.rule === 'approval_revision_moved')!.message).toMatch(/revision 4.*current revision is 5/);
  });

  it('does not refuse when the revision is unknown rather than different', () => {
    const e = clean();
    e.currentManifestRevision = null;
    expect(prerequisiteGaps('blueprint_approved', e).map((g) => g.rule)).not.toContain('approval_revision_moved');
  });
});

describe('time-of-check/time-of-use is re-checked, not cached', () => {
  it('planning re-runs the approval checks, not just the authority check', () => {
    const e = clean();
    e.approval = null;
    expect(prerequisiteGaps('planning', e).map((g) => g.rule)).toContain('approval_missing');
  });

  it('build handoff re-checks the same things planning did', () => {
    const e = clean();
    e.approval = { ...e.approval!, superseded: true };
    expect(prerequisiteGaps('building', e).map((g) => g.rule)).toContain('approval_superseded');
  });

  it('runtime execution re-checks authority, because it can be revoked after approval', () => {
    const e = clean();
    e.actorStillAuthorized = false;
    expect(prerequisiteGaps('operating', e).map((g) => g.rule)).toContain('authority_revoked');
  });
});

describe('blocking versus advisory', () => {
  it('a screen without a rationale is advisory — surfaced, not a blocker', () => {
    const gaps = prerequisiteGaps('design_ready', { ...clean(), screensWithoutRationale: ['SCR-2'] });
    expect(advisoryGaps(gaps).map((g) => g.rule)).toContain('screen_without_rationale');
    expect(blockingGaps(gaps)).toHaveLength(0);
    expect(satisfied(gaps)).toBe(true);
  });

  it('an unmapped task is blocking, even alongside an advisory', () => {
    const gaps = prerequisiteGaps('design_ready', {
      ...clean(),
      screensWithoutRationale: ['SCR-2'],
      tasksUnmappedToSurface: ['T-8'],
    });
    expect(blockingGaps(gaps).map((g) => g.rule)).toContain('task_unmapped_to_surface');
    expect(satisfied(gaps)).toBe(false);
  });

  it('keeps the advisory set small, so the gate still means something', () => {
    // If most rules were waivable the gate would be decorative. Asserted so a future edit that
    // quietly moves a blocking rule into the advisory set has to justify itself here.
    const e = clean();
    const allRules = LIFECYCLE_STAGES.flatMap((s) => prerequisiteGaps(s, e)).map((g) => g.rule);
    expect(allRules).toHaveLength(0); // clean snapshot: nothing fires
    const broken = prerequisiteGaps('design_ready', { ...clean(), screensWithoutRationale: ['a'], tasksUnmappedToSurface: ['b'] });
    expect(advisoryGaps(broken)).toHaveLength(1);
    expect(blockingGaps(broken)).toHaveLength(1);
  });
});
