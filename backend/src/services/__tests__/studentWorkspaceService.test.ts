/**
 * studentWorkspaceService tests — no DB, no network.
 * Mocks ../../models (GitHubConnection + Enrollment) and global.fetch.
 * Covers: provision happy-path, idempotent 422 name-exists, existing-name
 * reuse, missing-token / missing-login guards, sync, and not-connected reads.
 */

jest.mock('../../models/Project', () => ({
  __esModule: true,
  default: {
    // PRJ belongs to ENR; FOREIGN_PRJ belongs to someone else. A service call
    // for FOREIGN_PRJ must never reach the network.
    findByPk: jest.fn(async (id: string) => {
      if (id === 'prj-1') return { id: 'prj-1', enrollment_id: 'enr-1', name: 'Sponsor Dashboard', organization_name: 'Colaberry' };
      if (id === 'prj-foreign') return { id: 'prj-foreign', enrollment_id: 'enr-someone-else', name: 'Not Yours' };
      return null;
    }),
  },
}));

jest.mock('../../models', () => {
  // One in-memory connection row keyed by project_id (FR-037).
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
      _seed: (projectId: string, data: any) => {
        rows[projectId] = makeRow({ project_id: projectId, enrollment_id: 'enr-1', ...data });
        return rows[projectId];
      },
      findOrCreate: jest.fn(async ({ where, defaults }: any) => {
        const key = where.project_id;
        if (rows[key]) return [rows[key], false];
        rows[key] = makeRow(defaults);
        return [rows[key], true];
      }),
      findOne: jest.fn(async ({ where }: any) => rows[where.project_id] || null),
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
const PRJ = 'prj-1';
const FOREIGN = 'prj-foreign';
const LOGIN = 'student-dev';
const PROJECT = { id: PRJ, name: 'Sponsor Dashboard', organization_name: 'Colaberry' };

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
  /**
   * FR-039 added a `GET /users/:login` existence check ahead of repo creation,
   * so every provision path now begins with that call. Scripted here once rather
   * than repeated in each case.
   */
  const userExists = () => mockFetch.mockResolvedValueOnce(res({ ok: true, status: 200, json: { login: LOGIN } }));

  it('happy path: creates repo, adds push collaborator, upserts connection (no token persisted)', async () => {
    userExists();
    mockFetch
      .mockResolvedValueOnce(res({ status: 201 })) // POST create
      .mockResolvedValueOnce(res({ status: 201 })); // PUT collaborator

    const view = await svc.provisionWorkspaceRepo(ENR, PRJ, LOGIN);

    expect(view.provisioned).toBe(true);
    expect(view.repo_owner).toBe('ColaberryIntern');
    expect(view.repo_name).toBe(svc.workspaceRepoName(PROJECT));
    expect(view.student_github_login).toBe(LOGIN);
    expect(view.repo_url).toContain('github.com/ColaberryIntern/');

    // call 0 is the FR-039 user-existence lookup; create is call 1.
    const [userUrl] = mockFetch.mock.calls[0];
    expect(String(userUrl)).toContain(`/users/${LOGIN}`);

    // create call
    const [createUrl, createInit] = mockFetch.mock.calls[1];
    expect(createUrl).toBe('https://api.github.com/orgs/ColaberryIntern/repos');
    expect(createInit.method).toBe('POST');
    const body = JSON.parse(createInit.body);
    expect(body.private).toBe(true);
    expect(body.auto_init).toBe(true);
    // Authorization uses the platform token
    expect(createInit.headers.Authorization).toBe('Bearer platform-token');

    // collaborator call
    const [collabUrl, collabInit] = mockFetch.mock.calls[2];
    expect(collabUrl).toContain(`/collaborators/${LOGIN}`);
    expect(JSON.parse(collabInit.body).permission).toBe('push');

    // platform token is NOT persisted
    const row = MockConn._rows[PRJ];
    expect(row.access_token_encrypted).toBe('');
    expect(row.status_json.provisioned).toBe(true);
    expect(row.status_json.student_github_login).toBe(LOGIN);
  });

  it('is idempotent: 422 name-exists on create is treated as success', async () => {
    userExists();
    mockFetch
      .mockResolvedValueOnce(res({ ok: false, status: 422, text: 'name already exists on this account' }))
      .mockResolvedValueOnce(res({ status: 204 })); // collaborator already present

    const view = await svc.provisionWorkspaceRepo(ENR, PRJ, LOGIN);
    expect(view.provisioned).toBe(true);
    expect(view.repo_name).toBe(svc.workspaceRepoName(PROJECT));
  });

  it('reuses an existing connection row on a repeat provision (findOrCreate returns existing)', async () => {
    userExists();
    MockConn._seed(PRJ, {
      repo_url: 'https://github.com/ColaberryIntern/old',
      repo_owner: 'ColaberryIntern',
      repo_name: svc.workspaceRepoName(PROJECT),
      access_token_encrypted: '',
      status_json: { provisioned: true, student_github_login: 'old-login' },
    });
    mockFetch
      .mockResolvedValueOnce(res({ ok: false, status: 422, text: 'name already exists' }))
      .mockResolvedValueOnce(res({ status: 204 }));

    const view = await svc.provisionWorkspaceRepo(ENR, PRJ, LOGIN);
    expect(MockConn.findOrCreate).toHaveBeenCalledTimes(1);
    // login updated on the reused row
    expect(view.student_github_login).toBe(LOGIN);
  });

  it('rejects a missing/invalid github login before any network call', async () => {
    await expect(svc.provisionWorkspaceRepo(ENR, PRJ, '')).rejects.toThrow(/valid GitHub username/);
    await expect(svc.provisionWorkspaceRepo(ENR, PRJ, 'bad login')).rejects.toThrow(/valid GitHub username/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws a clear error when GITHUB_TOKEN is missing', async () => {
    delete process.env.GITHUB_TOKEN;
    await expect(svc.provisionWorkspaceRepo(ENR, PRJ, LOGIN)).rejects.toThrow(/GITHUB_TOKEN is not configured/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws when the enrollment does not exist', async () => {
    // Ownership is checked before the enrollment guard, so an unknown enrollment
    // fails as "Project not found" — it does not own prj-1.
    await expect(svc.provisionWorkspaceRepo('missing', PRJ, LOGIN)).rejects.toThrow(/Project not found/);
  });

  it('surfaces a non-422 create failure', async () => {
    userExists();
    mockFetch.mockResolvedValueOnce(res({ ok: false, status: 403, text: 'forbidden' }));
    await expect(svc.provisionWorkspaceRepo(ENR, PRJ, LOGIN)).rejects.toThrow(/repo create failed \(403\)/);
  });
});

describe('syncWorkspaceRepo', () => {
  it('pulls branch → tree → commits and persists file_count/language/commits/last_sync', async () => {
    MockConn._seed(PRJ, {
      repo_owner: 'ColaberryIntern',
      repo_name: svc.workspaceRepoName(PROJECT),
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

    const view = await svc.syncWorkspaceRepo(ENR, PRJ);
    expect(view.file_count).toBe(2);
    expect(view.recent_commits).toHaveLength(1);
    expect(view.recent_commits[0].sha).toBe('abcdef1');
    expect(view.recent_commits[0].message).toBe('feat: first');

    const row = MockConn._rows[PRJ];
    expect(row.file_count).toBe(2);
    expect(row.repo_language).toBe('TypeScript');
    expect(row.last_sync_at).toBeInstanceOf(Date);
  });

  it('throws when no repo is provisioned', async () => {
    await expect(svc.syncWorkspaceRepo(ENR, PRJ)).rejects.toThrow(/No workspace repo provisioned/);
  });

  it('throws a clear error when GITHUB_TOKEN is missing', async () => {
    delete process.env.GITHUB_TOKEN;
    await expect(svc.syncWorkspaceRepo(ENR, PRJ)).rejects.toThrow(/GITHUB_TOKEN is not configured/);
  });
});

describe('getWorkspaceRepo', () => {
  it('returns a not-connected view when there is no connection row', async () => {
    const view = await svc.getWorkspaceRepo(ENR, PRJ);
    expect(view.connected).toBe(false);
    expect(view.provisioned).toBe(false);
    expect(view.repo_url).toBeNull();
    expect(view.recent_commits).toEqual([]);
  });

  it('returns a provisioned view from an existing connection', async () => {
    MockConn._seed(PRJ, {
      repo_owner: 'ColaberryIntern',
      repo_name: svc.workspaceRepoName(PROJECT),
      repo_url: 'https://github.com/ColaberryIntern/x',
      file_count: 5,
      last_sync_at: new Date('2026-07-08T00:00:00Z'),
      commit_summary_json: [{ sha: 'abc1234', message: 'init', author: 'Stu', date: '2026-07-08T00:00:00Z' }],
      status_json: { provisioned: true, student_github_login: LOGIN },
    });
    const view = await svc.getWorkspaceRepo(ENR, PRJ);
    expect(view.connected).toBe(true);
    expect(view.provisioned).toBe(true);
    expect(view.file_count).toBe(5);
    expect(view.student_github_login).toBe(LOGIN);
    expect(view.recent_commits).toHaveLength(1);
  });
});

// ── ownership: a foreign project must never reach the network (FR-037) ───────
describe('project ownership', () => {
  it.each([
    ['provision', () => svc.provisionWorkspaceRepo(ENR, FOREIGN, LOGIN)],
    ['sync', () => svc.syncWorkspaceRepo(ENR, FOREIGN)],
    ['get', () => svc.getWorkspaceRepo(ENR, FOREIGN)],
  ])('%s refuses a project the caller does not own, WITHOUT calling GitHub', async (_name, call) => {
    await expect(call()).rejects.toThrow(/Project not found/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports a foreign project as 404, so it cannot be probed for existence', async () => {
    await expect(svc.getWorkspaceRepo(ENR, FOREIGN)).rejects.toMatchObject({ status: 404 });
    // Same shape as a project that genuinely does not exist.
    await expect(svc.getWorkspaceRepo(ENR, 'prj-nonexistent')).rejects.toMatchObject({ status: 404 });
  });

  it('requires both ids', async () => {
    await expect(svc.getWorkspaceRepo('', PRJ)).rejects.toThrow(/enrollmentId is required/);
    await expect(svc.getWorkspaceRepo(ENR, '')).rejects.toThrow(/projectId is required/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── repo naming: the student's portfolio artifact ───────────────────────────
describe('workspaceRepoName', () => {
  it('reads like a project, not a UUID', () => {
    expect(svc.workspaceRepoName({ id: '248d9d63-2543-45a1-b3f9-d1f691a8428a', name: 'Sponsor Dashboard' }))
      .toBe('sponsor-dashboard-248d9d63');
  });

  it('is deterministic', () => {
    const p = { id: 'abc12345-0000-0000-0000-000000000000', name: 'My Build' };
    expect(svc.workspaceRepoName(p)).toBe(svc.workspaceRepoName(p));
  });

  it('falls back to organization_name, then to a safe default', () => {
    expect(svc.workspaceRepoName({ id: 'abc12345-0000-0000-0000-000000000000', name: null, organization_name: 'Acme Corp' }))
      .toBe('acme-corp-abc12345');
    expect(svc.workspaceRepoName({ id: 'abc12345-0000-0000-0000-000000000000' }))
      .toBe('build-abc12345');
  });

  it.each([
    ['Ali & Co: The "Best" Build!', 'ali-co-the-best-build'],
    ['   spaced   out   ', 'spaced-out'],
    ['—— ——', 'build'],
    ['A'.repeat(80), 'a'.repeat(40)],
  ])('slugifies %p safely', (input, expected) => {
    expect(svc.slugifyProjectName(input)).toBe(expected);
  });

  it('never emits a name GitHub would reject', () => {
    for (const n of ['', '  ', '///', 'Ünïcødé Ñame', '.hidden', 'trailing-']) {
      const name = svc.workspaceRepoName({ id: 'abc12345-0000-0000-0000-000000000000', name: n });
      expect(name).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/);
      expect(name).not.toContain('--');
    }
  });
});

// ── username validation before anything is created (FR-039) ─────────────────
describe('githubUserExists / provision pre-check', () => {
  it('refuses a well-formed but nonexistent username WITHOUT creating a repo', async () => {
    mockFetch.mockResolvedValueOnce(res({ ok: false, status: 404 }));   // GET /users/:login
    await expect(svc.provisionWorkspaceRepo(ENR, PRJ, 'ghost-user'))
      .rejects.toThrow(/does not exist/);
    // Exactly one call — the lookup. No repo create, no collaborator add.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toContain('/users/ghost-user');
  });

  it('checks the user BEFORE creating the repo, not after', async () => {
    mockFetch
      .mockResolvedValueOnce(res({ ok: true, status: 200, json: { login: LOGIN } }))
      .mockResolvedValueOnce(res({ ok: true, status: 201, json: {} }))
      .mockResolvedValueOnce(res({ ok: true, status: 201 }));
    await svc.provisionWorkspaceRepo(ENR, PRJ, LOGIN);
    expect(String(mockFetch.mock.calls[0][0])).toContain('/users/');
    expect(String(mockFetch.mock.calls[1][0])).toContain('/repos');
  });

  // A rate limit must not be reported to a student as "your username is wrong".
  it('distinguishes "cannot verify right now" from "does not exist"', async () => {
    mockFetch.mockResolvedValue(res({ ok: false, status: 403 }));
    await expect(svc.provisionWorkspaceRepo(ENR, PRJ, LOGIN))
      .rejects.toThrow(/Could not verify the GitHub username right now/);
  });

  it('names the offending username so the student can fix it', async () => {
    mockFetch.mockResolvedValueOnce(res({ ok: false, status: 404 }));
    await expect(svc.provisionWorkspaceRepo(ENR, PRJ, 'typodname'))
      .rejects.toThrow(/typodname/);
  });
});
