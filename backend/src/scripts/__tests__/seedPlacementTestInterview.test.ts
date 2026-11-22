jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn(), close: jest.fn(), transaction: jest.fn() } }));
jest.mock('../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnrollmentIds: jest.fn() }));

import { create, parseArgs, remove, tagFor } from '../seedPlacementTestInterview';

/**
 * Loop T33: the one-test-interview seed. Dry run by default; refuses an enrollment not on the Career Prep allow-list;
 * employer and interviewer addresses required; a second run changes nothing; --remove deletes exactly the tagged row.
 */
const E = 'aced5b39-0b47-496a-b172-e1f5c042bf8a';
const OTHER = '1950b213-5e4e-4cc1-b9cb-04fea1bbe4b0';
const base = ['--enrollment', E, '--employer-email', 'Ali+Employer@Example.com', '--interviewer-email', 'ali+iv@example.com'];

/** A tiny in-memory placement_interviews + placement_events + career_interviews, answering the script's statements. */
function fakeDb() {
  const ivs: Array<{ id: string; tag: string; enrollment: string; employer: unknown; interviewer: unknown }> = [];
  const events: string[] = []; const prep: string[] = [];
  const sql: string[] = [];
  const query = async (s: string, r: Record<string, unknown>): Promise<unknown[]> => {
    sql.push(s);
    if (s.startsWith('SELECT id FROM placement_interviews')) return ivs.filter((x) => x.tag === r.tag && (!r.enrollment || x.enrollment === r.enrollment)).map((x) => ({ id: x.id }));
    if (s.includes('INSERT INTO placement_interviews')) {
      if (ivs.some((x) => x.tag === r.tag)) return [];
      const id = `iv-${ivs.length + 1}`; ivs.push({ id, tag: String(r.tag), enrollment: String(r.enrollment), employer: r.employer, interviewer: r.interviewer }); return [{ id }];
    }
    if (s.includes('INSERT INTO placement_events')) { events.push(String(r.id)); return []; }
    if (s.startsWith('DELETE FROM placement_events')) { events.splice(0, events.length, ...events.filter((e) => e !== r.id)); return []; }
    if (s.startsWith('DELETE FROM career_interviews')) { prep.splice(0, prep.length, ...prep.filter((p) => p !== r.id)); return []; }
    if (s.startsWith('DELETE FROM placement_interviews')) { const i = ivs.findIndex((x) => x.id === r.id && x.tag === r.tag); if (i >= 0) ivs.splice(i, 1); return []; }
    throw new Error(`unexpected SQL ${s.slice(0, 40)}`);
  };
  return { ivs, events, prep, sql, query, transaction: async <T>(fn: (r: typeof query) => Promise<T>) => fn(query) };
}
const allow = (ids: string[]) => async () => ids;

describe('arguments', () => {
  it('needs an enrollment uuid and BOTH addresses to create; lower-cases them; dry run unless --apply', () => {
    expect(parseArgs(base)).toEqual({ enrollment: E, employer: 'ali+employer@example.com', interviewer: 'ali+iv@example.com', remove: false, apply: false });
    expect(parseArgs([...base, '--apply']).apply).toBe(true);
    expect(() => parseArgs(['--enrollment', E, '--employer-email', 'a@b.co'])).toThrow(/both required/);
    expect(() => parseArgs(['--enrollment', E, '--employer-email', 'nope', '--interviewer-email', 'a@b.co'])).toThrow(/both required/);
    expect(() => parseArgs(['--enrollment', 'x', ...base.slice(2)])).toThrow(/usage/);
    expect(parseArgs(['--enrollment', E, '--remove'])).toEqual({ enrollment: E, employer: null, interviewer: null, remove: true, apply: false });
  });
});

describe('create', () => {
  it('refuses an enrollment that is not on the Career Prep allow-list, and writes nothing', async () => {
    const db = fakeDb();
    await expect(create(parseArgs([...base, '--apply']), { query: db.query, allowList: allow([OTHER]) })).rejects.toThrow(/not on the Career Prep allow-list/);
    expect(db.sql).toEqual([]);
  });

  it('a dry run (the default) writes nothing', async () => {
    const db = fakeDb();
    expect(await create(parseArgs(base), { query: db.query, allowList: allow([E]) })).toEqual({ action: 'create', dry: true, changed: true, interviewId: null });
    expect(db.ivs).toEqual([]);
  });

  it('--apply writes ONE tagged interview in review with the given addresses and one event; a second run changes nothing', async () => {
    const db = fakeDb();
    const first = await create(parseArgs([...base, '--apply']), { query: db.query, allowList: allow([E]) });
    const again = await create(parseArgs([...base, '--apply']), { query: db.query, allowList: allow([E]) });
    expect(first).toEqual({ action: 'create', dry: false, changed: true, interviewId: 'iv-1' });
    expect(again).toEqual({ action: 'create', dry: false, changed: false, interviewId: 'iv-1' });
    expect(db.ivs).toEqual([{ id: 'iv-1', tag: tagFor(E), enrollment: E, employer: 'ali+employer@example.com', interviewer: 'ali+iv@example.com' }]);
    expect(db.events).toEqual(['iv-1']);
    expect(db.sql.find((s) => s.includes('INSERT INTO placement_interviews'))).toMatch(/'review'.*ON CONFLICT \(source_event_id\) DO NOTHING/s);
  });
});

describe('remove', () => {
  it('dry run names the row and deletes nothing; --apply deletes exactly the tagged row, its events and its prep link; a second run is a no-op', async () => {
    const db = fakeDb();
    await create(parseArgs([...base, '--apply']), { query: db.query, allowList: allow([E]) });
    db.ivs.push({ id: 'real-1', tag: 'interview.detected:<m@x>', enrollment: E, employer: null, interviewer: null });
    db.prep.push('iv-1', 'real-1');
    expect(await remove(parseArgs(['--enrollment', E, '--remove']), db)).toEqual({ action: 'remove', dry: true, changed: true, interviewId: 'iv-1' });
    expect(db.ivs.map((x) => x.id)).toEqual(['iv-1', 'real-1']);
    expect(await remove(parseArgs(['--enrollment', E, '--remove', '--apply']), db)).toEqual({ action: 'remove', dry: false, changed: true, interviewId: 'iv-1' });
    expect(db.ivs.map((x) => x.id)).toEqual(['real-1']);
    expect(db.events).toEqual([]);
    expect(db.prep).toEqual(['real-1']);
    expect(await remove(parseArgs(['--enrollment', E, '--remove', '--apply']), db)).toEqual({ action: 'remove', dry: false, changed: false, interviewId: null });
  });
});
