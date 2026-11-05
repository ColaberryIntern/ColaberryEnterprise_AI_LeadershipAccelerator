/**
 * L10.8 — the factory-to-delivery bridge, tested in both directions.
 *
 * The ticket's `doneWhen` is specific: each story carries executionPolicy, approvalPolicy,
 * trustDimensions, riskLevel and evidenceRequired; the traceability rules hold, including every
 * production agent trust requirement becoming an implementation or evaluation story; and the
 * release gate distinguishes READY from AUTHORIZED TO DEPLOY. Each of those is a test below.
 *
 * ## The profile is PINNED in every release assertion, and that is not incidental
 *
 * `mandatoryChecksFor` falls back to ALL release checks for an unrecognised profile key. So
 * "no results gives one blocker per mandatory check" passes identically for a correctly chosen
 * profile and for a typo — a test that goes green for the wrong reason, which is the false-pass
 * family this whole run is about. Asserting the expected check COUNT for a NAMED profile is
 * what makes the assertion mean something.
 */
import {
  bridgeFactoryToDelivery, buildDeliveryStories, riskLevelFor, evidenceFor, type BridgeInput,
} from '../factoryDeliveryBridge';
import { PROFILE_MANDATORY_CHECKS, type ReleaseCheckResult } from '../../../modules/delivery/releaseChecks';
import { INPACT_DIMENSIONS } from '../../../modules/delivery/inpact';
import type {
  FactoryTask, AgentTeam, Surface, AllocationRow, ContractRequirement,
} from '../contracts/factoryContract';

const task = (over: Partial<FactoryTask> & { id: string }): FactoryTask => ({
  process_id: 'PROC-1', title: over.id, description: '', kind: 'TASK', stage_id: 'S1',
  source_evidence: ['b1'], required_skills: [], judgment_level: 'low',
  decision_authority: 'none', data_sensitivity: 'public', interaction_pattern: null,
  frequency: null, effort_minutes: null, effort_basis: 'UNKNOWN', confidence: null,
  method: 'EXPLICIT', ...over,
});

const alloc = (task_id: string, execution_class: AllocationRow['execution_class']): AllocationRow =>
  ({ task_id, execution_class, rationale: 'because', accountable_role_id: 'role-lead' });

const team = (over: Partial<AgentTeam> = {}): AgentTeam => ({
  id: 'team-compliance', name: 'Compliance', subject: 'Compliance',
  task_ids: ['t-ai'], approver_role_id: 'role-lead',
  execution_policy: 'agent_with_review', approval_policy: 'internal_review',
  autonomy_stage: null, trust_dimensions: ['transparent'], ...over,
} as AgentTeam);

const surface = (over: Partial<Surface> = {}): Surface =>
  ({ id: 'surf-console', name: 'Bid console', kind: 'console', task_ids: ['t-human'], ...over } as Surface);

const requirement = (id: string, priority: ContractRequirement['priority']): ContractRequirement => ({
  id, statement: `statement ${id}`, kind: 'compliance', priority, tracks: ['solution_build'],
  source_document: 'rfp.pdf', amendment_version: '0', section: '1', extracted_text: '',
  interpretation: null,
} as ContractRequirement);

function baseInput(over: Partial<BridgeInput> = {}): BridgeInput {
  return {
    project: {
      delivery_project_id: 'dp-1',
      tasks: [
        task({ id: 't-start', kind: 'START' }),
        task({ id: 't-ai', title: 'Check compliance', data_sensitivity: 'confidential' }),
        task({ id: 't-human', title: 'Approve the response', decision_authority: 'decide_bounded' }),
        task({ id: 't-end', kind: 'END' }),
      ],
      allocation: [alloc('t-ai', 'ai_with_approval'), alloc('t-human', 'human')],
      requirements: [requirement('REQ-1', 'must')],
      agent_teams: [team()],
      surfaces: [surface()],
    },
    profileKey: 'internal_tool',
    ...over,
  };
}

