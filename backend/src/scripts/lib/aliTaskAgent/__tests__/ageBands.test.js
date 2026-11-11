/**
 * ageBands.
 *
 * The module exists because the queue cannot tell "late" from "abandoned". So the cases that
 * matter are the boundaries of that distinction, and the two ways a date can be absent: a task
 * with no due date is not late, and a task due today is not overdue. Getting either wrong
 * manufactures neglect out of nothing, which is the failure mode this whole change is correcting.
 */
const {
  daysOverdue, bandFor, partition, summarize, urgencyVsAge, BANDS,
} = require('../ageBands');

const TODAY = '2026-11-11T12:00:00Z';
const item = (due, score = 50, title = 't') => ({ todo: { due_on: due, title }, score });

describe('daysOverdue', () => {
  it('counts whole days past the due date', () => {
    expect(daysOverdue('2026-11-01', TODAY)).toBe(10);
  });

  it('is negative for something not yet due', () => {
    expect(daysOverdue('2026-11-20', TODAY)).toBe(-9);
  });

  it('is zero on the due date itself', () => {
    expect(daysOverdue('2026-11-11', TODAY)).toBe(0);
  });

  /** null is not zero. A task nobody dated cannot be late, and must not be bucketed as if it were. */
  it('returns null when there is no due date, rather than zero', () => {
    expect(daysOverdue(null, TODAY)).toBeNull();
    expect(daysOverdue(undefined, TODAY)).toBeNull();
    expect(daysOverdue('', TODAY)).toBeNull();
  });

  it('returns null for an unparseable date instead of a wild number', () => {
    expect(daysOverdue('not-a-date', TODAY)).toBeNull();
  });
});

describe('bandFor', () => {
  it.each([
    ['2026-11-20', 'fresh', 'not yet due'],
    ['2026-11-11', 'fresh', 'due today is not yet late'],
    ['2026-11-10', 'overdue', 'one day late'],
    ['2026-10-12', 'overdue', 'thirty days late is still overdue'],
    ['2026-10-11', 'aging', 'thirty one days crosses into aging'],
    ['2026-09-12', 'aging', 'sixty days is the last aging day'],
    ['2026-09-11', 'dormant', 'sixty one days is dormant'],
    ['2026-07-29', 'dormant', 'the Women Applying AI draft, 105 days'],
  ])('%s -> %s (%s)', (due, key) => {
    expect(bandFor(due, TODAY).key).toBe(key);
  });

  it('treats a missing due date as fresh, never dormant', () => {
    expect(bandFor(null, TODAY).key).toBe('fresh');
  });

  it('gives every band an icon and a word, so colour is never the only signal', () => {
    BANDS.forEach((b) => {
      expect(b.icon).toBeTruthy();
      expect(b.label).toBeTruthy();
    });
  });
});

describe('partition', () => {
  const items = [
    item('2026-11-20'), item('2026-11-10'), item('2026-10-01'), item('2026-07-29'), item(null),
  ];

  it('sends only the over-sixty-day items to dormant', () => {
    const { live, dormant } = partition(items, TODAY);
    expect(live).toHaveLength(4);
    expect(dormant).toHaveLength(1);
    expect(dormant[0].todo.due_on).toBe('2026-07-29');
  });

  it('honours a different cut, because sixty days is a judgement not a law', () => {
    const { dormant } = partition(items, TODAY, { dormantAfterDays: 30 });
    expect(dormant).toHaveLength(2);
  });

  it('keeps undated items in the live set rather than hiding them', () => {
    const { live } = partition(items, TODAY);
    expect(live.some((i) => i.todo.due_on === null)).toBe(true);
  });

  it('survives junk input instead of throwing', () => {
    expect(partition(null, TODAY)).toEqual({ live: [], dormant: [] });
  });
});

describe('summarize', () => {
  const items = [
    item('2026-11-20'), item('2026-11-10'), item('2026-11-04'),
    item('2026-10-01'), item('2026-07-29'), item('2026-01-01'), item(null),
  ];

  it('reports the dormant share, which is the number the decision hangs on', () => {
    const s = summarize(items, TODAY);
    expect(s.total).toBe(7);
    expect(s.dormantCount).toBe(2);
    expect(s.dormantShare).toBeCloseTo(2 / 7, 5);
  });

  it('names the single worst item so the headline is concrete', () => {
    const s = summarize([item('2026-01-01', 10, 'ancient thing'), item('2026-11-10')], TODAY);
    expect(s.worst.title).toBe('ancient thing');
    expect(s.worst.days).toBeGreaterThan(300);
  });

  it('counts undated tasks separately from late ones', () => {
    const s = summarize(items, TODAY);
    expect(s.noDueDate).toBe(1);
  });

  it('buckets every task exactly once', () => {
    const s = summarize(items, TODAY);
    expect(s.histogram.reduce((a, h) => a + h.n, 0)).toBe(items.length);
  });

  it('handles an empty queue without dividing by zero', () => {
    const s = summarize([], TODAY);
    expect(s.dormantShare).toBe(0);
    expect(s.worst).toBeNull();
  });
});

describe('urgencyVsAge', () => {
  it('drops undated tasks, which have no x position to plot', () => {
    const pts = urgencyVsAge([item('2026-11-10', 80), item(null, 90)], TODAY);
    expect(pts).toHaveLength(1);
    expect(pts[0]).toMatchObject({ days: 1, score: 80 });
  });

  it('defaults a missing score to zero rather than NaN', () => {
    const pts = urgencyVsAge([{ todo: { due_on: '2026-11-10' } }], TODAY);
    expect(pts[0].score).toBe(0);
  });
});
