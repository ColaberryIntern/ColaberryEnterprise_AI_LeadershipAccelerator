/**
 * L8.4 — the story-authorization gate, WIRED and OBSERVE-BY-DEFAULT.
 *
 * Arming the gate meant two changes: `sbpOrchestrator` now passes `projectId` so the gate is
 * reached (covered in `sbpOrchestrator.test.ts`), and `decomposeBuild` turns a refusal into a
 * LOG rather than a throw unless `FLAGS.sbpStoryGateEnforce` is on. This suite asserts the
 * behaviour at the decompose boundary, because the whole point of observe mode is that a refused
 * build still PROCEEDS — a predicate test would not catch a regression that started throwing.
 *
 * The gate itself is mocked: what is under test is decompose's reaction to a verdict, not how the
 * verdict is reached (that is `storyAuthorization`'s own suite).
 */
import { decomposeBuild } from '../decomposeService';
import { storyAuthorizationFor, StoryNotAuthorizedError } from '../storyAuthorization';
import { FLAGS } from '../../../config/featureFlags';
import type { BuildPlan } from '../planContract';

jest.mock('../storyAuthorization', () => {
  const actual = jest.requireActual<typeof import('../storyAuthorization')>('../storyAuthorization');
  return { ...actual, storyAuthorizationFor: jest.fn() };
});
const mockGate = storyAuthorizationFor as jest.MockedFunction<typeof storyAuthorizationFor>;

const BRIEF = 'A sponsor dashboard. The manager pays for seats through our existing PaySimple link.';
const DOC = '# Chapter 1\nThe system provisions employees on payment confirmation.';

const validPlan: BuildPlan = {
  project_name: 'Sponsor Dashboard',
  descriptor: 'Corporate seat management',
  requirements: [{ id: 'REQ-001', statement: 'A manager can build a roster.', kind: 'FUNC', priority: 'must', cluster: 'Roster' }],
  releases: [{ key: 'r0', name: 'Skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 }],
  stories: [{
    id: 'STORY-001', release: 'r0', title: 'Manager builds a roster',
    narrative: 'As a manager, I want to add employees, so that I can buy seats.',
    fulfills: ['REQ-001'], owner_agent: 'Roster',
    acceptance: ['Given a, when b, then c.', 'Given d, when e, then f.', 'Trust - it is audited.'],
    task_guidance: 'g', failure_paths: ['x'], blocked_by: [],
  }],
};

function stubClient() {
  const create = jest.fn(async () => ({
    choices: [{ message: { content: JSON.stringify(validPlan) } }],
    usage: { total_tokens: 1 },
  }));
  return { client: { create } as any, create };
}

/** Collect structured log lines without swallowing a genuine failure. */
function captureLogs(): { lines: Array<Record<string, any>>; restore: () => void } {
  const lines: Array<Record<string, any>> = [];
  const original = console.log;
  // eslint-disable-next-line no-console
  console.log = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string') {
      try { lines.push(JSON.parse(first)); } catch { /* not structured */ }
    }
  };
  return { lines, restore: () => { console.log = original; } };
}

let enforceWas: boolean;
beforeEach(() => { enforceWas = FLAGS.sbpStoryGateEnforce; mockGate.mockReset(); });
afterEach(() => { FLAGS.sbpStoryGateEnforce = enforceWas; jest.restoreAllMocks(); });

