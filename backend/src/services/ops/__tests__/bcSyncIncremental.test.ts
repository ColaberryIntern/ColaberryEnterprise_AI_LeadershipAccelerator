/**
 * Tests for the incremental Todo-feed sweep that replaced OpsBcSync's full
 * per-project walk (which took ~20 min for the ~30k-todo mirror). The sweep must
 * stop at the cursor so a steady-state pass touches only recently-changed todos.
 */
jest.mock('../basecampToken', () => ({
  getBcToken: jest.fn(() => 'tok'),
  refreshBcToken: jest.fn(async () => 'tok'),
  isAuthError: (s: number) => s === 401,
}));
jest.mock('../bcRetry', () => ({
  ...jest.requireActual('../bcRetry'),
  sleep: jest.fn(() => Promise.resolve()),
  bcPace: jest.fn(() => Promise.resolve()),
}));
// Avoid pulling a real DB connection in via the model imports.
jest.mock('../../../models/OpsBcTodo', () => ({}));
jest.mock('../../../models/OpsBcProject', () => ({}));
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { fetchUpdatedTodos, isExcludedProject } from '../bcSyncService';

const T = 1_000_000_000_000; // arbitrary cursor (ms)
const iso = (ms: number) => new Date(ms).toISOString();
const todo = (updatedAtMs: number, id = updatedAtMs, bucketName = 'Proj') => ({
  id,
  title: `todo ${id}`,
  updated_at: iso(updatedAtMs),
  created_at: iso(updatedAtMs),
  bucket: { id: 1, name: bucketName },
  parent: { id: 2, type: 'Todolist', title: 'List' },
});
const page = (items: unknown[]) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => items, text: async () => '' });

describe('fetchUpdatedTodos', () => {
  it('returns only todos at/after the cursor and stops at the first all-older page', async () => {
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce(page([todo(T + 2000), todo(T + 1000)])) // page1: both fresh
      .mockResolvedValueOnce(page([todo(T + 500), todo(T - 500)])) //   page2: one fresh, one old
      .mockResolvedValueOnce(page([todo(T - 1000), todo(T - 2000)])); // page3: all older -> stop

    const out = await fetchUpdatedTodos(T);
    expect(out.map((t) => t.id)).toEqual([T + 2000, T + 1000, T + 500]); // 3 fresh, the old one dropped
    expect(global.fetch).toHaveBeenCalledTimes(3); // page3 fetched, found nothing fresh, stopped
  });

  it('stops at the first empty page', async () => {
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce(page([todo(T + 1000)]))
      .mockResolvedValueOnce(page([]));
    const out = await fetchUpdatedTodos(T);
    expect(out).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('with a null cursor (empty mirror) keeps everything until the feed ends', async () => {
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce(page([todo(T - 99999), todo(T - 100000)])) // all "old" but kept (no cursor)
      .mockResolvedValueOnce(page([]));
    const out = await fetchUpdatedTodos(null);
    expect(out).toHaveLength(2);
  });

  it('skips malformed feed items missing bucket/parent', async () => {
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce(page([{ id: 5, updated_at: iso(T + 1000), created_at: iso(T) }, todo(T + 1000, 6)]))
      .mockResolvedValueOnce(page([]));
    const out = await fetchUpdatedTodos(T);
    expect(out.map((t) => t.id)).toEqual([6]);
  });

  it('scopes the feed to the given buckets server-side (bucket= param)', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(page([]));
    (global as any).fetch = fetchMock;
    await fetchUpdatedTodos(T, [11, 22, 33]);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('type=Todo');
    expect(url).toContain('bucket=11,22,33');
  });

  it('omits the bucket param when no buckets are given', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(page([]));
    (global as any).fetch = fetchMock;
    await fetchUpdatedTodos(T);
    expect(fetchMock.mock.calls[0][0] as string).not.toContain('bucket=');
  });

  it('skips Center of Excellence todos but still treats them as fresh (no early stop)', async () => {
    (global as any).fetch = jest
      .fn()
      // page1: a CoE todo (excluded) + a normal todo, both fresh
      .mockResolvedValueOnce(page([todo(T + 1000, 10, 'Power BI - Center of Excellence'), todo(T + 1000, 11)]))
      // page2: an older normal todo -> stop
      .mockResolvedValueOnce(page([todo(T - 1000, 12)]));
    const out = await fetchUpdatedTodos(T);
    expect(out.map((t) => t.id)).toEqual([11]); // CoE dropped, normal kept, did NOT stop on page1
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('isExcludedProject', () => {
  it('excludes any Center of Excellence project (all name variants)', () => {
    expect(isExcludedProject('Power BI - Center of Excellence')).toBe(true);
    expect(isExcludedProject('The New Center of Excellence')).toBe(true);
    expect(isExcludedProject('Power BI Center of Excellence')).toBe(true);
    expect(isExcludedProject('Data Science - Center of Excellence')).toBe(true);
  });

  it('excludes RMG Mortgage Project (bulk data, not ops)', () => {
    expect(isExcludedProject('RMG Mortgage Project')).toBe(true);
    expect(isExcludedProject('rmg mortgage')).toBe(true);
  });

  it('keeps real ops projects', () => {
    expect(isExcludedProject('Gov Contracts')).toBe(false);
    expect(isExcludedProject('AI Systems Architect Accelerator')).toBe(false);
    expect(isExcludedProject('LandJet Growth Engine')).toBe(false);
    expect(isExcludedProject(null)).toBe(false);
    expect(isExcludedProject(undefined)).toBe(false);
    expect(isExcludedProject('')).toBe(false);
  });
});
