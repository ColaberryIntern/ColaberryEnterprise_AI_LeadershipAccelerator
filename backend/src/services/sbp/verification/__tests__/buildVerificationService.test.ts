/**
 * The loop, end to end, with GitHub and Postgres mocked.
 *
 * The property under test that is worth the most: READING THE SAME COMMIT TWICE
 * AWARDS ONCE. Everything else in this file exists to prove the loop does not
 * reach that award by the wrong route — a rate limit must not read as "nothing
 * done", a mangled file must not silently un-verify anything, and a story with
 * no commit must not be stamped.
 */
const mockProjectFindByPk = jest.fn();
const mockTaskFindOne = jest.fn();
const mockTaskUpdate = jest.fn();
const mockConnectionFindOne = jest.fn();
const mockGetPublishedPlan = jest.fn();
const mockMarkVerified = jest.fn();
const mockRecordEvidence = jest.fn();
const mockGetBudgetPerUnitXp = jest.fn();

jest.mock('../../../../models/Project', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockProjectFindByPk(...a) },
}));
jest.mock('../../../../models/StudentTask', () => ({
  __esModule: true,
  default: {
    findOne: (...a: any[]) => mockTaskFindOne(...a),
    update: (...a: any[]) => mockTaskUpdate(...a),
  },
}));
jest.mock('../../../../models/GitHubConnection', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockConnectionFindOne(...a) },
}));
jest.mock('../../planStore', () => ({
  getPublishedPlan: (...a: any[]) => mockGetPublishedPlan(...a),
}));
jest.mock('../../../projects/projectWriteService', () => ({
  markTaskVerifiedComplete: (...a: any[]) => mockMarkVerified(...a),
}));
jest.mock('../../../progression/evidenceEngine', () => ({
  recordEvidence: (...a: any[]) => mockRecordEvidence(...a),
}));
jest.mock('../../../progression/pointsConfigService', () => ({
  getBudgetPerUnitXp: (...a: any[]) => mockGetBudgetPerUnitXp(...a),
}));

import { verifyBuildFromRepo, STORY_XP_KEY, VERIFIER_SOURCE } from '../buildVerificationService';
import { PROGRESS_SCHEMA_VERSION } from '../progressContract';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const ENROLLMENT_ID = '22222222-2222-2222-2222-222222222222';
const SHA = 'f'.repeat(40);
const CRIT_A = 'The roster endpoint returns 200';
const CRIT_B = 'An unauthenticated caller gets 401';

const PLAN = {
  version: 3,
  plan: {
    stories: [
      { id: 'STORY-001', acceptance: [CRIT_A, CRIT_B] },
      { id: 'STORY-002', acceptance: ['something else'] },
    ],
  },
};

function progressJson(passedB = true): string {
  return JSON.stringify({
    schema_version: PROGRESS_SCHEMA_VERSION,
    stories: [{
      id: 'STORY-001',
      criteria: [{ text: CRIT_A, passed: true }, { text: CRIT_B, passed: passedB }],
    }],
  });
}

/**
 * A fetch stand-in over a tiny in-memory GitHub. Routed on the path so the test
 * exercises the real reader — its retries, its base64 decode, its detail fetch
 * for the changed-file count — rather than a stub of it.
 */
function githubFetch(opts: { progress?: string | null; commitMessage?: string; changedFiles?: number; status?: number } = {}) {
  const {
    progress = progressJson(),
    commitMessage = 'STORY-001: roster endpoint\n\nStory: STORY-001',
    changedFiles = 2,
    status,
  } = opts;

  return jest.fn(async (url: string) => {
    const path = String(url);
    const json = (body: unknown, s = 200): any => ({
      ok: s >= 200 && s < 300,
      status: s,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: { get: () => null },
    });
    if (status) return json({ message: 'boom' }, status);

    if (path.includes('/contents/')) {
      return progress === null
        ? json({ message: 'Not Found' }, 404)
        : json({ content: Buffer.from(progress, 'utf8').toString('base64') });
    }
    if (/\/commits\/[0-9a-f]{40}/.test(path)) {
      return json({
        sha: SHA,
        commit: { message: commitMessage, author: { name: 'Student', date: '2026-08-10T12:00:00Z' } },
        files: new Array(changedFiles).fill({ filename: 'src/roster.ts' }),
      });
    }
    if (path.includes('/commits?')) {
      return json([{ sha: SHA, commit: { message: commitMessage, author: { date: '2026-08-10T12:00:00Z' } } }]);
    }
    return json({ message: 'Not Found' }, 404);
  }) as unknown as typeof fetch;
}

