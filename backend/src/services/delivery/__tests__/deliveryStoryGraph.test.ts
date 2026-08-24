/**
 * Contract tests for the Story Contract, traceability, and the story graph.
 */
import {
  findDeliveryTraceabilityGaps,
  validateStoryContract,
  type DeliveryStoryContract,
} from '../deliveryStoryContract';
import {
  computeStoryStatuses,
  findCollisions,
  findDanglingDependencies,
  findDependencyCycles,
  pathsCollide,
  planParallelExecution,
} from '../deliveryStoryGraph';

const story = (overrides: Partial<DeliveryStoryContract> = {}): DeliveryStoryContract => ({
  storyId: 'STORY-001',
  title: 'Approver sees the invoice queue',
  fulfills: ['REQ-001'],
  riskLevel: 'R2',
  acceptance: ['Given an invoice, when it arrives, then it appears in the queue'],
  failurePaths: ['Upstream unavailable'],
  testRequirements: ['unit', 'browser'],
  executionPolicy: 'agent_with_review',
  approvalPolicy: 'internal_review',
  touchesPaths: ['src/queue'],
  ...overrides,
});

const blocking = (s: DeliveryStoryContract) =>
  validateStoryContract(s).filter((i) => i.severity === 'blocking');

describe('story contract validation', () => {
  it('a complete story passes', () => {
    expect(blocking(story())).toEqual([]);
  });

  it('a story fulfilling nothing blocks', () => {
    // Either undocumented scope, or work nobody asked for.
    expect(blocking(story({ fulfills: [] })).map((i) => i.rule)).toContain(
      'story_fulfills_nothing',
    );
  });

  it('a missing risk level blocks', () => {
    // The execution gate would otherwise have to guess, and the safe guess blocks
    // ordinary work.
    expect(blocking(story({ riskLevel: null })).map((i) => i.rule)).toContain(
      'risk_level_missing',
    );
  });

  it('an unknown risk level blocks', () => {
    expect(blocking(story({ riskLevel: 'R9' })).map((i) => i.rule)).toContain('risk_level_unknown');
  });

  it('missing acceptance blocks; missing failure paths only warns', () => {
    expect(blocking(story({ acceptance: [] })).map((i) => i.rule)).toContain('acceptance_missing');

    const issues = validateStoryContract(story({ failurePaths: [] }));
    expect(issues.find((i) => i.rule === 'failure_paths_missing')!.severity).toBe('warning');
  });

  it('BLOCKS autonomous execution of an R3+ story', () => {
    // A schema change, production release or destructive action landing with nobody in
    // the loop.
    const issues = blocking(
      story({ riskLevel: 'R3', executionPolicy: 'agent_autonomous', approvalPolicy: 'internal_review' }),
    );
    expect(issues.map((i) => i.rule)).toContain('autonomous_execution_of_high_risk_story');
  });

  it('allows autonomous execution of an R2 story', () => {
    expect(
      blocking(story({ riskLevel: 'R2', executionPolicy: 'agent_autonomous' })),
    ).toEqual([]);
  });

  it('BLOCKS a high-risk story with no approval policy', () => {
    const issues = blocking(
      story({ riskLevel: 'R4', executionPolicy: 'agent_with_review', approvalPolicy: 'none' }),
    );
    expect(issues.map((i) => i.rule)).toContain('high_risk_story_without_approval');
  });

  it('rejects an unknown trust dimension', () => {
    expect(blocking(story({ trustDimensions: ['fast'] })).map((i) => i.rule)).toContain(
      'trust_dimension_unknown',
    );
  });
});