describe('story gate — observe mode (flag off, the default)', () => {
  it('a refused build PROCEEDS and logs sbp_story_gate_would_refuse', async () => {
    FLAGS.sbpStoryGateEnforce = false;
    mockGate.mockResolvedValue({ authorized: false, reason: 'blueprint_not_approved', gaps: ['approval_missing'] });
    const { client, create } = stubClient();
    const logs = captureLogs();

    const result = await decomposeBuild({ projectId: 'p1', brief: BRIEF, document: DOC, client });
    logs.restore();

    expect(result.plan.project_name).toBe('Sponsor Dashboard'); // the build was NOT refused
    expect(create).toHaveBeenCalledTimes(1); // the model WAS called after the gate
    expect(mockGate).toHaveBeenCalledWith('p1');
    const observed = logs.lines.find((l) => l.event === 'sbp_story_gate_would_refuse');
    expect(observed).toBeDefined();
    expect(observed!.context).toMatchObject({ projectId: 'p1', reason: 'blueprint_not_approved', mode: 'observe' });
  });

  it('an authorized build proceeds with NO would-refuse log', async () => {
    FLAGS.sbpStoryGateEnforce = false;
    mockGate.mockResolvedValue({ authorized: true, reason: 'blueprint_approved', gaps: [] });
    const { client, create } = stubClient();
    const logs = captureLogs();

    await decomposeBuild({ projectId: 'p1', brief: BRIEF, document: DOC, client });
    logs.restore();

    expect(create).toHaveBeenCalledTimes(1);
    expect(logs.lines.some((l) => l.event === 'sbp_story_gate_would_refuse')).toBe(false);
  });

  it('an ERROR in the gate read does NOT break an observed build — it logs and proceeds', async () => {
    // Arming added a DB read the live path never made. In observe mode an infra blip there must
    // not fail a build the gate is explicitly not enforcing.
    FLAGS.sbpStoryGateEnforce = false;
    mockGate.mockRejectedValue(new Error('db unavailable'));
    const { client, create } = stubClient();
    const logs = captureLogs();

    const result = await decomposeBuild({ projectId: 'p1', brief: BRIEF, document: DOC, client });
    logs.restore();

    expect(result.plan.project_name).toBe('Sponsor Dashboard'); // proceeded despite the gate error
    expect(create).toHaveBeenCalledTimes(1);
    const errLine = logs.lines.find((l) => l.event === 'sbp_story_gate_observe_error');
    expect(errLine).toBeDefined(); // not swallowed silently
    expect(errLine!.context).toMatchObject({ projectId: 'p1', mode: 'observe', message: 'db unavailable' });
  });
});

describe('story gate — enforce mode (flag on)', () => {
  it('a refused build THROWS StoryNotAuthorizedError before the model is called', async () => {
    FLAGS.sbpStoryGateEnforce = true;
    mockGate.mockResolvedValue({ authorized: false, reason: 'no_lifecycle', gaps: ['lifecycle_unregistered'] });
    const { client, create } = stubClient();

    await expect(decomposeBuild({ projectId: 'p1', brief: BRIEF, document: DOC, client }))
      .rejects.toBeInstanceOf(StoryNotAuthorizedError);
    expect(create).not.toHaveBeenCalled(); // refusal costs no model call
  });

  it('an authorized build still proceeds when enforcement is on', async () => {
    FLAGS.sbpStoryGateEnforce = true;
    mockGate.mockResolvedValue({ authorized: true, reason: 'legacy_compatibility', gaps: [] });
    const { client, create } = stubClient();

    const result = await decomposeBuild({ projectId: 'p1', brief: BRIEF, document: DOC, client });
    expect(result.plan.project_name).toBe('Sponsor Dashboard');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('a gate-read error PROPAGATES in enforce mode (fail closed, no build past a broken gate)', async () => {
    FLAGS.sbpStoryGateEnforce = true;
    mockGate.mockRejectedValue(new Error('db unavailable'));
    const { client, create } = stubClient();

    await expect(decomposeBuild({ projectId: 'p1', brief: BRIEF, document: DOC, client }))
      .rejects.toThrow('db unavailable');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('story gate — not consulted without a project id', () => {
  it('skips the gate entirely when no projectId is supplied', async () => {
    FLAGS.sbpStoryGateEnforce = true; // even enforcing, no id means no gate
    const { client, create } = stubClient();

    await decomposeBuild({ brief: BRIEF, document: DOC, client });
    expect(mockGate).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
