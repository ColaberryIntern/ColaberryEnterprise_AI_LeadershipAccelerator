/**
 * workspaceRepo — the single answer to "can the platform write documents into
 * this project's repo?", shared by BOTH publish paths.
 *
 * Why this file is worth more than its size suggests. Publishing happens twice:
 * the HTTP route a student or operator can call, and the orchestrator's
 * automatic publish at the end of generation. Auto-publish is live in
 * production and runs unattended on every finished wizard, so a guard that
 * exists on only one path is not a partial fix — it is a regression that fires
 * on the next student to finish the intake, with nobody watching.
 *
 * The case that motivated moving the guard in here is `awaiting_push`: a repo
 * the platform provisioned, so `repo_owner` and `repo_name` ARE set, but which
 * the student has not pushed to yet, so it has no branch for a commit to sit
 * on. The old lookup saw owner+name and said "yes, writable". Writing into it
 * fails at the GitHub boundary with a 404 on a missing ref.
 */
const mockFindOne = jest.fn();

jest.mock('../../../models', () => ({
  GitHubConnection: { findOne: (...a: any[]) => mockFindOne(...a) },
}));

// repoForProject reaches isWritableConnection through repoConnectService, whose
// module-level imports include the real Project model. Mocked for the same
// reason the neighbouring suites do it: loading Sequelize here is slow and
// intermittently flaky under parallel runs, and nothing in this file touches it.
jest.mock('../../../models/Project', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));

import * as fs from 'fs';
import * as path from 'path';
import { repoForProject } from '../workspaceRepo';

const PROJECT = '11111111-1111-1111-1111-111111111111';

/** A row as the database hands it back. `connect` lives inside status_json. */
function connection(over: Record<string, any> = {}) {
  return {
    repo_owner: 'ColaberryIntern',
    repo_name: 'roster-1111',
    repo_url: 'https://github.com/ColaberryIntern/roster-1111',
    status_json: {},
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('repoForProject — writability, not merely existence', () => {
  it('returns null for a provisioned repo the student has not pushed to yet', async () => {
    // The regression this guard exists to prevent. Owner and name are set, so
    // an existence-only check says "writable" and publish 404s on a missing ref.
    mockFindOne.mockResolvedValue(connection({ status_json: { connect: { state: 'awaiting_push' } } }));

    await expect(repoForProject(PROJECT)).resolves.toBeNull();
  });

  it('returns null for a candidate still awaiting the student proof push', async () => {
    // Nothing is bound until the proof lands, so owner/name are still empty.
    mockFindOne.mockResolvedValue(connection({
      repo_owner: null, repo_name: null, repo_url: null,
      status_json: { connect: { state: 'awaiting_proof' } },
    }));

    await expect(repoForProject(PROJECT)).resolves.toBeNull();
  });

  it('resolves a fully connected repo', async () => {
    mockFindOne.mockResolvedValue(connection({ status_json: { connect: { state: 'connected' } } }));

    await expect(repoForProject(PROJECT)).resolves.toEqual({
      owner: 'ColaberryIntern',
      repo: 'roster-1111',
      url: 'https://github.com/ColaberryIntern/roster-1111',
    });
  });

  it('resolves a legacy row that predates the connect step', async () => {
    // No `connect` key at all. These were writable before this step existed and
    // must stay writable, or the change silently breaks every repo already in
    // production. Back-compat is the reason isWritableConnection treats
    // `undefined` as writable rather than defaulting to "not yet".
    mockFindOne.mockResolvedValue(connection({ status_json: {} }));

    await expect(repoForProject(PROJECT)).resolves.toEqual({
      owner: 'ColaberryIntern',
      repo: 'roster-1111',
      url: 'https://github.com/ColaberryIntern/roster-1111',
    });
  });

  it('returns null when the project has no connection row at all', async () => {
    mockFindOne.mockResolvedValue(null);

    await expect(repoForProject(PROJECT)).resolves.toBeNull();
  });

  it('falls back to a derived URL when repo_url is empty', async () => {
    mockFindOne.mockResolvedValue(connection({ repo_url: null, status_json: { connect: { state: 'connected' } } }));

    await expect(repoForProject(PROJECT)).resolves.toEqual({
      owner: 'ColaberryIntern',
      repo: 'roster-1111',
      url: 'https://github.com/ColaberryIntern/roster-1111',
    });
  });

  it('scopes the lookup to the project, never the enrollment', async () => {
    // One repo per project (FR-037). Legacy enrollment-scoped rows carry
    // project_id = NULL and must not be picked up as a project's workspace repo.
    mockFindOne.mockResolvedValue(null);

    await repoForProject(PROJECT);

    expect(mockFindOne).toHaveBeenCalledWith({ where: { project_id: PROJECT } });
  });

  it('never throws for "there is no repo" — absent is a supported answer', async () => {
    // Callers treat null as "publish without writing documents" (awaiting_repo).
    // If this threw, a student with no repo would lose their plan instead.
    for (const row of [null, connection({ status_json: { connect: { state: 'awaiting_push' } } })]) {
      mockFindOne.mockResolvedValue(row);
      await expect(repoForProject(PROJECT)).resolves.toBeNull();
    }
  });
});

/**
 * Drift guard. The unit tests above cover BOTH publish paths only for as long
 * as both paths actually go through this module. #1462 extracted it precisely
 * because a second copy of the lookup is how the two paths drift — one writing
 * documents and the other skipping them for the same project. A re-inlined
 * lookup would pass every test above while reintroducing the bug, so the
 * structure is asserted rather than assumed.
 */
describe('both publish paths resolve the repo through this module', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8');

  const ROUTES = '../../../routes/sbpRoutes.ts';
  const ORCHESTRATOR = '../sbpOrchestrator.ts';

  it('the HTTP publish route delegates to repoForProject', () => {
    expect(read(ROUTES)).toContain("import('../services/sbp/workspaceRepo')");
  });

  it('auto-publish delegates to repoForProject', () => {
    expect(read(ORCHESTRATOR)).toContain("import('./workspaceRepo')");
  });

  it('neither caller runs its own GitHubConnection lookup', () => {
    // The decision lives in one place. If this fails, someone re-inlined it and
    // the writability guard is now missing from whichever path they touched.
    for (const src of [read(ROUTES), read(ORCHESTRATOR)]) {
      expect(src).not.toMatch(/GitHubConnection\.findOne/);
    }
  });
});