describe('every story carries the five fields the ticket names', () => {
  it('emits one story per real task, skipping START and END', () => {
    const { stories } = buildDeliveryStories(baseInput());
    expect(stories.map((s) => s.storyId)).toEqual(['story-t-ai', 'story-t-human']);
  });

  it('carries executionPolicy, approvalPolicy, trustDimensions, riskLevel and evidenceRequired', () => {
    const { stories } = buildDeliveryStories(baseInput());
    for (const s of stories) {
      expect(s.riskLevel).toBeTruthy();
      expect(s.evidenceRequired?.length).toBeGreaterThan(0);
      // executionPolicy and trustDimensions may legitimately be null for human work; the
      // assertion is that the KEY is present and considered, not that it is always filled.
      expect(Object.keys(s)).toContain('executionPolicy');
      expect(Object.keys(s)).toContain('approvalPolicy');
      expect(Object.keys(s)).toContain('trustDimensions');
    }
  });

  it('takes an AI story\'s policies from its OWNING TEAM, not from a default', () => {
    const { stories } = buildDeliveryStories(baseInput({
      project: {
        ...baseInput().project,
        agent_teams: [team({ execution_policy: 'agent_autonomous', approval_policy: 'client_approval' })],
      },
    }));
    const ai = stories.find((s) => s.storyId === 'story-t-ai')!;
    expect(ai.executionPolicy).toBe('agent_autonomous');
    expect(ai.approvalPolicy).toBe('client_approval');
  });

  it('derives manual_only for human work', () => {
    const { stories } = buildDeliveryStories(baseInput());
    expect(stories.find((s) => s.storyId === 'story-t-human')!.executionPolicy).toBe('manual_only');
  });

  it('leaves an AI story\'s policies NULL when no team owns it, and reports the gap', () => {
    // The alternative - defaulting to agent_with_review - would be indistinguishable from a
    // team that really declared it. A null plus a reported gap is the honest answer.
    const { stories, gaps } = buildDeliveryStories(baseInput({
      project: { ...baseInput().project, agent_teams: [] },
    }));
    const ai = stories.find((s) => s.storyId === 'story-t-ai')!;
    expect(ai.executionPolicy).toBeNull();
    expect(ai.approvalPolicy).toBeNull();
    expect(gaps.map((g) => g.rule)).toContain('AI_TASK_WITHOUT_TEAM');
  });

  it('reports human work with no surface', () => {
    const { gaps } = buildDeliveryStories(baseInput({
      project: { ...baseInput().project, surfaces: [] },
    }));
    expect(gaps.map((g) => g.rule)).toContain('HUMAN_TASK_WITHOUT_SURFACE');
  });
});

describe('riskLevelFor is a table, not a judgement call', () => {
  it.each([
    ['regulated data', { data_sensitivity: 'regulated' as const }, 'R4'],
    ['confidential data', { data_sensitivity: 'confidential' as const }, 'R4'],
    ['full decision authority', { decision_authority: 'decide_full' as const }, 'R4'],
    ['bounded decision authority', { decision_authority: 'decide_bounded' as const }, 'R3'],
    ['recommend authority', { decision_authority: 'recommend' as const }, 'R2'],
    ['internal data', { data_sensitivity: 'internal' as const }, 'R2'],
    ['public data, no authority', {}, 'R1'],
  ])('%s -> %s', (_label, over, expected) => {
    expect(riskLevelFor(task({ id: 't', ...over }))).toBe(expected);
  });

  it('never assigns the ends of the scale', () => {
    // R0 would say a contract task is risk-free; R5 is not justified by anything a task record
    // carries. Both would be the mapping overclaiming what it knows.
    const all = (['public', 'internal', 'confidential', 'regulated'] as const).flatMap((s) =>
      (['none', 'recommend', 'decide_bounded', 'decide_full'] as const).map((a) =>
        riskLevelFor(task({ id: 't', data_sensitivity: s, decision_authority: a }))));
    expect(all).not.toContain('R0');
    expect(all).not.toContain('R5');
  });
});

describe('evidenceRequired uses the existing DeliveryEvidenceType vocabulary', () => {
  it('asks for an AI evaluation only where an agent performs', () => {
    expect(evidenceFor('ai_with_approval')).toContain('ai_eval');
    expect(evidenceFor('human')).not.toContain('ai_eval');
  });

  it('adds a security scan for work no human approves', () => {
    expect(evidenceFor('ai_autonomous')).toContain('security_scan');
    expect(evidenceFor('ai_with_approval')).not.toContain('security_scan');
  });
});

