/**
 * What a refused write TEACHES the platform.
 *
 * A sync that cannot commit is the moment GitHub tells us, in as many words,
 * that the platform does not have push on this repo. That answer used to be
 * thrown away: the connection went on claiming writability, the next sync queued
 * the same doomed commit, and the student saw nothing at all — no documents, no
 * warning, no reason. `writeAccessOf` kept returning null, which is precisely
 * why the read-only warning shipped on 2026-08-17 has never rendered for anyone.
 *
 * So: a permission refusal is recorded as `pull_only`. Nothing else is, because
 * a timeout or a rate limit says nothing about permissions and demoting a live
 * build on one would break it to fix a reporting problem.
 */
const mockWrite = jest.fn();
const mockRecordWriteAccess = jest.fn();

jest.mock('../planStore', () => ({
  __esModule: true,
  getPublishedPlan: jest.fn(async () => ({
    plan: { stories: [] }, version: 3, plan_sha256: 'abc', published_at: '2026-08-01T00:00:00.000Z',
  })),
}));

jest.mock('../workspaceRepo', () => ({
  __esModule: true,
  repoForProject: jest.fn(async () => ({
    owner: 'a-student', repo: 'nightshift', url: 'https://github.com/a-student/nightshift',
  })),
}));

jest.mock('../../../models/Project', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(async () => ({ id: 'prj-1', enrollment_id: 'enr-1' })) },
}));

// The refresh now asks GitHub's reported write access before rendering, so
// STORY-000's doc can only claim a seeded progress file on a repo we can
// actually write to. `pull_only` is the honest answer for the repo this suite
// describes — a refused write is the whole subject of the file.
jest.mock('../repoWriteAccess', () => ({
  __esModule: true,
  repoWriteAccessForProject: jest.fn(async () => 'pull_only'),
}));

jest.mock('../renderDocs', () => ({
  __esModule: true,
  renderDocs: jest.fn(() => [{ path: 'docs/PLAN.md', content: '# Plan' }]),
  isAllowedPath: jest.fn(() => true),
}));

jest.mock('../buildProgressSnapshot', () => ({
  __esModule: true,
  loadBuildProgress: jest.fn(async () => ({ progress: {}, baselineByStory: {} })),
}));

jest.mock('../scheduleForEnrollment', () => ({
  __esModule: true,
  scheduleForEnrollment: jest.fn(async () => null),
}));

// The error CLASS must be the real one — `err instanceof RepoWriteError` is what
// the code under test branches on.
jest.mock('../repoWriter', () => ({
  __esModule: true,
  ...jest.requireActual('../repoWriter'),
  writeDocsToRepo: (...a: any[]) => mockWrite(...a),
  readRepoManifest: jest.fn(async () => null),
}));

jest.mock('../repoConnect/repoConnectService', () => ({
  __esModule: true,
  recordWriteAccess: (...a: any[]) => mockRecordWriteAccess(...a),
}));

import { refreshRepoDocuments } from '../refreshRepoDocuments';
import { RepoWriteError } from '../repoWriter';

const PRJ = 'prj-1';

beforeEach(() => {
  jest.clearAllMocks();
  mockRecordWriteAccess.mockResolvedValue(true);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('a refused write is recorded, not discarded', () => {
  it('records pull_only when GitHub says the platform cannot push', async () => {
    mockWrite.mockRejectedValue(new RepoWriteError('NoPushAccess', 'refused'));

    const result = await refreshRepoDocuments(PRJ);

    expect(result.outcome).toBe('write_failed');
    expect(result.error_class).toBe('NoPushAccess');
    expect(mockRecordWriteAccess).toHaveBeenCalledWith(PRJ, false);
  });

  it('still never throws — the pull is what the student asked for', async () => {
    mockWrite.mockRejectedValue(new RepoWriteError('NoPushAccess', 'refused'));
    // Even the bookkeeping write failing must not break the contract.
    mockRecordWriteAccess.mockRejectedValue(new Error('db down'));

    await expect(refreshRepoDocuments(PRJ)).resolves.toMatchObject({ outcome: 'write_failed' });
  });
});

describe('everything else leaves the recorded permission alone', () => {
  it.each([
    ['UpstreamTimeout', 'a slow minute at GitHub'],
    ['UpstreamError', 'a 500, or a rate limit'],
    ['ConflictRetriesExhausted', 'a busy branch'],
    ['ConfigError', 'our own missing token'],
  ] as const)('does not demote the connection on %s (%s)', async (errorClass) => {
    mockWrite.mockRejectedValue(new RepoWriteError(errorClass, 'nope'));

    const result = await refreshRepoDocuments(PRJ);

    expect(result.error_class).toBe(errorClass);
    expect(mockRecordWriteAccess).not.toHaveBeenCalled();
  });

  it('records nothing at all on a successful write', async () => {
    mockWrite.mockResolvedValue({
      committed: true, commitSha: 'deadbeef', changedPaths: ['docs/PLAN.md'], skippedUnchanged: 0,
    });

    const result = await refreshRepoDocuments(PRJ);

    expect(result.outcome).toBe('written');
    expect(mockRecordWriteAccess).not.toHaveBeenCalled();
  });
});
