/**
 * The server owns the name — including on a device that already holds the build.
 *
 * ── THE DEFECT, MEASURED 2026-08-17 IN PRODUCTION ────────────────────────────
 *
 * Ali's project `cce94c20` is named `Student Early Warning` in `accelerator_prod`
 * (verified by query). His browser rendered the card as "Your build".
 *
 * Both were correct for the code as written. The project was hydrated on
 * 2026-08-16 while `projects.name` was still NULL, so the card cached
 * `FALLBACK_NAME`. The real name arrived afterwards, from the naming backfill.
 * And `overlayCompletions` — the only path a device that ALREADY holds a project
 * ever takes — updated task state and the Command Center URL and nothing else.
 * `backendTreeToProject` does read `tree.name`, which is why this looked fixed:
 * that path runs only on a device seeing the build for the first time.
 *
 * So a rename could reach every device EXCEPT the ones that had the project.
 *
 * ── THE CONSTRAINT THAT MAKES IT NON-TRIVIAL ─────────────────────────────────
 *
 * `importProject` deliberately never writes the client's `name` onto the project
 * row. A browser-built project that was mirrored up therefore has `name: NULL`
 * server-side while holding a real student-chosen name locally. Adopting
 * unconditionally would rename that student's build to "Your build" — replacing
 * a stale-name bug with a data-destroying one.
 */
import {
  reconcileProjects, overlayCompletions, adoptServerIdentity,
  FALLBACK_NAME, UNKNOWN_INVENTORY,
  type BackendProjectTree, type ServerInventory,
} from '../projectHydrate';
import type { StudentProject, ProjectTask } from '../projectsStore';

const PROJECT_ID = 'cce94c20-a398-45b3-a6fb-b3fc87b6b1ef';

const localTask = (id: string, storyId: string, state: 'todo' | 'done' = 'todo'): ProjectTask => ({
  id, title: `T ${storyId}`, storyId, state, due: state === 'done' ? 'done' : 'up',
});

function localProject(over: Partial<StudentProject> = {}): StudentProject {
  return {
    id: PROJECT_ID,
    name: FALLBACK_NAME,          // exactly what Ali's browser had cached
    slug: 'your-build',
    descriptor: 'Capstone build',
    accent: '#367895', cover: 'linear-gradient(#000,#111)', icon: 'M0 0',
    status: 'ready', createdAt: 1, stage: 'Release 0', curStep: 2, size: 'project',
    idea: 'x', reqs: [],
    lists: [{ id: 'l1', step: 2, name: 'Release 0', sub: '', tasks: [localTask('t1', 'STORY-000')] }],
    activity: [], preview: { toolName: 'x', summary: 'y', tools: [], dataSources: [], guardrails: [] },
    origin: 'pipeline', pipelineProjectId: PROJECT_ID,
    ...over,
  };
}

function tree(over: Partial<BackendProjectTree> = {}): BackendProjectTree {
  return {
    id: PROJECT_ID,
    name: 'Student Early Warning',
    organization_name: null,
    lists: [{
      id: 'l1', title: 'Release 0', position: 0,
      tasks: [{
        id: 't1', story_id: 'STORY-000', requirement_key: null, title: 'T STORY-000',
        description: null, status: 'not_started', position: 0, owner_agent: null,
        release_key: 'r0', acceptance: null, build: null, blocked_by: [],
      }],
    }],
    ...over,
  };
}

const inventory = (ids: string[], activeId: string | null = null): ServerInventory =>
  ({ known: true, ids, hydratableIds: ids, activeId });

// ─────────────────────────────────────────────────────────────────────────────
describe('a server-side rename reaches a device that already holds the project', () => {
  it('replaces the cached fallback name with the real server name', () => {
    const result = overlayCompletions(localProject(), tree());

    expect(result.name).toBe('Student Early Warning');
    expect(result.name).not.toBe(FALLBACK_NAME);
  });

  it('updates the slug alongside the name so they cannot disagree', () => {
    expect(overlayCompletions(localProject(), tree()).slug).toBe('student-early-warning');
  });

  it('lands the rename through the full reconcile, not just the helper', () => {
    const r = reconcileProjects([localProject()], tree(), inventory([PROJECT_ID], PROJECT_ID));

    expect(r.changed).toBe(true);
    expect(r.next).toHaveLength(1);
    expect(r.next[0].name).toBe('Student Early Warning');
  });

  it('applies a rename and a completion arriving in the same pull', () => {
    const t = tree();
    t.lists[0].tasks[0].status = 'complete';

    const result = overlayCompletions(localProject(), t);

    expect(result.name).toBe('Student Early Warning');
    expect(result.lists[0].tasks[0].state).toBe('done');
  });
});

describe('it never destroys a good local name', () => {
  it('keeps the local name when the server has none (the mirrored-project case)', () => {
    // `importProject` never writes the client's name, so a mirrored project is
    // NULL-named server-side while holding the student's own name locally.
    const local = localProject({ name: 'PawLife', slug: 'pawlife' });

    const result = overlayCompletions(local, tree({ name: null }));

    expect(result.name).toBe('PawLife');
    expect(result.slug).toBe('pawlife');
  });

  it('keeps the local name when the server name is whitespace only', () => {
    const local = localProject({ name: 'PawLife' });
    expect(overlayCompletions(local, tree({ name: '   ' })).name).toBe('PawLife');
  });

  it('never replaces a real local name with the fallback', () => {
    const local = localProject({ name: 'PawLife' });
    expect(overlayCompletions(local, tree({ name: null })).name).not.toBe(FALLBACK_NAME);
  });
});

