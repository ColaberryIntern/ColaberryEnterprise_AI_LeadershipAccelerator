/**
 * C9 look service: reads and saves against server-side points; one row per learner (upsert); what others see never includes a
 * ride; a repeat presence read inside 60 s makes no queries; a read failure never throws.
 */
import { getLook, setLook, looksFor, __setLookDepsForTests, LookDeps, LOOK_CACHE_TTL_MS } from '../campusLookService';
import { GearError } from '../campusUnlocks';

let points: Record<string, number> = {};
let rows: Record<string, unknown> = {};
const calls = { totals: 0, rungs: 0, find: 0, upsert: 0, schema: 0 };
let failTotals = false;
let failUpsert = false;

const deps: LookDeps = {
  totals: async (ids) => { calls.totals += 1; if (failTotals) throw Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' }); return new Map(ids.map((id) => [id, points[id] ?? 0])); },
  rungs: async (ids, totals) => { calls.rungs += 1; return new Map(ids.map((id) => [id, (totals.get(id) ?? 0) >= 400 ? 'AI Enabled I' : 'AI Aware I'])); },
  findLooks: async (ids) => { calls.find += 1; return ids.filter((id) => rows[id] !== undefined).map((id) => ({ enrollment_id: id, equipped: rows[id] })); },
  upsertLook: async (id, eq) => { calls.upsert += 1; if (failUpsert) throw new Error('write failed'); rows[id] = eq; },
  ensureSchema: async () => { calls.schema += 1; },
};

let errSpy: jest.SpyInstance;
beforeEach(() => {
  points = { a: 400, b: 900, c: 0 }; rows = {}; failTotals = false; failUpsert = false;
  for (const k of Object.keys(calls) as (keyof typeof calls)[]) calls[k] = 0;
  __setLookDepsForTests(deps);
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { errSpy.mockRestore(); __setLookDepsForTests(null); });

describe('getLook / setLook', () => {
  it('reads points, rung, the catalog with unlocked flags, and what is worn', async () => {
    rows.a = { head: 'cap' };
    const look = await getLook('a');
    expect(look.points).toBe(400);
    expect(look.rung_name).toBe('AI Enabled I');
    expect(look.catalog.filter((i) => i.unlocked).map((i) => i.id)).toEqual(['cap', 'jacket', 'hoodie', 'shades']);
    expect(look.equipped).toEqual({ head: 'cap' });
    expect(calls.schema).toBeGreaterThan(0);
  });

  it('saving the same set twice leaves one row with the same value', async () => {
    await setLook('a', { head: 'cap', face: 'shades' });
    const second = await setLook('a', { head: 'cap', face: 'shades' });
    expect(Object.keys(rows)).toEqual(['a']);
    expect(rows.a).toEqual({ head: 'cap', face: 'shades' });
    expect(second.equipped).toEqual({ head: 'cap', face: 'shades' });
  });

  it('the set is complete: leaving a slot out takes that item off', async () => {
    await setLook('a', { head: 'cap', face: 'shades' });
    await setLook('a', { head: 'cap' });
    expect(rows.a).toEqual({ head: 'cap' });
  });

  it('a locked item is refused with GearError and nothing is written', async () => {
    await expect(setLook('c', { head: 'cap' })).rejects.toBeInstanceOf(GearError);
    expect(calls.upsert).toBe(0);
    expect(rows.c).toBeUndefined();
  });

  it('a failing points read or write throws (the route answers 500); a failed write leaves the old row', async () => {
    rows.a = { head: 'cap' };
    failUpsert = true;
    await expect(setLook('a', { face: 'shades' })).rejects.toThrow('write failed');
    expect(rows.a).toEqual({ head: 'cap' });
    failUpsert = false; failTotals = true;
    await expect(getLook('a')).rejects.toThrow('db down');
  });

  it('a stored item the points no longer earn is not worn', async () => {
    rows.c = { head: 'cap' };
    expect((await getLook('c')).equipped).toEqual({});
  });
});

describe('looksFor (what other people see)', () => {
  it('rung and public gear for each id, a saved ride dropped (C46), in one batch', async () => {
    rows.b = { head: 'cap', ride: 'cruiser', neck: 'chain' };
    const out = await looksFor(['a', 'b']);
    expect(out.get('b')).toEqual({ rung_name: 'AI Enabled I', gear: { head: 'cap', neck: 'chain' } });
    expect(out.get('a')).toEqual({ rung_name: 'AI Enabled I', gear: {} });
    expect(JSON.stringify([...out.values()])).not.toMatch(/ride|cruiser|board/);
    expect([calls.totals, calls.rungs, calls.find]).toEqual([1, 1, 1]);
  });

  it('a repeat read inside 60 s makes no queries; after 60 s it reads again', async () => {
    expect(LOOK_CACHE_TTL_MS).toBe(60_000); // pinned: the cache window is part of the contract (D9)
    const t0 = 1_000_000;
    await looksFor(['a', 'b'], t0);
    const before = { ...calls };
    await looksFor(['a', 'b'], t0 + LOOK_CACHE_TTL_MS - 1);
    expect([calls.totals, calls.rungs, calls.find]).toEqual([before.totals, before.rungs, before.find]);
    await looksFor(['a'], t0 + LOOK_CACHE_TTL_MS + 1);
    expect(calls.totals).toBe(before.totals + 1);
  });

  it('saving a look refreshes what others see right away', async () => {
    await looksFor(['a']);
    await setLook('a', { head: 'cap' });
    expect((await looksFor(['a'])).get('a')?.gear).toEqual({ head: 'cap' });
  });

  it('a read failure never throws: no levels this time, logged with an error class', async () => {
    failTotals = true;
    const out = await looksFor(['a']);
    expect(out.size).toBe(0);
    expect(JSON.parse(String(errSpy.mock.calls[0][0]))).toMatchObject({ event: 'campus_looks_read_failed', error_class: 'SequelizeConnectionError' });
  });

  it('no ids, no queries', async () => {
    expect((await looksFor([])).size).toBe(0);
    expect(calls.totals).toBe(0);
  });
});
