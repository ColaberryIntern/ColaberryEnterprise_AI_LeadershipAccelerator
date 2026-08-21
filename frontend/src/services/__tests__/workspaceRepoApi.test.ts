/**
 * workspaceRepoApi — the three per-project workspace repo calls.
 *
 * MEASURED, 2026-08-13, production. A repo belongs to a PROJECT, not to an
 * enrollment (FR-037), so all three backend routes require `project_id`. This
 * client passed none. Every call answered:
 *
 *   400 {"error":"Invalid input","issues":[{"expected":"string",...}]}
 *
 * and the drawer's deliberate fail-soft turned that into silence — the whole
 * "Your workspace repo" section rendered as nothing, so a student clicking a
 * story saw no way to reach their repo at all. Nothing was broken loudly
 * enough to notice; the section simply was not there.
 *
 * These tests pin the parameter onto each call, because the failure mode is a
 * missing argument that TypeScript cannot catch once it is optional.
 */
const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: () => ({
      get: (...a: any[]) => mockGet(...a),
      post: (...a: any[]) => mockPost(...a),
      interceptors: { request: { use: jest.fn() } },
    }),
  },
}));
jest.mock('../../utils/participantToken', () => ({ getParticipantToken: () => 'tok' }));

import {
  getWorkspaceRepo, provisionWorkspaceRepo, syncWorkspaceRepo,
  startRepoConnect, confirmRepoConnect, downloadDocsBundle, downloadProgressFile,
  connectErrorOf,
} from '../workspaceRepoApi';

const PROJECT = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue({ data: { provisioned: false } });
  mockPost.mockResolvedValue({ data: { provisioned: true } });
});

describe('every workspace repo call names the project', () => {
  it('sends project_id as a query param on GET', async () => {
    await getWorkspaceRepo(PROJECT);

    expect(mockGet).toHaveBeenCalledWith('/api/portal/workspace/repo', { params: { project_id: PROJECT } });
  });

  it('sends project_id in the body when provisioning, alongside the github login', async () => {
    await provisionWorkspaceRepo(PROJECT, 'octocat');

    expect(mockPost).toHaveBeenCalledWith(
      '/api/portal/workspace/repo/provision',
      { project_id: PROJECT, github_login: 'octocat' },
    );
  });

  it('sends project_id in the body when syncing — it used to send no body at all', async () => {
    await syncWorkspaceRepo(PROJECT);

    expect(mockPost).toHaveBeenCalledWith('/api/portal/workspace/repo/sync', { project_id: PROJECT });
  });

  it('returns the view the backend sent, unwrapped', async () => {
    mockGet.mockResolvedValue({ data: { provisioned: true, repo_name: 'concierge-f1b93ef7' } });

    await expect(getWorkspaceRepo(PROJECT)).resolves.toEqual({
      provisioned: true, repo_name: 'concierge-f1b93ef7',
    });
  });

  it('lets a rejection through, so the caller decides whether to fail soft', async () => {
    // The drawer chooses to swallow this. That choice belongs to the drawer,
    // not to the client — a client that swallowed it would hide a real 400
    // from every caller, which is exactly how this bug survived.
    mockGet.mockRejectedValue(Object.assign(new Error('400'), { response: { status: 400 } }));

    await expect(getWorkspaceRepo(PROJECT)).rejects.toThrow('400');
  });
});

describe('the connect calls', () => {
  it('sends the repo reference verbatim — parsing is the backend\'s job', async () => {
    await startRepoConnect(PROJECT, '  https://github.com/me/thing/tree/main  '.trim());

    expect(mockPost).toHaveBeenCalledWith(
      '/api/portal/workspace/repo/connect',
      { project_id: PROJECT, repo: 'https://github.com/me/thing/tree/main' },
    );
  });

  it('omits confirm_replace unless the student explicitly said so', async () => {
    await startRepoConnect(PROJECT, 'me/thing');
    expect(mockPost.mock.calls[0][1]).not.toHaveProperty('confirm_replace');

    await startRepoConnect(PROJECT, 'me/thing', true);
    expect(mockPost.mock.calls[1][1]).toMatchObject({ confirm_replace: true });
  });

  it('confirms by project alone — the candidate repo is server-side state', async () => {
    await confirmRepoConnect(PROJECT);
    expect(mockPost).toHaveBeenCalledWith(
      '/api/portal/workspace/repo/connect/confirm', { project_id: PROJECT },
    );
  });
});

