const m = {
  query: jest.fn(),
  refresh: jest.fn(),
};
jest.mock('../../../config/database', () => ({ __esModule: true, sequelize: { query: (...a: unknown[]) => m.query(...a) } }));
jest.mock('../../sbp/refreshRepoDocuments', () => ({
  __esModule: true,
  refreshRepoDocuments: (...a: unknown[]) => m.refresh(...a),
}));

import { runPlanRepoSync } from '../planRepoSyncSweep';

/**
 * The sweep's I/O behaviour. The judgement it applies is tested next door in
 * `planRepoSyncDecision.test.ts`; what matters here is that it survives the ways the
 * world goes wrong, and that it cannot quietly report success when it did nothing.
 *
 * The database is mocked for the reason `refreshRepoDocuments.access.test.ts` gives: an
 * unmocked query is green today only because nothing is listening on the database port,
 * and on a machine with Postgres up it becomes real I/O inside a unit test.
 */

const row = (over: Record<string, unknown> = {}) => ({
  domain_key: 'platform',
  project_id: 'p-1',
  has_repo: true,
  has_published_plan: true,
  plan_story_ids: ['s1'],
  board_story_ids: ['s1'],
  ...over,
});

const written = { outcome: 'written', commit_sha: 'abc123', changed_paths: ['docs/STORIES.md'], error_class: null };
const unchanged = { outcome: 'unchanged', commit_sha: null, changed_paths: [], error_class: null };

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  m.refresh.mockResolvedValue(unchanged);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the happy path', () => {
  it('hands every connected project with a published plan to the writer', async () => {
    m.query.mockResolvedValue([row(), row({ domain_key: 'sales', project_id: 'p-2' })]);
    m.refresh.mockResolvedValue(written);

    const s = await runPlanRepoSync({ delayMs: 0 });

    expect(m.refresh).toHaveBeenCalledTimes(2);
    expect(m.refresh.mock.calls[0][0]).toBe('p-1');
    expect(m.refresh.mock.calls[1][0]).toBe('p-2');
    expect(s).toMatchObject({ attempted: 2, written: 2, unchanged: 0, skipped: 0, failed: 0 });
  });

  it('passes one correlation id to every project in the run, so a sweep can be traced end to end', async () => {
    m.query.mockResolvedValue([row(), row({ project_id: 'p-2' })]);
    await runPlanRepoSync({ delayMs: 0, correlationId: 'corr-fixed' });
    expect(m.refresh.mock.calls[0][1]).toEqual({ correlationId: 'corr-fixed' });
    expect(m.refresh.mock.calls[1][1]).toEqual({ correlationId: 'corr-fixed' });
  });

  it('counts an unchanged repo as the steady state, not as work', async () => {
    m.query.mockResolvedValue([row()]);
    const s = await runPlanRepoSync({ delayMs: 0 });
    expect(s).toMatchObject({ attempted: 1, written: 0, unchanged: 1 });
  });
});

describe('what it refuses to touch', () => {
  it('never calls the writer for a project with no repo or no published plan', async () => {
    m.query.mockResolvedValue([
      row({ project_id: 'no-repo', has_repo: false }),
      row({ project_id: 'no-plan', has_published_plan: false }),
    ]);
    const s = await runPlanRepoSync({ delayMs: 0 });
    expect(m.refresh).not.toHaveBeenCalled();
    expect(s).toMatchObject({ attempted: 0, skipped: 2, written: 0 });
  });

  it('counts read-only access as skipped rather than failed, because it is a known state', async () => {
    m.query.mockResolvedValue([row()]);
    m.refresh.mockResolvedValue({ outcome: 'pull_only', commit_sha: null, changed_paths: [], error_class: 'NoPushAccess' });
    const s = await runPlanRepoSync({ delayMs: 0 });
    expect(s).toMatchObject({ failed: 0, skipped: 1 });
  });
});

describe('failure paths', () => {
  it('rethrows a failed project query, so the run is recorded as an error and not a silent success', async () => {
    m.query.mockRejectedValue(new Error('relation does not exist'));
    await expect(runPlanRepoSync({ delayMs: 0 })).rejects.toThrow('relation does not exist');
    expect(m.refresh).not.toHaveBeenCalled();
  });

  it('counts a reported write failure without stopping the sweep', async () => {
    m.query.mockResolvedValue([row({ project_id: 'bad' }), row({ project_id: 'good' })]);
    m.refresh
      .mockResolvedValueOnce({ outcome: 'write_failed', commit_sha: null, changed_paths: [], error_class: 'RateLimited' })
      .mockResolvedValueOnce(written);
    const s = await runPlanRepoSync({ delayMs: 0 });
    expect(s).toMatchObject({ attempted: 2, failed: 1, written: 1 });
  });

  it('survives a writer that throws, which its own contract says it never does, and still reaches the next project', async () => {
    m.query.mockResolvedValue([row({ project_id: 'throws' }), row({ project_id: 'good' })]);
    m.refresh.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(written);
    const s = await runPlanRepoSync({ delayMs: 0 });
    expect(s).toMatchObject({ failed: 1, written: 1 });
    expect(m.refresh).toHaveBeenCalledTimes(2);
  });

  it('does nothing and reports nothing when there are no agent domains at all', async () => {
    m.query.mockResolvedValue([]);
    const s = await runPlanRepoSync({ delayMs: 0 });
    expect(s).toMatchObject({ attempted: 0, written: 0, skipped: 0, failed: 0, drifted: 0 });
  });
});

describe('bounds', () => {
  it('takes at most `limit` projects in one run', async () => {
    m.query.mockResolvedValue([row({ project_id: 'a' }), row({ project_id: 'b' }), row({ project_id: 'c' })]);
    const s = await runPlanRepoSync({ delayMs: 0, limit: 2 });
    expect(m.refresh).toHaveBeenCalledTimes(2);
    expect(s.attempted).toBe(2);
  });

  it('counts drifted projects separately from the push, because drift is a republish debt this job cannot pay', async () => {
    m.query.mockResolvedValue([row({ board_story_ids: ['s1', 's2-new'] })]);
    const s = await runPlanRepoSync({ delayMs: 0 });
    expect(s.drifted).toBe(1);
    // It still delivers the plan that IS published rather than withholding it.
    expect(m.refresh).toHaveBeenCalledTimes(1);
  });

  it('tolerates null id arrays from the query without crashing', async () => {
    m.query.mockResolvedValue([row({ plan_story_ids: null, board_story_ids: null })]);
    const s = await runPlanRepoSync({ delayMs: 0 });
    expect(s).toMatchObject({ attempted: 1, drifted: 0 });
  });
});

describe('idempotency', () => {
  it('a second run against an unchanged repo writes nothing, because the writer hashes every file', async () => {
    m.query.mockResolvedValue([row()]);
    m.refresh.mockResolvedValueOnce(written).mockResolvedValueOnce(unchanged);

    const first = await runPlanRepoSync({ delayMs: 0 });
    const second = await runPlanRepoSync({ delayMs: 0 });

    expect(first).toMatchObject({ written: 1, unchanged: 0 });
    expect(second).toMatchObject({ written: 0, unchanged: 1 });
  });
});
