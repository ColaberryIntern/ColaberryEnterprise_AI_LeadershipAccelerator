/**
 * EVERY LIVE BUILD GETS A CARD, NOT JUST THE ACTIVE ONE.
 *
 * MEASURED 2026-08-25, qninying@gmail.com, enrollment acda8718. The server held
 * two live projects on that enrollment: `CoreOps` (active, 28 tasks, 22 of them
 * complete) and `Ambit` (13 tasks, created server-side on 2026-08-19 and never
 * active on his device). `GET /api/portal/projects` returned BOTH — confirmed
 * against production, 200, with `Ambit` in the body — and the Projects page
 * rendered exactly one build plus the training example. Reproduced in a real
 * browser on enterprise.colaberry.ai before the fix and again after it.
 *
 * THE DEFECT. `reconcileFromBackend` hydrates from `/api/portal/projects/active`,
 * which returns a single tree. The inventory from `/api/portal/projects` was
 * read for exactly two purposes — naming the active id, and pruning cards for
 * projects that no longer exist — and was never a source of new cards. So a
 * project that is live on the server but not active had NO path onto the page,
 * and reloading could not help, because the reload re-ran the same one-tree
 * pull. `hydrateProjectById` already did the right thing and was wired only to
 * the archive-restore flow.
 *
 * This was never a data problem. Both of his projects carried the same wrong
 * `organization_name` ("Oklahoma Turnpike Authority") and the one carrying it
 * rendered fine, which is what rules the column out as the cause.
 *
 * THE RISK THE FIX CREATES, AND THE GUARD. "Hydrate everything the server owns"
 * points straight at `fcce50ef-…`, the platform's own ~144k-row project record,
 * which sits on a real enrollment (Ali's) and has `name IS NULL` so it would
 * render as a build called "Your build". The server marks it `is_protected` and
 * hydration skips it, while pruning still sees it. Those two lists must not be
 * collapsed back into one — see ServerInventory.hydratableIds.
 */
jest.mock('../../../../utils/portalApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() },
}));

import portalApi from '../../../../utils/portalApi';
import { refreshProjectsFromBackend } from '../projectSync';
import { loadProjects, hydrateProjects } from '../projectsStore';
import type { BackendProjectTree, BackendTaskNode } from '../projectHydrate';
import type { StudentProject, ProjectTask } from '../projectsStore';

const api = portalApi as unknown as { get: jest.Mock; post: jest.Mock; put: jest.Mock; patch: jest.Mock };

const COREOPS = '48f67531-dbbe-4176-b20c-29d4603fa802';   // active
const AMBIT = '860288eb-30a5-4344-a27b-90cffbc54978';     // live, never active
const PLATFORM = 'fcce50ef-fe01-471d-a3ff-cd6948d092c2';  // the platform's own record

const bTask = (story_id: string, status = 'not_started'): BackendTaskNode => ({
  id: `uuid-${story_id}`, story_id, requirement_key: null, title: story_id, description: null,
  status, position: 0, owner_agent: null, release_key: null, acceptance: null, build: null,
  blocked_by: [],
});

const tree = (id: string, name: string, stories: string[]): BackendProjectTree => ({
  id, name, organization_name: 'Oklahoma Turnpike Authority',
  lists: [{ id: `${id}-L1`, title: 'Release 0', position: 0, tasks: stories.map((s) => bTask(s)) }],
});

const localProject = (id: string, name: string, over: Partial<StudentProject> = {}): StudentProject => ({
  id, name, slug: name, descriptor: '', accent: '#000', cover: '', icon: '', status: 'ready',
  createdAt: 1, stage: '', curStep: 2, size: 'project', idea: '', sample: false,
  reqs: [], activity: [],
  lists: [{
    id: `${id}-L1`, step: 2, name: 'L1', sub: '',
    tasks: [{ id: `${id}-t1`, title: 't1', storyId: 'STORY-000', state: 'todo', due: 'up' } as ProjectTask],
  }],
  preview: { toolName: name, summary: '', tools: [], dataSources: [], guardrails: [] },
  ...over,
});

