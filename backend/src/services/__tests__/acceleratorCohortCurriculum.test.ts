import { groupCardsByWeek } from '../acceleratorCohortCurriculumService';

/**
 * Week grouping for the rebuilt Curriculum tab. The ordering rule is the part
 * worth pinning: `week` is nullable, and a naive numeric sort puts null before
 * 1, which would float unscheduled leftovers above Week 1 at the top of the
 * page — the first thing a reader sees would be the material with no place in
 * the course.
 */

type Card = Parameters<typeof groupCardsByWeek>[0][number];

function card(over: Partial<Card> = {}): Card {
  return {
    id: 'x',
    type: 'concept',
    type_label: 'Concept',
    title: 'A card',
    subtitle: null,
    week: 1,
    bucket: 'learn',
    visibility: 'published',
    status: 'active',
    order: 0,
    ...over,
  };
}

describe('groupCardsByWeek', () => {
  it('groups cards under their week, ascending', () => {
    const weeks = groupCardsByWeek([
      card({ id: 'c', week: 3 }),
      card({ id: 'a', week: 1 }),
      card({ id: 'b', week: 2 }),
    ]);
    expect(weeks.map((w) => w.week)).toEqual([1, 2, 3]);
    expect(weeks.map((w) => w.label)).toEqual(['Week 1', 'Week 2', 'Week 3']);
  });

  it('puts unscheduled cards LAST, not first', () => {
    const weeks = groupCardsByWeek([
      card({ id: 'loose', week: null }),
      card({ id: 'w1', week: 1 }),
      card({ id: 'w2', week: 2 }),
    ]);
    expect(weeks.map((w) => w.week)).toEqual([1, 2, null]);
    expect(weeks[weeks.length - 1].label).toBe('Unscheduled');
  });

  it('counts published and draft separately within a week', () => {
    const [w] = groupCardsByWeek([
      card({ id: '1', week: 1, visibility: 'published' }),
      card({ id: '2', week: 1, visibility: 'published' }),
      card({ id: '3', week: 1, visibility: 'draft' }),
      card({ id: '4', week: 1, visibility: 'scheduled' }),
    ]);
    expect(w.total).toBe(4);
    expect(w.published).toBe(2);
    // Anything not published is not visible to a student, so it counts as draft
    // for the purposes of "what has actually shipped to the class".
    expect(w.draft).toBe(2);
  });

  it('keeps every card — totals reconcile with the input', () => {
    const cards = [
      card({ id: '1', week: 1 }), card({ id: '2', week: 2 }),
      card({ id: '3', week: null }), card({ id: '4', week: 2 }),
    ];
    const weeks = groupCardsByWeek(cards);
    expect(weeks.reduce((n, w) => n + w.total, 0)).toBe(cards.length);
  });

  it('returns an empty array for no cards rather than a phantom week', () => {
    expect(groupCardsByWeek([])).toEqual([]);
  });

  it('handles a week 0 without confusing it for a missing week', () => {
    // Week 0 is a real week in this curriculum (pre-work), and `week ?? null`
    // would be wrong if it used a falsy check instead of a null check.
    const weeks = groupCardsByWeek([card({ id: 'w0', week: 0 }), card({ id: 'loose', week: null })]);
    expect(weeks.map((w) => w.week)).toEqual([0, null]);
    expect(weeks[0].label).toBe('Week 0');
  });

  it('is deterministic and does not mutate its input', () => {
    const cards = [card({ id: 'b', week: 2 }), card({ id: 'a', week: 1 })];
    const before = cards.map((c) => c.id);
    expect(groupCardsByWeek(cards)).toEqual(groupCardsByWeek(cards));
    expect(cards.map((c) => c.id)).toEqual(before);
  });
});