/** A task row whose verified_at reflects whatever previous runs did to it. */
function taskRow(storyId: string, verifiedAt: Date | null = null) {
  return { id: `task-${storyId}`, story_id: storyId, verified_at: verifiedAt };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GITHUB_TOKEN = 'test-token';
  mockProjectFindByPk.mockResolvedValue({ id: PROJECT_ID, enrollment_id: ENROLLMENT_ID });
  mockConnectionFindOne.mockResolvedValue({ repo_owner: 'ColaberryIntern', repo_name: 'roster-abc12345' });
  mockGetPublishedPlan.mockResolvedValue(PLAN);
  mockTaskFindOne.mockImplementation(async ({ where }: any) => taskRow(where.story_id));
  mockTaskUpdate.mockResolvedValue([1]);
  mockMarkVerified.mockResolvedValue({ id: 'x', story_id: 'STORY-001', status: 'complete', verified_at: new Date() });
  mockRecordEvidence.mockResolvedValue({ builder_xp: 0, created: true });
  // The 2-story PLAN against an 800 budget: 400 a story.
  mockGetBudgetPerUnitXp.mockResolvedValue({ per_unit: 400, budget: 800, reason: null });
});

describe('verifyBuildFromRepo — the happy path', () => {
  it('verifies exactly the claimed story, stamps it, and records evidence against the sha', async () => {
    const summary = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });

    expect(summary.ok).toBe(true);
    expect(summary.plan_version).toBe(3);
    expect(summary.rollup.stories_verified).toBe(1);
    expect(summary.rollup.newly_verified).toEqual(['STORY-001']);
    // STORY-002 was never claimed and has no commit.
    expect(summary.stories.find((s) => s.story_id === 'STORY-002')?.state).toBe('not_started');

    expect(mockMarkVerified).toHaveBeenCalledTimes(1);
    expect(mockMarkVerified).toHaveBeenCalledWith(PROJECT_ID, 'STORY-001', expect.objectContaining({
      source: VERIFIER_SOURCE, ref: SHA,
    }));
    expect(mockRecordEvidence).toHaveBeenCalledWith(expect.objectContaining({
      enrollmentId: ENROLLMENT_ID,
      source: 'github_commit',
      sourceRef: `STORY-001@${SHA}`,
      typeSlug: STORY_XP_KEY,
    }));
  });

  it('writes a verdict for EVERY story, not only the verified one', async () => {
    await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });
    const written = mockTaskUpdate.mock.calls.map((c) => c[0].verification_json);
    expect(written).toHaveLength(2);
    expect(written.map((w: any) => w.state).sort()).toEqual(['not_started', 'verified']);
  });
});

describe('idempotency — reading the same commit twice awards once', () => {
  it('does not record evidence again once the task is already verified', async () => {
    const fetchImpl = githubFetch();

    const first = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl });
    expect(first.rollup.newly_verified).toEqual(['STORY-001']);
    expect(mockRecordEvidence).toHaveBeenCalledTimes(1);

    // Second run: the row now carries verified_at, exactly as the first run left it.
    mockTaskFindOne.mockImplementation(async ({ where }: any) =>
      taskRow(where.story_id, where.story_id === 'STORY-001' ? new Date('2026-08-10T12:05:00Z') : null));

    const second = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl });
    expect(second.rollup.stories_verified).toBe(1);      // still verified
    expect(second.rollup.newly_verified).toEqual([]);    // but nothing new
    expect(second.rollup.xp_awarded).toBe(0);
    expect(mockRecordEvidence).toHaveBeenCalledTimes(1); // ← the whole point
  });

  it('even if the transition guard were bypassed, the evidence key is the backstop', async () => {
    // recordEvidence reports created:false when its idempotency key already exists.
    mockRecordEvidence.mockResolvedValue({ builder_xp: 40, created: false });
    const summary = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });
    expect(summary.rollup.xp_awarded).toBe(0);
    expect(summary.rollup.newly_verified).toEqual([]);
  });
});