describe('downloadDocsBundle', () => {
  it('requests a blob, because the endpoint is authed and returns binary', async () => {
    mockGet.mockResolvedValue({
      data: new Blob(['zip']),
      headers: { 'content-disposition': 'attachment; filename="nightshift-build-docs-v3.zip"' },
    });

    const result = await downloadDocsBundle(PROJECT);

    expect(mockGet).toHaveBeenCalledWith('/api/portal/workspace/docs/bundle', {
      params: { project_id: PROJECT }, responseType: 'blob',
    });
    expect(result.filename).toBe('nightshift-build-docs-v3.zip');
  });

  it('falls back to a sane filename when the header is absent', async () => {
    mockGet.mockResolvedValue({ data: new Blob(['zip']), headers: {} });
    await expect(downloadDocsBundle(PROJECT)).resolves.toMatchObject({ filename: 'build-docs.zip' });
  });
});

/**
 * The call that makes the progress file reachable at all for a pull-only
 * student. Two things have to be right and neither is checkable by TypeScript:
 * the project id has to be on the request (the failure this whole file was
 * written about), and the filename has to survive a response whose custom
 * headers a cross-origin browser will not expose.
 */
describe('downloadProgressFile', () => {
  it('asks the progress-file route for this project, as a blob', async () => {
    mockGet.mockResolvedValue({
      data: new Blob(['{}']),
      headers: {
        'content-disposition': 'attachment; filename="progress.json"',
        'x-colaberry-progress-existing': 'merged',
      },
    });

    const result = await downloadProgressFile(PROJECT);

    expect(mockGet).toHaveBeenCalledWith('/api/portal/workspace/progress-file', {
      params: { project_id: PROJECT }, responseType: 'blob',
    });
    expect(result.filename).toBe('progress.json');
    expect(result.existing).toBe('merged');
  });

  it('still names the file progress.json when no header is exposed', async () => {
    // The fallback IS the correct name, not a placeholder: the student is being
    // told to save this at `.colaberry/progress.json`, and a browser that named
    // it `download` would strand them at the one step that matters.
    mockGet.mockResolvedValue({ data: new Blob(['{}']), headers: {} });
    await expect(downloadProgressFile(PROJECT)).resolves.toMatchObject({
      filename: 'progress.json', existing: null,
    });
  });

  it('reports an unreadable existing file rather than smoothing it over', async () => {
    mockGet.mockResolvedValue({
      data: new Blob(['{}']),
      headers: { 'x-colaberry-progress-existing': 'unreadable' },
    });
    await expect(downloadProgressFile(PROJECT)).resolves.toMatchObject({ existing: 'unreadable' });
  });

  it('treats an unrecognised header value as "not told", never as a state', async () => {
    mockGet.mockResolvedValue({
      data: new Blob(['{}']),
      headers: { 'x-colaberry-progress-existing': 'something-new' },
    });
    await expect(downloadProgressFile(PROJECT)).resolves.toMatchObject({ existing: null });
  });
});

describe('connectErrorOf', () => {
  it('surfaces the backend\'s classified message rather than a generic one', () => {
    const err = {
      response: {
        data: {
          error: 'github.com/me/thing is already the workspace repo for another build.',
          error_class: 'RepoAlreadyClaimed',
          details: { owner: 'me' },
        },
      },
    };
    expect(connectErrorOf(err, 'fallback')).toEqual({
      error: 'github.com/me/thing is already the workspace repo for another build.',
      error_class: 'RepoAlreadyClaimed',
      details: { owner: 'me' },
    });
  });

  it('falls back when the failure carries no body — a network drop, say', () => {
    expect(connectErrorOf(new Error('Network Error'), 'Could not connect that repo.'))
      .toEqual({ error: 'Could not connect that repo.', error_class: null });
  });
});
