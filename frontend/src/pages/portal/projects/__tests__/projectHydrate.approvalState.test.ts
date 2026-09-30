/**
 * approval_state must ride through hydration the same way command_center_url
 * does: adopted on a fresh device, adopted by the overlay on a device that
 * already holds the build (the one that just approved it), and — critically —
 * absent maps to null (ungated), never gated, so no existing student is locked
 * out by a server that has not sent the field.
 */
import {
  overlayCompletions, backendTreeToProject,
  type BackendProjectTree, type BackendTaskNode, type BackendListNode,
} from '../projectHydrate';
import type { StudentProject, ProjectTask } from '../projectsStore';

const bTask = (story_id: string): BackendTaskNode => ({
  id: `uuid-${story_id}`, story_id, requirement_key: null, title: `${story_id} title`,
  description: null, status: 'not_started', position: 0, owner_agent: null, release_key: null,
  acceptance: null, build: null, blocked_by: [],
});
const bList = (tasks: BackendTaskNode[]): BackendListNode => ({ id: 'l0', title: 'Release 0', position: 0, tasks });

const tree = (over: Partial<BackendProjectTree> = {}): BackendProjectTree => ({
  id: 'proj-uuid', name: 'CoreOps', organization_name: null, lists: [bList([bTask('STORY-000')])], ...over,
});

const localTask = (storyId: string): ProjectTask => ({ id: `uuid-${storyId}`, title: `${storyId} title`, storyId, state: 'todo', due: 'up' });
const local = (over: Partial<StudentProject> = {}): StudentProject => ({
  id: 'proj-uuid', name: 'CoreOps', slug: 'coreops', descriptor: '', accent: '#000', cover: '',
  icon: '', status: 'ready', createdAt: 1, stage: '', curStep: 2, size: 'project', idea: '',
  sample: false, reqs: [], activity: [],
  preview: { toolName: 'CoreOps', summary: '', tools: [], dataSources: [], guardrails: [] },
  lists: [{ id: 'l0', step: 2, name: 'Release 0', sub: '', tasks: [localTask('STORY-000')] }],
  ...over,
});

describe('backendTreeToProject carries approval_state', () => {
  it('maps a pending build to pending_approval', () => {
    expect(backendTreeToProject(tree({ approval_state: 'pending_approval' })).approvalState).toBe('pending_approval');
  });
  it('maps an absent field to null (ungated), not to a gated state', () => {
    expect(backendTreeToProject(tree()).approvalState).toBeNull();
  });
});

describe('overlayCompletions adopts an approval transition on the device that acted', () => {
  it('moves a held pending card to approved when the server says so', () => {
    const p = local({ approvalState: 'pending_approval' });
    const out = overlayCompletions(p, tree({ approval_state: 'approved' }));
    expect(out).not.toBe(p);              // it changed
    expect(out.approvalState).toBe('approved');
  });

  it('returns the SAME reference when nothing — approval included — changed', () => {
    const p = local({ approvalState: 'approved' });
    const out = overlayCompletions(p, tree({ approval_state: 'approved' }));
    expect(out).toBe(p);                  // fast path preserved
  });

  it('does not invent a change when both sides are ungated (absent both)', () => {
    const p = local();                    // no approvalState
    const out = overlayCompletions(p, tree());   // no approval_state
    expect(out).toBe(p);
    expect(out.approvalState ?? null).toBeNull();
  });
});
