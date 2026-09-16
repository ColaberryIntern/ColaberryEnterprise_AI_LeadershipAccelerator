/**
 * Adding a story to a published build.
 *
 * The pure builder is graded against the REAL plan gate, not a mocked one: the
 * property worth the most is that a student-authored story passes the same bar
 * a generated one does, and the only honest way to assert that is to run the
 * gate. The orchestration is tested with the stores mocked, because what it has
 * to prove is sequencing — nothing written before the gate passes, and the new
 * draft's sha (not the student's) handed to publish.
 */
const mockGetPublishedPlan = jest.fn();
const mockSavePlanDraft = jest.fn();
const mockPublishBuild = jest.fn();

jest.mock('../planStore', () => ({
  getPublishedPlan: (...a: any[]) => mockGetPublishedPlan(...a),
  savePlanDraft: (...a: any[]) => mockSavePlanDraft(...a),
}));
jest.mock('../sbpOrchestrator', () => ({
  publishBuild: (...a: any[]) => mockPublishBuild(...a),
}));

import {
  addStorySchema, buildStoryRevision, addStoryToPublishedBuild, AddStoryError, MAX_STORIES_PER_BUILD,
  resolveOwnerAgent,
} from '../addStoryService';
import { gatePlan, blockingViolations } from '../planGate';
import type { BuildPlan, PlanStory } from '../planContract';

const SHA = 'a'.repeat(64);

function story(id: string, release: string, fulfills: string[]): PlanStory {
  return {
    id, release, fulfills,
    title: `Story ${id}`,
    narrative: `As a coordinator, I want ${id} to work, so that the roster is trustworthy.`,
    owner_agent: 'System',
    acceptance: [
      'Given a roster, when it loads, then every row is present',
      'Given a bad row, when it loads, then the row is flagged',
      'Trust: every decision is logged with a trace id',
    ],
    task_guidance: 'Do the thing.',
    failure_paths: ['upstream unavailable'],
  };
}

/** A plan the real gate accepts: r0 with an ungated story, every must covered. */
function publishedPlan(): BuildPlan {
  return {
    project_name: 'Roster Trust',
    descriptor: 'A roster the coordinator can trust.',
    requirements: [
      { id: 'REQ-001', statement: 'The roster loads every row', kind: 'FUNC', priority: 'must', cluster: 'roster' },
      { id: 'REQ-002', statement: 'Bad rows are flagged', kind: 'SAFE', priority: 'must', cluster: 'roster' },
    ],
    releases: [
      { key: 'r0', name: 'Skeleton', goal: 'prove the spine', demo: 'a row loads', week_start: 1, week_end: 2 },
      { key: 'r1', name: 'Flags', goal: 'flag bad rows', demo: 'a bad row is red', week_start: 3, week_end: 4 },
    ],
    stories: [story('STORY-001', 'r0', ['REQ-001']), story('STORY-002', 'r1', ['REQ-002'])],
    // NO agents[]. 30 of 31 real published plans have none, and the fixture
    // was wrong to carry one: it is what let the AGENT-nnn assumption survive
    // 22 green tests and reach production, where it refused every build.
  } as BuildPlan;
}

const input = () => addStorySchema.parse({
  title: 'Export the roster as CSV',
  narrative: 'As a coordinator, I want to export the roster, so that I can share it with the venue.',
  acceptance: [
    'Given a roster, when I click export, then a CSV downloads',
    'Given an empty roster, when I click export, then I am told there is nothing to export',
    'Trust: the export is logged with who asked and when',
  ],
  release: 'r1',
  expected_sha256: SHA,
});

beforeEach(() => jest.clearAllMocks());

// ── the fixture itself must be clean, or every assertion below is hollow ────
describe('fixture', () => {
  it('is a plan the real gate publishes', () => {
    expect(blockingViolations(gatePlan(publishedPlan()).violations)).toEqual([]);
  });
});

