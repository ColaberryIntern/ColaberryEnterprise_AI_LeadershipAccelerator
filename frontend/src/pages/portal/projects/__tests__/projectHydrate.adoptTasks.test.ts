/**
 * A story the server has and the browser does not.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 *
 * MEASURED 2026-08-17, production, qninying@gmail.com, project
 * 48f67531-dbbe-4176-b20c-29d4603fa802. The student reported — twice — that he
 * could not see STORY-000. He was right.
 *
 * The server row was healthy and structurally identical to the row he COULD
 * see: same list ("Release 0 · Initial Setup and Trust Spine"), adjacent
 * positions, both `not_started`, neither blocked, same due date. The read API
 * returned it in full: 28 tasks, STORY-000 among them, 30,027 characters of
 * prompt, in a 114 KB payload. `backendTreeToProject` mapped all 28 faithfully.
 *
 * The browser dropped it, and here is why. STORY-000 is deliberately kept OUT
 * of `plan.stories` (see backend commandCenterStory.ts: it fulfils no
 * requirement of the student's own system, so counting it would distort the
 * traceability gate and the release sizing). It exists ONLY as a materialized
 * task row, prepended by materializeTasks. So a browser that cached this build
 * from anything plan-shaped cached 27 stories, with no STORY-000 and no way to
 * know one was missing.
 *
 * From that moment the device is stuck, because `overlayCompletions` — the ONLY
 * path a device that already holds a project ever takes — could flip task
 * state, adopt the server's name, and record the Command Center URL, and
 * nothing else. There was no code anywhere that could move a server-side task
 * ADDITION onto an existing card. `reconcileProjects` reported `noop`: the two
 * sides disagreed about what exists and nothing noticed.
 *
 * This is the same shape as the rename defect fixed by `adoptServerIdentity`
 * two days earlier. That fix taught the overlay path to adopt a changed NAME.
 * This one teaches it to adopt a changed TASK SET.
 *
 * ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
 *
 * Not a size or quota limit. The 30,027-character prompt was the eye-catching
 * difference (STORY-001 carries 4,242) and it is a red herring: the whole tree
 * serialises to 114 KB, far inside the ~5 MB localStorage budget, and scenario
 * A below proves all 28 tasks survive the mapper intact.
 *
 * Not the colliding list positions either. That project really does carry two
 * generations sharing a position space (two lists at 2, two at 5), which is why
 * his card led with "Project DNA & Requirements". Ties break arbitrarily, but
 * Array.prototype.sort is stable, so the collision REORDERS and never drops.
 * Tracked separately; it is not what hid the story.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 *
 * Adoption ADDS and never removes. A task the server has and the browser lacks
 * is added at the server's position; a task the browser has and the server
 * lacks is KEPT. The student's completions are the thing that must survive, so
 * the merge is only ever additive: losing a plan is the bug being fixed here,
 * and losing ten hand-ticked completions would just be a worse one.
 */
import {
  reconcileProjects, overlayCompletions, backendTreeToProject,
  type BackendProjectTree, type BackendTaskNode, type BackendListNode,
} from '../projectHydrate';
import type { StudentProject, ProjectTask } from '../projectsStore';

const PROJECT_ID = 'proj-uuid';

const bTask = (
  story_id: string, position: number, status = 'not_started', over: Partial<BackendTaskNode> = {},
): BackendTaskNode => ({
  id: `uuid-${story_id}`, story_id, requirement_key: null, title: `${story_id} title`,
  description: null, status, position, owner_agent: null, release_key: null,
  acceptance: null, build: null, blocked_by: [], ...over,
});

const bList = (id: string, title: string, position: number, tasks: BackendTaskNode[]): BackendListNode =>
  ({ id, title, position, tasks });

/** His shape: STORY-000 first in Release 0, then the stories the plan knows about. */
const serverTree = (): BackendProjectTree => ({
  id: PROJECT_ID, name: 'CoreOps', organization_name: null,
  lists: [
    bList('l-r0', 'Release 0 · Initial Setup and Trust Spine', 0,
      [bTask('STORY-000', 0), bTask('STORY-001', 1), bTask('STORY-002', 2)]),
    bList('l-r1', 'Release 1 · AI Analysis and Recommendations', 1,
      [bTask('STORY-003', 0), bTask('STORY-004', 1)]),
  ],
});

const localTask = (storyId: string, state: ProjectTask['state'] = 'todo'): ProjectTask =>
  ({ id: `uuid-${storyId}`, title: `${storyId} title`, storyId, state, due: state === 'done' ? 'done' : 'up' });

/** A device holding the whole plan EXCEPT STORY-000 — exactly what he had. */
const cachedWithoutStory000 = (over: Partial<StudentProject> = {}): StudentProject => ({
  id: PROJECT_ID, name: 'CoreOps', slug: 'coreops', descriptor: '', accent: '#000', cover: '',
  icon: '', status: 'ready', createdAt: 1, stage: '', curStep: 2, size: 'project', idea: '',
  sample: false, reqs: [], activity: [],
  preview: { toolName: 'CoreOps', summary: '', tools: [], dataSources: [], guardrails: [] },
  lists: [
    { id: 'l-r0', step: 2, name: 'Release 0 · Initial Setup and Trust Spine', sub: '',
      tasks: [localTask('STORY-001'), localTask('STORY-002')] },
    { id: 'l-r1', step: 3, name: 'Release 1 · AI Analysis and Recommendations', sub: '',
      tasks: [localTask('STORY-003'), localTask('STORY-004')] },
  ],
  ...over,
});