describe('traceability fails closed on all three rules', () => {
  it('an uncovered must requirement is a gap', () => {
    const gaps = findDeliveryTraceabilityGaps({
      stories: [story({ fulfills: ['REQ-001'] })],
      mustRequirementIds: ['REQ-001', 'REQ-002'],
      approvedDesignDecisionIds: [],
    });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ kind: 'must_requirement', id: 'REQ-002' });
  });

  it('an approved design decision with no story is a gap', () => {
    const gaps = findDeliveryTraceabilityGaps({
      stories: [story()],
      mustRequirementIds: [],
      approvedDesignDecisionIds: ['DD-1'],
    });
    expect(gaps[0]).toMatchObject({ kind: 'design_decision', id: 'DD-1' });
  });

  it('a recorded no-code rationale closes the design gap', () => {
    const gaps = findDeliveryTraceabilityGaps({
      stories: [story()],
      mustRequirementIds: [],
      approvedDesignDecisionIds: ['DD-1'],
      noCodeRationaleFor: ['DD-1'],
    });
    expect(gaps).toEqual([]);
  });

  it('a production agent trust requirement with no story is a gap', () => {
    // The rule with teeth: Gate 5 makes an agent DECLARE what trust it needs; without
    // this, nothing forces anyone to build it and the declaration is paperwork.
    const gaps = findDeliveryTraceabilityGaps({
      stories: [story()],
      mustRequirementIds: [],
      approvedDesignDecisionIds: [],
      productionAgentTrustRequirements: [{ agentId: 'AG-1', dimension: 'permitted' }],
    });
    expect(gaps[0]).toMatchObject({
      kind: 'agent_trust_requirement',
      id: 'AG-1:permitted',
    });
  });

  it('a story covering the agent AND the dimension closes it', () => {
    const gaps = findDeliveryTraceabilityGaps({
      stories: [story({ agentImpacts: ['AG-1'], trustDimensions: ['permitted'] })],
      mustRequirementIds: [],
      approvedDesignDecisionIds: [],
      productionAgentTrustRequirements: [{ agentId: 'AG-1', dimension: 'permitted' }],
    });
    expect(gaps).toEqual([]);
  });

  it('covering the agent but the WRONG dimension does not close it', () => {
    const gaps = findDeliveryTraceabilityGaps({
      stories: [story({ agentImpacts: ['AG-1'], trustDimensions: ['instant'] })],
      mustRequirementIds: [],
      approvedDesignDecisionIds: [],
      productionAgentTrustRequirements: [{ agentId: 'AG-1', dimension: 'permitted' }],
    });
    expect(gaps).toHaveLength(1);
  });

  it('reports every gap at once', () => {
    const gaps = findDeliveryTraceabilityGaps({
      stories: [],
      mustRequirementIds: ['REQ-1', 'REQ-2'],
      approvedDesignDecisionIds: ['DD-1'],
      productionAgentTrustRequirements: [{ agentId: 'AG-1', dimension: 'permitted' }],
    });
    expect(gaps).toHaveLength(4);
  });
});

describe('cycle detection', () => {
  it('a clean chain has no cycle', () => {
    const stories = [
      story({ storyId: 'A', dependsOn: [] }),
      story({ storyId: 'B', dependsOn: ['A'] }),
      story({ storyId: 'C', dependsOn: ['B'] }),
    ];
    expect(findDependencyCycles(stories).hasCycle).toBe(false);
  });

  it('detects a two-story cycle', () => {
    // No story in a cycle can ever become ready — the plan is unbuildable, not slow.
    const stories = [
      story({ storyId: 'A', dependsOn: ['B'] }),
      story({ storyId: 'B', dependsOn: ['A'] }),
    ];
    const report = findDependencyCycles(stories);
    expect(report.hasCycle).toBe(true);
    expect(report.cycleMembers).toEqual(['A', 'B']);
  });

  it('detects a self-dependency', () => {
    const report = findDependencyCycles([story({ storyId: 'A', dependsOn: ['A'] })]);
    expect(report.hasCycle).toBe(true);
    expect(report.cycleMembers).toContain('A');
  });

  it('a dangling dependency is not a cycle', () => {
    expect(findDependencyCycles([story({ storyId: 'A', dependsOn: ['ghost'] })]).hasCycle).toBe(
      false,
    );
  });

  it('finds dangling dependencies separately', () => {
    const dangling = findDanglingDependencies([story({ storyId: 'A', dependsOn: ['ghost'] })]);
    expect(dangling).toEqual([{ storyId: 'A', missing: 'ghost' }]);
  });
});

describe('ready vs blocked', () => {
  it('a story with no dependencies is ready', () => {
    const statuses = computeStoryStatuses([{ story: story({ storyId: 'A' }), complete: false }]);
    expect(statuses[0].state).toBe('ready');
  });

  it('a story waiting on an incomplete dependency is blocked', () => {
    const statuses = computeStoryStatuses([
      { story: story({ storyId: 'A' }), complete: false },
      { story: story({ storyId: 'B', dependsOn: ['A'] }), complete: false },
    ]);
    expect(statuses.find((s) => s.storyId === 'B')).toMatchObject({
      state: 'blocked',
      waitingOn: ['A'],
    });
  });

  it('becomes ready once the dependency completes', () => {
    const statuses = computeStoryStatuses([
      { story: story({ storyId: 'A' }), complete: true },
      { story: story({ storyId: 'B', dependsOn: ['A'] }), complete: false },
    ]);
    expect(statuses.find((s) => s.storyId === 'B')!.state).toBe('ready');
  });

  it('a DANGLING dependency leaves the story blocked, not ready', () => {
    // The alternative would let a story run because its prerequisite was misspelled.
    const statuses = computeStoryStatuses([
      { story: story({ storyId: 'B', dependsOn: ['ghost'] }), complete: false },
    ]);
    expect(statuses[0].state).toBe('blocked');
  });
});