describe('the award is a share of the capstone budget, not a per-story rate', () => {
  it('divides by the PUBLISHED PLAN story count, not by what the student finished', async () => {
    await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });
    // The plan has 2 stories; only STORY-001 verified. The divisor must be 2.
    expect(mockGetBudgetPerUnitXp).toHaveBeenCalledWith(STORY_XP_KEY, 2);
  });

  it('resolves the rate ONCE per run, not once per story', async () => {
    await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });
    expect(mockGetBudgetPerUnitXp).toHaveBeenCalledTimes(1);
  });

  it('hands the divided figure to the award, so every story on a run pays the same', async () => {
    mockRecordEvidence.mockResolvedValue({ builder_xp: 400, created: true });
    const summary = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });
    expect(mockRecordEvidence).toHaveBeenCalledWith(expect.objectContaining({
      typeSlug: STORY_XP_KEY,
      builderXpOverride: 400,
    }));
    expect(summary.rollup.xp_awarded).toBe(400);
  });

  it('a bigger plan pays less per story for the same budget', async () => {
    mockGetBudgetPerUnitXp.mockResolvedValue({ per_unit: 27, budget: 800, reason: null });
    mockRecordEvidence.mockResolvedValue({ builder_xp: 27, created: true });
    const summary = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });
    expect(summary.rollup.xp_awarded).toBe(27);
  });

  it('still records the evidence trail when the budget is unset, awarding nothing', async () => {
    mockGetBudgetPerUnitXp.mockResolvedValue({ per_unit: 0, budget: null, reason: 'no_budget_set' });
    mockRecordEvidence.mockResolvedValue({ builder_xp: 0, created: true });
    const summary = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });

    expect(summary.ok).toBe(true);
    expect(summary.rollup.newly_verified).toEqual(['STORY-001']);   // the story still counts
    expect(summary.rollup.xp_awarded).toBe(0);                      // but no XP moves
    expect(mockRecordEvidence).toHaveBeenCalledWith(expect.objectContaining({ builderXpOverride: 0 }));
  });
});

describe('the two halves fail independently', () => {
  it('a story with no commit is NOT verified and is never stamped', async () => {
    const summary = await verifyBuildFromRepo(PROJECT_ID, {
      fetchImpl: githubFetch({ commitMessage: 'wip: poking at things' }),
    });
    expect(summary.stories.find((s) => s.story_id === 'STORY-001')?.state).toBe('submitted');
    expect(mockMarkVerified).not.toHaveBeenCalled();
    expect(mockRecordEvidence).not.toHaveBeenCalled();
  });

  it('a commit that changed no files is not evidence', async () => {
    const summary = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch({ changedFiles: 0 }) });
    expect(summary.stories.find((s) => s.story_id === 'STORY-001')?.state).toBe('submitted');
    expect(mockMarkVerified).not.toHaveBeenCalled();
  });

  it('3 of 4 criteria reports as submitted with the outstanding one named', async () => {
    const summary = await verifyBuildFromRepo(PROJECT_ID, {
      fetchImpl: githubFetch({ progress: progressJson(false) }),
    });
    const s = summary.stories.find((x) => x.story_id === 'STORY-001')!;
    expect(s.state).toBe('submitted');
    expect(s.criteria_passed).toBe(1);
    expect(s.criteria_total).toBe(2);
    expect(s.outstanding).toEqual([CRIT_B]);
    expect(mockMarkVerified).not.toHaveBeenCalled();
  });
});

describe('failure paths never look like "nothing done"', () => {
  it('a malformed progress file is rejected loudly and writes nothing', async () => {
    const summary = await verifyBuildFromRepo(PROJECT_ID, {
      fetchImpl: githubFetch({ progress: '{ "schema_version": 1, "stories": [ }' }),
    });
    expect(summary.ok).toBe(false);
    expect(summary.error_class).toBe('ProgressFileNotJson');
    expect(summary.reason).toMatch(/not valid JSON/);
    expect(mockTaskUpdate).not.toHaveBeenCalled();
    expect(mockMarkVerified).not.toHaveBeenCalled();
  });

  it('a missing progress file is a normal state, not a rejection', async () => {
    const summary = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch({ progress: null }) });
    expect(summary.ok).toBe(true);
    expect(summary.rollup.stories_verified).toBe(0);
  });

  it('a GitHub rate limit is reported as a rate limit, not as zero progress', async () => {
    const summary = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch({ status: 429 }) });
    expect(summary.ok).toBe(false);
    expect(summary.error_class).toBe('RateLimited');
    expect(summary.reason).toMatch(/rate-limiting/);
    expect(mockTaskUpdate).not.toHaveBeenCalled();
  });

  it('no published plan is a clear state, not a crash', async () => {
    mockGetPublishedPlan.mockResolvedValue(null);
    const summary = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });
    expect(summary.ok).toBe(false);
    expect(summary.error_class).toBe('NoPublishedPlan');
  });

  it('no workspace repo is a clear state, not a crash', async () => {
    mockConnectionFindOne.mockResolvedValue(null);
    const summary = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });
    expect(summary.ok).toBe(false);
    expect(summary.error_class).toBe('NoWorkspaceRepo');
  });
});
