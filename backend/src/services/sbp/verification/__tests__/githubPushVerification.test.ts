/**
 * The push→verification trigger, with GitHub, Postgres and the verification pass
 * all mocked.
 *
 * The properties worth the most here:
 *   - A REDELIVERY DOES NOT RE-RUN THE PASS. GitHub retries; a retry that
 *     re-reads the repo spends a student's rate limit re-deciding a settled
 *     question.
 *   - OUR OWN COMMITS DO NOT TRIGGER US. The pipeline writes into the student's
 *     repo; if that write triggered a sync that could write again, the loop is
 *     the bug.
 *   - A MIXED PUSH IS STILL THE STUDENT'S. Dropping real work because our bot
 *     happened to commit in the same push would lose a completion.
 */
const mockConnectionFindOne = jest.fn();
const mockQuery = jest.fn();
const mockVerifyBuildFromRepo = jest.fn();

jest.mock('../../../../models/GitHubConnection', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockConnectionFindOne(...a) },
}));
jest.mock('../../../../config/database', () => ({
  sequelize: { query: (...a: any[]) => mockQuery(...a) },
}));
jest.mock('../buildVerificationService', () => ({
  verifyBuildFromRepo: (...a: any[]) => mockVerifyBuildFromRepo(...a),
}));

import { handlePushForVerification, isBotOnlyPush } from '../githubPushVerification';
import { BOT_COMMIT_PREFIX } from '../../repoWriter';

const PROJECT_ID = '40a5cea6-ace8-4734-8220-7e62df2111e5';

/** A claim that succeeds (the INSERT ... RETURNING came back with a row). */
const claimWins = () => mockQuery.mockResolvedValue([{ delivery_id: 'd1' }]);
/** A claim that loses to an earlier delivery of the same id. */
const claimLoses = () => mockQuery.mockResolvedValue([]);

const okSummary = {
  ok: true,
  error_class: null,
  rollup: { stories_verified: 1, newly_verified: ['STORY-001'], xp_awarded: 0 },
};

const push = (over: Partial<Parameters<typeof handlePushForVerification>[0]> = {}) => ({
  deliveryId: 'd1',
  event: 'push',
  owner: 'ColaberryIntern',
  repo: 'AcceleratorTesting',
  commits: [{ message: 'STORY-001: add the roster endpoint' }],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockConnectionFindOne.mockResolvedValue({ project_id: PROJECT_ID });
  mockVerifyBuildFromRepo.mockResolvedValue(okSummary);
  claimWins();
});

describe('isBotOnlyPush', () => {
  it('is true when every commit carries the bot prefix', () => {
    expect(isBotOnlyPush([
      { message: `${BOT_COMMIT_PREFIX} sync build plan — 3 files` },
      { message: `${BOT_COMMIT_PREFIX} sync build plan — 1 file` },
    ])).toBe(true);
  });

  it('is FALSE when a student commit rides along with ours', () => {
    // The student's work in a mixed push is real. Ignoring it because our bot
    // committed in the same push would lose a genuine completion.
    expect(isBotOnlyPush([
      { message: `${BOT_COMMIT_PREFIX} sync build plan — 3 files` },
      { message: 'STORY-002: add the 401 path' },
    ])).toBe(false);
  });

  it('is false for an empty list rather than vacuously true', () => {
    // "Nothing to judge" is not "all ours". Answering true would silently
    // swallow every push whose payload omitted commits.
    expect(isBotOnlyPush([])).toBe(false);
  });

  it('tolerates leading whitespace and non-string messages', () => {
    expect(isBotOnlyPush([{ message: `  ${BOT_COMMIT_PREFIX} sync` }])).toBe(true);
    expect(isBotOnlyPush([{ message: undefined }])).toBe(false);
    expect(isBotOnlyPush([{ message: 42 as unknown as string }])).toBe(false);
  });

  it('does not match a commit that merely mentions the prefix mid-message', () => {
    expect(isBotOnlyPush([{ message: `reverts ${BOT_COMMIT_PREFIX} sync build plan` }])).toBe(false);
  });
});

