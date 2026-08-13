/**
 * scopeAgents — the AI team, scoped from the requirements.
 *
 * MEASURED, 2026-08-13, production. `owner_agent` was declared in the plan
 * schema as a bare `{ type: 'string' }` with no description and no guidance
 * anywhere in the prompt, so the model filled it with job titles:
 *
 *   Contract Manager — owns STORY-001
 *   System           — owns STORY-003, 004, 006, 007, 009, 010
 *   Account Owner    — owns STORY-005, STORY-008
 *
 * "System" owning half the build is not an agent roster, and a student cannot
 * build anything from a job title.
 *
 * Two properties are enforced in code rather than asked for in the prompt, and
 * they are what most of these tests are about:
 *
 *   1. An agent touching a SAFE requirement cannot be autonomous.
 *   2. A failure here never costs the student a publishable plan.
 */
import { scopeAgents } from '../scopeAgents';
import { BuildPlan, PlanRequirement, PlanStory } from '../planContract';

function req(id: string, over: Partial<PlanRequirement> = {}): PlanRequirement {
  return { id, statement: `The system must do ${id}.`, kind: 'FUNC', priority: 'must', cluster: 'core', ...over };
}
function story(id: string, over: Partial<PlanStory> = {}): PlanStory {
  return {
    id, release: 'r0', title: `Deliver ${id}`,
    narrative: `As an owner, I want ${id}, so that it lands.`,
    fulfills: [], owner_agent: 'Development Team',
    acceptance: ['Given a, when b, then c.', 'Given d, when e, then f.', 'Trust — g.'],
    task_guidance: 'g', failure_paths: ['x'],
    ...over,
  };
}

const PLAN = (): BuildPlan => ({
  project_name: 'Client Onboarding Concierge',
  descriptor: 'runs a new client\'s first week',
  requirements: [
    req('REQ-001', { statement: 'The system must read the signed agreement.' }),
    req('REQ-002', { statement: 'Nothing is sent to a client without a named person approving it.', kind: 'SAFE' }),
  ],
  releases: [{ key: 'r0', name: 'Skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 }],
  stories: [
    story('STORY-001', { fulfills: ['REQ-001'] }),
    story('STORY-002', { fulfills: ['REQ-002'] }),
  ],
});

const agent = (over: Record<string, unknown> = {}) => ({
  id: 'AGENT-001', name: 'Agreement Reader', purpose: 'Reads the signed agreement.',
  trigger_type: 'event', trigger: 'an agreement is signed',
  inputs: ['HelloSign'], outputs: ['parsed package'],
  autonomy_level: 'acts_autonomously', escalation_rules: ['the clause is ambiguous'],
  skills: ['read PDF'], owns: ['STORY-001'], ...over,
});

const clientReturning = (payload: unknown) => ({
  create: jest.fn(async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] })),
});
const deps = (client: any) => ({ client, correlationId: 'test' });

// ── rule 1: a guardrail forces a human into the loop ─────────────────────────

describe('an agent that touches a guardrail cannot act alone', () => {
  it('caps autonomy at acts_with_approval, whatever the model said', async () => {
    const client = clientReturning({
      agents: [agent({ owns: ['STORY-001', 'STORY-002'], autonomy_level: 'acts_autonomously' })],
    });

    const out = await scopeAgents(PLAN(), deps(client));

    expect(out.plan.agents![0].autonomy_level).toBe('acts_with_approval');
    expect(out.gated).toEqual(['Agreement Reader']);
  });

  it('records WHICH promise gates it, in the requirement\'s own words', async () => {
    const client = clientReturning({ agents: [agent({ owns: ['STORY-001', 'STORY-002'] })] });

    const out = await scopeAgents(PLAN(), deps(client));

    expect(out.plan.agents![0].approval_gates).toEqual([
      'REQ-002 — Nothing is sent to a client without a named person approving it.',
    ]);
  });

  it('leaves an agent that touches no guardrail autonomous', async () => {
    const client = clientReturning({
      agents: [
        agent({ owns: ['STORY-001'], autonomy_level: 'acts_autonomously' }),
        agent({ id: 'AGENT-002', name: 'Approval Router', owns: ['STORY-002'], autonomy_level: 'suggests' }),
      ],
    });

    const out = await scopeAgents(PLAN(), deps(client));

    expect(out.plan.agents![0].autonomy_level).toBe('acts_autonomously');
    expect(out.plan.agents![0].approval_gates).toEqual([]);
    expect(out.gated).toEqual([]);
  });

  it('never lets the model set approval_gates itself — they come from the plan', async () => {
    const client = clientReturning({
      agents: [agent({ owns: ['STORY-001'], approval_gates: ['REQ-999 — something invented'] } as any)],
    });

    const out = await scopeAgents(PLAN(), deps(client));

    expect(out.plan.agents![0].approval_gates).toEqual([]);
  });
});