describe('adoptServerIdentity keeps the same-reference fast path', () => {
  it('returns the SAME object when the name already matches', () => {
    const local = localProject({ name: 'Student Early Warning', slug: 'student-early-warning' });
    expect(adoptServerIdentity(local, tree())).toBe(local);
  });

  it('returns the SAME object when the server has no name at all', () => {
    const local = localProject({ name: 'PawLife' });
    expect(adoptServerIdentity(local, tree({ name: null }))).toBe(local);
  });

  it('reports no change from reconcile on a second identical pass (idempotent)', () => {
    const first = reconcileProjects([localProject()], tree(), inventory([PROJECT_ID], PROJECT_ID));
    const second = reconcileProjects(first.next, tree(), inventory([PROJECT_ID], PROJECT_ID));

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.next).toBe(first.next);
  });

  it('does not mutate the project it was given', () => {
    const local = localProject();
    overlayCompletions(local, tree());
    expect(local.name).toBe(FALLBACK_NAME);
  });
});

describe('the descriptor follows the name without ever echoing it', () => {
  it('adopts the organization name as the subtitle', () => {
    const result = overlayCompletions(localProject(), tree({ organization_name: 'Colaberry' }));
    expect(result.descriptor).toBe('Colaberry');
  });

  it('does not set a subtitle that equals the new heading', () => {
    const result = overlayCompletions(
      localProject(),
      tree({ name: 'CoreOps', organization_name: 'CoreOps' }),
    );
    expect(result.name).toBe('CoreOps');
    expect(result.descriptor).not.toBe('CoreOps');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
/**
 * The two cases that must NOT be conflated. A card the server no longer lists is
 * a ghost and has to go; a build created in this browser that has not reached the
 * server yet must survive, or the student watches their new project vanish
 * mid-creation.
 *
 * The distinguishing fact is `backendIdOf`: a project that reached the server
 * carries a backend id (a claim, or a UUID of its own). A browser-minted project
 * has `p<epoch>` and no claim, so the server was never in a position to testify
 * about it either way.
 */
describe('ghosts disappear; in-flight local creations survive', () => {
  const ghost = (): StudentProject => localProject({
    id: '40a5cea6-ace8-4734-8220-7e62df2111e5',
    name: 'Deleted Build',
    pipelineProjectId: '40a5cea6-ace8-4734-8220-7e62df2111e5',
  });
  const inFlight = (): StudentProject => localProject({
    id: 'p1786587289890',      // browser-minted: `p` + epoch
    name: 'Brand New Build',
    origin: 'local',
    pipelineProjectId: null,
  });

  it('drops a project the server has stopped listing', () => {
    const r = reconcileProjects(
      [localProject(), ghost()],
      tree(),
      inventory([PROJECT_ID], PROJECT_ID),
    );

    expect(r.next.map((p) => p.id)).toEqual([PROJECT_ID]);
    expect(r.removed?.map((p) => p.name)).toEqual(['Deleted Build']);
  });

  it('KEEPS a browser-built project that has never reached the server', () => {
    const r = reconcileProjects(
      [localProject(), inFlight()],
      tree(),
      inventory([PROJECT_ID], PROJECT_ID),
    );

    expect(r.next.map((p) => p.name)).toContain('Brand New Build');
    expect(r.removed).toEqual([]);
  });

  it('keeps the in-flight build while dropping the ghost in the same pass', () => {
    const r = reconcileProjects(
      [localProject(), ghost(), inFlight()],
      tree(),
      inventory([PROJECT_ID], PROJECT_ID),
    );

    const names = r.next.map((p) => p.name);
    expect(names).toContain('Brand New Build');
    expect(names).not.toContain('Deleted Build');
  });

  it('removes NOTHING when the inventory fetch failed', () => {
    const r = reconcileProjects([localProject(), ghost()], tree(), UNKNOWN_INVENTORY);
    expect(r.next).toHaveLength(2);
    expect(r.removed).toEqual([]);
  });

  /**
   * An ARCHIVED project must vanish for real, not linger as a ghost that
   * reappears on the next reload. The server drops it from
   * `GET /api/portal/projects`, so it is absent from the inventory — which is
   * exactly the "reached the server and is now gone" shape the prune removes.
   */
  it('removes an ARCHIVED project once the server stops listing it', () => {
    const archived = localProject({
      id: '40a5cea6-ace8-4734-8220-7e62df2111e5',
      name: 'Archived Build',
      pipelineProjectId: '40a5cea6-ace8-4734-8220-7e62df2111e5',
    });

    // The archive also repointed the active project, so /active now returns the
    // OTHER build and the inventory no longer contains the archived id.
    const r = reconcileProjects(
      [archived, localProject()],
      tree(),
      inventory([PROJECT_ID], PROJECT_ID),
    );

    expect(r.next.map((p) => p.id)).toEqual([PROJECT_ID]);
    expect(r.removed?.map((p) => p.id)).toEqual(['40a5cea6-ace8-4734-8220-7e62df2111e5']);
  });

  it('removes an archived project even when it was the ACTIVE one and nothing replaced it', () => {
    const archived = localProject({ name: 'Archived Build' });

    // No active tree at all: the student archived their only build. The
    // inventory is known and non-empty only because another project remains;
    // here it is genuinely empty, so the interlock declines to prune. That is
    // the DESIGNED behaviour (an empty inventory with no active tree is
    // indistinguishable from a broken response) — assert it rather than pretend
    // otherwise, because the UI removes the card optimistically on archive.
    const r = reconcileProjects([archived], null, inventory([], null));

    expect(r.next).toHaveLength(1);
    expect(r.removed).toEqual([]);
  });
});
