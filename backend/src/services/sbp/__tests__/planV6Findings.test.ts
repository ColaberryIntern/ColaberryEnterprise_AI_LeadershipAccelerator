/**
 * ShiftFill v6 (2026-11-22, project 8e3adf6d): what the fresh plan and its cold
 * Command Center build still got wrong, each checked against v6's plan.json.
 *  1. Shift Offer Sender waited for a person with no gate, though its own rule
 *     said "Overtime approval required" (the gate sat on Hygienist Ranker).
 *  2. STORY-002 named "the leave management system", which the student never did.
 *  3. A CONSTRAINT listing the stories that use it read as an error.
 * The agents and requirements below are v6's, verbatim.
 */
import { gateWaitingAgents } from '../waitingGates';
import { commandCenterTabSections } from '../commandCenterTabs';
import { buildReleaseStoriesPrompt } from '../stagedGeneration';
import { BuildPlan, PlanAgent, PlanRequirement } from '../planContract';

const REQ = (id: string, kind: PlanRequirement['kind'], statement: string): PlanRequirement =>
  ({ id, kind, statement, cluster: 'c', priority: 'must', from_dimensions: [] } as PlanRequirement);
const REQS: PlanRequirement[] = [
  REQ('REQ-008', 'SAFE', 'The system must never offer a shift that would push someone over 40 hours without Dana approving overtime.'),
  REQ('REQ-016', 'SAFE', 'Hygienists must only receive text messages and never need an app or a login.'),
  REQ('REQ-018', 'SAFE', "The system must flag any message to a temp agency for Dana's approval before sending."),
  REQ('REQ-017', 'CONSTRAINT', 'The system must use Gmail, Slack, Google Sheets, and Twilio SMS for communication and data management.'),
];
const ROLES = ['Dana', 'hygienist'];

const agent = (over: Partial<PlanAgent>): PlanAgent => ({
  id: over.name ?? 'a', name: 'a', purpose: 'p', trigger_type: 'event', trigger: 't', inputs: [], outputs: [],
  autonomy_level: 'acts_autonomously', approval_gates: [], escalation_rules: [], skills: [], owns: [], ...over,
});
const SENDER = agent({
  name: 'Shift Offer Sender', autonomy_level: 'acts_with_approval', owns: ['STORY-007'],
  hard_rules: ['REQ-016 — Hygienists must only receive text messages and never need an app or a login.'],
  escalation_rules: ['Overtime approval required'],
});
const RANKER = agent({
  name: 'Hygienist Ranker', autonomy_level: 'acts_with_approval', owns: ['STORY-006'],
  approval_gates: ['REQ-008 — The system must never offer a shift that would push someone over 40 hours without Dana approving overtime.'],
});

describe('an agent that waits for a person names what it waits for', () => {
  it('gives Shift Offer Sender the overtime gate its own rule describes', () => {
    const [sender] = gateWaitingAgents([SENDER], REQS, ROLES);
    expect(sender.approval_gates).toEqual([
      'REQ-008 — The system must never offer a shift that would push someone over 40 hours without Dana approving overtime.',
    ]);
    expect(sender.autonomy_level).toBe('acts_with_approval');
  });

  it('leaves an agent that already has a gate, or acts on its own, exactly as it was', () => {
    const lone = agent({ name: 'Gap Creator', escalation_rules: ['Overtime approval required'] });
    const out = gateWaitingAgents([RANKER, lone], REQS, ROLES);
    expect(out[0]).toBe(RANKER);
    expect(out[1]).toBe(lone);
  });

  it('does not match on a name or the word "approval" alone', () => {
    const vague = { ...SENDER, escalation_rules: ['Dana approval required'] };
    expect(gateWaitingAgents([vague], REQS, ROLES)[0]).toBe(vague);
  });

  it('changes nothing when no rule matches, and is idempotent', () => {
    const silent = { ...SENDER, escalation_rules: [] };
    expect(gateWaitingAgents([silent], REQS, ROLES)[0]).toBe(silent);
    const once = gateWaitingAgents([SENDER], REQS, ROLES);
    expect(gateWaitingAgents(once, REQS, ROLES)).toEqual(once);
  });
});

describe('the Story 000 brief', () => {
  const plan: BuildPlan = {
    project_name: 'ShiftFill', descriptor: 'd', requirements: REQS,
    releases: [{ key: 'r0', name: 'r0', goal: 'g', demo: 'd', week_start: 1, week_end: 1 }],
    stories: ['STORY-006', 'STORY-007'].map((id) => ({
      id, release: 'r0', title: 't', narrative: 'As Dana, I want x, so y.', fulfills: [], owner_agent: '',
      acceptance: ['Given a, when b, then c.'], task_guidance: 'g', failure_paths: ['f'],
    })),
    agents: [RANKER, SENDER],
  };
  const text = commandCenterTabSections(plan).join('\n');

  it('shows Shift Offer Sender waiting on the overtime gate, not an open question', () => {
    const card = text.slice(text.indexOf('**Shift Offer Sender**'));
    expect(card).toMatch(/Waits for a person because of: REQ-008/);
  });

  it('reads a CONSTRAINT\'s stories as the ones that use the tool', () => {
    expect(text).toMatch(/those are the stories that USE the tool, not stories that build it/);
  });
});

describe('a story never guesses where data lives', () => {
  it('tells the story writer to ask the named person instead of naming a system', () => {
    const prompt = buildReleaseStoriesPrompt(
      { brief: 'Never text anyone on approved leave.', document: '' },
      { key: 'r0', name: 'r0', goal: 'g', demo: 'd', week_start: 1, week_end: 1 },
      [], [], null,
    );
    expect(prompt).toMatch(/do not name a system for it: say in task_guidance to ask the named person where it is kept/);
  });
});
