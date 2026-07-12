/**
 * Unit tests for the ATA live-state guard. Covers the four mandatory test types
 * (CLAUDE.md): happy path, failure path (fail-open on unverifiable, drop on
 * 404), boundary cases, and idempotency. bcGet is injected - no network.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { filterOutCompleted, isCompletedLive } = require('../liveStateFilter');

const item = (id: number) => ({ projectId: 47502609, todo: { id, content: `task ${id}` } });

// Fake Basecamp: `completedIds` come back completed; ids in `errById` throw.
const bc = (completedIds: number[], errById: Record<number, string> = {}) => async (p: string) => {
  const m = /todos\/(\d+)\.json/.exec(p);
  const id = m ? Number(m[1]) : NaN;
  if (errById[id]) throw new Error(errById[id]);
  return { id, completed: completedIds.includes(id) };
};

describe('filterOutCompleted - happy path', () => {
  test('drops completed todos, keeps open ones, preserves order', async () => {
    const queue = [item(1), item(2), item(3), item(4)];
    const { live, dropped, unverified } = await filterOutCompleted(queue, { bcGet: bc([1, 3]), paceMs: 0 });
    expect(live.map((i: any) => i.todo.id)).toEqual([2, 4]);
    expect(dropped.map((d: any) => d.id)).toEqual([1, 3]);
    expect(dropped.every((d: any) => d.reason === 'completed')).toBe(true);
    expect(unverified).toBe(0);
  });

  test('the reported real-world case: the top stale ticket is removed', async () => {
    const queue = [item(9946497989), item(10016294666)]; // #1 was completed, #2 open
    const { live, dropped } = await filterOutCompleted(queue, { bcGet: bc([9946497989]), paceMs: 0 });
    expect(dropped.map((d: any) => d.id)).toEqual([9946497989]);
    expect(live.map((i: any) => i.todo.id)).toEqual([10016294666]);
  });
});

describe('filterOutCompleted - failure path (fail-open)', () => {
  test('an unverifiable todo (network/401) is KEPT, not hidden', async () => {
    const queue = [item(1), item(2)];
    const { live, dropped, unverified } = await filterOutCompleted(queue, { bcGet: bc([], { 2: 'GET -> 401' }), paceMs: 0 });
    expect(live.map((i: any) => i.todo.id).sort()).toEqual([1, 2]); // both kept
    expect(dropped).toEqual([]);
    expect(unverified).toBe(1);
  });

  test('a 404 (trashed / gone) IS dropped', async () => {
    const queue = [item(1), item(9)];
    const { live, dropped } = await filterOutCompleted(queue, { bcGet: bc([], { 9: 'GET /buckets/1/todos/9.json -> 404' }), paceMs: 0 });
    expect(live.map((i: any) => i.todo.id)).toEqual([1]);
    expect(dropped[0]).toMatchObject({ id: 9, reason: 'not-found' });
  });

  test('an item missing a todo id is kept (fail-open), not crashed on', async () => {
    const r = await isCompletedLive(bc([]), { projectId: 1, todo: {} });
    expect(r.error).toBeTruthy();
    expect(r.completed).toBeUndefined();
  });
});

describe('filterOutCompleted - boundary cases', () => {
  test('empty queue', async () => {
    expect(await filterOutCompleted([], { bcGet: bc([]), paceMs: 0 })).toEqual({ live: [], dropped: [], unverified: 0 });
  });

  test('no bcGet supplied -> returns the queue unchanged (never blocks the run)', async () => {
    const queue = [item(1)];
    const r = await filterOutCompleted(queue, { paceMs: 0 } as any);
    expect(r.live).toBe(queue);
    expect(r.dropped).toEqual([]);
  });

  test('non-array queue -> empty result', async () => {
    expect(await filterOutCompleted(null as any, { bcGet: bc([]), paceMs: 0 })).toEqual({ live: [], dropped: [], unverified: 0 });
  });
});

describe('filterOutCompleted - idempotency', () => {
  test('same inputs -> same partition', async () => {
    const queue = [item(1), item(2), item(3)];
    const a = await filterOutCompleted(queue, { bcGet: bc([2]), paceMs: 0 });
    const b = await filterOutCompleted(queue, { bcGet: bc([2]), paceMs: 0 });
    expect(a.live.map((i: any) => i.todo.id)).toEqual(b.live.map((i: any) => i.todo.id));
    expect(a.dropped).toEqual(b.dropped);
  });
});
