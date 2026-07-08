// Unit tests for the student workspace repo service. Models + GitHub API (fetch)
// are stubbed — no DB, no network. Mirrors githubIntegrationService.test.ts.

jest.mock('../../models', () => ({
  GitHubConnection: { findOne: jest.fn(), create: jest.fn() },
  Enrollment: { findByPk: jest.fn() },
}));

import { GitHubConnection, Enrollment } from '../../models';
import { provisionWorkspaceRepo, syncWorkspaceRepo, getWorkspaceRepo } from '../studentWorkspaceService';

const mockConn = (over: any = {}) => ({
  repo_url: 'https://github.com/ColaberryIntern/jane-doe-workspace-abc123',
  repo_owner: 'ColaberryIntern',
  repo_name: 'jane-doe-workspace-abc123',
  status_json: { provisioned: true, student_github_login: 'janedoe' },
  file_count: 0,
  last_sync_at: null,
  commit_summary_json: [],
  save: jest.fn().mockResolvedValue(undefined),
  ...over,
});

const ghRes = (status: number, json: any = {}) => ({ status, json: async () => json });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GITHUB_TOKEN = 'plat-token';
  process.env.GITHUB_WORKSPACE_ORG = 'ColaberryIntern';
  (global as any).fetch = jest.fn();
});

describe('provisionWorkspaceRepo', () => {
  it('creates the repo, adds the collaborator, and records the connection', async () => {
    (Enrollment.findByPk as jest.Mock).mockResolvedValue({ id: 'abc123def', full_name: 'Jane Doe', email: 'jane@x.com' });
    (GitHubConnection.findOne as jest.Mock)
      .mockResolvedValueOnce(null)            // no existing connection
      .mockResolvedValueOnce(mockConn());     // getWorkspaceRepo read-back
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(ghRes(201, { name: 'jane-doe-workspace-abc123' })) // create repo
      .mockResolvedValueOnce(ghRes(201, {}));                                    // add collaborator
    (GitHubConnection.create as jest.Mock).mockResolvedValue({});

    const out = await provisionWorkspaceRepo('abc123def', 'janedoe');

    expect(out.provisioned).toBe(true);
    expect(out.repo_owner).toBe('ColaberryIntern');
    // repo create + collaborator add both called
    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[0][0]).toContain('/orgs/ColaberryIntern/repos');
    expect(calls[0][1].method).toBe('POST');
    expect(calls[1][0]).toContain('/collaborators/janedoe');
    expect(calls[1][1].method).toBe('PUT');
    expect(GitHubConnection.create).toHaveBeenCalled();
  });

  it('is idempotent when the repo already exists (422 name-exists → proceeds)', async () => {
    (Enrollment.findByPk as jest.Mock).mockResolvedValue({ id: 'abc123def', full_name: 'Jane Doe', email: 'jane@x.com' });
    (GitHubConnection.findOne as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockConn());
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(ghRes(422, { errors: [{ message: 'name already exists on this account' }] }))
      .mockResolvedValueOnce(ghRes(204, {}));  // already a collaborator
    (GitHubConnection.create as jest.Mock).mockResolvedValue({});

    const out = await provisionWorkspaceRepo('abc123def', '@janedoe');
    expect(out.provisioned).toBe(true);
    // strips a leading @ from the login
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain('/collaborators/janedoe');
  });

  it('reuses the existing repo name so re-provision does not rename', async () => {
    (Enrollment.findByPk as jest.Mock).mockResolvedValue({ id: 'abc123def', full_name: 'Jane Doe', email: 'jane@x.com' });
    const existing = mockConn({ repo_name: 'custom-existing-name' });
    (GitHubConnection.findOne as jest.Mock)
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(existing);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(ghRes(201, {}))
      .mockResolvedValueOnce(ghRes(204, {}));

    await provisionWorkspaceRepo('abc123def', 'janedoe');
    expect((global.fetch as jest.Mock).mock.calls[0][1].body).toContain('custom-existing-name');
    expect(existing.save).toHaveBeenCalled();
  });

  it('throws when GITHUB_TOKEN is missing', async () => {
    delete process.env.GITHUB_TOKEN;
    (Enrollment.findByPk as jest.Mock).mockResolvedValue({ id: 'abc', full_name: 'Jane', email: 'j@x.com' });
    (GitHubConnection.findOne as jest.Mock).mockResolvedValue(null);
    await expect(provisionWorkspaceRepo('abc', 'janedoe')).rejects.toThrow(/GITHUB_TOKEN/);
  });

  it('throws when no github login is given', async () => {
    await expect(provisionWorkspaceRepo('abc', '  ')).rejects.toThrow(/GitHub username/);
  });
});

describe('syncWorkspaceRepo', () => {
  it('pulls tree + commits and saves them onto the connection', async () => {
    const conn = mockConn();
    (GitHubConnection.findOne as jest.Mock).mockResolvedValue(conn);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(ghRes(200, { default_branch: 'main' }))                              // repo info
      .mockResolvedValueOnce(ghRes(200, { tree: [{ type: 'blob', path: 'src/app.ts' }, { type: 'tree', path: 'src' }] })) // tree
      .mockResolvedValueOnce(ghRes(200, [{ sha: 'deadbeef123', commit: { message: 'init\nbody', author: { name: 'Jane', date: '2026-07-07' } } }])); // commits

    const out = await syncWorkspaceRepo('abc');
    expect(conn.save).toHaveBeenCalled();
    expect(conn.file_count).toBe(1);            // one blob
    expect(conn.repo_language).toBe('TypeScript');
    expect(out.connected).toBe(true);
  });

  it('throws when there is no provisioned repo', async () => {
    (GitHubConnection.findOne as jest.Mock).mockResolvedValue(null);
    await expect(syncWorkspaceRepo('abc')).rejects.toThrow(/provision/);
  });
});

describe('getWorkspaceRepo', () => {
  it('returns not-connected when there is no row', async () => {
    (GitHubConnection.findOne as jest.Mock).mockResolvedValue(null);
    expect(await getWorkspaceRepo('abc')).toEqual({ connected: false, provisioned: false });
  });
});
