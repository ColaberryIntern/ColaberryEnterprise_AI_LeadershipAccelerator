/**
 * L7.2 — a crafted source document may not change a tool policy.
 *
 * The ticket's success metric is one sentence: "A crafted source block cannot change an
 * allocation, an authority or a tool policy." This file covers the TOOL POLICY half at the place
 * the policy is actually decided, which is `policiesFor` inside the factory-to-delivery bridge.
 *
 * ## Why this is an injection surface and not merely a validation gap
 *
 * Every field the policy decision reads is LLM output, and that output is produced from text
 * extracted from an uploaded source document:
 *
 *   - `agent_teams[].execution_policy` and `.approval_policy` — what the agent is allowed to do
 *   - `allocation[].execution_class`                          — who performs the task
 *   - `tasks[].data_sensitivity` and `.decision_authority`    — which set the story's risk
 *
 * `factoryDecomposePrompt.ts` states the governing invariant to the model in these words: "the
 * team of ai_with_approval tasks is agent_with_review, not agent_autonomous". Before this suite
 * that instruction was the ONLY thing holding the invariant; no code enforced it.
 *
 * A prompt instruction is not a control, and that is measured rather than assumed. On 11 Nov a
 * regeneration of the live Herriman bid was run specifically to let the current prompt satisfy
 * the sibling instruction in the same file demanding a named approver on high-risk work. The
 * measured result was 0 of 6 high-risk tasks naming an approver before, and 0 of 4 after. The
 * model dropped the instruction both times. So the sentence "the prompt tells it not to" is
 * evidence of intent, not of enforcement.
 *
 * ## What the control here can and cannot do, stated up front
 *
 * The clamp compares two model-supplied fields, so it catches an INCONSISTENT claim: a task the
 * allocation classes `ai_with_approval` whose team declares `agent_autonomous`. A decomposition
 * that sets BOTH to autonomous is self-consistent and passes the clamp untouched. Cross-field
 * agreement is not a security property when one actor writes every field.
 *
 * That residual exposure is not left as a comment. The last two tests exercise it directly: one
 * shows the downstream story contract still refusing the self-consistent case at R3 and above,
 * and one is a TRIPWIRE pinning the fact that those downstream refusals are keyed on a risk
 * level the same model supplies. If someone later makes risk independent of model output, the
 * tripwire fails and should be rewritten — that is the point of it.
 */
import { buildDeliveryStories, bridgeFactoryToDelivery, type BridgeInput } from '../factoryDeliveryBridge';
import { riskLevelFor } from '../factoryTaskRisk';
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

const requirement = (id: string): ContractRequirement => ({
  id, statement: `statement ${id}`, kind: 'compliance', priority: 'must', tracks: ['solution_build'],
  source_document: 'rfp.pdf', amendment_version: '0', section: '1', extracted_text: '',
  interpretation: null,
} as ContractRequirement);

/**
 * `aiClass` and the team's policies are the two knobs every test below turns. The AI task is
 * `confidential`, which `riskLevelFor` ranks R4, so it is high risk unless a test says otherwise.
 */
function input(opts: {
  aiClass?: AllocationRow['execution_class'];
  teamOver?: Partial<AgentTeam>;
  aiTaskOver?: Partial<FactoryTask>;
} = {}): BridgeInput {
  const { aiClass = 'ai_with_approval', teamOver = {}, aiTaskOver = {} } = opts;
  return {
    project: {
      delivery_project_id: 'dp-1',
      tasks: [
        task({ id: 't-ai', title: 'Check compliance', data_sensitivity: 'confidential', ...aiTaskOver }),
        task({ id: 't-human', title: 'Approve the response', decision_authority: 'decide_bounded' }),
      ],
      allocation: [alloc('t-ai', aiClass), alloc('t-human', 'human')],
      requirements: [requirement('REQ-1')],
      agent_teams: [team(teamOver)],
      surfaces: [surface()],
      assignments: [],
    },
    profileKey: 'internal_tool',
  };
}

const aiStory = (i: BridgeInput) => {
  const { stories } = buildDeliveryStories(i);
  return stories.find((s) => s.storyId === 'story-t-ai')!;
};

const escalationGaps = (i: BridgeInput) =>
  buildDeliveryStories(i).gaps.filter((g) => g.rule === 'POLICY_ESCALATION_REFUSED');

