/**
 * verifiedPicks + the live Basecamp checks behind it. No network: Basecamp is injected.
 *
 * The bug this guards (2026-11-12): the Morning Five ranked a TRASHED list #1 and linked five of
 * its to-dos. Basecamp answers 200 for trashed recordings, with status "trashed".
 */
const { verifiedPicks } = require('../verifiedPicks');
const { fetchListMeta, fetchTodoState } = require('../listMeta');

const NOW = new Date('2026-11-12T12:00:00Z');
const order = (id, listId, over = {}) => ({ id: `p1/${id}`, projectId: 'p1', listId, list: `List ${listId}`,
  title: `Task ${id}`, dueOn: '2026-11-10', cat: 'other', generated: false, ...over });
const view = (o) => ({ id: o.id, projectId: o.projectId, listId: o.listId, list: o.list, title: o.title,
  dueOn: o.dueOn, band: 'overdue', generated: false, humanOnly: false });

const allLive = async (ls) => new Map(ls.map((l) => [`${l.projectId}/${l.listId}`, { checked: true, found: true }]));
const todosLive = async (ts) => new Map(ts.map((t) => [`${t.projectId}/${t.bcId}`, { checked: true, live: true, why: 'open' }]));

describe('verifiedPicks', () => {
  const orders = [order('1', 'TRASH', { dueOn: '2026-11-11' }), order('2', 'TRASH'), order('3', 'OK'), order('4', 'OK2')];
  const views = orders.map(view);

  it('drops every task in a list Basecamp says is gone, from both the five and the lists', async () => {
    const checkLists = async (ls) => new Map(ls.map((l) => [`${l.projectId}/${l.listId}`,
      l.listId === 'TRASH' ? { checked: true, found: false, why: 'trashed in Basecamp' } : { checked: true, found: true }]));
    const r = await verifiedPicks({ orders, views, now: NOW, checkLists, checkTodos: todosLive });
    expect(r.picks.map((p) => p.id)).toEqual(expect.not.arrayContaining(['p1/1', 'p1/2']));
    expect(r.listPick.picks.map((l) => l.listId)).not.toContain('TRASH');
    expect(r.summaries.map((s) => s.listId)).not.toContain('TRASH');
    expect(r.deadLists.get('p1/TRASH')).toBe('trashed in Basecamp');
  });

  it('re-picks when a linked to-do turns out to be dead', async () => {
    const checkTodos = async (ts) => new Map(ts.map((t) => [`${t.projectId}/${t.bcId}`,
      t.bcId === '3' ? { checked: true, live: false, why: 'completed in Basecamp' } : { checked: true, live: true }]));
    const r = await verifiedPicks({ orders, views, now: NOW, checkLists: allLive, checkTodos });
    expect(r.picks.map((p) => p.id)).not.toContain('p1/3');
    expect(r.listPick.picks.flatMap((l) => l.pressing.map((t) => t.id))).not.toContain('p1/3');
    expect(r.rounds).toBe(2);
  });

  it('is bounded: never more than maxRounds, and never ships a dead link', async () => {
    let calls = 0;
    const killAll = async (ts) => { calls += 1; return new Map(ts.map((t) => [`${t.projectId}/${t.bcId}`, { checked: true, live: false, why: 'trashed in Basecamp' }])); };
    const r = await verifiedPicks({ orders, views, now: NOW, checkLists: allLive, checkTodos: killAll, maxRounds: 2 });
    expect(calls).toBeLessThanOrEqual(2);
    r.picks.forEach((p) => expect(r.deadTodos.has(p.id)).toBe(false));
    r.listPick.picks.forEach((l) => l.pressing.forEach((t) => expect(r.deadTodos.has(t.id)).toBe(false)));
  });

  /** Fail-open: Basecamp down must not empty the report; it is counted instead. */
  it('keeps and counts what could not be checked', async () => {
    const unknownLists = async (ls) => new Map(ls.map((l) => [`${l.projectId}/${l.listId}`, { checked: false, found: null, why: 'HTTP 500' }]));
    const unknownTodos = async (ts) => new Map(ts.map((t) => [`${t.projectId}/${t.bcId}`, { checked: false, live: null, why: 'TimeoutError' }]));
    const r = await verifiedPicks({ orders, views, now: NOW, checkLists: unknownLists, checkTodos: unknownTodos });
    expect(r.picks.length).toBeGreaterThan(0);
    expect(r.unchecked).toBeGreaterThan(0);
  });

  /** Ali, 2026-11-12: one ranked ten; a ranked list covers its own tasks, so none repeat. */
  it('never picks a task that sits in a picked list', async () => {
    const r = await verifiedPicks({ orders, views, now: NOW, checkLists: allLive, checkTodos: todosLive });
    const pickedLists = new Set(r.listPick.picks.map((l) => l.id));
    expect(pickedLists.size).toBeGreaterThan(0);
    r.picks.forEach((t) => expect(pickedLists.has(`${t.projectId}/${t.listId}`)).toBe(false));
  });

  it('is idempotent: the same Basecamp answers give the same picks', async () => {
    const a = await verifiedPicks({ orders, views, now: NOW, checkLists: allLive, checkTodos: todosLive });
    const b = await verifiedPicks({ orders, views, now: NOW, checkLists: allLive, checkTodos: todosLive });
    expect(b.picks.map((p) => p.id)).toEqual(a.picks.map((p) => p.id));
  });
});

const res = (status, body) => ({ status, json: async () => body });
const opts = (fetchImpl) => ({ token: 't', fetchImpl, retryDelayMs: 0, timeoutMs: 50 });

describe('fetchListMeta: trashed and archived lists', () => {
  it('reports a trashed list as not found, though Basecamp answered 200', async () => {
    const m = await fetchListMeta([{ projectId: 'p', listId: '1', name: 'n' }],
      opts(async () => res(200, { status: 'trashed', title: 'Path to Profitability', parent: { type: 'Todoset' } })));
    expect(m.get('p/1')).toMatchObject({ checked: true, found: false, why: 'trashed in Basecamp' });
  });
  it('reports an archived list as not found', async () => {
    const m = await fetchListMeta([{ projectId: 'p', listId: '2', name: 'n' }], opts(async () => res(200, { status: 'archived', parent: {} })));
    expect(m.get('p/2')).toMatchObject({ found: false, why: 'archived in Basecamp' });
  });
  it('still reports an active list as found', async () => {
    const m = await fetchListMeta([{ projectId: 'p', listId: '3', name: 'n' }], opts(async () => res(200, { status: 'active', title: 't', parent: {} })));
    expect(m.get('p/3')).toMatchObject({ checked: true, found: true });
  });
});

describe('fetchTodoState', () => {
  const T = [{ projectId: 'p', bcId: '9' }];
  it.each([
    [res(200, { status: 'active', completed: false }), { checked: true, live: true }],
    [res(200, { status: 'trashed', completed: false }), { checked: true, live: false, why: 'trashed in Basecamp' }],
    [res(200, { status: 'active', completed: true }), { checked: true, live: false, why: 'completed in Basecamp' }],
    [res(404, null), { checked: true, live: false, why: 'not found in Basecamp' }],
    [res(401, null), { checked: false, live: null }],
  ])('classifies a Basecamp answer', async (answer, expected) => {
    const m = await fetchTodoState(T, opts(async () => answer));
    expect(m.get('p/9')).toMatchObject(expected);
  });
  it('without a token, checks nothing and says so', async () => {
    const m = await fetchTodoState(T, {});
    expect(m.get('p/9')).toMatchObject({ checked: false, why: 'no Basecamp token' });
  });
});
