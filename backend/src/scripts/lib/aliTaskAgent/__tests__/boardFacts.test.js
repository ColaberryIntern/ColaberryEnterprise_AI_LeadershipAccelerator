/**
 * boardFacts - the one-row-per-task table the dashboard cross-filters over.
 */
const { buildFacts, periodOf, kindOf, shapeOf } = require('../boardFacts');

describe('periodOf', () => {
  it.each([
    ['2026-01-01', '2026-Q1'], ['2026-03-31', '2026-Q1'], ['2026-04-01', '2026-Q2'],
    ['2026-12-31', '2026-Q4'], ['2023-11-07T00:00:00.000Z', '2023-Q4'],
  ])('%s -> %s', (d, q) => expect(periodOf(d)).toBe(q));

  it('says "none" rather than guessing for a missing or broken date', () => {
    expect(periodOf(null)).toBe('none');
    expect(periodOf('not a date')).toBe('none');
  });

  it('takes a Date as well as a string', () => {
    expect(periodOf(new Date('2026-08-15T12:00:00Z'))).toBe('2026-Q3');
  });
});

describe('kindOf', () => {
  it('ranks "needs a person" above machine-generated, because it decides who can do it', () => {
    expect(kindOf({ humanOnly: true, generated: true })).toBe('person');
    expect(kindOf({ generated: true })).toBe('generated');
    expect(kindOf({})).toBe('hand');
  });
});

describe('shapeOf', () => {
  it('reports what Basecamp said, and "unknown" when it was not asked', () => {
    expect(shapeOf({ found: false, isGroup: true })).toBe('gone');
    expect(shapeOf({ isGroup: true })).toBe('group');
    expect(shapeOf({ isGroup: false })).toBe('list');
    expect(shapeOf({})).toBe('unknown');
  });
});

describe('buildFacts', () => {
  const ident = (l) => ({ id: l.id, name: l.id, cat: 'x', sub: 'y' });

  it('writes one row per task, pointing at its list', () => {
    const t = buildFacts([
      { id: 'a', isGroup: false, tasks: [{ band: 'dormant', dueOn: '2025-02-01', generated: true }, { band: 'fresh', humanOnly: true }] },
      { id: 'b', isGroup: true, tasks: [{ band: 'aging', dueOn: '2026-07-04' }] },
    ], ident);
    expect(t.facts).toEqual([[0, 'dormant', '2025-Q1', 'generated'], [0, 'fresh', 'none', 'person'], [1, 'aging', '2026-Q3', 'hand']]);
    expect(t.lists.map((l) => [l.id, l.shape])).toEqual([['a', 'list'], ['b', 'group']]);
  });

  it('expands band counts when a list has no task views, so totals still add up', () => {
    const t = buildFacts([{ id: 'a', tasks: [], bands: [{ band: 'dormant', n: 2 }, { band: 'fresh', n: 1 }] }], ident);
    expect(t.facts).toHaveLength(3);
  });

  it('handles nothing', () => {
    expect(buildFacts(null, ident)).toEqual({ lists: [], facts: [] });
  });
});
