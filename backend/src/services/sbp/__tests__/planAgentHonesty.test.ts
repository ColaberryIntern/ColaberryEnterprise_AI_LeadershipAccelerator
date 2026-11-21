/**
 * The agent roster says what the plan says, no more and no less.
 *
 * Every case here is a defect read off the ShiftFill v3 cold build
 * (2026-11-20, project 5c747bbd), reduced to the smallest plan that shows it:
 *
 *   - hard rules listed as approval gates, with nobody to approve them;
 *   - the Gap Detector → Gap Notifier hand-off missed over a plural;
 *   - an agent that "waits for a human" with nothing named to wait on;
 *   - r3's demo promising the 30-minute fill that the outline put in r1;
 *   - REQ-015 (the tools) reading as a MUST with no story;
 *   - one story escalating to "the scheduler" while the rest name Dana.
 */
import { scopeAgents } from '../scopeAgents';
import { separateHardRules } from '../planPeople';
import { buildPlanDocument } from '../planDocument';
import { handoffsFor, readsWhatIsProduced } from '../planDocumentInsights';
import { alignMeasuresToDemos, figuresOf } from '../outlineAlignment';
import { normaliseOutline, buildReleaseStoriesPrompt } from '../stagedGeneration';
import { commandCenterTabSections } from '../commandCenterTabs';
import { BuildPlan, PlanAgent, PlanRequirement, PlanStory } from '../planContract';

const req = (id: string, kind: PlanRequirement['kind'], statement: string): PlanRequirement => ({
  id, kind, statement, priority: 'must', cluster: 'core',
});
const story = (id: string, fulfills: string[], narrative = 'As Dana, I want it, so that it lands.'): PlanStory => ({
  id, release: 'r0', title: id, narrative, fulfills, owner_agent: 'x',
  acceptance: ['Given a, when b, then c.'], task_guidance: 'g', failure_paths: ['f'],
});
const agent = (over: Partial<PlanAgent>): PlanAgent => ({
  id: 'AGENT-001', name: 'A', purpose: 'p', trigger_type: 'event', trigger: 't',
  inputs: [], outputs: [], autonomy_level: 'acts_autonomously', approval_gates: [],
  escalation_rules: [], skills: [], owns: [], ...over,
});

const OVERTIME = 'The system must never offer a shift that would push someone over 40 hours without Dana approving overtime.';
const LEAVE = 'The system must never text a hygienist who is on approved leave.';
const NO_APP = 'The system must ensure hygienists never need an app or a login to interact with it.';

const PLAN = (): BuildPlan => ({
  project_name: 'ShiftFill',
  descriptor: 'fills hygienist gaps',
  requirements: [
    req('REQ-001', 'FUNC', 'The system must send text offers in waves of three.'),
    req('REQ-007', 'SAFE', OVERTIME),
    req('REQ-008', 'SAFE', LEAVE),
    req('REQ-017', 'SAFE', NO_APP),
    req('REQ-015', 'CONSTRAINT', 'The system must use Gmail, Slack, Google Sheets, and Twilio SMS.'),
  ],
  releases: [{ key: 'r0', name: 'r0', goal: 'g', demo: 'd', week_start: 1, week_end: 2 }],
  stories: [story('STORY-001', ['REQ-001', 'REQ-017']), story('STORY-002', ['REQ-007']), story('STORY-003', ['REQ-008'])],
});

const roster = (agents: unknown[]) => ({
  create: jest.fn(async () => ({ choices: [{ message: { content: JSON.stringify({ agents }) } }] })),
});
const scoped = (over: Record<string, unknown>) => ({
  id: 'AGENT-001', name: 'Shift Offer Sender', purpose: 'p', trigger_type: 'event', trigger: 't',
  inputs: [], outputs: [], autonomy_level: 'acts_autonomously', escalation_rules: [], skills: [], owns: [], ...over,
});

