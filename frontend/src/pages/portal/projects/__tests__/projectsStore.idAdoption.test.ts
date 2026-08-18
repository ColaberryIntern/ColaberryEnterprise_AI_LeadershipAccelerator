/**
 * DEFECT: after a successful build the browser kept its `p<epoch>` pseudo id
 * instead of adopting the server UUID, so every /api/portal/workspace/* call
 * carried a non-UUID project_id and was rejected 400 at the Zod boundary
 * (125 rejected requests in one 4.7h production window). Students who already
 * had a stale id in localStorage carried it for days.
 */
import { loadProjects, getProject, claimBackendProject, canonicalProjectId } from '../projectsStore';
import { isUuid } from '../projectIdentity';

const KEY = 'te_projects_v1';
const UUID = '3f1c9d2e-5b8a-4c17-9e04-8a7b6c5d4e3f';

/** A minimally-shaped stored project — the store only reads these fields here. */
const stored = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: 'Salon Booking Rebuild',
  slug: 'salon-booking-rebuild',
  descriptor: 'A build',
  accent: '#000', cover: '', icon: '', status: 'active',
  createdAt: 1755012345678, stage: 'Step 1', curStep: 1, size: 'standard', idea: 'x',
  reqs: [], lists: [], activity: [], preview: {}, weeks: 12,
  ...extra,
});

/** Seed localStorage with the sample the store always keeps, plus `projects`. */
function seed(projects: object[]): void {
  localStorage.setItem(KEY, JSON.stringify([...projects]));
}

beforeEach(() => localStorage.clear());

describe('a stale pseudo id already in the browser heals on next load', () => {
  it('re-keys the project to the server UUID', () => {
    seed([stored('p1755012345678', { pipelineProjectId: UUID })]);
    const mine = loadProjects().filter((p) => !p.sample);
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(UUID);
    expect(isUuid(mine[0].id)).toBe(true);
  });

  it('persists the heal, so it happens once and not on every read', () => {
    seed([stored('p1755012345678', { pipelineProjectId: UUID })]);
    loadProjects();
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]') as Array<{ id: string }>;
    expect(raw.some((p) => p.id === UUID)).toBe(true);
    expect(raw.some((p) => p.id === 'p1755012345678')).toBe(false);
  });

  it('still resolves the project by its old id, so a bookmarked workspace URL survives', () => {
    seed([stored('p1755012345678', { pipelineProjectId: UUID })]);
    loadProjects();
    expect(getProject('p1755012345678')?.id).toBe(UUID);
  });

  it('carries the acceptance ticks across the re-key instead of orphaning them', () => {
    seed([stored('p1755012345678', { pipelineProjectId: UUID })]);
    localStorage.setItem('te_ws_acc_p1755012345678_STORY-001', JSON.stringify({ 0: true }));
    loadProjects();
    expect(localStorage.getItem(`te_ws_acc_${UUID}_STORY-001`)).toBe(JSON.stringify({ 0: true }));
    expect(localStorage.getItem('te_ws_acc_p1755012345678_STORY-001')).toBeNull();
  });

  it('leaves a purely local build (no server id) exactly as it was', () => {
    seed([stored('p1755012345678')]);
    const mine = loadProjects().filter((p) => !p.sample);
    expect(mine[0].id).toBe('p1755012345678');
  });
});

describe('a successful build adopts the server id at claim time', () => {
  it('replaces the pseudo id with the server UUID', () => {
    seed([stored('p1755012345678')]);
    loadProjects();
    claimBackendProject('p1755012345678', UUID);
    const mine = loadProjects().filter((p) => !p.sample);
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(UUID);
    expect(mine[0].pipelineProjectId).toBe(UUID);
  });

  it('the id a workspace call would now carry is a UUID', () => {
    seed([stored('p1755012345678')]);
    loadProjects();
    claimBackendProject('p1755012345678', UUID);
    // This is the value ProjectsPage puts in the /workspace/:projectId route and
    // that ProjectWorkspacePage forwards to every /api/portal/workspace/* call.
    const routeId = getProject('p1755012345678')!.id;
    expect(isUuid(routeId)).toBe(true);
    expect(routeId).toBe(UUID);
  });

  it('is a no-op when the project already carries that server id', () => {
    seed([stored(UUID, { pipelineProjectId: UUID })]);
    loadProjects();
    claimBackendProject(UUID, UUID);
    expect(loadProjects().filter((p) => !p.sample).map((p) => p.id)).toEqual([UUID]);
  });

  it('refuses a claim that is not a UUID rather than writing junk into the route', () => {
    seed([stored('p1755012345678')]);
    loadProjects();
    claimBackendProject('p1755012345678', 'not-a-uuid');
    expect(loadProjects().filter((p) => !p.sample)[0].id).toBe('p1755012345678');
  });
});

describe('canonicalProjectId — what a stale workspace URL resolves to', () => {
  it('maps a stale pseudo id in the route to the server UUID', () => {
    seed([stored('p1755012345678', { pipelineProjectId: UUID })]);
    expect(canonicalProjectId('p1755012345678')).toBe(UUID);
  });

  it('leaves an already-canonical UUID untouched', () => {
    seed([stored('p1755012345678', { pipelineProjectId: UUID })]);
    expect(canonicalProjectId(UUID)).toBe(UUID);
  });

  it('passes an unknown id through rather than inventing one', () => {
    seed([stored('p1755012345678', { pipelineProjectId: UUID })]);
    expect(canonicalProjectId('p999')).toBe('p999');
    expect(canonicalProjectId('')).toBe('');
  });
});
