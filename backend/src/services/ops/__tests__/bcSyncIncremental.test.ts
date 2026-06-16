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

import { fetchUpdatedTodos } from '../bcSyncService';

const T = 1_000_000_000_000; // arbitrary cursor (ms)
const iso = (ms: number) => new Date(ms).toISOString();
const todo = (updatedAtMs: number, id = updatedAtMs) => ({
  id,
  title: `todo ${id}`,
  updated_at: iso(updatedAtMs),
  created_at: iso(updatedAtMs),
  bucket: { id: 1, name: 'Proj' },
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
});
