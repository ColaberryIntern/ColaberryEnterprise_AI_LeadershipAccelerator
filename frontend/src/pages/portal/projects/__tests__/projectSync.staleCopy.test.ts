jest.mock('../../../../utils/portalApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() },
}));

import portalApi from '../../../../utils/portalApi';
import { refreshProjectsFromBackend, refetchProjectFromServer } from '../projectSync';
import { copyState, resetCopyState } from '../projectFreshness';
import { loadProjects, hydrateProjects, getProject } from '../projectsStore';
import type { BackendProjectTree, BackendTaskNode } from '../projectHydrate';
import type { StudentProject, ProjectTask } from '../projectsStore';

/**
 * AF2.9 — A FAILED REFRESH MUST NOT SILENTLY SERVE A SAVED COPY.
 *
 * ProjectWorkspacePage pulls on mount and fails soft: "on any failure the page
 * keeps rendering the store copy it already had". Right instinct, wrong
 * behaviour, because nothing said so. Mihret and Quincy each spent an evening
 * on it on 2026-10-21, and Mihret ended up diagnosing it for us with an
 * incognito window.
 *
 * These tests pin the three outcomes a pull can have, and the recovery:
 *
 *   reached + stored     -> confirmed, no banner
 *   unreachable          -> stale, and the student is told
 *   404 (flag off)       -> NEITHER, because there is no server to be stale
 *                           against and saying otherwise would be a lie the
 *                           client invented
 */

const api = portalApi as unknown as { get: jest.Mock; post: jest.Mock; put: jest.Mock; patch: jest.Mock };

const PROJ = '48f67531-dbbe-4176-b20c-29d4603fa802';

const bTask = (story_id: string, over: Partial<BackendTaskNode> = {}): BackendTaskNode => ({
  id: `uuid-${story_id}`, story_id, requirement_key: null, title: story_id, description: null,
  status: 'not_started', position: 0, owner_agent: null, release_key: null, acceptance: null,
  build: null, blocked_by: [], ...over,
});

const tree = (id: string, name: string, tasks: BackendTaskNode[]): BackendProjectTree => ({
  id, name, organization_name: null,
  lists: [{ id: `${id}-L1`, title: 'Release 0', position: 0, tasks }],
});

const localProject = (id: string, name: string, tasks: ProjectTask[], over: Partial<StudentProject> = {}): StudentProject => ({
  id, name, slug: name, descriptor: '', accent: '#000', cover: '', icon: '', status: 'ready',
  createdAt: 1, stage: '', curStep: 2, size: 'project', idea: '', sample: false,
  reqs: [], activity: [],
  lists: [{ id: `${id}-L1`, step: 2, name: 'Release 0', sub: '', tasks }],
  preview: { toolName: name, summary: '', tools: [], dataSources: [], guardrails: [] },
  ...over,
});

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: id, organization_name: null, project_stage: 'discovery',
  requirements_completion_pct: null, health_score: null,
  is_active: true, repo_sync: null, is_protected: false, ...over,
});

const err = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });

/**
 * The student's OWN builds. `loadProjects` seeds the read-only sample salon
 * build when the list lacks it, so an unfiltered read is never just what the
 * test stored.
 */
const own = () => loadProjects().filter((p) => !p.sample);

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  resetCopyState();
  api.post.mockResolvedValue({ data: { id: PROJ } });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => { jest.restoreAllMocks(); });

describe('a pull that reached the server', () => {
  it('confirms the copy, so nothing is reported', async () => {
    api.get.mockImplementation((url: string) => {
      if (url === '/api/portal/projects') return Promise.resolve({ data: { projects: [row(PROJ)] } });
      if (url === '/api/portal/projects/active') return Promise.resolve({ data: tree(PROJ, 'CoreOps', [bTask('STORY-000')]) });
      return Promise.reject(err(404));
    });

    await refreshProjectsFromBackend();

    expect(copyState().stale).toBe(false);
    expect(copyState().confirmedAt).not.toBeNull();
  });
});

describe('a pull that could not reach the server', () => {
  it('says the page is showing a saved copy', async () => {
    api.get.mockRejectedValue(err(503));

    await refreshProjectsFromBackend();

    expect(copyState().stale).toBe(true);
    expect(copyState().reason).toBe('pull_failed');
    expect(copyState().status).toBe(503);
  });

  it('reports a network error that carries no status at all', async () => {
    api.get.mockRejectedValue(new Error('Network Error'));

    await refreshProjectsFromBackend();

    expect(copyState().stale).toBe(true);
    expect(copyState().status).toBeUndefined();
  });

  it('leaves the local copy in place — failing soft is still the right fallback', async () => {
    hydrateProjects([localProject(PROJ, 'CoreOps', [
      { id: 't1', title: 'STORY-000', storyId: 'STORY-000', state: 'done', due: 'done' },
    ])]);
    api.get.mockRejectedValue(err(503));

    await refreshProjectsFromBackend();

    expect(own().map((p) => p.name)).toEqual(['CoreOps']);
  });
});

