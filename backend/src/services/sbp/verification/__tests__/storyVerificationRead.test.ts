/**
 * The narrow read the workspace page polls.
 *
 * The properties worth the most here:
 *   - IT NEVER LEAKS ANOTHER STUDENT'S BUILD. Not-yours, no-such-project and
 *     no-such-story all collapse to the same null, so the endpoint cannot be
 *     used to probe for the existence of somebody else's work.
 *   - AN UNREAD STORY IS NOT A CONFIRMED ONE. A row with no verdict must come
 *     back with `verification: null` so the UI ticks nothing, and must never
 *     read as verified through a missing field.
 *   - THE XP LOOKUP IS SKIPPED UNTIL THE LATCH IS SET, which is what keeps a
 *     five-second poll to a single query for the whole time a student is
 *     actually waiting.
 */
const mockProjectFindByPk = jest.fn();
const mockTaskFindOne = jest.fn();
const mockEvidenceFindOne = jest.fn();

jest.mock('../../../../models/Project', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockProjectFindByPk(...a) },
}));
jest.mock('../../../../models/StudentTask', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockTaskFindOne(...a) },
}));
jest.mock('../../../../models/EvidenceRecord', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockEvidenceFindOne(...a) },
}));

import { readStoryVerification } from '../storyVerificationRead';

const ENROLLMENT = 'aced5b39-0b47-496a-b172-e1f5c042bf8a';
const PROJECT = '40a5cea6-ace8-4734-8220-7e62df2111e5';
const STORY = 'STORY-001';

const ACCEPTANCE = ['the roster endpoint returns 200', 'the 401 path returns problem+json'];

const task = (over: Record<string, unknown> = {}) => ({
  status: 'in_progress',
  verified_at: null,
  verified_by: null,
  verified_ref: null,
  acceptance: ACCEPTANCE,
  verification_json: null,
  ...over,
});

const verdict = (over: Record<string, unknown> = {}) => ({
  state: 'submitted',
  criteria_total: 2,
  criteria_passed: 1,
  outstanding: ['the 401 path returns problem+json'],
  commit_sha: null,
  commit_at: null,
  reasons: ['1 of 2 acceptance criteria are marked as passing.'],
  rejected_claims: [],
  checked_at: '2026-08-15T10:00:00.000Z',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockProjectFindByPk.mockResolvedValue({ enrollment_id: ENROLLMENT });
  mockTaskFindOne.mockResolvedValue(task());
  mockEvidenceFindOne.mockResolvedValue(null);
});

describe('readStoryVerification — ownership', () => {
  it("returns null for another student's project", async () => {
    mockProjectFindByPk.mockResolvedValue({ enrollment_id: 'somebody-else' });
    expect(await readStoryVerification(ENROLLMENT, PROJECT, STORY)).toBeNull();
  });

  it('returns null for a project that does not exist — same answer, deliberately', async () => {
    mockProjectFindByPk.mockResolvedValue(null);
    expect(await readStoryVerification(ENROLLMENT, PROJECT, STORY)).toBeNull();
  });

  it('returns null for a story that is not on this project', async () => {
    mockTaskFindOne.mockResolvedValue(null);
    expect(await readStoryVerification(ENROLLMENT, PROJECT, STORY)).toBeNull();
  });

  it('refuses a blank enrollment without touching the database', async () => {
    expect(await readStoryVerification('', PROJECT, STORY)).toBeNull();
    expect(mockProjectFindByPk).not.toHaveBeenCalled();
  });
});

describe('readStoryVerification — the verdict', () => {
  it('reports an unchecked story as unverified with no verdict at all', async () => {
    const view = await readStoryVerification(ENROLLMENT, PROJECT, STORY);
    expect(view).toMatchObject({ verified_at: null, verification: null, xp_awarded: 0 });
    // The criteria still ship, so the page can render the list before the
    // platform has ever looked at the repo.
    expect(view?.acceptance).toEqual(ACCEPTANCE);
  });

  it('carries the outstanding criteria through verbatim', async () => {
    mockTaskFindOne.mockResolvedValue(task({ verification_json: verdict() }));
    const view = await readStoryVerification(ENROLLMENT, PROJECT, STORY);
    // Verbatim matters: the UI pairs these against `acceptance` by text to decide
    // which boxes are confirmed.
    expect(view?.verification?.outstanding).toEqual(['the 401 path returns problem+json']);
    expect(view?.verification?.state).toBe('submitted');
  });

  it('does not look up XP for an unverified story', async () => {
    mockTaskFindOne.mockResolvedValue(task({ verification_json: verdict() }));
    await readStoryVerification(ENROLLMENT, PROJECT, STORY);
    expect(mockEvidenceFindOne).not.toHaveBeenCalled();
  });

  it('reads banked XP back for a verified story, keyed on the FROZEN sha', async () => {
    mockTaskFindOne.mockResolvedValue(task({
      status: 'complete',
      verified_at: new Date('2026-08-15T11:00:00.000Z'),
      verified_by: 'build_pipeline:repo_verification',
      verified_ref: 'a1b2c3d4e5f6',
      verification_json: verdict({ state: 'verified', criteria_passed: 2, outstanding: [], commit_sha: 'a1b2c3d4e5f6' }),
    }));
    mockEvidenceFindOne.mockResolvedValue({ builder_xp: 25 });

    const view = await readStoryVerification(ENROLLMENT, PROJECT, STORY);
    expect(view?.verified_at).toBe('2026-08-15T11:00:00.000Z');
    expect(view?.xp_awarded).toBe(25);
    expect(mockEvidenceFindOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ source_ref: `${STORY}@a1b2c3d4e5f6` }),
    }));
  });

  it('survives an unreadable evidence table without losing the verification state', async () => {
    // A number on a card is not worth failing the read the student came for.
    mockTaskFindOne.mockResolvedValue(task({
      verified_at: new Date('2026-08-15T11:00:00.000Z'),
      verified_ref: 'a1b2c3d4e5f6',
      verification_json: verdict({ state: 'verified', outstanding: [] }),
    }));
    mockEvidenceFindOne.mockRejectedValue(new Error('relation does not exist'));

    const view = await readStoryVerification(ENROLLMENT, PROJECT, STORY);
    expect(view?.verified_at).toBe('2026-08-15T11:00:00.000Z');
    expect(view?.xp_awarded).toBe(0);
  });

  it('reads a non-array acceptance blob as empty rather than crashing', async () => {
    mockTaskFindOne.mockResolvedValue(task({ acceptance: { nope: true } }));
    expect((await readStoryVerification(ENROLLMENT, PROJECT, STORY))?.acceptance).toEqual([]);
  });

  it('treats an unparseable verified_at as NOT verified', async () => {
    // The generous direction on a field that gates credit is the wrong direction.
    mockTaskFindOne.mockResolvedValue(task({ verified_at: 'not a date' }));
    const view = await readStoryVerification(ENROLLMENT, PROJECT, STORY);
    expect(view?.verified_at).toBeNull();
    expect(mockEvidenceFindOne).not.toHaveBeenCalled();
  });
});