describe('a hard rule is not an approval gate', () => {
  it('records a never-rule as a hard rule and leaves the agent free to act', async () => {
    const out = await scopeAgents(PLAN(), { client: roster([scoped({ owns: ['STORY-001'] })]) });
    const a = out.plan.agents![0];
    expect(a.approval_gates).toEqual([]);
    expect(a.hard_rules).toEqual([`REQ-017 — ${NO_APP}`]);
    expect(a.autonomy_level).toBe('acts_autonomously');
  });

  it('still makes an agent wait when a person can let the guardrail through', async () => {
    const out = await scopeAgents(PLAN(), {
      client: roster([scoped({ name: 'Hygienist Ranker', owns: ['STORY-002', 'STORY-003'] })]),
    });
    const a = out.plan.agents![0];
    expect(a.approval_gates).toEqual([`REQ-007 — ${OVERTIME}`]);
    expect(a.hard_rules).toEqual([`REQ-008 — ${LEAVE}`]);
    expect(a.autonomy_level).toBe('acts_with_approval');
    expect(out.gated).toEqual(['Hygienist Ranker']);
  });

  it('asks the model to name a hand-off by the producing agent\'s exact output', async () => {
    const client = roster([scoped({ owns: ['STORY-001'] })]);
    await scopeAgents(PLAN(), { client });
    const system = (client.create.mock.calls[0] as any)[0].messages[0].content as string;
    expect(system).toMatch(/EXACTLY that agent's output name/);
  });

  it('re-sorts a plan scoped before the split, and doing it twice changes nothing', () => {
    const old = [agent({
      name: 'Privacy Protector', autonomy_level: 'acts_with_approval',
      approval_gates: [`REQ-008 — ${LEAVE}`, `REQ-007 — ${OVERTIME}`],
    })];
    const once = separateHardRules(old, ['Dana']);
    expect(once[0].approval_gates).toEqual([`REQ-007 — ${OVERTIME}`]);
    expect(once[0].hard_rules).toEqual([`REQ-008 — ${LEAVE}`]);
    // Never raises autonomy: that is a person's call, not a renderer's.
    expect(once[0].autonomy_level).toBe('acts_with_approval');
    expect(separateHardRules(once, ['Dana'])).toEqual(once);
  });

  it('leaves an agent with nothing to move as the very same object', () => {
    const a = agent({ approval_gates: [`REQ-007 — ${OVERTIME}`] });
    expect(separateHardRules([a], [])[0]).toBe(a);
  });

  it('plan.json carries the re-sorted roster for an existing project', () => {
    const plan = { ...PLAN(), agents: [agent({ approval_gates: [`REQ-017 — ${NO_APP}`] })] };
    const doc = buildPlanDocument(plan);
    expect(doc.agents[0].approval_gates).toEqual([]);
    expect(doc.agents[0].hard_rules).toEqual([`REQ-017 — ${NO_APP}`]);
  });
});

describe('hand-offs survive a plural and a qualifier, and nothing looser', () => {
  it.each([
    ['Gap record', 'Gap record', true],
    ['Gap records', 'Gap record', true],
    ['Unfilled gap records', 'Gap record', true],
    ['gap details', 'Gap record', false],
    ['Gap record creation', 'Gap record', false],
    // A one-word output would join to anything ending in it.
    ['Gap record', 'Record', false],
    ['Status', 'Status', true],
  ])('%s reads %s: %s', (input, produced, expected) => {
    expect(readsWhatIsProduced(input, produced)).toBe(expected);
  });

  it('draws the Gap Detector → Gap Notifier arrow ShiftFill v3 missed', () => {
    const edges = handoffsFor([
      agent({ name: 'Gap Detector', outputs: ['Gap record'] }),
      agent({ name: 'Gap Notifier', inputs: ['Unfilled gap records', 'Daily activity log'] }),
    ]);
    expect(edges).toEqual([{ from_agent: 'Gap Detector', to_agent: 'Gap Notifier', via: 'Gap record' }]);
  });
});

describe('a demo and its release agree about a measure', () => {
  const FILL = req('REQ-012', 'NFR', 'The system must fill gaps within 30 minutes of the call-out on 9 mornings out of 10.');
  const TIME = req('REQ-013', 'NFR', 'The system must ensure Dana spends under 10 minutes per gap.');
  const VOLUME = req('REQ-014', 'NFR', 'It must handle about 3 call-outs a week, and 8 to 10 in flu season.');
  const demos = [
    { demo: 'Show a call-out being detected.' },
    { demo: 'Show a YES filling the shift.' },
    { demo: 'Show the system filling gaps within 30 minutes and spreading offers fairly.' },
  ];

  it('moves the 30-minute fill to the release whose demo shows it', () => {
    const byReq = new Map([['REQ-012', 'r1'], ['REQ-013', 'r0']]);
    expect(alignMeasuresToDemos([FILL, TIME], byReq, demos)).toEqual(['REQ-012']);
    expect(byReq.get('REQ-012')).toBe('r2');
    expect(byReq.get('REQ-013')).toBe('r0');
  });

  it('leaves a measure alone when two demos name its figure', () => {
    const byReq = new Map([['REQ-012', 'r0']]);
    const both = [{ demo: 'Fills within 30 minutes.' }, { demo: 'Still within 30 minutes at flu peak.' }];
    expect(alignMeasuresToDemos([FILL], byReq, both)).toEqual([]);
    expect(byReq.get('REQ-012')).toBe('r0');
  });

  it('leaves it alone when the figure is shared by two measures', () => {
    const other = req('REQ-020', 'NFR', 'Replies must be read within 30 minutes.');
    const byReq = new Map([['REQ-012', 'r0'], ['REQ-020', 'r0']]);
    expect(alignMeasuresToDemos([FILL, other], byReq, demos)).toEqual([]);
  });

  it('does not read "8 to 10" or "9 out of 10" as a unit', () => {
    expect(figuresOf(VOLUME.statement)).toEqual(['3 call']);
    expect(figuresOf(FILL.statement)).toEqual(['30 minutes', '9 mornings']);
  });

  it('runs inside the outline, so stories are written in the right release', () => {
    const out = normaliseOutline({
      releases: demos.map((d, i) => ({ key: `r${i}`, name: `R${i}`, goal: 'g', demo: d.demo, week_start: i + 1, week_end: i + 1 })),
      assignments: [
        { requirement_id: 'REQ-001', release: 'r0' },
        { requirement_id: 'REQ-002', release: 'r1' },
        { requirement_id: 'REQ-012', release: 'r1' },
        { requirement_id: 'REQ-016', release: 'r2' },
      ],
    }, [
      req('REQ-001', 'FUNC', 'Detect a call-out.'),
      req('REQ-002', 'FUNC', 'Send the offers.'),
      FILL,
      req('REQ-016', 'FUNC', 'Spread offers fairly.'),
    ]);
    expect(out.assignments.find((a) => a.requirement_id === 'REQ-012')!.release).toBe('r2');
  });
});

describe('the Command Center brief tells the truth about agents and constraints', () => {
  const tabs = (plan: BuildPlan) => commandCenterTabSections(plan).join('\n');

  it('says an agent that waits with no named gate is an open question', () => {
    const text = tabs({ ...PLAN(), agents: [agent({ name: 'Gap Notifier', autonomy_level: 'acts_with_approval' })] });
    expect(text).toMatch(/Waits for a person, but the plan names no approval point for it/);
  });

  it('lists a hard rule as enforced, not as something waiting for approval', () => {
    const text = tabs({ ...PLAN(), agents: [agent({ name: 'Shift Offer Sender', approval_gates: [`REQ-017 — ${NO_APP}`] })] });
    expect(text).toContain(`Rules it enforces itself (nobody can override them): REQ-017 — ${NO_APP}`);
    expect(text).not.toContain(`Waits for a person because of: REQ-017`);
  });

  it('presents a CONSTRAINT as what the system is built with, never as a missing story', () => {
    expect(tabs(PLAN())).toMatch(/kind` CONSTRAINT[\s\S]*built with, not built/);
  });
});

describe('one person, one name', () => {
  it('tells the story writer to keep a named person\'s name', () => {
    const prompt = buildReleaseStoriesPrompt(
      { brief: 'Dana fills hygienist gaps.', document: '' },
      { key: 'r1', name: 'r1', goal: 'g', demo: 'd', week_start: 1, week_end: 1 },
      [], [], null,
    );
    expect(prompt).toMatch(/Never swap in a job title for someone already named/);
  });
});
