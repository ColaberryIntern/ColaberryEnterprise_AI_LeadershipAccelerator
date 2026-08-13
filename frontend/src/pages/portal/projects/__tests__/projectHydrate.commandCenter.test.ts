/**
 * projectHydrate — the two fields the workspace header and the verification
 * signal depend on, across BOTH reconcile paths.
 *
 * The interesting one is overlay. A Command Center URL only exists after the
 * student has built and deployed STORY-000 — which is to say, on exactly the
 * device that already holds the project locally and therefore takes the OVERLAY
 * path, never the hydrate path. Mapping the URL only in backendTreeToProject
 * would make the button appear on every device except the one that did the
 * work. These tests pin that down, and pin down that carrying it does not
 * defeat the same-reference fast path the sync loop uses to skip a write.
 */
import {
  reconcileProjects, overlayCompletions, backendTreeToProject,
  type BackendProjectTree, type BackendTaskNode,
} from '../projectHydrate';
import type { StudentProject, ProjectTask } from '../projectsStore';

const localTask = (id: string, storyId: string, state: ProjectTask['state'] = 'todo'): ProjectTask =>
  ({ id, title: id, storyId, state, due: state === 'done' ? 'done' : 'up' });

const localProject = (id: string, tasks: ProjectTask[], over: Partial<StudentProject> = {}): StudentProject => ({
  id, name: id, slug: id, descriptor: '', accent: '#000', cover: '', icon: '', status: 'ready',
  createdAt: 1, stage: '', curStep: 2, size: 'project', idea: '',
  reqs: [], lists: [{ id: `${id}-L1`, step: 2, name: 'L1', sub: '', tasks }], activity: [],
  preview: { toolName: id, summary: '', tools: [], dataSources: [], guardrails: [] },
  ...over,
});

const bTask = (story_id: string, extra: Partial<BackendTaskNode> = {}): BackendTaskNode =>
  ({ id: `uuid-${story_id}`, story_id, requirement_key: null, title: story_id, description: null,
     status: 'not_started', position: 0, owner_agent: null, release_key: null, acceptance: null,
     build: null, blocked_by: [], ...extra });

const bTree = (tasks: BackendTaskNode[], over: Partial<BackendProjectTree> = {}): BackendProjectTree =>
  ({ id: 'proj-uuid', name: 'My Build', organization_name: null,
     lists: [{ id: 'l1', title: 'Release 0', position: 0, tasks }], ...over });

// ── command_center_url on the hydrate path ────────────────────────────────────
describe('command_center_url reaches a device that has never seen the build', () => {
  it('carries the URL onto the reconstructed project', () => {
    const p = backendTreeToProject(bTree([bTask('STORY-000')], { command_center_url: 'https://cc.example.com/' }));
    expect(p.commandCenterUrl).toBe('https://cc.example.com/');
  });

  it('is null, never undefined, when the server did not send one', () => {
    // One shape for "no Command Center" whether the server omitted the key or
    // sent null, so no consumer has to handle both.
    expect(backendTreeToProject(bTree([bTask('STORY-000')])).commandCenterUrl).toBeNull();
    expect(backendTreeToProject(bTree([bTask('a')], { command_center_url: null })).commandCenterUrl).toBeNull();
  });
});

// ── command_center_url on the overlay path (the one that actually matters) ────
describe('command_center_url reaches the device that built it', () => {
  const local = () => [localProject('p1', [localTask('t1', 'STORY-000')])];

  it('lands on a project this device already holds', () => {
    const r = reconcileProjects(local(), bTree([bTask('STORY-000')], { command_center_url: 'https://cc.example.com/' }));

    expect(r.mode).toBe('overlay');
    expect(r.changed).toBe(true);
    expect(r.next[0].commandCenterUrl).toBe('https://cc.example.com/');
  });

  it('does not report a change when neither side has a URL', () => {
    // The sync loop skips its write on `changed: false`; a spurious change here
    // would mean a localStorage write and a re-render on every poll.
    const r = reconcileProjects(local(), bTree([bTask('STORY-000')]));
    expect(r.changed).toBe(false);
    expect(r.mode).toBe('noop');
  });

  it('is idempotent — the second pass with the same URL is a no-op', () => {
    const tree = bTree([bTask('STORY-000')], { command_center_url: 'https://cc.example.com/' });
    const once = reconcileProjects(local(), tree);
    const twice = reconcileProjects(once.next, tree);

    expect(twice.changed).toBe(false);
    expect(twice.next[0]).toBe(once.next[0]);   // same reference, no write
  });

  it('follows the server when the URL changes or is withdrawn', () => {
    const withUrl = reconcileProjects(local(), bTree([bTask('STORY-000')], { command_center_url: 'https://old.example.com/' }));
    const moved = reconcileProjects(withUrl.next, bTree([bTask('STORY-000')], { command_center_url: 'https://new.example.com/' }));
    expect(moved.next[0].commandCenterUrl).toBe('https://new.example.com/');

    // The server is authoritative: a URL it no longer validates (an http one,
    // say, which projectTreeDto refuses) must not linger as a stale link.
    const withdrawn = reconcileProjects(moved.next, bTree([bTask('STORY-000')]));
    expect(withdrawn.changed).toBe(true);
    expect(withdrawn.next[0].commandCenterUrl).toBeNull();
  });

  it('does not disturb the completions overlay it shares a pass with', () => {
    const p = localProject('p1', [localTask('t1', 'STORY-000'), localTask('t2', 'STORY-001')]);
    const out = overlayCompletions(p, bTree(
      [bTask('STORY-000', { status: 'complete' }), bTask('STORY-001')],
      { command_center_url: 'https://cc.example.com/' },
    ));

    expect(out.lists[0].tasks[0].state).toBe('done');
    expect(out.lists[0].tasks[1].state).toBe('todo');
    expect(out.commandCenterUrl).toBe('https://cc.example.com/');
    expect(p.lists[0].tasks[0].state).toBe('todo');   // input not mutated
  });
});

// ── verified_at ───────────────────────────────────────────────────────────────
describe('verified_at is carried as verifiedAt', () => {
  it('maps a timestamp the server recorded', () => {
    const p = backendTreeToProject(bTree([bTask('STORY-000', { verified_at: '2026-08-12T14:00:00.000Z' })]));
    expect(p.lists[0].tasks[0].verifiedAt).toBe('2026-08-12T14:00:00.000Z');
  });

  it('reads a server that does not send the field yet as "not verified"', () => {
    // The field is absent from today's DTO. Absent and null mean the same
    // thing to every reader, so both normalise to null rather than undefined.
    expect(backendTreeToProject(bTree([bTask('STORY-000')])).lists[0].tasks[0].verifiedAt).toBeNull();
    expect(backendTreeToProject(bTree([bTask('a', { verified_at: null })])).lists[0].tasks[0].verifiedAt).toBeNull();
  });

  it('is independent of the student marking the task done', () => {
    const p = backendTreeToProject(bTree([bTask('STORY-000', { status: 'complete' })]));
    expect(p.lists[0].tasks[0].state).toBe('done');
    expect(p.lists[0].tasks[0].verifiedAt).toBeNull();   // done ≠ verified
  });
});
