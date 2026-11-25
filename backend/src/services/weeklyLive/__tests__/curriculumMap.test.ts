import { sequelize } from '../../../config/database';
import { buildCurriculumMap, daysBetween, centralDate, importHistory, tagSessionWeek, type CoverageRow } from '../curriculumMap';
import { batchNameFor, resolveBatch } from '../batchResolver';

/** WL2.4: the curriculum map and the air-date batch resolver. */
const row = (week: number, date: string, n = date): CoverageRow => ({ week, date, sessionId: `s-${n}`, title: `t${week}` });

describe('buildCurriculumMap', () => {
  it('has all 12 weeks with themes', () => {
    const m = buildCurriculumMap([], '2026-11-30');
    expect(m.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(m.weeks[1].theme).toContain('Agent Skills');
    expect(m.weeks.every((w) => w.lastCovered === null && w.daysAgo === null && !w.coveredInLast4)).toBe(true);
  });
  it('Week 2 shows covered Nov 23 with correct days ago', () => {
    const m = buildCurriculumMap([row(2, '2026-11-23')], '2026-11-30');
    expect(m.weeks[1]).toMatchObject({ week: 2, lastCovered: '2026-11-23', daysAgo: 7, timesCovered: 1, coveredInLast4: true, lastTitle: 't2' });
  });
  it('only the four most recent sessions count as recent, and future rows are ignored', () => {
    const rows = [row(1, '2026-10-26'), row(5, '2026-11-02'), row(6, '2026-11-09'), row(7, '2026-11-16'), row(2, '2026-11-23'), row(9, '2026-12-07')];
    const m = buildCurriculumMap(rows, '2026-11-30');
    expect(m.recentWeeks).toEqual([2, 7, 6, 5]);
    expect(m.weeks[0].coveredInLast4).toBe(false);
    expect(m.weeks[0].daysAgo).toBe(35);
    expect(m.weeks[8].lastCovered).toBeNull();
  });
});

it('daysBetween crosses month, year and the DST change by calendar day', () => {
  expect(daysBetween('2026-11-30', '2026-12-01')).toBe(1);
  expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
});

it('centralDate reads the Central calendar day, not UTC', () => {
  expect(centralDate(new Date('2026-12-01T03:00:00Z'))).toBe('2026-11-30');
  expect(centralDate(new Date('2026-12-01T07:00:00Z'))).toBe('2026-12-01');
});

describe('batchNameFor (month edges, Central)', () => {
  it.each([
    ['2026-11-30', 'Cohort - November 2026'],
    ['2026-12-01', 'Cohort - December 2026'],
    ['2027-01-01', 'Cohort - January 2027'],
  ])('%s -> %s', (d, name) => { expect(batchNameFor(d)).toBe(name); });
  it('a 9 PM Central class on Nov 30 (03:00 UTC Dec 1) is still November', () => {
    expect(batchNameFor(new Date('2026-12-01T03:00:00Z'))).toBe('Cohort - November 2026');
    expect(batchNameFor('2026-12-01T03:00:00Z')).toBe('Cohort - November 2026');
  });
  it('rejects impossible dates', () => {
    expect(batchNameFor('2026-02-30')).toBeNull();
    expect(batchNameFor('nope')).toBeNull();
  });
});

describe('database calls', () => {
  let q: jest.SpyInstance;
  beforeEach(() => { q = jest.spyOn(sequelize, 'query'); });
  afterEach(() => q.mockRestore());

  it('Nov 30 2026 resolves to Cohort - November 2026', async () => {
    q.mockResolvedValueOnce([{ id: 'c1', name: 'Cohort - November 2026' }] as never);
    expect(await resolveBatch('2026-11-30')).toEqual({ ok: true, cohortId: 'c1', cohortName: 'Cohort - November 2026' });
    expect(q.mock.calls[0][1].replacements).toEqual({ name: 'Cohort - November 2026' });
    expect(String(q.mock.calls[0][0])).not.toMatch(/INSERT/i);
  });
  it('a month with no cohort returns 409 naming it, and creates nothing', async () => {
    q.mockResolvedValueOnce([] as never);
    const r = await resolveBatch('2027-03-01');
    expect(r).toMatchObject({ ok: false, status: 409, cohortName: 'Cohort - March 2027' });
    expect(q).toHaveBeenCalledTimes(1);
  });
  it('a bad date is a 400 without a query', async () => {
    expect(await resolveBatch('2026-13-01')).toMatchObject({ ok: false, status: 400 });
    expect(q).not.toHaveBeenCalled();
  });

  it('importHistory tags once, counts a rerun as already tagged, and reports unmatched', async () => {
    q.mockResolvedValueOnce([{ id: 's23' }] as never).mockResolvedValueOnce([{ session_id: 's23' }] as never) // first entry, new
      .mockResolvedValueOnce([] as never) // second entry, no session
      .mockResolvedValueOnce([{ id: 's23' }] as never).mockResolvedValueOnce([] as never); // third, already tagged
    const r = await importHistory([
      { date: '2026-11-23', week: 2, title: 'Your Know-How Is Now a Product' },
      { date: '2026-11-16', week: 4, title: 'Never aired' },
      { date: '2026-11-23', week: 2, title: 'Your Know-How Is Now a Product' },
      { date: '2026-11-09', title: 'no week' },
    ], 'hist-1');
    expect(r).toEqual({ batch: 'hist-1', tagged: 1, alreadyTagged: 1, unmatched: [expect.stringContaining('Never aired'), expect.stringContaining('missing')] });
    const insert = String(q.mock.calls[1][0]);
    expect(insert).toContain('ON CONFLICT (session_id) DO NOTHING');
    expect(q.mock.calls[1][1].replacements).toEqual({ id: 's23', week: 2, batch: 'hist-1' });
    expect(q.mock.calls[0][1].replacements.title).toBe('Your Know-How Is Now a Product%');
  });

  it('tagSessionWeek upserts and refuses a week outside 1..12', async () => {
    q.mockResolvedValue([] as never);
    await tagSessionWeek('s30', 3);
    expect(String(q.mock.calls[0][0])).toContain('ON CONFLICT (session_id) DO UPDATE');
    await expect(tagSessionWeek('s30', 13)).rejects.toThrow(RangeError);
    expect(q).toHaveBeenCalledTimes(1);
  });
});

it('a class scheduled after the date is planned, not covered, and the nearest one wins', () => {
  const m = buildCurriculumMap([{ week: 3, date: '2026-12-14', sessionId: 'b', title: 'Later' }, { week: 3, date: '2026-11-30', sessionId: 'a', title: 'Ep 2' }], '2026-11-25');
  expect(m.weeks[2]).toMatchObject({ timesCovered: 0, lastCovered: null, planned: { date: '2026-11-30', title: 'Ep 2' } });
  expect(m.weeks[3].planned).toBeNull();
});