describe('buildStoryRevision — the story a student writes passes the same gate a generated one does', () => {
  it('appends the story with the next id and a requirement it fulfils', () => {
    const r = buildStoryRevision(publishedPlan(), input());
    expect(r.story.id).toBe('STORY-003');
    expect(r.requirement.id).toBe('REQ-003');
    expect(r.story.fulfills).toEqual(['REQ-003']);
    expect(r.plan.stories).toHaveLength(3);
    expect(r.plan.requirements).toHaveLength(3);
  });

  it('produces a plan the REAL gate still publishes', () => {
    const r = buildStoryRevision(publishedPlan(), input());
    expect(blockingViolations(gatePlan(r.plan).violations)).toEqual([]);
  });

  it('never reuses a number, even with a gap in the sequence', () => {
    const plan = publishedPlan();
    plan.stories = [story('STORY-001', 'r0', ['REQ-001']), story('STORY-007', 'r1', ['REQ-002'])];
    expect(buildStoryRevision(plan, input()).story.id).toBe('STORY-008');
  });

  it('leaves every existing story byte-identical', () => {
    const plan = publishedPlan();
    const before = JSON.stringify(plan.stories);
    const r = buildStoryRevision(plan, input());
    expect(JSON.stringify(r.plan.stories.slice(0, 2))).toBe(before);
  });

  it('takes the owner from the plan\'s own stories, which is all a real plan has', () => {
    expect(buildStoryRevision(publishedPlan(), input()).story.owner_agent).toBe('System');
  });

  it('honours an explicit owner the plan already uses', () => {
    const plan = publishedPlan();
    plan.stories[1].owner_agent = 'User';
    expect(buildStoryRevision(plan, { ...input(), owner_agent: 'User' }).story.owner_agent).toBe('User');
  });

  it('mints the requirement at should, so a new idea is never a must the skeleton has to cover', () => {
    expect(buildStoryRevision(publishedPlan(), input()).requirement.priority).toBe('should');
  });
});

describe('buildStoryRevision — every refusal names its rule', () => {
  const expectClass = (fn: () => unknown, cls: string, status: number) => {
    try { fn(); } catch (e) {
      expect(e).toBeInstanceOf(AddStoryError);
      expect((e as AddStoryError).error_class).toBe(cls);
      expect((e as AddStoryError).status).toBe(status);
      return;
    }
    throw new Error(`expected ${cls}`);
  };

  it('refuses a release the plan does not have', () => {
    expectClass(() => buildStoryRevision(publishedPlan(), { ...input(), release: 'r9' }), 'UnknownRelease', 422);
  });

  it('refuses an acceptance set with no Trust line', () => {
    const i = input();
    i.acceptance = i.acceptance.filter((a) => !/^trust/i.test(a)).concat('Given x, when y, then z');
    expectClass(() => buildStoryRevision(publishedPlan(), i), 'NoTrustLine', 422);
  });

  it('refuses two Trust lines as firmly as none', () => {
    const i = input();
    i.acceptance = [...i.acceptance, 'Trust: a second one'];
    expectClass(() => buildStoryRevision(publishedPlan(), i), 'NoTrustLine', 422);
  });


  it('refuses an owner the plan never uses, and says which ones it does', () => {
    expectClass(() => buildStoryRevision(publishedPlan(), { ...input(), owner_agent: 'Nobody' }), 'UnknownAgent', 422);
  });

  it('stops at the cap', () => {
    const plan = publishedPlan();
    for (let n = 3; n <= MAX_STORIES_PER_BUILD; n++) {
      plan.stories.push(story(`STORY-${String(n).padStart(3, '0')}`, 'r1', ['REQ-002']));
    }
    expect(plan.stories).toHaveLength(MAX_STORIES_PER_BUILD);
    expectClass(() => buildStoryRevision(plan, input()), 'StoryCap', 422);
  });
});

describe('addStorySchema — the boundaries', () => {
  it('rejects r0 at the schema, before any plan is read', () => {
    expect(() => addStorySchema.parse({ ...input(), release: 'r0' })).toThrow();
  });

  it('requires 3 to 7 acceptance lines', () => {
    expect(() => addStorySchema.parse({ ...input(), acceptance: ['Trust: one', 'two'] })).toThrow();
    expect(() => addStorySchema.parse({ ...input(), acceptance: new Array(8).fill('Given a, when b, then c') })).toThrow();
  });

  it('requires a real sha for the lock', () => {
    expect(() => addStorySchema.parse({ ...input(), expected_sha256: 'latest' })).toThrow();
  });
});

