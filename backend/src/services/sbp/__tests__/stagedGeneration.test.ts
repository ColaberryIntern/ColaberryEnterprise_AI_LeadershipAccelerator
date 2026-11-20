import {
  releaseCountFor, normaliseOutline, assembleStories, generateStagedPlan, stagedGenerationEnabled,
  buildReleaseStoriesPrompt, buildOutlinePrompt, OUTLINE_JSON_SCHEMA, RELEASE_STORIES_JSON_SCHEMA,
  MAX_RELEASES, pullGuardsForward,
} from '../stagedGeneration';
import { decomposeBuild } from '../decomposeService';
import { BUILD_PLAN_JSON_SCHEMA, PlanRelease, PlanRequirement, PlanStory } from '../planContract';
import { gatePlan, blockingViolations } from '../planGate';

const REQ = (n: number, kind: PlanRequirement['kind'] = 'FUNC'): PlanRequirement => ({
  id: `REQ-${String(n).padStart(3, '0')}`,
  statement: kind === 'CONSTRAINT' ? `The system must use Vendor${n} for its records.` : `The scheduler must see shift gap ${n} resolved within ${n} minutes.`,
  kind, priority: 'must', cluster: `Cluster ${Math.ceil(n / 5)}`, from_dimensions: [],
});
const reqs = (count: number, constraints = 0): PlanRequirement[] => [
  ...Array.from({ length: count }, (_, i) => REQ(i + 1)),
  ...Array.from({ length: constraints }, (_, i) => REQ(count + i + 1, 'CONSTRAINT')),
];
const REL = (i: number): PlanRelease => ({ key: `r${i}`, name: `Release ${i}`, goal: 'g', demo: 'd', week_start: i + 1, week_end: i + 1 });
const STORY = (id: string, fulfills: string[], extra: Partial<PlanStory> = {}): PlanStory => ({
  id, release: 'rX', title: `Scheduler resolves ${fulfills.join(' and ')}`,
  narrative: 'As a scheduler, I want gaps resolved, so that chairs stay filled.',
  fulfills, owner_agent: 'Gap Agent',
  acceptance: ['Given a gap, When it opens, Then it is offered.', 'Given no reply, When 10 minutes pass, Then it escalates.', 'Trust: every offer is written to the audit log.'],
  task_guidance: 'Use the gaps table.', failure_paths: ['no reply', 'double accept', 'sms down'], blocked_by: [],
  workspace: { kind: 'workspace', ref: 'Gap board', action: null },
  ...extra,
});

describe('release count follows the material, with the tier as a floor', () => {
  it('keeps the tier floor for a small project', () => {
    expect(releaseCountFor(5, reqs(11))).toBe(5);
  });
  it('opens more releases for more material, ignoring constraints, up to the ceiling', () => {
    expect(releaseCountFor(5, reqs(48, 10))).toBe(8);
    expect(releaseCountFor(3, reqs(500))).toBe(MAX_RELEASES);
  });
});

describe('schemas are the plan\'s own, by reference', () => {
  it('reuses release and story item schemas', () => {
    expect((OUTLINE_JSON_SCHEMA as any).properties.releases.items).toBe((BUILD_PLAN_JSON_SCHEMA as any).properties.releases.items);
    expect((RELEASE_STORIES_JSON_SCHEMA as any).properties.stories.items).toBe((BUILD_PLAN_JSON_SCHEMA as any).properties.stories.items);
  });
});

describe('normaliseOutline', () => {
  const R = reqs(6, 1);
  it('drops a release nothing landed in and re-keys the rest densely', () => {
    const out = normaliseOutline({
      releases: [REL(0), REL(1), REL(2)],
      assignments: ['REQ-001', 'REQ-002', 'REQ-003'].map((id) => ({ requirement_id: id, release: 'r0' }))
        .concat(['REQ-004', 'REQ-005', 'REQ-006'].map((id) => ({ requirement_id: id, release: 'r2' }))),
    }, R);
    expect(out.releases.map((r) => r.key)).toEqual(['r0', 'r1']);
    expect(out.releases[1].name).toBe('Release 2');
    expect(out.assignments.find((a) => a.requirement_id === 'REQ-004')!.release).toBe('r1');
  });

  it('re-homes an unassigned or mis-assigned requirement to the lightest release, and never assigns a constraint', () => {
    const out = normaliseOutline({
      releases: [REL(0), REL(1)],
      assignments: [
        { requirement_id: 'REQ-001', release: 'r0' }, { requirement_id: 'REQ-002', release: 'r0' },
        { requirement_id: 'REQ-003', release: 'r9' }, // unknown release
        { requirement_id: 'REQ-007', release: 'r0' }, // a CONSTRAINT: not a work item
      ],
    }, R);
    const homes = Object.fromEntries(out.assignments.map((a) => [a.requirement_id, a.release]));
    expect(homes['REQ-003']).toBe('r1');
    expect(Object.keys(homes).sort()).toEqual(['REQ-001', 'REQ-002', 'REQ-003', 'REQ-004', 'REQ-005', 'REQ-006']);
    expect(homes['REQ-007']).toBeUndefined();
  });
});