describe('handlePushForVerification', () => {
  it('runs a verification pass for a real student push', async () => {
    const res = await handlePushForVerification(push());
    expect(res).toEqual({ outcome: 'verified', project_id: PROJECT_ID });
    expect(mockVerifyBuildFromRepo).toHaveBeenCalledWith(PROJECT_ID, expect.objectContaining({
      correlationId: expect.any(String),
    }));
  });

  it('IDEMPOTENCY: a redelivered delivery id never re-runs the pass', async () => {
    claimLoses();
    const res = await handlePushForVerification(push());
    expect(res.outcome).toBe('duplicate');
    expect(mockVerifyBuildFromRepo).not.toHaveBeenCalled();
  });

  it('ignores a push that is entirely our own bot commits', async () => {
    const res = await handlePushForVerification(push({
      commits: [{ message: `${BOT_COMMIT_PREFIX} sync build plan — 3 files` }],
    }));
    expect(res.outcome).toBe('bot_only');
    expect(mockVerifyBuildFromRepo).not.toHaveBeenCalled();
    // Never even claims a delivery id: there is nothing to be idempotent about.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('still verifies when our bot commit rides along with the student pushing work', async () => {
    const res = await handlePushForVerification(push({
      commits: [
        { message: `${BOT_COMMIT_PREFIX} sync build plan — 2 files` },
        { message: 'STORY-001: add the roster endpoint' },
      ],
    }));
    expect(res.outcome).toBe('verified');
    expect(mockVerifyBuildFromRepo).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a repo bound to no project', async () => {
    mockConnectionFindOne.mockResolvedValue(null);
    const res = await handlePushForVerification(push());
    expect(res).toEqual({ outcome: 'no_project', project_id: null });
    expect(mockVerifyBuildFromRepo).not.toHaveBeenCalled();
  });

  it('does nothing for a branch delete or tag push carrying no commits', async () => {
    const res = await handlePushForVerification(push({ commits: [] }));
    expect(res.outcome).toBe('no_commits');
    expect(mockVerifyBuildFromRepo).not.toHaveBeenCalled();
  });

  it('refuses a delivery with no delivery id rather than running undedupable work', async () => {
    const res = await handlePushForVerification(push({ deliveryId: '' }));
    expect(res.outcome).toBe('no_commits');
    expect(mockVerifyBuildFromRepo).not.toHaveBeenCalled();
  });

  it('FAILS OPEN when the delivery ledger is unavailable', async () => {
    // A dropped push is worse than a duplicated pass: the award layer already
    // makes a second pass harmless, so the safe direction is to run it.
    mockQuery.mockRejectedValue(new Error('relation does not exist'));
    const res = await handlePushForVerification(push());
    expect(res.outcome).toBe('verified');
    expect(mockVerifyBuildFromRepo).toHaveBeenCalledTimes(1);
  });

  it('never throws when the verification pass itself blows up', async () => {
    // GitHub already has its 200 by the time this runs. An exception here would
    // surface as an unhandled rejection, not as anything anybody sees.
    mockVerifyBuildFromRepo.mockRejectedValue(new Error('connection terminated'));
    const res = await handlePushForVerification(push());
    expect(res).toEqual({ outcome: 'failed', project_id: PROJECT_ID });
  });

  it('reports a classified upstream failure without treating it as a defect', async () => {
    // A rate limit is a STATE the pass returns, not a throw.
    mockVerifyBuildFromRepo.mockResolvedValue({
      ok: false, error_class: 'RateLimited',
      rollup: { stories_verified: 0, newly_verified: [], xp_awarded: 0 },
    });
    const res = await handlePushForVerification(push());
    expect(res.outcome).toBe('verified');
  });
});