describe('the traceability rule with teeth: declared trust must be built', () => {
  it('covers every (team, dimension) pair, so no agent_trust_requirement gap remains', () => {
    const result = bridgeFactoryToDelivery(baseInput({
      blockToRequirement: { b1: 'REQ-1' },
    }));
    expect(result.traceabilityGaps.filter((g) => g.kind === 'agent_trust_requirement')).toEqual([]);
  });

  it('REPORTS a gap when a team declares a dimension no story carries', () => {
    // The other direction, and the one that proves the check is live. A team declaring two
    // dimensions whose tasks are not in its task_ids has nothing implementing them.
    const input = baseInput({ blockToRequirement: { b1: 'REQ-1' } });
    const result = bridgeFactoryToDelivery({
      ...input,
      project: {
        ...input.project,
        agent_teams: [team({ task_ids: [], trust_dimensions: ['transparent', 'permitted'] })],
      },
    });
    const kinds = result.traceabilityGaps.filter((g) => g.kind === 'agent_trust_requirement');
    expect(kinds).toHaveLength(2);
    expect(kinds.map((g) => g.id)).toEqual(
      expect.arrayContaining(['team-compliance:transparent', 'team-compliance:permitted']),
    );
  });

  it('uses real INPACT dimension names', () => {
    expect(INPACT_DIMENSIONS).toContain('transparent');
    expect(INPACT_DIMENSIONS).toContain('permitted');
  });

  it('reports a must-requirement no story fulfils', () => {
    const input = baseInput({ blockToRequirement: { b1: 'REQ-1' } });
    const result = bridgeFactoryToDelivery({
      ...input,
      project: { ...input.project, requirements: [requirement('REQ-1', 'must'), requirement('REQ-99', 'must')] },
    });
    expect(result.traceabilityGaps.find((g) => g.id === 'REQ-99')?.kind).toBe('must_requirement');
  });
});

describe('block ids are not requirement ids, and the bridge says so', () => {
  it('reports REQUIREMENT_LINK_UNAVAILABLE when no map is supplied', () => {
    const { gaps } = buildDeliveryStories(baseInput());
    const gap = gaps.find((g) => g.rule === 'REQUIREMENT_LINK_UNAVAILABLE');
    expect(gap).toBeDefined();
    expect(gap!.detail).toContain('Block ids are not requirement ids');
  });

  it('is silent, and traces to requirement ids, once the map IS supplied', () => {
    const { stories, gaps } = buildDeliveryStories(baseInput({ blockToRequirement: { b1: 'REQ-1' } }));
    expect(gaps.map((g) => g.rule)).not.toContain('REQUIREMENT_LINK_UNAVAILABLE');
    expect(stories[0].fulfills).toEqual(['REQ-1']);
  });
});

