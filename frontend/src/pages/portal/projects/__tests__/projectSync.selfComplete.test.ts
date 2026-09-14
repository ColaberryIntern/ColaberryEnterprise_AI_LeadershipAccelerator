/**
 * The student's confirmation of a Demo Prep task reaches the server.
 *
 * Ali, 2026-09-14: "Demo should have points in the Project section as well."
 * A prep task's completion used to live only in localStorage; the server never
 * heard of it, so nothing could pay it. This is the one completion a client
 * may send, and these tests pin its three outcomes: paid, API-off fallback,
 * and a real failure that must surface rather than silently drop the points.
 */
jest.mock('../../../../utils/portalApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() },
}));

import portalApi from '../../../../utils/portalApi';
import { completeSelfDirectedTask, onSyncFailure } from '../projectSync';

const api = portalApi as unknown as { post: jest.Mock };
const TASK = '9c1a2b3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';

beforeEach(() => jest.clearAllMocks());

describe('completeSelfDirectedTask', () => {
  it('posts to the self-complete route for the task and returns what it paid', async () => {
    api.post.mockResolvedValue({ data: { id: TASK, story_id: 'PREP-2', status: 'complete', points_awarded: 20, already: false } });
    const r = await completeSelfDirectedTask(TASK);
    expect(api.post).toHaveBeenCalledWith(`/api/portal/projects/tasks/${TASK}/self-complete`, {});
    expect(r).toEqual({ id: TASK, story_id: 'PREP-2', status: 'complete', points_awarded: 20, already: false });
  });

  it('passes a replay through honestly — already:true, 0 points — so the UI never celebrates twice', async () => {
    api.post.mockResolvedValue({ data: { id: TASK, story_id: 'PREP-2', status: 'complete', points_awarded: 0, already: true } });
    const r = await completeSelfDirectedTask(TASK);
    expect(r?.points_awarded).toBe(0);
    expect(r?.already).toBe(true);
  });

  it('returns null when the Projects API is off (404), so the caller keeps the local-only completion', async () => {
    api.post.mockRejectedValue(Object.assign(new Error('Not Found'), { response: { status: 404 } }));
    const seen: unknown[] = [];
    const off = onSyncFailure((f) => seen.push(f));
    expect(await completeSelfDirectedTask(TASK)).toBeNull();
    expect(seen).toEqual([]);   // expected, stays quiet
    off();
  });

  it('THROWS on a real failure, and reports it — a rehearsal the server could not record must stay open', async () => {
    api.post.mockRejectedValue(Object.assign(new Error('boom'), { response: { status: 500 } }));
    const seen: any[] = [];
    const off = onSyncFailure((f) => seen.push(f));
    await expect(completeSelfDirectedTask(TASK)).rejects.toThrow('boom');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ op: 'task-status', status: 500 });
    off();
  });

  it('a 409 (not a prep task) is a real failure too, not an API-off fallback', async () => {
    api.post.mockRejectedValue(Object.assign(new Error('Only a Demo Prep task…'), { response: { status: 409 } }));
    await expect(completeSelfDirectedTask(TASK)).rejects.toThrow();
  });
});