/** The list rows `GET /api/portal/projects` returns, in the shape the client reads. */
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: id, organization_name: null, project_stage: 'discovery',
  requirements_completion_pct: null, health_score: null,
  is_active: false, repo_sync: null, is_protected: false, ...over,
});

/** Route the mocked GETs the way the real endpoints answer. */
function serve(inventory: unknown[], active: BackendProjectTree | null, trees: Record<string, BackendProjectTree>) {
  api.get.mockImplementation((url: string) => {
    if (url === '/api/portal/projects') return Promise.resolve({ data: { projects: inventory } });
    if (url === '/api/portal/projects/active') return Promise.resolve({ data: active ?? {} });
    const id = url.replace('/api/portal/projects/', '');
    if (trees[id]) return Promise.resolve({ data: trees[id] });
    return Promise.reject(Object.assign(new Error('not found'), { response: { status: 404 } }));
  });
}

const ownNames = () => loadProjects().filter((p) => !p.sample).map((p) => p.name).sort();

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  api.post.mockResolvedValue({ data: { id: COREOPS } });
});

describe('a live project that is not the active one', () => {
  it('gets a card — the Ambit case', async () => {
    serve(
      [row(AMBIT, { name: 'Ambit' }), row(COREOPS, { name: 'CoreOps', is_active: true })],
      tree(COREOPS, 'CoreOps', ['STORY-000', 'STORY-001']),
      { [AMBIT]: tree(AMBIT, 'Ambit', ['STORY-000', 'STORY-001', 'STORY-002']) },
    );

    await refreshProjectsFromBackend();

    expect(ownNames()).toEqual(['Ambit', 'CoreOps']);
  });

  it('is fetched by id, which is the request that never used to be made', async () => {
    serve(
      [row(AMBIT, { name: 'Ambit' }), row(COREOPS, { name: 'CoreOps', is_active: true })],
      tree(COREOPS, 'CoreOps', ['STORY-000']),
      { [AMBIT]: tree(AMBIT, 'Ambit', ['STORY-000']) },
    );

    await refreshProjectsFromBackend();

    expect(api.get).toHaveBeenCalledWith(`/api/portal/projects/${AMBIT}`);
  });

  it('leaves the active build and its completions alone', async () => {
    // His 22 hand-ticked completions on CoreOps are the only visible progress he
    // has. Hydrating a second build must not cost him any of it.
    const coreops = localProject(COREOPS, 'CoreOps');
    coreops.lists[0].tasks[0].state = 'done';
    hydrateProjects([coreops]);

    serve(
      [row(AMBIT, { name: 'Ambit' }), row(COREOPS, { name: 'CoreOps', is_active: true })],
      tree(COREOPS, 'CoreOps', ['STORY-000']),
      { [AMBIT]: tree(AMBIT, 'Ambit', ['STORY-000']) },
    );

    await refreshProjectsFromBackend();

    const held = loadProjects().find((p) => p.id === COREOPS)!;
    expect(held.lists[0].tasks.find((t) => t.storyId === 'STORY-000')!.state).toBe('done');
  });
});

describe('the platform record', () => {
  it('never becomes a build card', async () => {
    serve(
      [row(PLATFORM, { name: null, is_protected: true }), row(COREOPS, { name: 'CoreOps', is_active: true })],
      tree(COREOPS, 'CoreOps', ['STORY-000']),
      { [PLATFORM]: tree(PLATFORM, null as unknown as string, ['STORY-000']) },
    );

    await refreshProjectsFromBackend();

    expect(ownNames()).toEqual(['CoreOps']);
  });

  it('is never even requested', async () => {
    serve(
      [row(PLATFORM, { name: null, is_protected: true }), row(COREOPS, { name: 'CoreOps', is_active: true })],
      tree(COREOPS, 'CoreOps', ['STORY-000']),
      {},
    );

    await refreshProjectsFromBackend();

    expect(api.get).not.toHaveBeenCalledWith(`/api/portal/projects/${PLATFORM}`);
  });
});

