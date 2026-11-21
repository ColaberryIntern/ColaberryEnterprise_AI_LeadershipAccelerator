/**
 * Every story is owned by an agent on the roster.
 *
 * ShiftFill v5 (2026-11-21, project 392b73bd): the scoped roster missed
 * STORY-003 ("Ensure privacy of call-out reasons"), the story kept its
 * pre-scoping owner "AI Agent", and REQ-010 ended up enforced by nobody. The
 * fixture below is that roster, verbatim in the fields the scoring reads.
 */
import { homeOrphanStories, attachGuardrails, rosterWithEveryStoryOwned } from '../storyOwners';
import { buildPlanDocument } from '../planDocument';
import { commandCenterTabSections } from '../commandCenterTabs';
import { BuildPlan, PlanAgent, PlanRequirement, PlanStory } from '../planContract';

const req = (id: string, kind: PlanRequirement['kind'], statement: string): PlanRequirement => ({
  id, kind, statement, priority: 'must', cluster: 'c',
});
const story = (id: string, release: string, title: string, fulfills: string[], owner: string): PlanStory => ({
  id, release, title, narrative: `As Dana, I want ${title.toLowerCase()}, so that it holds.`,
  fulfills, owner_agent: owner, acceptance: ['Given a, when b, then c.'], task_guidance: 'g', failure_paths: ['f'],
});
const agent = (name: string, purpose: string, trigger: string, inputs: string[], outputs: string[], owns: string[],
  autonomy: PlanAgent['autonomy_level'] = 'acts_autonomously'): PlanAgent => ({
  id: name, name, purpose, trigger_type: 'event', trigger, inputs, outputs, autonomy_level: autonomy,
  approval_gates: [], escalation_rules: [], skills: [], owns,
});

const V5 = (): BuildPlan => ({
  project_name: 'ShiftFill', descriptor: 'd',
  requirements: [
    req('REQ-001', 'FUNC', 'The system must read call-out texts or emails and open a gap.'),
    req('REQ-003', 'FUNC', 'The system must send text offers in waves of three.'),
    req('REQ-008', 'SAFE', 'The system must never offer a shift that would push someone over 40 hours without Dana approving overtime.'),
    req('REQ-010', 'SAFE', "The system must never share one employee's reason for calling out with anyone else."),
  ],
  releases: [{ key: 'r0', name: 'R0', goal: 'g', demo: 'd', week_start: 1, week_end: 1 },
    { key: 'r1', name: 'R1', goal: 'g', demo: 'd', week_start: 2, week_end: 2 }],
  stories: [
    story('STORY-001', 'r0', 'Create gap from call-out', ['REQ-001'], 'Gap Creator'),
    story('STORY-002', 'r0', 'Send offers in waves', ['REQ-003'], 'Offer Sender'),
    story('STORY-003', 'r0', 'Ensure privacy of call-out reasons', ['REQ-010'], 'AI Agent'),
    story('STORY-004', 'r1', 'Rank hygienists under 40 hours', ['REQ-008'], 'Hygienist Ranker'),
  ],
  agents: [
    agent('Gap Creator', 'Creates a gap record from call-out text or email.', 'Call-out text or email arrival', [], ['Gap record'], ['STORY-001']),
    agent('Hygienist Ranker', 'Ranks hygienists for shift offers based on availability and constraints.', 'Gap record creation',
      ['Gap record'], ['Ranked hygienist list'], ['STORY-004'], 'acts_with_approval'),
    agent('Offer Sender', 'Sends text offers to hygienists in waves and manages responses.', 'Ranked hygienist list creation',
      ['Ranked hygienist list'], ['Shift acceptance', 'Unaccepted shift'], ['STORY-002']),
  ],
});

describe('a story the roster missed', () => {
  it('is homed on the agent it fits, never left with a name that is not on the roster', () => {
    const plan = V5();
    const out = homeOrphanStories(plan.stories, plan.agents!);
    expect(out.homed.get('STORY-003')).toBe('Gap Creator');
    expect(out.stories.find((s) => s.id === 'STORY-003')!.owner_agent).toBe('Gap Creator');
    expect(out.agents[0].owns).toEqual(['STORY-001', 'STORY-003']);
  });

  it('prefers the agent that already owns a story fulfilling the same requirement', () => {
    const plan = V5();
    plan.stories.push(story('STORY-005', 'r1', 'Unrelated words entirely', ['REQ-003'], 'AI Agent'));
    expect(homeOrphanStories(plan.stories, plan.agents!).homed.get('STORY-005')).toBe('Offer Sender');
  });

  it('brings its guardrail with it: REQ-010 becomes a hard rule of its new owner', () => {
    const out = rosterWithEveryStoryOwned(V5());
    const gap = out.agents!.find((a) => a.name === 'Gap Creator')!;
    expect(gap.hard_rules?.map((r) => r.slice(0, 7))).toEqual(['REQ-010']);
    expect(gap.autonomy_level).toBe('acts_autonomously');
  });

  it('caps autonomy when the homed story carries an approval', () => {
    const plan = V5();
    plan.agents![2].owns = ['STORY-002'];
    plan.stories[2] = story('STORY-003', 'r0', 'Send offers only within 40 hours', ['REQ-008'], 'AI Agent');
    plan.stories[3].fulfills = [];
    const out = rosterWithEveryStoryOwned(plan);
    const owner = out.agents!.find((a) => a.owns.includes('STORY-003'))!;
    expect(owner.approval_gates.map((g) => g.slice(0, 7))).toEqual(['REQ-008']);
    expect(owner.autonomy_level).toBe('acts_with_approval');
  });

  it('changes nothing when every story is already owned, and does not mutate its input', () => {
    const plan = V5();
    plan.agents![0].owns.push('STORY-003');
    plan.stories[2].owner_agent = 'Gap Creator';
    const before = JSON.stringify(plan);
    expect(rosterWithEveryStoryOwned(plan)).toBe(plan);
    expect(JSON.stringify(plan)).toBe(before);
  });

  it('is idempotent', () => {
    const once = rosterWithEveryStoryOwned(V5());
    expect(rosterWithEveryStoryOwned(once)).toBe(once);
  });

  it('leaves a plan with no roster alone', () => {
    const plan = { ...V5(), agents: undefined };
    expect(rosterWithEveryStoryOwned(plan)).toBe(plan);
  });
});

describe('attachGuardrails', () => {
  it('never adds a guardrail an agent already carries', () => {
    const plan = V5();
    const a = { ...plan.agents![1], approval_gates: ['REQ-008 — already there'] };
    const out = attachGuardrails([a], plan);
    expect(out.agents[0]).toBe(a);
    expect(out.gated).toEqual([]);
  });
});

describe('every render shows the repaired roster', () => {
  it('plan.json: STORY-003 owned by Gap Creator, which enforces REQ-010', () => {
    const doc = buildPlanDocument(V5());
    expect(doc.stories.find((s) => s.id === 'STORY-003')!.owner_agent).toBe('Gap Creator');
    expect(doc.agents!.find((a) => a.name === 'Gap Creator')!.hard_rules!.join(' ')).toMatch(/REQ-010/);
  });

  it('the Command Center brief no longer mentions the phantom owner', () => {
    expect(commandCenterTabSections(V5()).join('\n')).not.toMatch(/AI Agent/);
  });
});