describe('path collisions', () => {
  it.each([
    [['src/a'], ['src/a'], true],
    [['src/a'], ['src/a/b'], true],
    [['src/a/b'], ['src/a'], true],
    [['src/a/'], ['src/a'], true],
    [['src/a'], ['src/b'], false],
    [['src/ab'], ['src/a'], false],
    [[], ['src/a'], false],
  ])('%p vs %p collides: %p', (a, b, expected) => {
    expect(pathsCollide(a, b)).toBe(expected);
  });

  it('finds colliding pairs with the shared paths', () => {
    const collisions = findCollisions([
      story({ storyId: 'A', touchesPaths: ['src/queue'] }),
      story({ storyId: 'B', touchesPaths: ['src/queue/item.ts'] }),
      story({ storyId: 'C', touchesPaths: ['src/other'] }),
    ]);
    expect(collisions).toHaveLength(1);
    expect(collisions[0]).toMatchObject({ a: 'A', b: 'B' });
  });
});

describe('parallel dispatch planning', () => {
  it('dispatches non-colliding ready stories together', () => {
    const plan = planParallelExecution([
      { story: story({ storyId: 'A', touchesPaths: ['src/a'] }), complete: false },
      { story: story({ storyId: 'B', touchesPaths: ['src/b'] }), complete: false },
    ]);
    expect(plan.parallelSafe.sort()).toEqual(['A', 'B']);
    expect(plan.deferred).toEqual([]);
  });

  it('defers a colliding story rather than racing it', () => {
    // Two agent runs editing one path concurrently produce a commit nobody reviewed, in
    // a client's repository.
    const plan = planParallelExecution([
      { story: story({ storyId: 'A', touchesPaths: ['src/queue'] }), complete: false },
      { story: story({ storyId: 'B', touchesPaths: ['src/queue/item.ts'] }), complete: false },
    ]);
    expect(plan.parallelSafe).toEqual(['A']);
    expect(plan.deferred).toEqual([{ storyId: 'B', collidesWith: 'A' }]);
  });

  it('a story declaring NO paths never runs alongside another', () => {
    // Unknown reach is not the same as no reach.
    const plan = planParallelExecution([
      { story: story({ storyId: 'A', touchesPaths: ['src/a'] }), complete: false },
      { story: story({ storyId: 'B', touchesPaths: [] }), complete: false },
    ]);
    expect(plan.parallelSafe).toEqual(['A']);
    expect(plan.deferred[0].collidesWith).toBe('(undeclared paths)');
  });

  it('an undeclared-path story alone may run, and claims everything', () => {
    const plan = planParallelExecution([
      { story: story({ storyId: 'B', touchesPaths: [] }), complete: false },
      { story: story({ storyId: 'A', touchesPaths: ['src/a'] }), complete: false },
    ]);
    expect(plan.parallelSafe).toEqual(['B']);
    expect(plan.deferred[0].storyId).toBe('A');
  });

  it('is deterministic — same input, same dispatch', () => {
    // A rerun after a failure must schedule identically or nobody can reproduce it.
    const inputs = [
      { story: story({ storyId: 'A', touchesPaths: ['src/x'] }), complete: false },
      { story: story({ storyId: 'B', touchesPaths: ['src/x'] }), complete: false },
    ];
    expect(planParallelExecution(inputs)).toEqual(planParallelExecution(inputs));
  });

  it('blocked stories are reported separately from deferred ones', () => {
    const plan = planParallelExecution([
      { story: story({ storyId: 'A', touchesPaths: ['src/a'] }), complete: false },
      { story: story({ storyId: 'B', dependsOn: ['A'], touchesPaths: ['src/b'] }), complete: false },
    ]);
    expect(plan.parallelSafe).toEqual(['A']);
    expect(plan.blocked.map((b) => b.storyId)).toEqual(['B']);
  });
});