describe('the projects API switched off', () => {
  it('is NOT a stale copy', async () => {
    // A 404 means PROJECT_API_ENABLED is off. There is no server answer to be
    // behind, so a banner saying "we could not reach the server" would be
    // inventing a fault. reportFailure already excludes 404 for this reason.
    api.get.mockRejectedValue(err(404));

    await refreshProjectsFromBackend();

    expect(copyState().stale).toBe(false);
    expect(copyState().reason).toBeNull();
  });

  it('and is not a confirmation either', async () => {
    api.get.mockRejectedValue(err(404));

    await refreshProjectsFromBackend();

    expect(copyState().confirmedAt).toBeNull();
  });
});

describe('the recovery — what the incognito window did, as a button', () => {
  const stale = () => localProject(PROJ, 'CoreOps', [
    { id: 'local-t1', title: 'STORY-000', storyId: 'STORY-000', state: 'todo', due: 'up',
      prompt: 'This story is human work. There is no prompt on purpose.' },
    { id: 'local-t2', title: 'STORY-001', storyId: 'STORY-001', state: 'done', due: 'done' },
  ]);

  const server = () => tree(PROJ, 'CoreOps', [
    bTask('STORY-000', { build: 'Build the MCP server. Read the acceptance criteria first.' }),
    bTask('STORY-001'),
  ]);

  const taskOf = (storyId: string) => own()[0].lists
    .flatMap((l) => l.tasks).find((t) => t.storyId === storyId) as ProjectTask;

  it('replaces the card with the server\'s copy', async () => {
    hydrateProjects([stale()]);
    api.get.mockResolvedValue({ data: server() });

    await expect(refetchProjectFromServer(PROJ)).resolves.toBe(true);

    expect(taskOf('STORY-000').prompt).toBe('Build the MCP server. Read the acceptance criteria first.');
    expect(copyState().stale).toBe(false);
  });

  it('keeps a completion the server has not echoed yet', async () => {
    // The server still reports STORY-001 as not_started. The student said they
    // did it, and the monotonic rule everywhere else in this layer is that the
    // server may mark a story done and never undo one.
    hydrateProjects([stale()]);
    api.get.mockResolvedValue({ data: server() });

    await refetchProjectFromServer(PROJ);

    expect(taskOf('STORY-001').state).toBe('done');
  });

  it('keeps the aliases that let a bookmarked URL still resolve', async () => {
    // The store heals a pseudo id to the server uuid on read and folds the old
    // one into `legacyIds`. The refetch has to carry those across: a student
    // sitting on /workspace/p1755012345678/STORY-000 who clicks recover must
    // not be stranded on a URL that resolves to nothing.
    hydrateProjects([localProject('p1755012345678', 'CoreOps', [
      { id: 'local-t1', title: 'STORY-000', storyId: 'STORY-000', state: 'todo', due: 'up' },
    ], { pipelineProjectId: PROJ })]);
    api.get.mockResolvedValue({ data: server() });

    await refetchProjectFromServer(PROJ);

    expect(getProject('p1755012345678')?.id).toBe(PROJ);
  });

  it('touches nothing when the refetch fails, and says the copy is still stale', async () => {
    // FETCH FIRST, THEN REPLACE. Clearing before fetching would leave a student
    // whose network is down holding nothing at all, which is worse than the
    // stale copy they started with.
    hydrateProjects([stale()]);
    api.get.mockRejectedValue(err(503));

    await expect(refetchProjectFromServer(PROJ)).resolves.toBe(false);

    expect(taskOf('STORY-000').prompt).toBe('This story is human work. There is no prompt on purpose.');
    expect(copyState().reason).toBe('pull_failed');
  });

  it('leaves every OTHER build alone', async () => {
    const other = localProject('p999', 'Ambit', [
      { id: 'o1', title: 'STORY-000', storyId: 'STORY-000', state: 'todo', due: 'up' },
    ]);
    hydrateProjects([stale(), other]);
    api.get.mockResolvedValue({ data: server() });

    await refetchProjectFromServer(PROJ);

    expect(own().map((p) => p.name)).toEqual(['CoreOps', 'Ambit']);
    expect(own()[1].lists[0].tasks).toHaveLength(1);
  });
});