const keysOf = (p: StudentProject): string[] =>
  p.lists.flatMap((l) => l.tasks.map((t) => t.storyId || t.id));
const doneCount = (p: StudentProject): number =>
  p.lists.flatMap((l) => l.tasks).filter((t) => t.state === 'done').length;

// ── the defect, stated as the student stated it ──────────────────────────────
describe('a story the server has and this device does not', () => {
  it('is ADDED to the card the device already holds', () => {
    const before = keysOf(cachedWithoutStory000());
    expect(before).not.toContain('STORY-000');   // the precondition, spelled out

    const merged = overlayCompletions(cachedWithoutStory000(), serverTree());

    expect(keysOf(merged)).toContain('STORY-000');
  });

  it('lands at the server\'s position, not appended to the end', () => {
    const merged = overlayCompletions(cachedWithoutStory000(), serverTree());
    const r0 = merged.lists.find((l) => l.id === 'l-r0')!;

    // Position 0 is the whole point: STORY-000 is the first thing a student
    // builds, and a Command Center story sorted last is a different bug.
    expect(r0.tasks.map((t) => t.storyId)).toEqual(['STORY-000', 'STORY-001', 'STORY-002']);
  });

  it('reaches the student through reconcileProjects, which no longer reports noop', () => {
    const r = reconcileProjects([cachedWithoutStory000()], serverTree());

    expect(r.mode).toBe('overlay');
    expect(r.changed).toBe(true);
    expect(keysOf(r.next[0])).toContain('STORY-000');
  });

  it('carries the adopted story\'s prompt, so the workspace has something to show', () => {
    const tree = serverTree();
    tree.lists[0].tasks[0].build = 'BUILD PROMPT FOR STORY-000';

    const merged = overlayCompletions(cachedWithoutStory000(), tree);
    const adopted = merged.lists.flatMap((l) => l.tasks).find((t) => t.storyId === 'STORY-000')!;

    expect(adopted.prompt).toBe('BUILD PROMPT FOR STORY-000');
  });
});

// ── the constraint: his ten ticks ────────────────────────────────────────────
describe('the student\'s completions', () => {
  /** Ten legacy tasks he hand-ticked, mirrored up and marked complete server-side. */
  const withTenDone = (): StudentProject => {
    const p = cachedWithoutStory000();
    const legacy = Array.from({ length: 10 }, (_, i) => localTask(`p1786115158272-t${i + 1}`, 'done'));
    return { ...p, lists: [...p.lists, { id: 'l-legacy', step: 4, name: 'Core build', sub: '', tasks: legacy }] };
  };

  it('all ten survive adoption', () => {
    const before = withTenDone();
    expect(doneCount(before)).toBe(10);

    const after = overlayCompletions(before, serverTree());

    expect(doneCount(after)).toBe(10);
  });

  it('are kept even though the server tree does not mention them', () => {
    const after = overlayCompletions(withTenDone(), serverTree());
    const keys = keysOf(after);

    // ADDS AND NEVER REMOVES. The server tree here carries only STORY-*, so a
    // subtractive merge would wipe all ten.
    expect(keys).toContain('p1786115158272-t1');
    expect(keys).toContain('p1786115158272-t10');
    expect(keys.filter((k) => k.startsWith('p1786115158272-t'))).toHaveLength(10);
  });

  it('an adopted task that is already complete server-side arrives done', () => {
    const tree = serverTree();
    tree.lists[0].tasks[0].status = 'complete';

    const merged = overlayCompletions(cachedWithoutStory000(), tree);
    const adopted = merged.lists.flatMap((l) => l.tasks).find((t) => t.storyId === 'STORY-000')!;

    expect(adopted.state).toBe('done');
  });
});

// ── a whole list the device never saw ────────────────────────────────────────
describe('a list the server has and this device does not', () => {
  it('is adopted with its tasks', () => {
    const tree = serverTree();
    tree.lists.push(bList('l-r2', 'Release 2 · User Interface', 2, [bTask('STORY-005', 0)]));

    const merged = overlayCompletions(cachedWithoutStory000(), tree);

    expect(merged.lists.map((l) => l.id)).toContain('l-r2');
    expect(keysOf(merged)).toContain('STORY-005');
  });
});

// ── idempotency and the fast path ────────────────────────────────────────────
describe('running twice', () => {
  it('is a no-op the second time', () => {
    const first = overlayCompletions(cachedWithoutStory000(), serverTree());
    const second = overlayCompletions(first, serverTree());

    // Same REFERENCE, not merely equal: callers skip the localStorage write and
    // the re-render on this, and a quiet sync has to stay genuinely quiet.
    expect(second).toBe(first);
  });

  it('leaves a device that is already in step untouched', () => {
    const inStep = backendTreeToProject(serverTree());

    expect(overlayCompletions(inStep, serverTree())).toBe(inStep);
  });

  it('reconcileProjects reports no change on the second pass', () => {
    const once = reconcileProjects([cachedWithoutStory000()], serverTree());
    const twice = reconcileProjects(once.next, serverTree());

    expect(twice.changed).toBe(false);
  });
});