describe('pullGuardsForward: the live ShiftFill outline that shipped every guardrail last (2026-11-20)', () => {
  const live = (id: string, kind: PlanRequirement['kind'], statement: string): PlanRequirement => ({ id, kind, statement, priority: 'must', cluster: 'c', from_dimensions: [] });
  const R = [
    live('REQ-001', 'FUNC', "The system must read the call-out text or email the moment it arrives and open a 'gap' for the specified office, date, and hours."),
    live('REQ-002', 'FUNC', 'The system must rank hygienists to offer the shift based on being off that day, licensed for that office, under 40 hours that week, and nearest by commute.'),
    live('REQ-003', 'FUNC', 'The system must text shift offers in waves of three people, with a 10-minute window to reply YES.'),
    live('REQ-018', 'FUNC', 'The system must offer the shift to the two temp agencies if no hygienist accepts.'),
    live('REQ-007', 'SAFE', 'The system must never offer a shift that would push someone over 40 hours without Dana approving overtime.'),
    live('REQ-008', 'SAFE', 'The system must never text a hygienist who is on approved leave.'),
    live('REQ-009', 'SAFE', "The system must never share one employee's reason for calling out with anyone else."),
    live('REQ-017', 'SAFE', "The system must require Dana's approval before sending any message to a temp agency."),
  ];
  const placed = () => new Map([
    ['REQ-001', 'r0'], ['REQ-002', 'r1'], ['REQ-003', 'r1'], ['REQ-018', 'r2'],
    ['REQ-007', 'r4'], ['REQ-008', 'r4'], ['REQ-009', 'r4'], ['REQ-017', 'r4'],
  ]);

  it('moves each guardrail to the release of the behaviour it guards', () => {
    const m = placed();
    pullGuardsForward(R, m);
    expect(m.get('REQ-007')).toBe('r1'); // overtime: guards the ranking and offering
    expect(['r0', 'r1']).toContain(m.get('REQ-008')); // leave: no later than texting hygienists (r1)
    expect(['r0']).toContain(m.get('REQ-009')); // call-out reasons: no later than reading the call-out (r0)
    expect(m.get('REQ-017')).toBe('r2'); // temp-agency approval: guards the temp-agency offer
  });

  it('never moves a guardrail later than the model put it', () => {
    const m = placed();
    m.set('REQ-008', 'r0');
    pullGuardsForward(R, m);
    expect(m.get('REQ-008')).toBe('r0');
  });

  it('leaves the behaviour requirements where they were', () => {
    const m = placed();
    pullGuardsForward(R, m);
    expect(['REQ-001', 'REQ-002', 'REQ-003', 'REQ-018'].map((id) => m.get(id))).toEqual(['r0', 'r1', 'r1', 'r2']);
  });
});

describe('assembleStories', () => {
  const R = reqs(6);
  it('numbers globally, forces the release, gates releases in code, and keeps only backward local deps', () => {
    const out = assembleStories([
      { release: REL(0), stories: [STORY('S1', ['REQ-001']), STORY('S2', ['REQ-002'], { blocked_by: ['S1'] })] },
      { release: REL(1), stories: [STORY('S1', ['REQ-003', 'REQ-999']), STORY('S2', ['REQ-004'], { blocked_by: ['S1', 'S7'] }), STORY('S3', ['REQ-005'], { blocked_by: ['S3'] })] },
    ], R);
    expect(out.map((s) => s.id)).toEqual(['STORY-001', 'STORY-002', 'STORY-003', 'STORY-004', 'STORY-005']);
    expect(out.map((s) => s.release)).toEqual(['r0', 'r0', 'r1', 'r1', 'r1']);
    expect(out[1].blocked_by).toEqual([]); // r0 is ungated, always
    expect(out[2].fulfills).toEqual(['REQ-003']); // dangling id dropped
    expect(out[2].blocked_by).toEqual(['STORY-002']); // key story of r0
    expect(out[3].blocked_by).toEqual(['STORY-002', 'STORY-003']);
    expect(out[4].blocked_by).toEqual(['STORY-002']); // self-reference dropped
  });
});

