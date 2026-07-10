/**
 * studentWorkspaceService tests — no DB, no network.
 * Mocks ../../models (GitHubConnection + Enrollment) and global.fetch.
 * Covers: provision happy-path, idempotent 422 name-exists, existing-name
 * reuse, missing-token / missing-login guards, sync, and not-connected reads.
 */

jest.mock('../../models', () => {
  // One in-memory connection row keyed by enrollment_id.
  const rows: Record<string, any> = {};
  function makeRow(defaults: any): any {
    const row: any = {
      ...defaults,
      save: jest.fn(async function (this: any) { return this; }),
    };
    return row;
  }
  return {
    GitHubConnection: {
      _rows: rows,
      _reset: () => { for (const k of Object.keys(rows)) delete rows[k]; },
      _seed: (enrollmentId: string, data: any) => {
        rows[enrollmentId] = makeRow({ enrollment_id: enrollmentId, ...data });
        return rows[enrollmentId];
      },
      findOrCreate: jest.fn(async ({ where, defaults }: any) => {
        const key = where.enrollment_id;
        if (rows[key]) return [rows[key], false];
        rows[key] = makeRow(defaults);
        return [rows[key], true];
      }),
      findOne: jest.fn(async ({ where }: any) => rows[where.enrollment_id] || null),
    },
    Enrollment: {
      findByPk: jest.fn(async (id: string) => (id === 'missing' ? null : { id, full_name: 'Test Student' })),
    },
  };
});

import * as svc from '../studentWorkspaceService';
import { GitHubConnection } from '../../models';

const MockConn = GitHubConnection as any;
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function res(opts: { ok?: boolean; status?: number; json?: any; text?: string }): any {
  const { ok = true, status = 200, json = {}, text = '' } = opts;
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(json),
    text: jest.fn().mockResolvedValue(text),
  };
}

const ENR = 'enr-1';
const LOGIN = 'student-dev';

beforeEach(() => {
  jest.clearAllMocks();
  MockConn._reset();
  process.env.GITHUB_TOKEN = 'platform-token';
  process.env.GITHUB_WORKSPACE_ORG = 'ColaberryIntern';
  delete process.env.GITHUB_API_URL;
});

describe('isValidGithubLogin', () => {
  it('accepts valid logins and rejects malformed input', () => {
    expect(svc.isValidGithubLogin('octocat')).toBe(true);
    expect(svc.isValidGithubLogin('a-b-c1')).toBe(true);
    expect(svc.isValidGithubLogin('')).toBe(false);
    expect(svc.isValidGithubLogin('-bad')).toBe(false);
    expect(svc.isValidGithubLogin('bad-')).toBe(false);
    expect(svc.isValidGithubLogin('has space')).toBe(false);
    expect(svc.isValidGithubLogin('a/b')).toBe(false);
    expect(svc.isValidGithubLogin(undefined)).toBe(false);
    expect(svc.isValidGithubLogin(123)).toBe(false);
  });
});

