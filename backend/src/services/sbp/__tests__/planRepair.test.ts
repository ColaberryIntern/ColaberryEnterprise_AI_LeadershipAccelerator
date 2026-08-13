/**
 * The repair loop, graded against the way it actually failed in production.
 *
 * On 2026-08-10 three builds were fired at production simultaneously. Two came
 * back clean; the third ("Grant Deadline Watchdog", project 502a095b) burned all
 * three repair attempts and ended `gate_failed` with SIX violations — more than
 * it started with. The stored plan showed exactly why:
 *
 *   requirement_unfalsifiable | REQ-008 "user-friendly interface"
 *   story_is_layer            | STORY-001, STORY-002 (fulfil only CONSTRAINTs)
 *   story_redundant_scaffold  | STORY-012, STORY-015, STORY-016
 *
 * STORY-015 and STORY-016 did not exist before repair ran. Asked to fix a
 * requirement it had no verb for, the model added two near-duplicates of
 * STORY-012, and the three then subsumed each other.
 *
 * These tests encode the three properties that failure demanded. The model is a
 * stub throughout: what is under test is the loop's merge/accept logic, not the
 * model's judgement.
 */
import { gateAndRepair, MAX_REPAIR_ATTEMPTS } from '../planRepair';
import { gatePlan } from '../planGate';
import { BuildPlan, PlanStory, PlanRequirement } from '../planContract';

// ── fixtures ────────────────────────────────────────────────────────────────