describe('L7.2 the allocation bounds the policy, and the bound is enforced not requested', () => {
  it('REFUSES agent_autonomous on a task the allocation classes ai_with_approval', () => {
    // The attack: the decomposition claims an autonomous team for a task whose own allocation
    // says a human approves it. Before this was enforced, the story carried agent_autonomous.
    const i = input({ teamOver: { execution_policy: 'agent_autonomous' } });
    expect(aiStory(i).executionPolicy).toBe('agent_with_review');
  });

  it('reports the refused claim as a gap naming the task and both policies', () => {
    // A silent clamp would be its own defect: a reviewer must be able to see that a
    // decomposition asked for autonomy and was told no.
    const gaps = escalationGaps(input({ teamOver: { execution_policy: 'agent_autonomous' } }));
    expect(gaps).toHaveLength(1);
    expect(gaps[0].ref).toBe('t-ai');
    expect(gaps[0].detail).toContain('agent_autonomous');
    expect(gaps[0].detail).toContain('agent_with_review');
  });

  it('CONTROL leaves a self-consistent ai_autonomous + agent_autonomous pair untouched', () => {
    // Without this the suite could pass by clamping everything, which would be a different bug
    // wearing this fix's name. It also pins the known limit honestly: the clamp does NOT catch
    // the self-consistent case.
    const i = input({ aiClass: 'ai_autonomous', teamOver: { execution_policy: 'agent_autonomous' } });
    expect(aiStory(i).executionPolicy).toBe('agent_autonomous');
    expect(escalationGaps(i)).toHaveLength(0);
  });

  it('CONTROL passes a legitimate agent_with_review through unchanged and reports nothing', () => {
    const i = input({ teamOver: { execution_policy: 'agent_with_review' } });
    expect(aiStory(i).executionPolicy).toBe('agent_with_review');
    expect(escalationGaps(i)).toHaveLength(0);
  });

  it('keeps the team\'s approval_policy when it refuses the execution policy', () => {
    // The refusal is scoped to the thing that was out of bounds. Quietly rewriting the approval
    // policy as well would make the clamp harder to reason about than the hole it closes.
    const i = input({
      teamOver: { execution_policy: 'agent_autonomous', approval_policy: 'client_approval' },
    });
    expect(aiStory(i).executionPolicy).toBe('agent_with_review');
    expect(aiStory(i).approvalPolicy).toBe('client_approval');
  });

  it('does not reach human work, which is manual_only by derivation', () => {
    const { stories, gaps } = buildDeliveryStories(
      input({ teamOver: { execution_policy: 'agent_autonomous' } }),
    );
    const human = stories.find((s) => s.storyId === 'story-t-human')!;
    expect(human.executionPolicy).toBe('manual_only');
    expect(gaps.filter((g) => g.ref === 't-human' && g.rule === 'POLICY_ESCALATION_REFUSED')).toHaveLength(0);
  });
});

describe('L7.2 what the clamp cannot catch, the story contract still refuses', () => {
  it('refuses a self-consistent autonomous run of a high-risk story', () => {
    // This is the case the clamp passes through. It must not be unguarded, so the assertion is
    // on the DOWNSTREAM control: an R3-or-above story running autonomously is a blocking issue.
    const i = input({ aiClass: 'ai_autonomous', teamOver: { execution_policy: 'agent_autonomous' } });
    expect(riskLevelFor(i.project.tasks.find((t) => t.id === 't-ai')!)).toBe('R4');

    const { storyIssues } = bridgeFactoryToDelivery(i);
    const mine = storyIssues.filter((s) => s.storyId === 'story-t-ai');
    expect(mine.map((s) => s.rule)).toContain('autonomous_execution_of_high_risk_story');
  });

  it('refuses a high-risk story whose approval policy is none', () => {
    const i = input({
      aiClass: 'ai_autonomous',
      teamOver: { execution_policy: 'agent_autonomous', approval_policy: 'none' },
    });
    const { storyIssues } = bridgeFactoryToDelivery(i);
    const mine = storyIssues.filter((s) => s.storyId === 'story-t-ai');
    expect(mine.map((s) => s.rule)).toContain('high_risk_story_without_approval');
  });

  it('TRIPWIRE those refusals are keyed on a risk level the same model supplies', () => {
    // READ THIS BEFORE "FIXING" A FAILURE HERE.
    //
    // `riskLevelFor` reads `data_sensitivity` and `decision_authority` off the task, and both are
    // model output from the source document. A decomposition that reports the task as public and
    // non-deciding gets R1, and at R1 BOTH refusals above are silent even for a fully autonomous
    // team. So the residual exposure after the clamp is not "autonomy is unguarded" but
    // "autonomy is guarded by a number the same document influences".
    //
    // This test asserts that dependency exists. It is a tripwire, not an endorsement: closing it
    // needs a risk input that does not come from the model, which is a design change with its
    // own blast radius and is NOT in this ticket. If someone makes risk independent, this test
    // SHOULD fail, and the right response is to delete it and say so in the ticket.
    const i = input({
      aiClass: 'ai_autonomous',
      teamOver: { execution_policy: 'agent_autonomous', approval_policy: 'none' },
      aiTaskOver: { data_sensitivity: 'public', decision_authority: 'none' },
    });
    expect(riskLevelFor(i.project.tasks.find((t) => t.id === 't-ai')!)).toBe('R1');

    const { storyIssues } = bridgeFactoryToDelivery(i);
    const mine = storyIssues.filter((s) => s.storyId === 'story-t-ai').map((s) => s.rule);
    expect(mine).not.toContain('autonomous_execution_of_high_risk_story');
    expect(mine).not.toContain('high_risk_story_without_approval');
  });
});
