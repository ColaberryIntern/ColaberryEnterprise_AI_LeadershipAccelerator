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
const mockRecordPages = jest.fn();

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
jest.mock('../../repoConnect/pagesUrlService', () => ({
  recordPagesUrlWithGrace: (...a: any[]) => mockRecordPages(...a),
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
  mockRecordPages.mockResolvedValue({ outcome: 'not_live_yet', url: null, from_api: false });
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
    // It IS recorded in the ledger now, unlike before. The receipt proves GitHub
    // can reach us — which is what the setup panel reads to show the webhook as
    // registered — even though the contents were our own echo and earn no
    // verification pass.
    expect(mockQuery).toHaveBeenCalled();
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

/**
 * THE RULE THIS WHOLE FEATURE LIVES UNDER.
 *
 * A first Pages build takes a minute or more, custom domains exist, students
 * decline hosting, and Pages on a private repo needs a paid plan. If any of
 * those could block the latch we would have rebuilt the permanently-stuck story
 * that the STORY-000 spec fix removed — the same bug wearing a different hat.
 */
describe('hosting can never gate a story', () => {
  it('verifies normally when the Pages check throws outright', async () => {
    mockRecordPages.mockRejectedValue(new Error('pages api exploded'));
    const res = await handlePushForVerification(push());
    expect(res.outcome).toBe('verified');
    expect(mockVerifyBuildFromRepo).toHaveBeenCalledTimes(1);
  });

  it('does not wait for the Pages check before verifying', async () => {
    // A probe that never settles must not hold the story hostage.
    let settle: () => void = () => {};
    mockRecordPages.mockReturnValue(new Promise<void>((r) => { settle = r; }));

    const res = await handlePushForVerification(push());
    expect(res.outcome).toBe('verified');
    expect(mockVerifyBuildFromRepo).toHaveBeenCalledTimes(1);
    settle();
  });

  it('still runs the hosting check for a normal push', async () => {
    await handlePushForVerification(push());
    expect(mockRecordPages).toHaveBeenCalledWith(
      PROJECT_ID, 'ColaberryIntern', 'AcceleratorTesting', expect.any(Object),
    );
  });

  it('does not check hosting for a push we are ignoring as our own', async () => {
    await handlePushForVerification(push({
      commits: [{ message: `${BOT_COMMIT_PREFIX} sync build plan` }],
    }));
    expect(mockRecordPages).not.toHaveBeenCalled();
  });
});

/**
 * GitHub fires a `ping` the instant a webhook is created. Accepting it is the
 * difference between a student knowing the scariest step of the setup worked and
 * having to take it on faith until their next push.
 *
 * Before this, the handler returned on "no commits" BEFORE claiming the
 * delivery, so a ping left no trace at all — and the panel, which reads the
 * ledger to decide whether the hook is live, could not go green until a real
 * push happened to arrive.
 */
describe('ping — the receipt IS the payload', () => {
  const ping = () => push({ event: 'ping', commits: [] });

  it('records the delivery so the panel can show the hook as registered', async () => {
    const res = await handlePushForVerification(ping());
    expect(res).toEqual({ outcome: 'ping', project_id: PROJECT_ID });
    // Claimed (INSERT) and closed (UPDATE) — the row exists either way.
    expect(mockQuery).toHaveBeenCalled();
  });

  it('does not run a verification pass — there is nothing in it to verify', async () => {
    await handlePushForVerification(ping());
    expect(mockVerifyBuildFromRepo).not.toHaveBeenCalled();
  });

  it('does not count as the student pushing work', async () => {
    // The ledger closes it as `ping`, and the panel counts only `verified` rows
    // as "your pushes are arriving". A ping must never claim their work landed.
    await handlePushForVerification(ping());
    const closed = mockQuery.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(closed).toContain('ping');
    expect(closed).not.toContain('"verified"');
  });

  it('is deduped like any other delivery', async () => {
    claimLoses();
    const res = await handlePushForVerification(ping());
    expect(res.outcome).toBe('duplicate');
  });

  it('is ignored for a repo we do not know', async () => {
    mockConnectionFindOne.mockResolvedValue(null);
    expect((await handlePushForVerification(ping())).outcome).toBe('no_project');
  });
});
