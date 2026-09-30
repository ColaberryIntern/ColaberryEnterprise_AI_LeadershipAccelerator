/**
 * WHEN THE PROGRESS FILE CANNOT BE READ, SAY SO — DO NOT LEAVE THE LAST VERDICT
 * STANDING AS IF IT WERE STILL TRUE.
 *
 * Found live in production on 2026-08-17. A student pushed a
 * `.colaberry/progress.json` with no top-level `schema_version` and no
 * `stories` array. The loop logged `sbp_verification_progress_rejected` twice
 * and returned early, writing nothing at all — so `verification_json` kept a
 * verdict from hours earlier that read:
 *
 *     "None of the 5 acceptance criteria are marked as passing yet."
 *
 * That sentence is not what happened. What happened is "we could not read your
 * progress file". She spent an evening re-verifying code that was already
 * correct, because the platform told her the criteria were failing.
 *
 * `ProgressParseFailure.reason` is documented as "One sentence a student can
 * act on. Rendered in the portal verbatim." On this path it reached the log and
 * the sync response and never the student. These tests pin the fix.
 *
 * THE INVARIANTS THIS PATH MUST NOT BREAK, each asserted below:
 *   - verification NEVER revokes — `verified_at` is a one-way latch and an
 *     unreadable file is the weakest possible evidence there is
 *   - no XP, no evidence rows, ever, on a read we could not perform
 *   - no story state is invented or advanced — "we could not read it" is not
 *     "nothing is done", which is the exact confusion that caused the harm
 *   - idempotent — two rejected syncs leave byte-identical state
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
import { annotateReadError } from '../verificationLatch';
import { toTaskVerificationDto } from '../../../projects/projectTreeDto';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const ENROLLMENT_ID = '22222222-2222-2222-2222-222222222222';
const SHA = 'f'.repeat(40);

/** Her build, reduced: one story, five criteria. */
const FIVE = [
  'The signup form rejects a duplicate email',
  'A confirmed member appears on the roster',
  'The roster is paginated at 25',
  'An unauthenticated caller gets 401',
  'Every write is audit-logged',
];
const PLAN = { version: 7, plan: { stories: [{ id: 'STORY-001', acceptance: FIVE }] } };

/**
 * THE FILE FROM PRODUCTION. No `schema_version`, no `stories` — exactly the two
 * Zod issues the live log recorded:
 *   schema_version: Invalid input: expected number, received undefined
 *   stories: Invalid input: expected array, received undefined
 */
const MANGLED = JSON.stringify({ project: 'Roster', progress: [{ story: 'STORY-001', done: true }] });

/** The stale verdict her row was actually carrying when she looked at the page. */
const STALE_VERDICT = {
  state: 'in_progress',
  criteria_total: 5,
  criteria_passed: 0,
  outstanding: FIVE,
  commit_sha: null,
  commit_at: null,
  reasons: ['None of the 5 acceptance criteria are marked as passing yet.'],
  rejected_claims: [],
  checked_at: '2026-08-17T14:00:00.000Z',
};

function githubFetch(progress: string | null = MANGLED) {
  return jest.fn(async (url: string) => {
    const path = String(url);
    const json = (body: unknown, s = 200): any => ({
      ok: s >= 200 && s < 300,
      status: s,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: { get: () => null },
    });
    if (path.includes('/contents/')) {
      return progress === null
        ? json({ message: 'Not Found' }, 404)
        : json({ content: Buffer.from(progress, 'utf8').toString('base64') });
    }
    if (/\/commits\/[0-9a-f]{40}/.test(path)) {
      return json({
        sha: SHA,
        commit: { message: 'STORY-001: roster', author: { name: 'S', date: '2026-08-17T12:00:00Z' } },
        files: [{ filename: 'src/roster.ts' }],
      });
    }
    if (path.includes('/commits?')) {
      return json([{ sha: SHA, commit: { message: 'STORY-001: roster', author: { date: '2026-08-17T12:00:00Z' } } }]);
    }
    return json({ message: 'Not Found' }, 404);
  }) as unknown as typeof fetch;
}

const taskRow = (storyId: string, over: Record<string, unknown> = {}) => ({
  id: `task-${storyId}`,
  story_id: storyId,
  verified_at: null,
  verified_by: null,
  verified_ref: null,
  verification_json: storyId === 'STORY-001' ? { ...STALE_VERDICT } : null,
  ...over,
});

/** Everything written to `verification_json` on this run, by story. */
const writes = (): Record<string, any> => Object.fromEntries(
  mockTaskUpdate.mock.calls.map((c) => [String(c[1].where.id).replace('task-', ''), c[0].verification_json]),
);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GITHUB_TOKEN = 'test-token';
  mockProjectFindByPk.mockResolvedValue({ id: PROJECT_ID, enrollment_id: ENROLLMENT_ID });
  mockConnectionFindOne.mockResolvedValue({ repo_owner: 'ColaberryIntern', repo_name: 'roster-abc12345' });
  mockGetPublishedPlan.mockResolvedValue(PLAN);
  mockTaskFindOne.mockImplementation(async ({ where }: any) => taskRow(where.story_id));
  mockTaskUpdate.mockResolvedValue([1]);
  mockMarkVerified.mockResolvedValue({ id: 'x' });
  mockRecordEvidence.mockResolvedValue({ builder_xp: 0, created: true });
  mockGetBudgetPerUnitXp.mockResolvedValue({ per_unit: 400, budget: 800, reason: null });
});