describe('READY and AUTHORIZED TO DEPLOY are different questions', () => {
  const passing = (profileKey: string): ReleaseCheckResult[] =>
    PROFILE_MANDATORY_CHECKS[profileKey].map((check) => ({ check, outcome: 'pass' as const }));

  it('is NOT ready with no check results, with the blocker count pinned to the profile', () => {
    // PINNED. `internal_tool` has exactly 5 mandatory checks; an unrecognised key would widen
    // to all of them and this count would silently change.
    expect(PROFILE_MANDATORY_CHECKS.internal_tool).toHaveLength(5);
    const result = bridgeFactoryToDelivery(baseInput({ profileKey: 'internal_tool' }));
    expect(result.release.ready).toBe(false);
    expect(result.release.mandatory).toHaveLength(5);
    // Five missing checks, PLUS one release-level blocker for the unrecorded approver. The
    // first draft of this test asserted five total and failed, which is the gate being more
    // thorough than the test expected: a release with every check passing and nobody named as
    // its approver is still not ready, and that is a separate rule from any single check.
    const missing = result.release.blockers.filter((b) => b.rule === 'check_missing');
    expect(missing).toHaveLength(5);
    expect(result.release.blockers.map((b) => b.rule)).toContain('approver_missing');
  });

  it('is READY with every mandatory check passing, and STILL NOT authorized', () => {
    expect(PROFILE_MANDATORY_CHECKS.commercial_standard).toHaveLength(7);
    const result = bridgeFactoryToDelivery(baseInput({
      profileKey: 'commercial_standard',
      checkResults: passing('commercial_standard'),
      approvedByIdentityId: 'person-ali',
    }));
    expect(result.release.ready).toBe(true);
    // The distinction the ticket asks for: ready is not permission.
    expect(result.deploymentRefusals.length).toBeGreaterThan(0);
  });

  it('refuses deployment for a release that is not ready, naming that as a reason', () => {
    const result = bridgeFactoryToDelivery(baseInput({ profileKey: 'internal_tool' }));
    expect(result.deploymentRefusals.map((r) => r.rule)).toContain('release_not_ready');
  });

  it('refuses deployment with no named human approver', () => {
    const result = bridgeFactoryToDelivery(baseInput({
      profileKey: 'internal_tool', checkResults: passing('internal_tool'),
    }));
    expect(result.deploymentRefusals.map((r) => r.rule)).toContain('human_approval_required');
  });

  it('NEVER fabricates a check result', () => {
    // The bridge's own promise. If it ever manufactured a passing result to make a release
    // look ready, every assertion above would still pass and the gate would be worthless.
    const result = bridgeFactoryToDelivery(baseInput({ profileKey: 'internal_tool' }));
    expect(result.release.passed).toEqual([]);
    expect(result.release.waived).toEqual([]);
  });
});

describe('story contract issues are reported, not swallowed', () => {
  /**
   * THIS TEST CHANGED AFTER THE CONTRACT DISAGREED WITH THE BRIDGE, and the disagreement was
   * worth keeping rather than silencing.
   *
   * `t-human` has `decide_bounded` authority, so `riskLevelFor` makes it R3, and the bridge
   * leaves a human story's `approvalPolicy` null because nothing in a decomposition states who
   * reviews a person's work. `validateStoryContract` then raises
   * `high_risk_story_without_approval`: a story at R3 or above with no approval requirement.
   *
   * The easy fix would be to have the bridge write `internal_review` onto human stories to make
   * this go quiet. That would be a policy invented by a mapping function and indistinguishable
   * from one somebody actually decided. A consequential task with no named approver is a REAL
   * gap in the decomposition, and reporting it is the bridge working correctly.
   */
  it('reports the contract\'s complaint instead of inventing a policy to silence it', () => {
    const result = bridgeFactoryToDelivery(baseInput({ blockToRequirement: { b1: 'REQ-1' } }));
    const blocking = result.storyIssues.filter((i) => i.severity === 'blocking');
    expect(blocking.map((i) => i.rule)).toEqual(['high_risk_story_without_approval']);
    expect(blocking[0].storyId).toBe('story-t-human');

    // And the bridge really did leave it null rather than guessing.
    const human = result.stories.find((s) => s.storyId === 'story-t-human')!;
    expect(human.approvalPolicy).toBeNull();
    expect(human.riskLevel).toBe('R3');
  });

  it('raises no blocking issue for a low-risk story, so the rule above is not firing on everything', () => {
    // The control. Without this, the assertion above could be satisfied by a validator that
    // complains about every story it is given.
    const input = baseInput({ blockToRequirement: { b1: 'REQ-1' } });
    const result = bridgeFactoryToDelivery({
      ...input,
      project: {
        ...input.project,
        tasks: [task({ id: 't-human', title: 'File the response', decision_authority: 'none' })],
        allocation: [alloc('t-human', 'human')],
        surfaces: [surface()],
      },
    });
    expect(result.storyIssues.filter((i) => i.severity === 'blocking')).toEqual([]);
  });

  it('surfaces a blocking issue when a story fulfils nothing', () => {
    const input = baseInput();
    const result = bridgeFactoryToDelivery({
      ...input,
      project: {
        ...input.project,
        tasks: [task({ id: 't-ai', title: 'Check compliance', source_evidence: [] })],
        allocation: [alloc('t-ai', 'ai_with_approval')],
      },
    });
    expect(result.storyIssues.map((i) => i.rule)).toContain('story_fulfills_nothing');
  });
});