const RELEASES = [
  { key: 'r0', name: 'Walking skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 },
  { key: 'r1', name: 'Drafting', goal: 'g', demo: 'd', week_start: 3, week_end: 4 },
];

function req(id: string, over: Partial<PlanRequirement> = {}): PlanRequirement {
  return { id, statement: `The system must do ${id}.`, kind: 'FUNC', priority: 'must', cluster: 'core', ...over };
}

function story(id: string, over: Partial<PlanStory> = {}): PlanStory {
  return {
    id,
    release: 'r0',
    title: `Deliver ${id}`,
    narrative: `As a director, I want ${id}, so that the outcome lands.`,
    fulfills: [],
    owner_agent: 'builder',
    acceptance: [
      'Given a deadline, when it nears, then the director is warned.',
      'Given a repeat run, when it fires twice, then only one warning is sent.',
      'Trust — every warning is written to the audit log with its idempotency key.',
    ],
    task_guidance: 'guidance',
    failure_paths: ['upstream unavailable'],
    ...over,
  };
}

/**
 * The shape of the production failure: a vague requirement no story can fix,
 * sitting on an otherwise sound plan. Both releases carry a story, so the ONLY
 * violation is the unfalsifiable one — that isolation is what lets the tests
 * below attribute a change in the count to the repair and nothing else.
 */
function planWithUnfalsifiableRequirement(): BuildPlan {
  return {
    project_name: 'Grant Deadline Watchdog',
    descriptor: 'watches grant portals',
    requirements: [
      req('REQ-001', { statement: 'The system must warn the director two weeks before a deadline.' }),
      req('REQ-002', { statement: 'The system must draft boilerplate from past submissions.' }),
      req('REQ-008', { statement: 'The system should provide a user-friendly interface.', kind: 'NFR', priority: 'should' }),
    ],
    releases: RELEASES,
    stories: [
      story('STORY-001', { fulfills: ['REQ-001'] }),
      story('STORY-002', { fulfills: ['REQ-002'], release: 'r1' }),
    ],
  };
}

/** A stub completion client that replays a fixed sequence of repair edits. */
function stubClient(edits: unknown[]) {
  const calls: string[] = [];
  let i = 0;
  return {
    calls,
    client: {
      create: jest.fn(async (args: any) => {
        calls.push(args.messages[args.messages.length - 1].content);
        const edit = edits[Math.min(i, edits.length - 1)];
        i += 1;
        return { choices: [{ message: { content: JSON.stringify(edit) } }] } as any;
      }),
    },
  };
}

const deps = (client: any) => ({ client, model: 'gpt-test', correlationId: 'test' });

// ── property 1: repair can edit requirements ────────────────────────────────

describe('requirement-level violations are repairable', () => {
  it('rewrites an unfalsifiable requirement in place and clears the gate', async () => {
    const plan = planWithUnfalsifiableRequirement();
    expect(gatePlan(plan).violations.map((v) => v.rule)).toContain('requirement_unfalsifiable');

    const { client } = stubClient([{
      stories: [],
      remove_story_ids: [],
      requirements: [req('REQ-008', {
        statement: 'Every screen the director uses must complete its primary action in three clicks or fewer.',
        kind: 'NFR', priority: 'should',
      })],
    }]);

    const out = await gateAndRepair(plan, 'grant watchdog brief', deps(client));

    expect(out.gate.ok).toBe(true);
    expect(out.plan.requirements.find((r) => r.id === 'REQ-008')!.statement).toMatch(/three clicks/);
    // Corrected in place, never appended.
    expect(out.plan.requirements).toHaveLength(3);
  });

  it('refuses to let repair invent a requirement it was not asked to fix', async () => {
    // Moving the goalposts: a repair that adds requirements changes what it is
    // being graded against. Only in-place correction is honoured.
    const plan = planWithUnfalsifiableRequirement();
    const { client } = stubClient([{
      stories: [],
      remove_story_ids: [],
      requirements: [
        req('REQ-008', { statement: 'The director must approve within 3 clicks.', kind: 'NFR', priority: 'should' }),
        req('REQ-999', { statement: 'The system must also do something new.' }),
      ],
    }]);

    const out = await gateAndRepair(plan, 'grant watchdog brief', deps(client));

    expect(out.plan.requirements.some((r) => r.id === 'REQ-999')).toBe(false);
    expect(out.plan.requirements).toHaveLength(3);
  });
});

// ── property 2: repair is monotone ──────────────────────────────────────────

describe('an attempt that makes the plan worse is discarded', () => {
  it('keeps the previous plan when a repair adds violations', async () => {
    const plan = planWithUnfalsifiableRequirement();
    const before = gatePlan(plan).violations.length;

    // Precisely the production pathology: asked to fix REQ-008, the model adds
    // two overlapping UI stories that then subsume each other.
    const scaffold = (id: string) => story(id, { title: 'Refine user interface', fulfills: ['REQ-001', 'REQ-008'] });
    const { client } = stubClient([{
      stories: [scaffold('STORY-015'), scaffold('STORY-016')],
      requirements: [],
      remove_story_ids: [],
    }]);

    const out = await gateAndRepair(plan, 'grant watchdog brief', deps(client));

    expect(out.plan.stories.some((s) => s.id === 'STORY-015')).toBe(false);
    expect(out.plan.stories.some((s) => s.id === 'STORY-016')).toBe(false);
    expect(out.gate.violations.length).toBeLessThanOrEqual(before);
    expect(out.rejected).toBeGreaterThan(0);
    expect(out.attempts).toBe(0);
  });

  it('never returns a plan worse than the one it was given, whatever the model does', async () => {
    const plan = planWithUnfalsifiableRequirement();
    const before = gatePlan(plan).violations.length;

    // Every attempt is destructive. The cap stops it; monotonicity protects it.
    const { client } = stubClient([{
      stories: [story('STORY-020', { title: 'Refine user interface', fulfills: ['REQ-001', 'REQ-008'] }),
                story('STORY-021', { title: 'Enhance user interface', fulfills: ['REQ-001', 'REQ-008'] })],
      requirements: [],
      remove_story_ids: [],
    }]);

    const out = await gateAndRepair(plan, 'grant watchdog brief', deps(client));

    expect(out.gate.violations.length).toBeLessThanOrEqual(before);
    expect(out.rejected).toBe(MAX_REPAIR_ATTEMPTS);
    expect(client.create).toHaveBeenCalledTimes(MAX_REPAIR_ATTEMPTS);
  });

  it('accepts a partial repair that reduces violations without clearing them', async () => {
    const plan = planWithUnfalsifiableRequirement();
    plan.requirements.push(req('REQ-009', {
      statement: 'The system should follow industry best practices.', kind: 'NFR', priority: 'should',
    }));
    const before = gatePlan(plan).violations.length;
    expect(before).toBeGreaterThan(1);

    // Fixes one of the two vague requirements, then offers nothing further.
    const { client } = stubClient([
      { stories: [], remove_story_ids: [], requirements: [req('REQ-008', { statement: 'The director completes approval in three clicks or fewer.', kind: 'NFR', priority: 'should' })] },
      { stories: [], remove_story_ids: [], requirements: [] },
    ]);

    const out = await gateAndRepair(plan, 'grant watchdog brief', deps(client));

    expect(out.gate.ok).toBe(false);
    expect(out.gate.violations.length).toBeLessThan(before);
    expect(out.attempts).toBe(1);
  });
});

// ── property 3: repair can remove ───────────────────────────────────────────

describe('redundant stories can be removed', () => {
  /** Three stories where one subsumes the other two — the scaffold violation. */
  function planWithScaffold(): BuildPlan {
    return {
      project_name: 'p', descriptor: 'd',
      requirements: [req('REQ-001'), req('REQ-002'), req('REQ-003')],
      releases: RELEASES,
      stories: [
        story('STORY-001', { fulfills: ['REQ-001'] }),
        story('STORY-002', { fulfills: ['REQ-002'], release: 'r1' }),
        story('STORY-003', { fulfills: ['REQ-001', 'REQ-002', 'REQ-003'], release: 'r1' }),
      ],
    };
  }

  it('deletes the subsuming story when the model asks it to', async () => {
    const plan = planWithScaffold();
    expect(gatePlan(plan).violations.map((v) => v.rule)).toContain('story_redundant_scaffold');

    const { client } = stubClient([{
      stories: [story('STORY-004', { fulfills: ['REQ-003'], release: 'r1' })],
      requirements: [],
      remove_story_ids: ['STORY-003'],
    }]);

    const out = await gateAndRepair(plan, 'brief', deps(client));

    expect(out.plan.stories.some((s) => s.id === 'STORY-003')).toBe(false);
    expect(out.plan.stories.some((s) => s.id === 'STORY-004')).toBe(true);
    expect(out.gate.violations.filter((v) => v.rule === 'story_redundant_scaffold')).toHaveLength(0);
  });

  it('refuses a removal that would empty the plan', async () => {
    // A plan with no stories trivially passes the coverage rules. That is gaming
    // the gate, not repairing it.
    const plan = planWithScaffold();
    const { client } = stubClient([{
      stories: [], requirements: [],
      remove_story_ids: ['STORY-001', 'STORY-002', 'STORY-003'],
    }]);

    const out = await gateAndRepair(plan, 'brief', deps(client));

    expect(out.plan.stories.length).toBeGreaterThan(0);
  });
});

// ── loop safety ─────────────────────────────────────────────────────────────

describe('loop safety', () => {
  it('does not call the model at all when the plan already passes', async () => {
    const plan: BuildPlan = {
      project_name: 'p', descriptor: 'd',
      requirements: [req('REQ-001'), req('REQ-002')],
      releases: RELEASES,
      stories: [
        story('STORY-001', { fulfills: ['REQ-001'] }),
        story('STORY-002', { fulfills: ['REQ-002'], release: 'r1' }),
      ],
    };
    expect(gatePlan(plan).ok).toBe(true);

    const { client } = stubClient([{ stories: [], requirements: [], remove_story_ids: [] }]);
    const out = await gateAndRepair(plan, 'brief', deps(client));

    expect(client.create).not.toHaveBeenCalled();
    expect(out.attempts).toBe(0);
    expect(out.gate.ok).toBe(true);
  });

  it('stops early when the model offers no edit rather than burning the cap', async () => {
    const plan = planWithUnfalsifiableRequirement();
    const { client } = stubClient([{ stories: [], requirements: [], remove_story_ids: [] }]);

    await gateAndRepair(plan, 'brief', deps(client));

    expect(client.create).toHaveBeenCalledTimes(1);
  });

  it('survives malformed model output without throwing', async () => {
    const plan = planWithUnfalsifiableRequirement();
    const client = { create: jest.fn(async () => ({ choices: [{ message: { content: 'not json{' } }] } as any)) };

    const out = await gateAndRepair(plan, 'brief', deps(client));

    expect(out.gate.ok).toBe(false);
    expect(out.plan.stories).toHaveLength(2);
  });

  it('tells the model how to fix each rule it actually violated', async () => {
    // Without per-rule remedies the model's only instinct is "add a story",
    // which is what produced the duplicate-UI-story cascade in production.
    const plan = planWithUnfalsifiableRequirement();
    const { calls, client } = stubClient([{ stories: [], requirements: [], remove_story_ids: [] }]);

    await gateAndRepair(plan, 'brief', deps(client));

    expect(calls[0]).toContain('requirement_unfalsifiable');
    expect(calls[0]).toMatch(/REPLACE the requirement with the SAME id/);
    expect(calls[0]).toMatch(/Never add a story whose title or scope overlaps/);
  });
});

describe('repair cannot introduce a blocking violation of its own', () => {
  /**
   * MEASURED, 2026-08-12. Asked to add an r0 trust-spine story, the model cited
   * REQ-019 on a plan holding 18 requirements — because repair is (correctly)
   * forbidden from adding requirements, so the id it wanted did not exist.
   * `dangling_requirement` is BLOCKING, so publish 409'd and a real build
   * produced zero tasks. Repair turned a style problem into a dead build.
   */
  /**
   * Each case gives the model a plan whose ONLY violation is the unfalsifiable
   * requirement, and a repair that fixes it while smuggling in one bad reference.
   * Sanitised, the candidate reaches zero violations and is accepted. Unsanitised
   * it reaches one — not strictly fewer than the one it started with — so
   * monotonicity rejects the whole repair and the plan stays broken. Every
   * assertion below therefore fails without the fix.
   */
  const fixReq = req('REQ-008', {
    statement: 'Every screen the director uses must complete its primary action in three clicks or fewer.',
    kind: 'NFR', priority: 'should',
  });

  it('drops a fulfills id that does not exist rather than shipping a dangling reference', async () => {
    const plan = planWithUnfalsifiableRequirement();
    const { client } = stubClient([{
      requirements: [fixReq], remove_story_ids: [],
      stories: [story('STORY-001', { title: 'Establish trust spine', fulfills: ['REQ-001', 'REQ-019'] })],
    }]);

    const out = await gateAndRepair(plan, 'brief', deps(client));

    expect(out.plan.stories.find((s) => s.id === 'STORY-001')!.fulfills).toEqual(['REQ-001']);
    expect(out.gate.violations.filter((v) => v.rule === 'dangling_requirement')).toHaveLength(0);
    expect(out.gate.ok).toBe(true);
  });

  it('remaps a story pointing at a release that does not exist', async () => {
    const plan = planWithUnfalsifiableRequirement();
    const { client } = stubClient([{
      requirements: [fixReq], remove_story_ids: [],
      stories: [story('STORY-001', { fulfills: ['REQ-001'], release: 'r9' })],
    }]);

    const out = await gateAndRepair(plan, 'brief', deps(client));

    expect(out.plan.stories.find((s) => s.id === 'STORY-001')!.release).toBe('r0');
    expect(out.gate.violations.filter((v) => v.rule === 'dangling_release')).toHaveLength(0);
    expect(out.gate.ok).toBe(true);
  });

  it('strips a blocked_by pointing at a story that does not exist', async () => {
    const plan = planWithUnfalsifiableRequirement();
    const { client } = stubClient([{
      requirements: [fixReq], remove_story_ids: [],
      stories: [story('STORY-001', { fulfills: ['REQ-001'], blocked_by: ['STORY-404'] })],
    }]);

    const out = await gateAndRepair(plan, 'brief', deps(client));

    expect(out.plan.stories.find((s) => s.id === 'STORY-001')!.blocked_by).toEqual([]);
    expect(out.gate.violations.filter((v) => v.rule === 'dangling_blocked_by')).toHaveLength(0);
    expect(out.gate.ok).toBe(true);
  });

  it('tells the model which requirement ids actually exist', async () => {
    const plan = planWithUnfalsifiableRequirement();
    const { calls, client } = stubClient([{ stories: [], requirements: [], remove_story_ids: [] }]);

    await gateAndRepair(plan, 'brief', deps(client));

    expect(calls[0]).toMatch(/THE ONLY REQUIREMENT IDS THAT EXIST/);
    expect(calls[0]).toContain('REQ-001, REQ-002, REQ-008');
  });
});
