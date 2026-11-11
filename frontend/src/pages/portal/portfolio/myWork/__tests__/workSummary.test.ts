/**
 * C129 Dashboard numbers: counts of the learner's real pieces only; gap weeks shown as 0; at most 8 weeks; skills spelled one way
 * and counted once per piece; newest five; links into My work carry the filter.
 */
import type { WorkItem } from '../../../../../services/myWorkApi';
import { myWorkLink, summarize } from '../workSummary';

const it_ = (id: string, createdAt: string, over: Partial<WorkItem> = {}): WorkItem => ({
  id, kind: 'case_study', group: 'written', title: `Piece ${id}`, from: 'Case study', createdAt, week: null, project: null, skills: [], state: 's', ...over,
});

describe('summarize', () => {
  const items = [
    it_('a', '2026-08-03T15:00:00Z', { skills: ['architecture', 'Architecture', 'mcp'], project: 'GoalKick' }),
    it_('b', '2026-08-05T15:00:00Z', { group: 'sheet', skills: ['architecture'], project: 'goalkick' }),
    it_('c', '2026-08-19T15:00:00Z', { group: 'word', project: 'Other' }),
    it_('d', '2026-08-20T15:00:00Z', { group: 'sheet' }),
  ];
  const s = summarize(items);

  it('totals, range and kinds in display order', () => {
    expect(s.total).toBe(4);
    expect(s.first).toBe('2026-08-03T15:00:00Z');
    expect(s.last).toBe('2026-08-20T15:00:00Z');
    expect(s.kinds.map((k) => [k.group, k.n])).toEqual([['written', 1], ['sheet', 2], ['word', 1]]);
  });

  it('weeks: oldest first, the empty week between shown as 0, not dropped or smoothed', () => {
    expect(s.weeks.map((w) => [w.key, w.n])).toEqual([['2026-08-03', 2], ['2026-08-10', 0], ['2026-08-17', 2]]);
    expect(s.activeWeeks).toBe(2);
  });

  it('skills counted once per piece, one spelling; projects case-insensitive', () => {
    expect(s.skills).toEqual([{ label: 'Architecture', n: 2 }, { label: 'Mcp', n: 1 }]);
    expect(s.projects).toBe(2);
  });

  it('newest five, newest first', () => {
    const many = Array.from({ length: 9 }, (_, i) => it_(`n${i}`, `2026-09-${String(10 + i).padStart(2, '0')}T15:00:00Z`));
    expect(summarize(many).newest.map((x) => x.id)).toEqual(['n8', 'n7', 'n6', 'n5', 'n4']);
  });

  it('at most the last 8 weeks', () => {
    const spread = Array.from({ length: 12 }, (_, i) => it_(`w${i}`, new Date(Date.UTC(2026, 5, 1 + i * 7, 15)).toISOString()));
    const w = summarize(spread).weeks;
    expect(w.length).toBe(8);
    expect(w[w.length - 1].n).toBe(1);
  });

  it('nothing in: zeros and empty lists, never invented rows', () => {
    expect(summarize([])).toEqual({ total: 0, first: null, last: null, kinds: [], weeks: [], skills: [], newest: [], activeWeeks: 0, projects: 0, featured: 0 });
  });
});

it('myWorkLink carries the filter into My work', () => {
  expect(myWorkLink()).toBe('/portal/portfolio/work');
  expect(myWorkLink({ kind: 'sheet' })).toBe('/portal/portfolio/work?kind=sheet');
  expect(myWorkLink({ by: 'skill', q: 'Context engineering' })).toBe('/portal/portfolio/work?by=skill&q=Context+engineering');
  expect(myWorkLink({ by: 'week' })).toBe('/portal/portfolio/work');
});
