/**
 * THE THREE WAYS A STUDENT USED TO LOSE VERIFIED WORK.
 *
 * Each of these is written as the thing that actually happens to a person, not
 * as an abstraction, because each was found by auditing the loop against one
 * rule and each would have shipped:
 *
 *   EVIDENCE LIVES IN OUR DATABASE. THE REPO IS ONLY WHERE VERIFICATION HAPPENS.
 *
 * `student_tasks.verified_at` is an immutable latch. `verification_json` is a
 * mutable snapshot of the last repo read. The display layer read only the
 * second, so the repo was silently promoted from evidence into record.
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
  __esModule: true, default: { findByPk: (...a: any[]) => mockProjectFindByPk(...a) },
}));
jest.mock('../../../../models/StudentTask', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockTaskFindOne(...a), update: (...a: any[]) => mockTaskUpdate(...a) },
}));
jest.mock('../../../../models/GitHubConnection', () => ({
  __esModule: true, default: { findOne: (...a: any[]) => mockConnectionFindOne(...a) },
}));
jest.mock('../../planStore', () => ({ getPublishedPlan: (...a: any[]) => mockGetPublishedPlan(...a) }));
jest.mock('../../../projects/projectWriteService', () => ({
  markTaskVerifiedComplete: (...a: any[]) => mockMarkVerified(...a),
}));
jest.mock('../../../progression/evidenceEngine', () => ({
  recordEvidence: (...a: any[]) => mockRecordEvidence(...a),
}));
jest.mock('../../../progression/pointsConfigService', () => ({
  getBudgetPerUnitXp: (...a: any[]) => mockGetBudgetPerUnitXp(...a),
}));

import { verifyBuildFromRepo } from '../buildVerificationService';
import { PROGRESS_SCHEMA_VERSION } from '../progressContract';
import { toTaskVerificationDto } from '../../../projects/projectTreeDto';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const ENROLLMENT_ID = '22222222-2222-2222-2222-222222222222';
const OLD_SHA = 'a'.repeat(40);
const NEW_SHA = 'b'.repeat(40);

/** Six stories, each with two criteria. A real build's worth of work. */
const SIX_STORIES = Array.from({ length: 6 }, (_, i) => ({
  id: `STORY-00${i + 1}`,
  acceptance: [`criterion A for story ${i + 1}`, `criterion B for story ${i + 1}`],
}));

const PLAN = { version: 3, plan: { stories: SIX_STORIES } };

const allPassing = () => JSON.stringify({
  schema_version: PROGRESS_SCHEMA_VERSION,
  stories: SIX_STORIES.map((s) => ({
    id: s.id,
    criteria: s.acceptance.map((text) => ({ text, passed: true })),
  })),
});

/**
 * A GitHub stand-in. `progress: null` is a 404 on the contents endpoint — the
 * student deleted the file. `commits` controls what the reader can still see.
 */
function githubFetch(opts: {
  progress?: string | null;
  commits?: Array<{ sha: string; message: string }>;
} = {}) {
  const {
    progress = allPassing(),
    commits = SIX_STORIES.map((s, i) => ({ sha: `${i}`.repeat(40), message: `${s.id}: done\n\nStory: ${s.id}` })),
  } = opts;

  return jest.fn(async (url: string) => {
    const path = String(url);
    const json = (body: unknown, s = 200): any => ({
      ok: s >= 200 && s < 300, status: s,
      json: async () => body, text: async () => JSON.stringify(body),
      headers: { get: () => null },
    });

    if (path.includes('/contents/')) {
      return progress === null
        ? json({ message: 'Not Found' }, 404)
        : json({ content: Buffer.from(progress, 'utf8').toString('base64') });
    }
    const detail = /\/commits\/([0-9a-f]{40})/.exec(path);
    if (detail) {
      const found = commits.find((c) => c.sha === detail[1]);
      return json({
        sha: detail[1],
        commit: { message: found?.message ?? 'unrelated', author: { name: 'Student', date: '2026-08-10T12:00:00Z' } },
        files: [{ filename: 'src/thing.ts' }],
      });
    }
    if (path.includes('/commits?')) {
      return json(commits.map((c) => ({
        sha: c.sha, commit: { message: c.message, author: { date: '2026-08-10T12:00:00Z' } },
      })));
    }
    return json({ message: 'Not Found' }, 404);
  }) as unknown as typeof fetch;
}

