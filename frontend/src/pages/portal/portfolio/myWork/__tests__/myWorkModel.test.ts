/**
 * C128 My work list logic: chips show only kinds the learner has, with real counts; the four groupings; search; Previous / Next
 * in the order the list was showing; weeks in Central time.
 */
import type { WorkItem } from '../../../../../services/myWorkApi';
import { chipsFor, filterItems, neighbors, orderOf, sectionsFor, skillLabel, weekKey } from '../myWorkModel';
import { loadOrder, saveOrder } from '../workOrder';

const it_ = (id: string, over: Partial<WorkItem> = {}): WorkItem => ({
  id, kind: 'case_study', group: 'written', title: `Piece ${id}`, from: 'Case study', createdAt: '2026-09-16T15:00:00Z',
  week: null, project: null, skills: [], state: 'Submitted, not reviewed yet', ...over,
});

const ITEMS: WorkItem[] = [
  it_('a', { group: 'link', kind: 'claude_studio', title: 'Capstone Defense and Launch Studio', createdAt: '2026-09-18T15:00:00Z', skills: ['communication', 'architecture'] }),
  it_('b', { group: 'sheet', kind: 'build_artifact', title: 'coreops_program_inventory.csv', createdAt: '2026-08-27T15:00:00Z', project: 'GoalKick', skills: ['architecture'] }),
  it_('c', { group: 'written', createdAt: '2026-08-25T15:00:00Z', skills: ['Architecture', 'executive_authority'] }),
  it_('d', { group: 'word', kind: 'build_artifact', title: 'data-flow-diagram.docx', createdAt: '2026-08-24T15:00:00Z', project: 'GoalKick', skills: ['requirements'] }),
  it_('e', { group: 'written', createdAt: '2026-08-24T12:00:00Z' }),
];

describe('chipsFor', () => {
  it('All first with the total, then only the kinds present, in display order, with real counts', () => {
    expect(chipsFor(ITEMS)).toEqual([
      { key: 'all', label: 'All', count: 5 }, { key: 'written', label: 'Written work', count: 2 },
      { key: 'link', label: 'Claude Studio links', count: 1 }, { key: 'sheet', label: 'Spreadsheets', count: 1 },
      { key: 'word', label: 'Word documents', count: 1 },
    ]);
  });
  it('no pieces: only All, at 0 (no invented kinds)', () => expect(chipsFor([])).toEqual([{ key: 'all', label: 'All', count: 0 }]));
});

describe('weekKey (Central time, weeks start Monday)', () => {
  it('a Sunday-evening piece in Central belongs to the week that started the Monday before', () => {
    // 2026-08-31 02:00Z is Sunday 30 Aug 21:00 CDT
    expect(weekKey('2026-08-31T02:00:00Z')).toBe('2026-08-24');
    expect(weekKey('2026-08-31T06:00:00Z')).toBe('2026-08-31');
  });
  it('crosses a year boundary', () => expect(weekKey('2027-01-01T18:00:00Z')).toBe('2026-12-28'));
});

describe('sectionsFor', () => {
  it('by week: newest week first, items keep newest-first order, labels say the week', () => {
    const s = sectionsFor(ITEMS, 'week');
    expect(s.map((x) => x.key)).toEqual(['2026-09-14', '2026-08-24']);
    expect(s[0].label).toBe('Week of Sep 14, 2026');
    expect(s[1].items.map((x) => x.id)).toEqual(['b', 'c', 'd', 'e']);
  });
  it('by project: biggest first, the untied pieces last', () => {
    const s = sectionsFor(ITEMS, 'project');
    expect(s.map((x) => x.label)).toEqual(['Not tied to a project', 'GoalKick'].reverse());
    expect(s[s.length - 1].items.map((x) => x.id)).toEqual(['a', 'c', 'e']);
  });
  it('by skill: a piece appears under each of its skills, spelled one way; untagged last', () => {
    const s = sectionsFor(ITEMS, 'skill');
    expect(s[0]).toMatchObject({ label: 'Architecture' });
    expect(s[0].items.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(s[s.length - 1]).toMatchObject({ label: 'No skill tagged' });
  });
  it('by kind: in display order', () => {
    expect(sectionsFor(ITEMS, 'kind').map((x) => x.key)).toEqual(['written', 'link', 'sheet', 'word']);
  });
  it('nothing in, nothing out', () => {
    for (const by of ['week', 'project', 'skill', 'kind'] as const) expect(sectionsFor([], by)).toEqual([]);
  });
});

describe('filter and search', () => {
  it('filters by kind and searches titles, lessons, projects and skills, case-insensitively', () => {
    expect(filterItems(ITEMS, 'written', '').map((x) => x.id)).toEqual(['c', 'e']);
    expect(filterItems(ITEMS, 'all', 'goalkick').map((x) => x.id)).toEqual(['b', 'd']);
    expect(filterItems(ITEMS, 'all', 'Executive authority').map((x) => x.id)).toEqual(['c']);
    expect(filterItems(ITEMS, 'all', '   ').length).toBe(5);
    expect(filterItems(ITEMS, 'pdf', '')).toEqual([]);
  });
  it('labels skills one way', () => expect(skillLabel('context_engineering')).toBe('Context engineering'));
});

describe('Previous / Next', () => {
  it('walks the order the list showed, once per piece even when grouping by skill repeats it', () => {
    const order = orderOf(sectionsFor(ITEMS, 'skill'));
    expect(new Set(order).size).toBe(order.length);
    expect(order.length).toBe(5);
    expect(neighbors(order, order[0])).toEqual({ prev: null, next: order[1], index: 0 });
    expect(neighbors(order, order[4])).toEqual({ prev: order[3], next: null, index: 4 });
    expect(neighbors(order, 'not-there')).toEqual({ prev: null, next: null, index: -1 });
  });
  it('the saved order round-trips, and a blocked or corrupt store reads as none', () => {
    saveOrder(['a', 'b']);
    expect(loadOrder()).toEqual(['a', 'b']);
    sessionStorage.setItem('myWork.order.v1', '{bad');
    expect(loadOrder()).toBeNull();
    sessionStorage.setItem('myWork.order.v1', JSON.stringify([1, 2]));
    expect(loadOrder()).toBeNull();
  });
});