describe('projects this device already holds', () => {
  it('are not fetched again', async () => {
    hydrateProjects([localProject(AMBIT, 'Ambit')]);
    serve(
      [row(AMBIT, { name: 'Ambit' }), row(COREOPS, { name: 'CoreOps', is_active: true })],
      tree(COREOPS, 'CoreOps', ['STORY-000']),
      { [AMBIT]: tree(AMBIT, 'Ambit', ['STORY-000']) },
    );

    await refreshProjectsFromBackend();

    expect(api.get).not.toHaveBeenCalledWith(`/api/portal/projects/${AMBIT}`);
  });

  it('are matched by their backend claim too, so a mirrored build is not duplicated', async () => {
    // A locally-built project keeps its own `p<epoch>` id and records the server
    // row it became in `pipelineProjectId`. Matching on `id` alone would give it
    // a second card on the next load.
    hydrateProjects([localProject('p1755012345678', 'Ambit', { pipelineProjectId: AMBIT })]);
    serve(
      [row(AMBIT, { name: 'Ambit' }), row(COREOPS, { name: 'CoreOps', is_active: true })],
      tree(COREOPS, 'CoreOps', ['STORY-000']),
      { [AMBIT]: tree(AMBIT, 'Ambit', ['STORY-000']) },
    );

    await refreshProjectsFromBackend();

    expect(api.get).not.toHaveBeenCalledWith(`/api/portal/projects/${AMBIT}`);
    expect(ownNames()).toEqual(['Ambit', 'CoreOps']);
  });
});

describe('failure paths', () => {
  it('an unreachable second project does not cost the others their card', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => { });
    const OTHER = '11111111-2222-4333-8444-555566667777';
    serve(
      [row(AMBIT, { name: 'Ambit' }), row(OTHER, { name: 'Other' }), row(COREOPS, { name: 'CoreOps', is_active: true })],
      tree(COREOPS, 'CoreOps', ['STORY-000']),
      { [AMBIT]: tree(AMBIT, 'Ambit', ['STORY-000']) },   // OTHER is deliberately absent → 404
    );

    await refreshProjectsFromBackend();

    expect(ownNames()).toEqual(['Ambit', 'CoreOps']);
    spy.mockRestore();
  });

  it('hydrates nothing when the inventory could not be read', async () => {
    // known:false means "we learned nothing". Inventing cards from a failed
    // read is how a transient error turns into wrong data on screen.
    api.get.mockImplementation((url: string) => {
      if (url === '/api/portal/projects') {
        return Promise.reject(Object.assign(new Error('off'), { response: { status: 404 } }));
      }
      if (url === '/api/portal/projects/active') {
        return Promise.resolve({ data: tree(COREOPS, 'CoreOps', ['STORY-000']) });
      }
      return Promise.reject(Object.assign(new Error('nope'), { response: { status: 404 } }));
    });

    await refreshProjectsFromBackend();

    expect(api.get).not.toHaveBeenCalledWith(`/api/portal/projects/${AMBIT}`);
    expect(ownNames()).toEqual(['CoreOps']);
  });

  it('an older server that omits is_protected still hydrates ordinary projects', async () => {
    const legacyRow = (id: string, name: string, is_active = false) => ({
      id, name, organization_name: null, project_stage: null,
      requirements_completion_pct: null, health_score: null, is_active, repo_sync: null,
    });
    serve(
      [legacyRow(AMBIT, 'Ambit'), legacyRow(COREOPS, 'CoreOps', true)],
      tree(COREOPS, 'CoreOps', ['STORY-000']),
      { [AMBIT]: tree(AMBIT, 'Ambit', ['STORY-000']) },
    );

    await refreshProjectsFromBackend();

    expect(ownNames()).toEqual(['Ambit', 'CoreOps']);
  });
});