/** What the DB hands back for a task. `verifiedAt` set = the platform verified it. */
function taskRow(storyId: string, over: Record<string, unknown> = {}) {
  return {
    id: `task-${storyId}`, story_id: storyId,
    verified_at: null, verified_by: null, verified_ref: null, verification_json: null,
    ...over,
  };
}

/** The verdicts the run persisted, keyed by story. This is what the student later sees. */
function persisted(): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [i, call] of mockTaskUpdate.mock.calls.entries()) {
    const record = call[0].verification_json;
    out[record.story_id ?? `#${i}`] = record;
  }
  return out;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GITHUB_TOKEN = 'test-token';
  mockProjectFindByPk.mockResolvedValue({ id: PROJECT_ID, enrollment_id: ENROLLMENT_ID });
  mockConnectionFindOne.mockResolvedValue({ repo_owner: 'a-student', repo_name: 'nightshift' });
  mockGetPublishedPlan.mockResolvedValue(PLAN);
  mockTaskUpdate.mockResolvedValue([1]);
  mockMarkVerified.mockResolvedValue({ id: 'x', story_id: 'STORY-001', status: 'complete', verified_at: new Date() });
  mockRecordEvidence.mockResolvedValue({ builder_xp: 25, created: true });
  mockGetBudgetPerUnitXp.mockResolvedValue({ per_unit: 25, budget: 800, reason: null });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ── 1 ───────────────────────────────────────────────────────────────────────

describe('A student deletes .colaberry/ and presses Sync', () => {
  /**
   * Six stories verified over four weeks. The student tidies their repo, removes
   * a folder full of platform bookkeeping they did not write, commits, and
   * syncs. The read SUCCEEDS — there is simply no progress file — so every
   * story comes back at zero criteria.
   *
   * Before the latch: six verified stories rendered as `not_started`, with
   * `verified_at` sitting untouched in the column underneath. A month of work,
   * apparently gone, with nothing on screen to say otherwise.
   */
  beforeEach(() => {
    mockTaskFindOne.mockImplementation(async ({ where }: any) => taskRow(where.story_id, {
      verified_at: new Date('2026-08-01T12:00:00Z'),
      verified_by: 'build_pipeline:repo_verification',
      verified_ref: OLD_SHA,
      verification_json: { state: 'verified', commit_sha: OLD_SHA, commit_at: '2026-08-01T11:00:00Z' },
    }));
  });

  it('all six stories stay verified', async () => {
    const summary = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch({ progress: null }) });

    expect(summary.ok).toBe(true);
    expect(summary.rollup.stories_verified).toBe(6);
    expect(summary.rollup.stories_not_started).toBe(0);
    for (const story of summary.stories) expect(story.state).toBe('verified');
  });

  it('what is WRITTEN back to the database says verified too, not just what is returned', async () => {
    await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch({ progress: null }) });

    const written = persisted();
    expect(Object.keys(written)).toHaveLength(6);
    for (const record of Object.values(written)) {
      expect(record.state).toBe('verified');
      expect(record.latched).toBe(true);
      expect(record.commit_sha).toBe(OLD_SHA);   // the frozen sha, not null
      expect(record.outstanding).toEqual([]);
    }
  });

  it('tells the student it cannot re-check, rather than pretending nothing happened', async () => {
    const summary = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch({ progress: null }) });
    const story = summary.stories[0];

    // Their commits are all still there — it is only the progress file that is
    // gone — so the live read lands on `in_progress`: something happened here,
    // but nothing currently claims a criterion passed.
    expect(story.live_state).toBe('in_progress');
    expect(story.reasons[0]).toMatch(/stays verified/i);
    expect(story.reasons[0]).toMatch(/nothing you do to the repo can take it away/i);
  });

  it('awards nothing new — the latch protects credit, it never grants it', async () => {
    await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch({ progress: null }) });
    expect(mockRecordEvidence).not.toHaveBeenCalled();
    expect(mockMarkVerified).not.toHaveBeenCalled();
  });

  it('and a student who had NOT verified anything still sees the honest empty state', async () => {
    // The same deleted folder, on a build where nothing was ever verified. The
    // latch must not paper over that: no record, nothing to protect.
    mockTaskFindOne.mockImplementation(async ({ where }: any) => taskRow(where.story_id));

    const summary = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch({ progress: null }) });
    expect(summary.rollup.stories_verified).toBe(0);
    expect(summary.stories.every((s) => s.state !== 'verified')).toBe(true);
  });
});