describe('addStoryToPublishedBuild — sequencing', () => {
  const stored = (over: Record<string, unknown> = {}) => ({
    plan: publishedPlan(), plan_sha256: SHA, truth_revision: 4, version: 2, ...over,
  });

  it('writes nothing when there is no published plan', async () => {
    mockGetPublishedPlan.mockResolvedValue(null);
    await expect(addStoryToPublishedBuild('p1', input(), { enrollmentId: 'e1', repo: null }))
      .rejects.toMatchObject({ error_class: 'NotPublished', status: 404 });
    expect(mockSavePlanDraft).not.toHaveBeenCalled();
    expect(mockPublishBuild).not.toHaveBeenCalled();
  });

  it('writes nothing when the plan moved under the student', async () => {
    mockGetPublishedPlan.mockResolvedValue(stored({ plan_sha256: 'b'.repeat(64) }));
    await expect(addStoryToPublishedBuild('p1', input(), { enrollmentId: 'e1', repo: null }))
      .rejects.toMatchObject({ error_class: 'HashMismatch', status: 409 });
    expect(mockSavePlanDraft).not.toHaveBeenCalled();
  });

  it('writes nothing when the story itself is refused', async () => {
    mockGetPublishedPlan.mockResolvedValue(stored());
    await expect(addStoryToPublishedBuild('p1', { ...input(), release: 'r9' }, { enrollmentId: 'e1', repo: null }))
      .rejects.toMatchObject({ error_class: 'UnknownRelease' });
    expect(mockSavePlanDraft).not.toHaveBeenCalled();
  });

  it('blames the plan, not the story, when the EXISTING plan no longer passes the gate', async () => {
    const plan = publishedPlan();
    plan.releases = plan.releases.filter((r) => r.key !== 'r0'); // r0_missing is blocking
    plan.stories = plan.stories.filter((s) => s.release !== 'r0');
    mockGetPublishedPlan.mockResolvedValue(stored({ plan }));
    await expect(addStoryToPublishedBuild('p1', input(), { enrollmentId: 'e1', repo: null }))
      .rejects.toMatchObject({ error_class: 'PlanPredatesGate' });
    expect(mockSavePlanDraft).not.toHaveBeenCalled();
  });

  it('saves the revision as the next draft and publishes THAT draft, by its own sha', async () => {
    mockGetPublishedPlan.mockResolvedValue(stored());
    mockSavePlanDraft.mockResolvedValue({ version: 3, plan_sha256: 'c'.repeat(64) });
    mockPublishBuild.mockResolvedValue({ status: 'published', planVersion: 3, commitSha: 'abc', filesWritten: 2, repoUrl: 'u' });

    const out = await addStoryToPublishedBuild('p1', input(), {
      enrollmentId: 'e1', repo: { owner: 'o', repo: 'r', url: 'u' }, correlationId: 'corr',
    });

    // The draft carries the revised plan and the truth revision it descends from.
    const [pid, plan, meta] = mockSavePlanDraft.mock.calls[0];
    expect(pid).toBe('p1');
    expect(plan.stories.map((s: PlanStory) => s.id)).toEqual(['STORY-001', 'STORY-002', 'STORY-003']);
    expect(meta).toMatchObject({ model: 'student', correlationId: 'corr', truthRevision: 4 });
    expect(meta.gate.ok).toBeDefined();

    // Publish is locked to the NEW draft's sha — never the one the student sent.
    expect(mockPublishBuild).toHaveBeenCalledWith('p1', {
      enrollmentId: 'e1', expectedSha: 'c'.repeat(64), repo: { owner: 'o', repo: 'r', url: 'u' },
    });

    expect(out).toMatchObject({
      status: 'published', planVersion: 3, commitSha: 'abc',
      story_id: 'STORY-003', requirement_id: 'REQ-003', plan_sha256: 'c'.repeat(64),
    });
  });

  it('passes a null repo through, so a build awaiting its repo still gets the story', async () => {
    mockGetPublishedPlan.mockResolvedValue(stored());
    mockSavePlanDraft.mockResolvedValue({ version: 3, plan_sha256: 'c'.repeat(64) });
    mockPublishBuild.mockResolvedValue({ status: 'awaiting_repo', planVersion: 3, commitSha: null, filesWritten: 0, repoUrl: null });
    const out = await addStoryToPublishedBuild('p1', input(), { enrollmentId: 'e1', repo: null });
    expect(mockPublishBuild.mock.calls[0][1].repo).toBeNull();
    expect(out.status).toBe('awaiting_repo');
  });
});

describe('resolveOwnerAgent — against the shape real plans actually have', () => {
  /**
   * Measured on production the day this shipped: 30 of 31 published plans had
   * NO `agents[]`, and their stories carried owners like "User" and "System".
   * The first version required an AGENT-nnn id from `plan.agents` and refused
   * every single real build. These tests are that incident.
   */
  const planWith = (owners: string[]): any => ({
    stories: owners.map((o, i) => ({ id: `STORY-00${i + 1}`, owner_agent: o })),
  });

  it('picks the most common owner, not the first', () => {
    expect(resolveOwnerAgent(planWith(['User', 'System', 'System']))).toBe('System');
  });

  it('never refuses when no owner was asked for, even with nothing to copy', () => {
    expect(resolveOwnerAgent({ stories: [] } as any)).toBe('System');
    expect(resolveOwnerAgent({} as any)).toBe('System');
  });

  it('ignores blank owners rather than electing the empty string', () => {
    expect(resolveOwnerAgent(planWith(['', '  ', 'User']))).toBe('User');
  });

  it('falls back to agents[] for the rare plan that has one', () => {
    expect(resolveOwnerAgent({ stories: [], agents: [{ id: 'AGENT-001' }] } as any)).toBe('AGENT-001');
  });

  it('accepts an explicit owner the plan uses, and rejects one it does not', () => {
    expect(resolveOwnerAgent(planWith(['User', 'System']), 'User')).toBe('User');
    expect(resolveOwnerAgent(planWith(['User', 'System']), 'Nobody')).toBeNull();
  });
});