describe('prompts', () => {
  it('asks the outline for every non-constraint assignment and the given release count', () => {
    const p = buildOutlinePrompt({ brief: 'b', document: '' }, reqs(12, 2), 4);
    expect(p).toContain('exactly 4 releases, r0..r3');
    expect(p).toContain('(12 assignments)');
    expect(p).toMatch(/SAFE requirement lands in the SAME release as the first behaviour it guards/);
  });
  it('asks a release for its own requirements only, as context for the rest', () => {
    const all = reqs(4);
    const p = buildReleaseStoriesPrompt({ brief: 'b', document: '' }, REL(0), all.slice(0, 2), all, null);
    const assigned = p.slice(p.indexOf('<ASSIGNED_TO_THIS_RELEASE>'), p.indexOf('</ASSIGNED_TO_THIS_RELEASE>'));
    expect(assigned).toContain('REQ-001');
    expect(assigned).not.toContain('REQ-003');
    expect(p).toMatch(/r0: it must include the story that proves the guardrail/);
  });
});

/**
 * A fake model that answers each stage by its schema name, the way the real one is asked. It
 * writes one story per assigned requirement, which is the shape a large scope document produces.
 */
function fakeClient(requirementCount: number) {
  const calls: string[] = [];
  const create = jest.fn(async (req: any) => {
    const name = req.response_format.json_schema.name;
    calls.push(name);
    const user: string = req.messages[1].content;
    let body: unknown;
    if (name === 'refined_requirements') {
      body = { project_name: 'ShiftFill', descriptor: 'Fills shift gaps.', requirements: reqs(requirementCount, 3) };
    } else if (name === 'requirement_coverage') {
      body = { missing: [] };
    } else if (name === 'release_outline') {
      const k = Number(/exactly (\d+) releases/.exec(user)![1]);
      const ids = [...user.matchAll(/- (REQ-\d+) \[(\w+)\//g)].filter((m) => m[2] !== 'CONSTRAINT').map((m) => m[1]);
      body = {
        releases: Array.from({ length: k }, (_, i) => REL(i)),
        assignments: ids.map((id, i) => ({ requirement_id: id, release: `r${i % k}` })),
      };
    } else if (name === 'release_stories') {
      const block = user.slice(user.indexOf('<ASSIGNED_TO_THIS_RELEASE>'), user.indexOf('</ASSIGNED_TO_THIS_RELEASE>'));
      const ids = [...block.matchAll(/(REQ-\d+)/g)].map((m) => m[1]);
      body = { stories: ids.map((id, i) => STORY(`S${i + 1}`, [id], { blocked_by: i > 0 ? [`S${i}`] : [] })) };
    } else {
      throw new Error(`unexpected schema ${name}`);
    }
    return { choices: [{ message: { content: JSON.stringify(body) } }] };
  });
  return { client: { create } as any, calls, create };
}

describe('generateStagedPlan', () => {
  it('produces a 120-story plan the one-call path could never return, and the gate finds nothing blocking', async () => {
    const { client, calls } = fakeClient(120);
    const out = await generateStagedPlan({ brief: 'A long scope document.', document: '', targets: { releases: 5 }, model: 'm', client });
    expect(out.plan.requirements).toHaveLength(123);
    expect(out.plan.stories).toHaveLength(120);
    expect(out.plan.releases).toHaveLength(MAX_RELEASES);
    expect(out.stages.stories_per_release.every((n) => n <= 15)).toBe(true);
    expect(calls.filter((c) => c === 'release_stories')).toHaveLength(MAX_RELEASES);
    const gate = gatePlan(out.plan, 'A long scope document.');
    expect(blockingViolations(gate.violations)).toEqual([]);
  });

  it('keeps a small project small: the tier floor, not padding', async () => {
    const { client } = fakeClient(11);
    const out = await generateStagedPlan({ brief: 'b', document: '', targets: { releases: 5 }, model: 'm', client });
    expect(out.plan.releases).toHaveLength(5);
    expect(out.plan.stories).toHaveLength(11);
  });
});

describe('decomposeBuild routes to the staged path only when asked', () => {
  it('staged: true runs the stages', async () => {
    const { client, calls } = fakeClient(8);
    const out = await decomposeBuild({ brief: 'b', document: '', targets: { releases: 3 }, client, model: 'm', staged: true });
    expect(calls[0]).toBe('refined_requirements');
    expect(out.plan.stories).toHaveLength(8);
  });

  it('a failing stage surfaces as a DecomposeError with its class, which the orchestrator records', async () => {
    const create = jest.fn(async () => ({ choices: [{ message: { content: '' } }] }));
    await expect(decomposeBuild({ brief: 'b', document: '', client: { create } as any, model: 'm', staged: true }))
      .rejects.toMatchObject({ name: 'DecomposeError', error_class: 'EmptyResponse' });
  });

  it('is on unless switched off', () => {
    const was = process.env.SBP_STAGED_GENERATION;
    delete process.env.SBP_STAGED_GENERATION;
    expect(stagedGenerationEnabled()).toBe(true);
    process.env.SBP_STAGED_GENERATION = 'off';
    expect(stagedGenerationEnabled()).toBe(false);
    if (was === undefined) delete process.env.SBP_STAGED_GENERATION; else process.env.SBP_STAGED_GENERATION = was;
  });
});