// ── 2 ───────────────────────────────────────────────────────────────────────

describe('A story verifies, then 100+ more commits land on the build', () => {
  /**
   * STORY-001 verified in week two. By week nine the student has pushed a few
   * hundred commits and the evidence commit has scrolled out of the reader's
   * 100-commit window. The progress file still ticks every criterion; there is
   * simply no visible commit naming the story any more.
   *
   * Before the latch: `verified` → `submitted`, triggered by nothing the
   * student did wrong. Falling out of a read window is time passing.
   */
  const RECENT_COMMITS = Array.from({ length: 100 }, (_, i) => ({
    sha: `${(i % 10)}`.repeat(40), message: `chore: unrelated work ${i}`,
  }));

  beforeEach(() => {
    mockTaskFindOne.mockImplementation(async ({ where }: any) => taskRow(where.story_id, where.story_id === 'STORY-001'
      ? {
        verified_at: new Date('2026-07-01T12:00:00Z'),
        verified_by: 'build_pipeline:repo_verification',
        verified_ref: OLD_SHA,
        verification_json: { state: 'verified', commit_sha: OLD_SHA },
      }
      : {}));
  });

  it('STORY-001 stays verified even though no commit naming it is visible any more', async () => {
    const summary = await verifyBuildFromRepo(PROJECT_ID, {
      fetchImpl: githubFetch({ commits: RECENT_COMMITS }),
    });

    const story = summary.stories.find((s) => s.story_id === 'STORY-001')!;
    expect(story.state).toBe('verified');
    expect(story.latched).toBe(true);
    // Criteria still pass in the file; the commit is the half that aged out.
    expect(story.live_state).toBe('submitted');
    expect(story.commit_sha).toBe(OLD_SHA);
  });

  it('the stories that genuinely have no commit yet are still reported honestly', async () => {
    const summary = await verifyBuildFromRepo(PROJECT_ID, {
      fetchImpl: githubFetch({ commits: RECENT_COMMITS }),
    });

    const others = summary.stories.filter((s) => s.story_id !== 'STORY-001');
    expect(others).toHaveLength(5);
    for (const story of others) {
      expect(story.state).toBe('submitted');   // criteria pass, no qualifying commit
      expect(story.latched).toBeFalsy();
    }
  });
});

// ── 3 ───────────────────────────────────────────────────────────────────────