describe('(a) an unreadable progress file reaches the student, not just the log', () => {
  it('still reports the failure to the caller, unchanged', async () => {
    const summary = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });
    expect(summary.ok).toBe(false);
    expect(summary.error_class).toBe('ProgressFileSchemaMismatch');
    expect(summary.reason).toMatch(/does not match the expected shape/);
  });

  it('persists the student-facing reason onto the story the portal reads', async () => {
    await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });

    const written = writes()['STORY-001'];
    expect(written).toBeDefined();
    expect(written.read_error).toMatch(/does not match the expected shape/);
    expect(written.read_error_class).toBe('ProgressFileSchemaMismatch');
  });

  it('retires the stale sentence that sent her back to redo finished work', async () => {
    await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });

    const written = writes()['STORY-001'];
    // The old reason was not merely out of date, it was a different claim about
    // the world: "your criteria are failing" instead of "we cannot read your
    // file". Leaving it in place is what cost her the evening.
    expect(written.reasons).not.toContain('None of the 5 acceptance criteria are marked as passing yet.');
    expect(written.reasons[0]).toMatch(/does not match the expected shape/);
  });

  it('surfaces it through the same read path the workspace page polls', () => {
    const written = annotateReadError(STALE_VERDICT, {
      error_class: 'ProgressFileSchemaMismatch',
      reason: '.colaberry/progress.json does not match the expected shape.',
    });
    const dto = toTaskVerificationDto(written, { verified_at: null });
    expect(dto?.read_error).toMatch(/does not match the expected shape/);
    expect(dto?.read_error_class).toBe('ProgressFileSchemaMismatch');
  });

  it('does not invent progress — the state, counts and outstanding list stand as they were', () => {
    const written = annotateReadError(STALE_VERDICT, {
      error_class: 'ProgressFileSchemaMismatch',
      reason: 'unreadable',
    });
    // "We could not read it" is not "nothing is done". Nothing here may move.
    expect(written.state).toBe('in_progress');
    expect(written.criteria_passed).toBe(0);
    expect(written.criteria_total).toBe(5);
    expect(written.outstanding).toEqual(FIVE);
    // No new verdict was reached, so the timestamp of the last real one holds.
    expect(written.checked_at).toBe('2026-08-17T14:00:00.000Z');
  });

  it('clears itself the moment a readable file arrives', async () => {
    const good = JSON.stringify({
      schema_version: 2,
      stories: [{ id: 'STORY-001', criteria: FIVE.map((text) => ({ text, passed: false })) }],
    });
    await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch(good) });
    const written = writes()['STORY-001'];
    expect(written.read_error ?? null).toBeNull();
  });
});

describe('(b) verification never revokes — a story already verified is untouched', () => {
  beforeEach(() => {
    mockTaskFindOne.mockImplementation(async ({ where }: any) => taskRow(where.story_id, {
      verified_at: new Date('2026-08-16T09:00:00.000Z'),
      verified_by: 'build_pipeline:repo_verification',
      verified_ref: SHA,
      verification_json: {
        ...STALE_VERDICT, state: 'verified', criteria_passed: 5, outstanding: [], commit_sha: SHA, reasons: [],
      },
    }));
  });

  it('writes nothing at all onto a verified story', async () => {
    await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });
    expect(writes()['STORY-001']).toBeUndefined();
  });

  it('never calls anything that could move verified_at, verified_by or verified_ref', async () => {
    await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });
    expect(mockMarkVerified).not.toHaveBeenCalled();
    for (const call of mockTaskUpdate.mock.calls) {
      expect(Object.keys(call[0])).toEqual(['verification_json']);
    }
  });

  it('leaves a latched record alone rather than annotating it', () => {
    const verified = { ...STALE_VERDICT, state: 'verified' as const, outstanding: [], reasons: [] };
    const out = annotateReadError(verified, { error_class: 'ProgressFileSchemaMismatch', reason: 'unreadable' });
    expect(out).toEqual(verified);
  });
});

describe('(c) idempotency — two rejected syncs leave the same end state', () => {
  it('produces byte-identical records on the second run', async () => {
    const first = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });
    const afterFirst = writes();

    // The second run reads the rows exactly as the first run left them.
    mockTaskFindOne.mockImplementation(async ({ where }: any) =>
      taskRow(where.story_id, { verification_json: afterFirst[where.story_id] ?? null }));
    mockTaskUpdate.mockClear();

    const second = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });
    const afterSecond = writes();

    expect(second.error_class).toBe(first.error_class);
    expect(JSON.stringify(afterSecond)).toBe(JSON.stringify(afterFirst));
  });

  it('is a fixed point — annotating an already-annotated record changes nothing', () => {
    const err = { error_class: 'ProgressFileSchemaMismatch', reason: 'unreadable' };
    const once = annotateReadError(STALE_VERDICT, err);
    expect(annotateReadError(once, err)).toEqual(once);
  });
});

describe('(d) nothing is awarded on a read we could not perform', () => {
  it('records no evidence and moves no XP', async () => {
    const summary = await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });
    expect(mockRecordEvidence).not.toHaveBeenCalled();
    expect(mockMarkVerified).not.toHaveBeenCalled();
    expect(summary.rollup.xp_awarded).toBe(0);
    expect(summary.rollup.newly_verified).toEqual([]);
  });

  it('does not even price the build — no budget is resolved on a rejected read', async () => {
    await verifyBuildFromRepo(PROJECT_ID, { fetchImpl: githubFetch() });
    expect(mockGetBudgetPerUnitXp).not.toHaveBeenCalled();
  });
});
