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

import { getWorkspaceRepo, provisionWorkspaceRepo, syncWorkspaceRepo } from '../workspaceRepoApi';

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