// ── rule 2: never cost the student a working plan ────────────────────────────

describe('a scoping failure leaves the plan exactly as it was', () => {
  const unchanged = (out: any, plan: BuildPlan) => {
    expect(out.scoped).toBe(false);
    expect(out.plan.agents).toBeUndefined();
    expect(out.plan.stories.map((s: PlanStory) => s.owner_agent)).toEqual(
      plan.stories.map((s) => s.owner_agent),
    );
  };

  it('survives the call throwing', async () => {
    const plan = PLAN();
    const client = { create: jest.fn(async () => { throw new Error('upstream on fire'); }) };

    const out = await scopeAgents(plan, deps(client));

    unchanged(out, plan);
    expect(out.reason).toBe('upstream');
  });

  it('survives unparseable content', async () => {
    const plan = PLAN();
    const client = { create: jest.fn(async () => ({ choices: [{ message: { content: 'not json' } }] })) };

    const out = await scopeAgents(plan, deps(client));

    unchanged(out, plan);
  });

  it('rejects an empty roster rather than publishing zero agents', async () => {
    const plan = PLAN();

    const out = await scopeAgents(plan, deps(clientReturning({ agents: [] })));

    unchanged(out, plan);
    expect(out.reason).toBe('malformed');
  });

  it('rejects the roster if it reproduces the bug — a placeholder name', async () => {
    // "System" owning half the stories is the exact output this module exists to
    // replace. Shipping it under a new schema would be worse than not scoping.
    const plan = PLAN();

    const out = await scopeAgents(plan, deps(clientReturning({
      agents: [agent({ name: 'System', owns: ['STORY-001', 'STORY-002'] })],
    })));

    unchanged(out, plan);
    expect(out.reason).toBe('placeholder_name');
  });

  it.each(['Team', 'Developer', 'Development Team', 'Unassigned', 'admin'])(
    'rejects "%s" too', async (name) => {
      const out = await scopeAgents(PLAN(), deps(clientReturning({ agents: [agent({ name })] })));
      expect(out.scoped).toBe(false);
    },
  );
});

// ── assignment ───────────────────────────────────────────────────────────────

describe('assignment', () => {
  it('renames each story\'s owner to the agent that owns it', async () => {
    const client = clientReturning({
      agents: [
        agent({ owns: ['STORY-001'] }),
        agent({ id: 'AGENT-002', name: 'Approval Router', owns: ['STORY-002'] }),
      ],
    });

    const out = await scopeAgents(PLAN(), deps(client));

    expect(out.plan.stories.map((s) => s.owner_agent)).toEqual(['Agreement Reader', 'Approval Router']);
  });

  it('leaves a story the roster missed with the owner it already had', async () => {
    // Better a stale owner than a story that belongs to nobody.
    const client = clientReturning({ agents: [agent({ owns: ['STORY-001'] })] });

    const out = await scopeAgents(PLAN(), deps(client));

    expect(out.plan.stories[1].owner_agent).toBe('Development Team');
    expect(out.scoped).toBe(true);
  });

  it('does not mutate the plan it was given', async () => {
    const plan = PLAN();
    const client = clientReturning({ agents: [agent({ owns: ['STORY-001'] })] });

    await scopeAgents(plan, deps(client));

    expect(plan.agents).toBeUndefined();
    expect(plan.stories[0].owner_agent).toBe('Development Team');
  });

  it('defaults a missing autonomy level to the cautious one', async () => {
    const client = clientReturning({ agents: [agent({ autonomy_level: 'whatever' })] });

    const out = await scopeAgents(PLAN(), deps(client));

    expect(out.plan.agents![0].autonomy_level).toBe('acts_with_approval');
  });

  it('sends the model the requirements AND the stories, so it can scope from them', async () => {
    const client = clientReturning({ agents: [agent()] });

    await scopeAgents(PLAN(), deps(client));

    const sent = client.create.mock.calls[0][0].messages[1].content;
    expect(sent).toContain('REQ-002');
    expect(sent).toContain('STORY-002');
    expect(sent).toMatch(/Nothing is sent to a client/);
  });
});