describe('provisionWorkspaceRepo', () => {
  it('happy path: creates repo, adds push collaborator, upserts connection (no token persisted)', async () => {
    mockFetch
      .mockResolvedValueOnce(res({ status: 201 })) // POST create
      .mockResolvedValueOnce(res({ status: 201 })); // PUT collaborator

    const view = await svc.provisionWorkspaceRepo(ENR, LOGIN);

    expect(view.provisioned).toBe(true);
    expect(view.repo_owner).toBe('ColaberryIntern');
    expect(view.repo_name).toBe(svc.workspaceRepoName(ENR));
    expect(view.student_github_login).toBe(LOGIN);
    expect(view.repo_url).toContain('github.com/ColaberryIntern/');

    // create call
    const [createUrl, createInit] = mockFetch.mock.calls[0];
    expect(createUrl).toBe('https://api.github.com/orgs/ColaberryIntern/repos');
    expect(createInit.method).toBe('POST');
    const body = JSON.parse(createInit.body);
    expect(body.private).toBe(true);
    expect(body.auto_init).toBe(true);
    // Authorization uses the platform token
    expect(createInit.headers.Authorization).toBe('Bearer platform-token');

    // collaborator call
    const [collabUrl, collabInit] = mockFetch.mock.calls[1];
    expect(collabUrl).toContain(`/collaborators/${LOGIN}`);
    expect(JSON.parse(collabInit.body).permission).toBe('push');

    // platform token is NOT persisted
    const row = MockConn._rows[ENR];
    expect(row.access_token_encrypted).toBe('');
    expect(row.status_json.provisioned).toBe(true);
    expect(row.status_json.student_github_login).toBe(LOGIN);
  });

  it('is idempotent: 422 name-exists on create is treated as success', async () => {
    mockFetch
      .mockResolvedValueOnce(res({ ok: false, status: 422, text: 'name already exists on this account' }))
      .mockResolvedValueOnce(res({ status: 204 })); // collaborator already present

    const view = await svc.provisionWorkspaceRepo(ENR, LOGIN);
    expect(view.provisioned).toBe(true);
    expect(view.repo_name).toBe(svc.workspaceRepoName(ENR));
  });

  it('reuses an existing connection row on a repeat provision (findOrCreate returns existing)', async () => {
    MockConn._seed(ENR, {
      repo_url: 'https://github.com/ColaberryIntern/old',
      repo_owner: 'ColaberryIntern',
      repo_name: svc.workspaceRepoName(ENR),
      access_token_encrypted: '',
      status_json: { provisioned: true, student_github_login: 'old-login' },
    });
    mockFetch
      .mockResolvedValueOnce(res({ ok: false, status: 422, text: 'name already exists' }))
      .mockResolvedValueOnce(res({ status: 204 }));

    const view = await svc.provisionWorkspaceRepo(ENR, LOGIN);
    expect(MockConn.findOrCreate).toHaveBeenCalledTimes(1);
    // login updated on the reused row
    expect(view.student_github_login).toBe(LOGIN);
  });

  it('rejects a missing/invalid github login before any network call', async () => {
    await expect(svc.provisionWorkspaceRepo(ENR, '')).rejects.toThrow(/valid GitHub username/);
    await expect(svc.provisionWorkspaceRepo(ENR, 'bad login')).rejects.toThrow(/valid GitHub username/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws a clear error when GITHUB_TOKEN is missing', async () => {
    delete process.env.GITHUB_TOKEN;
    await expect(svc.provisionWorkspaceRepo(ENR, LOGIN)).rejects.toThrow(/GITHUB_TOKEN is not configured/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws when the enrollment does not exist', async () => {
    await expect(svc.provisionWorkspaceRepo('missing', LOGIN)).rejects.toThrow(/Enrollment not found/);
  });

  it('surfaces a non-422 create failure', async () => {
    mockFetch.mockResolvedValueOnce(res({ ok: false, status: 403, text: 'forbidden' }));
    await expect(svc.provisionWorkspaceRepo(ENR, LOGIN)).rejects.toThrow(/repo create failed \(403\)/);
  });
});

describe('syncWorkspaceRepo', () => {
  it('pulls branch → tree → commits and persists file_count/language/commits/last_sync', async () => {
    MockConn._seed(ENR, {
      repo_owner: 'ColaberryIntern',
      repo_name: svc.workspaceRepoName(ENR),
      repo_url: 'https://github.com/ColaberryIntern/x',
      status_json: { provisioned: true, student_github_login: LOGIN },
    });
    mockFetch
      .mockResolvedValueOnce(res({ json: { default_branch: 'main' } })) // repo
      .mockResolvedValueOnce(res({ json: { tree: [
        { type: 'blob', path: 'src/index.ts' },
        { type: 'blob', path: 'src/app.ts' },
        { type: 'tree', path: 'src' },
      ] } })) // tree
      .mockResolvedValueOnce(res({ json: [
        { sha: 'abcdef1234', commit: { message: 'feat: first\n\nbody', author: { name: 'Stu', date: '2026-07-08T00:00:00Z' } } },
      ] })); // commits

    const view = await svc.syncWorkspaceRepo(ENR);
    expect(view.file_count).toBe(2);
    expect(view.recent_commits).toHaveLength(1);
    expect(view.recent_commits[0].sha).toBe('abcdef1');
    expect(view.recent_commits[0].message).toBe('feat: first');

    const row = MockConn._rows[ENR];
    expect(row.file_count).toBe(2);
    expect(row.repo_language).toBe('TypeScript');
    expect(row.last_sync_at).toBeInstanceOf(Date);
  });

  it('throws when no repo is provisioned', async () => {
    await expect(svc.syncWorkspaceRepo(ENR)).rejects.toThrow(/No workspace repo provisioned/);
  });

  it('throws a clear error when GITHUB_TOKEN is missing', async () => {
    delete process.env.GITHUB_TOKEN;
    await expect(svc.syncWorkspaceRepo(ENR)).rejects.toThrow(/GITHUB_TOKEN is not configured/);
  });
});

describe('getWorkspaceRepo', () => {
  it('returns a not-connected view when there is no connection row', async () => {
    const view = await svc.getWorkspaceRepo(ENR);
    expect(view.connected).toBe(false);
    expect(view.provisioned).toBe(false);
    expect(view.repo_url).toBeNull();
    expect(view.recent_commits).toEqual([]);
  });

  it('returns a provisioned view from an existing connection', async () => {
    MockConn._seed(ENR, {
      repo_owner: 'ColaberryIntern',
      repo_name: svc.workspaceRepoName(ENR),
      repo_url: 'https://github.com/ColaberryIntern/x',
      file_count: 5,
      last_sync_at: new Date('2026-07-08T00:00:00Z'),
      commit_summary_json: [{ sha: 'abc1234', message: 'init', author: 'Stu', date: '2026-07-08T00:00:00Z' }],
      status_json: { provisioned: true, student_github_login: LOGIN },
    });
    const view = await svc.getWorkspaceRepo(ENR);
    expect(view.connected).toBe(true);
    expect(view.provisioned).toBe(true);
    expect(view.file_count).toBe(5);
    expect(view.student_github_login).toBe(LOGIN);
    expect(view.recent_commits).toHaveLength(1);
  });
});