describe('A student force-pushes after a story was awarded', () => {
  /**
   * STORY-001 verified against `aaa…`, and 25 XP was banked in
   * `evidence_records` under `STORY-001@aaa…`. The student then squashes their
   * branch and force-pushes. Same work, new sha.
   *
   * Before the fix, two things went wrong. `verified_ref` did not exist, so the
   * frozen sha survived only in a log line; and the XP read rebuilt its lookup
   * key from the CURRENT sha, so it went hunting for `STORY-001@bbb…`, found
   * nothing, and the story read 0 XP forever while its award sat in the table.
   */
  it('the frozen sha is written at award time, so there is something to look XP up by', async () => {
    mockTaskFindOne.mockImplementation(async ({ where }: any) => taskRow(where.story_id));

    await verifyBuildFromRepo(PROJECT_ID, {
      fetchImpl: githubFetch({
        commits: [{ sha: OLD_SHA, message: 'STORY-001: done\n\nStory: STORY-001' }],
      }),
    });

    // The sha goes to markTaskVerifiedComplete as `ref`, which now persists it
    // to student_tasks.verified_ref under the same first-write-wins rule.
    expect(mockMarkVerified).toHaveBeenCalledWith(PROJECT_ID, 'STORY-001', expect.objectContaining({ ref: OLD_SHA }));
    expect(mockRecordEvidence).toHaveBeenCalledWith(expect.objectContaining({
      sourceRef: `STORY-001@${OLD_SHA}`,
    }));
  });

  it('after the force-push the story is still verified and still points at the ORIGINAL sha', async () => {
    mockTaskFindOne.mockImplementation(async ({ where }: any) => taskRow(where.story_id, where.story_id === 'STORY-001'
      ? {
        verified_at: new Date('2026-08-01T12:00:00Z'),
        verified_ref: OLD_SHA,
        verification_json: { state: 'verified', commit_sha: OLD_SHA },
      }
      : {}));

    // The rewritten history: the old sha is gone, a new one carries the work.
    const summary = await verifyBuildFromRepo(PROJECT_ID, {
      fetchImpl: githubFetch({
        commits: [{ sha: NEW_SHA, message: 'squashed: everything\n\nStory: STORY-002' }],
      }),
    });

    const story = summary.stories.find((s) => s.story_id === 'STORY-001')!;
    expect(story.state).toBe('verified');
    // THE ASSERTION THAT MATTERS FOR XP: the evidence reference does not move,
    // so `STORY-001@aaa…` still finds the row that was actually awarded.
    expect(story.commit_sha).toBe(OLD_SHA);
    expect(story.commit_sha).not.toBe(NEW_SHA);
  });

  it('does not double-award when the same work re-verifies under a new sha', async () => {
    mockTaskFindOne.mockImplementation(async ({ where }: any) => taskRow(where.story_id, where.story_id === 'STORY-001'
      ? { verified_at: new Date('2026-08-01T12:00:00Z'), verified_ref: OLD_SHA }
      : {}));

    await verifyBuildFromRepo(PROJECT_ID, {
      fetchImpl: githubFetch({
        commits: [{ sha: NEW_SHA, message: 'STORY-001: squashed\n\nStory: STORY-001' }],
      }),
    });

    // It re-verifies live under the new sha, and that is fine — but the task
    // already carried verified_at, so no second award is recorded.
    const forStoryOne = mockRecordEvidence.mock.calls.filter((c) => c[0].sourceRef.startsWith('STORY-001@'));
    expect(forStoryOne).toHaveLength(0);
  });
});

// ── the read side, which is where all three were visible ────────────────────

describe('the DTO refuses to show verified work as undone, whatever the blob says', () => {
  /**
   * Defence in depth. The write-side latch keeps the stored blob honest; this
   * one keeps the SCREEN honest even for a blob written by an older release, a
   * replay, or some future caller that forgets. Every display surface goes
   * through this function.
   */
  const LATCH = {
    verified_at: '2026-08-01T12:00:00Z',
    verified_by: 'build_pipeline:repo_verification',
    verified_ref: OLD_SHA,
  };

  it('a blob saying not_started on a verified task renders as verified', () => {
    const dto = toTaskVerificationDto(
      { state: 'not_started', criteria_total: 2, criteria_passed: 0, outstanding: ['a', 'b'], checked_at: '2026-08-14T09:00:00Z' },
      LATCH,
    )!;
    expect(dto.state).toBe('verified');
    expect(dto.latched).toBe(true);
    expect(dto.live_state).toBe('not_started');
    expect(dto.outstanding).toEqual([]);
    expect(dto.commit_sha).toBe(OLD_SHA);
  });

  it('a verified task whose blob was LOST entirely still renders as verified', () => {
    // Would otherwise read as "never synced" — erasing a completion we hold the
    // record for.
    const dto = toTaskVerificationDto(null, LATCH)!;
    expect(dto.state).toBe('verified');
    expect(dto.latched).toBe(true);
    expect(dto.checked_at).toBe('2026-08-01T12:00:00.000Z');
  });

  it('an unverified task with no blob is still null — the latch invents nothing', () => {
    expect(toTaskVerificationDto(null, { verified_at: null })).toBeNull();
    expect(toTaskVerificationDto(null)).toBeNull();
  });

  it('an unverified task keeps its honest in-progress verdict', () => {
    const dto = toTaskVerificationDto(
      { state: 'submitted', criteria_total: 4, criteria_passed: 3, outstanding: ['the 401 path'] },
      { verified_at: null },
    )!;
    expect(dto.state).toBe('submitted');
    expect(dto.latched).toBe(false);
    expect(dto.outstanding).toEqual(['the 401 path']);
  });

  it('an unrecognised state on an UNVERIFIED task still reads as not_started, never verified', () => {
    const dto = toTaskVerificationDto({ state: 'probably-fine' }, { verified_at: null })!;
    expect(dto.state).toBe('not_started');
  });
});
