/**
 * listMeta - asking Basecamp what each board "list" really is. No network: fetch is injected.
 */
const { fetchListMeta, listUrl } = require('../listMeta');

const L = (listId, name = 'n') => ({ projectId: '7463955', listId, name });
const res = (status, body) => ({ status, json: async () => body });
const opts = (fetchImpl) => ({ token: 't', fetchImpl, retryDelayMs: 0, timeoutMs: 50 });

describe('fetchListMeta', () => {
  it('marks a real list as a list', async () => {
    const m = await fetchListMeta([L('1')], opts(async () => res(200, { title: 'Real', parent: { type: 'Todoset' } })));
    expect(m.get('7463955/1')).toMatchObject({ checked: true, found: true, isGroup: false, title: 'Real', parentTitle: null });
  });

  it('marks a group inside a list as a group and names its parent', async () => {
    const m = await fetchListMeta([L('2')], opts(async () => res(200, {
      title: 'A. Intern readiness', parent: { type: 'Todolist', title: 'Gov Contracts + intern rollout' } })));
    expect(m.get('7463955/2')).toMatchObject({ isGroup: true, parentTitle: 'Gov Contracts + intern rollout' });
  });

  it('prefers the Basecamp title over a stale mirror name', async () => {
    const m = await fetchListMeta([L('3', 'old name')], opts(async () => res(200, { title: 'new name', parent: {} })));
    expect(m.get('7463955/3').title).toBe('new name');
  });

  it('reports a deleted list as not found, without retrying', async () => {
    let calls = 0;
    const m = await fetchListMeta([L('4', 'gone')], opts(async () => { calls += 1; return res(404); }));
    expect(m.get('7463955/4')).toMatchObject({ checked: true, found: false, title: 'gone' });
    expect(calls).toBe(1);
  });

  it('retries once on a 5xx, then degrades to the mirror', async () => {
    let calls = 0;
    const m = await fetchListMeta([L('5', 'mirror')], opts(async () => { calls += 1; return res(503); }));
    expect(calls).toBe(2);
    expect(m.get('7463955/5')).toMatchObject({ checked: false, found: null, title: 'mirror', why: 'HTTP 503' });
  });

  it('recovers when the retry succeeds', async () => {
    let calls = 0;
    const m = await fetchListMeta([L('6')], opts(async () => {
      calls += 1;
      return calls === 1 ? res(429) : res(200, { title: 'ok', parent: {} });
    }));
    expect(m.get('7463955/6')).toMatchObject({ found: true, title: 'ok' });
  });

  it('treats a hang as a timeout, not a crash', async () => {
    const hang = (url, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => {
      const e = new Error('aborted'); e.name = 'AbortError'; rej(e);
    }));
    const m = await fetchListMeta([L('7')], opts(hang));
    expect(m.get('7463955/7')).toMatchObject({ checked: false, why: 'TimeoutError' });
  });

  it('works with no token at all, and says the names were not checked', async () => {
    const m = await fetchListMeta([L('8', 'x')], {});
    expect(m.get('7463955/8')).toMatchObject({ checked: false, why: 'no Basecamp token', title: 'x' });
  });

  it('always gives a link, built from the ids', async () => {
    const m = await fetchListMeta([L('9')], {});
    expect(m.get('7463955/9').url).toBe('https://app.basecamp.com/3945211/buckets/7463955/todolists/9');
    expect(listUrl('1', '2', '99')).toBe('https://app.basecamp.com/99/buckets/1/todolists/2');
  });

  it('handles an empty input', async () => {
    expect((await fetchListMeta([], opts(async () => res(200, {})))).size).toBe(0);
  });
});
