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

/** The one shape that is writable: connected, and recorded as pushable. */
const WRITABLE = { connect: { state: 'connected', platform_can_push: true } };

describe('repoForProject — writability, not merely existence', () => {
  it('returns null for a provisioned repo the student has not pushed to yet', async () => {
    // The regression this guard exists to prevent. Owner and name are set, so
    // an existence-only check says "writable" and publish 404s on a missing ref.
    mockFindOne.mockResolvedValue(connection({
      status_json: { connect: { state: 'awaiting_push', platform_can_push: true } },
    }));

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

  it('resolves a fully connected repo the platform can push', async () => {
    mockFindOne.mockResolvedValue(connection({ status_json: WRITABLE }));

    await expect(repoForProject(PROJECT)).resolves.toEqual({
      owner: 'ColaberryIntern',
      repo: 'roster-1111',
      url: 'https://github.com/ColaberryIntern/roster-1111',
    });
  });

  /**
   * INVERTED ON 2026-08-19, and this is the case that inverted it.
   *
   * No `connect` key at all. These were treated as writable on back-compat
   * grounds — the permission was never recorded, and refusing on a guess would
   * break repos that work. Then the audit counted the repos: ELEVEN OF TWELVE
   * student repositories were read-only to the platform, and every one of them
   * had been answering "writable" off exactly this absent key. There were no
   * working repos being protected; there were doomed commits being queued in
   * silence.
   *
   * Refusing is safe because it is not permanent. `reconcileRepoAccess` runs on
   * every sync and records the real answer, so an unknown row becomes a known
   * one the first time the student presses Sync — and until then publish takes
   * the already-supported `awaiting_repo` path rather than failing at GitHub.
   */
  it('refuses a legacy row that predates the connect step, rather than guessing', async () => {
    mockFindOne.mockResolvedValue(connection({ status_json: {} }));

    await expect(repoForProject(PROJECT)).resolves.toBeNull();
  });

  it('refuses a connected repo whose permission was never recorded', async () => {
    mockFindOne.mockResolvedValue(connection({ status_json: { connect: { state: 'connected' } } }));

    await expect(repoForProject(PROJECT)).resolves.toBeNull();
  });

  it('refuses a repo GitHub reported as pull-only', async () => {
    mockFindOne.mockResolvedValue(connection({
      status_json: { connect: { state: 'connected', platform_can_push: false } },
    }));

    await expect(repoForProject(PROJECT)).resolves.toBeNull();
  });

  it('returns null when the project has no connection row at all', async () => {
    mockFindOne.mockResolvedValue(null);

    await expect(repoForProject(PROJECT)).resolves.toBeNull();
  });

  it('falls back to a derived URL when repo_url is empty', async () => {
    mockFindOne.mockResolvedValue(connection({ repo_url: null, status_json: WRITABLE }));

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
 * ── A SKIPPED WRITE MUST LEAVE A TRACE ───────────────────────────────────────
 *
 * Returning `null` is a supported outcome and always has been. It is also how
 * the read-only cohort stayed hidden for nine months: eleven students' repos
 * refused every commit the platform queued, and the only downstream trace was a
 * `no_repo` outcome — byte-identical to a student who had simply never connected
 * a repo at all. Nobody could have found this in the logs, because the logs did
 * not distinguish the two.
 *
 * The reason is the entire value. `access_unknown` is our bookkeeping failing
 * and warrants a warn; `pull_only` is the student's deliberate choice and is
 * merely information.
 */
describe('the refusal is legible', () => {
  const logged = (): Array<Record<string, any>> =>
    (console.log as jest.Mock).mock.calls
      .map(([line]) => { try { return JSON.parse(String(line)); } catch { return null; } })
      .filter((e): e is Record<string, any> => Boolean(e) && e.event === 'sbp_repo_write_refused');

  beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => undefined); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('says WHY when the permission was never recorded, and says it loudly', async () => {
    mockFindOne.mockResolvedValue(connection({ status_json: { connect: { state: 'connected' } } }));

    await repoForProject(PROJECT);

    expect(logged()).toEqual([expect.objectContaining({
      service: 'sbp-workspace-repo',
      event: 'sbp_repo_write_refused',
      level: 'warn',
      context: { projectId: PROJECT, reason: 'access_unknown' },
    })]);
  });

  it('distinguishes the student\'s choice from our ignorance', async () => {
    mockFindOne.mockResolvedValue(connection({
      status_json: { connect: { state: 'connected', platform_can_push: false } },
    }));

    await repoForProject(PROJECT);

    // Not a warning: a repo the platform only reads is a legitimate choice, and
    // verification, points and the whole build work exactly the same on one.
    expect(logged()).toEqual([expect.objectContaining({
      level: 'info',
      context: { projectId: PROJECT, reason: 'pull_only' },
    })]);
  });

  it.each([
    ['no_repo', null],
    ['not_connected', { connect: { state: 'awaiting_push', platform_can_push: true } }],
  ])('names %s too', async (reason, status_json) => {
    mockFindOne.mockResolvedValue(status_json === null ? null : connection({ status_json }));

    await repoForProject(PROJECT);

    expect(logged()).toEqual([expect.objectContaining({ context: { projectId: PROJECT, reason } })]);
  });

  it('stays quiet when the write is allowed — this is a refusal log, not a heartbeat', async () => {
    mockFindOne.mockResolvedValue(connection({ status_json: WRITABLE }));

    await repoForProject(PROJECT);

    expect(logged()).toEqual([]);
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
