import { NAV_GROUPS, PINNED_LINKS, visibleNavGroups, type NavGroup } from '../../../components/Layout/adminNav';
import { LIVE_VIEW_AS_NAV, viewAsAccess, viewAsSummary, type ViewAsNav } from '../viewAsAccess';

/**
 * AF12.18. The load-bearing test here is the LAST one: `viewAsAccess` restates
 * `visibleNavGroups`' access rule, because that function closes over the live `NAV_GROUPS` and
 * cannot be asked about an injected sidebar. The agreement test is what keeps the two copies
 * from drifting, so if the rule in `adminNav.ts` changes and this panel is not updated with it,
 * this file fails rather than the panel quietly describing a sidebar nobody has.
 *
 * Everything above it runs against a FIXTURE sidebar, so the exact labels asserted cannot be
 * broken by an unrelated nav edit. The fixture is shaped like the real thing: a group whose links
 * carry their own sections, a group that inherits the group's, and a group reachable only through
 * a sub-list, which is Sarbjit's case and Quincy's bug.
 */

const list = (label: string, section: string) => ({
  source: 'agents' as const,
  label,
  section,
  icon: 'robot-2-line',
  paths: [/^\/admin\/x\/[^/]+$/],
});

const FIXTURE: ViewAsNav = {
  pinned: [
    { path: '/admin/dashboard', label: 'Dashboard', icon: 'd', section: 'dashboard' },
    { path: '/admin/war-room', label: 'War Room', icon: 'w', section: 'war_room' },
    // Needs a linked staff portal account on top of the section, so holding the section is not
    // the whole answer and the panel has to say so.
    { path: '/admin/ai-training-enter', label: 'AI Training', icon: 'b', section: 'dashboard', newTab: true, requiresMgmtBridge: true },
    // No section at all: unreachable, never public.
    { path: '/admin/orphan', label: 'Orphan', icon: 'o' },
  ],
  groups: [
    {
      label: 'Marketing',
      section: 'campaigns',
      links: [
        { path: '/admin/campaigns', label: 'Campaigns', icon: 'c' },
        { path: '/admin/brands', label: 'Brands', icon: 'b', section: 'brands' },
        { path: '/admin/spend', label: 'Spend', icon: 's', section: 'revenue' },
      ],
    },
    {
      label: 'Interns',
      section: 'internship',
      links: [{ path: '/admin/internship', label: 'Internship Hub', icon: 'i' }],
      subLists: [list('Agents', 'agents')],
    },
    {
      label: 'Revenue',
      section: 'revenue',
      links: [{ path: '/admin/revenue', label: 'Revenue', icon: 'r' }],
    },
    {
      // The sidebar allows an unlabelled group; its section stands in as the label.
      label: null,
      section: 'system',
      links: [{ path: '/admin/system', label: 'System', icon: 'y' }],
    },
  ],
};

/** Sarbjit's real grants: `mgmt_role: marketing` plus one extra section. */
const SARBJIT = ['dashboard', 'campaigns', 'brands', 'agents'];

const areaBy = (a: ReturnType<typeof viewAsAccess>, label: string) => {
  const found = a.areas.find((x) => x.label === label);
  if (!found) throw new Error(`no area labelled ${label}`);
  return found;
};

describe('viewAsAccess, against a fixture sidebar', () => {
  it('opens a group when a link inherits the group section it holds', () => {
    const a = viewAsAccess(SARBJIT, FIXTURE);
    const m = areaBy(a, 'Marketing');
    expect(m.reach).toBe('open');
    // Campaigns inherits 'campaigns'; Brands carries its own 'brands'. Both held.
    expect(m.pages).toEqual(['Campaigns', 'Brands']);
    // Spend carries 'revenue', which she does not hold, so it is named as withheld rather than
    // left out: "which pages inside Marketing can she not open" is the question this answers.
    expect(m.withheldPages).toEqual(['Spend']);
  });

  it('reports a group reachable ONLY through a sub-list as via_list, not as open and not as withheld', () => {
    const a = viewAsAccess(SARBJIT, FIXTURE);
    const interns = areaBy(a, 'Interns');
    expect(interns.reach).toBe('via_list');
    expect(interns.pages).toEqual([]);
    expect(interns.withheldPages).toEqual(['Internship Hub']);
    expect(interns.lists).toEqual(['Agents']);
  });

  it('withholds a group whose section and sub-lists it does not hold', () => {
    const a = viewAsAccess(SARBJIT, FIXTURE);
    expect(areaBy(a, 'Revenue').reach).toBe('withheld');
    expect(areaBy(a, 'Revenue').pages).toEqual([]);
  });

  it('labels an unlabelled group by its section', () => {
    expect(areaBy(viewAsAccess(SARBJIT, FIXTURE), 'system').section).toBe('system');
  });

  it('splits pinned links, and flags the one that also needs a linked portal account', () => {
    const a = viewAsAccess(SARBJIT, FIXTURE);
    expect(a.pinnedOpen).toEqual([
      { label: 'Dashboard', conditional: false },
      { label: 'AI Training', conditional: true },
    ]);
    // War Room's section is not held. Orphan has no section, so it is unreachable rather than
    // public, which is the same rule the campus tower and Admin OS apply.
    expect(a.pinnedWithheld).toEqual(['War Room', 'Orphan']);
  });

  it('counts the three reaches, and they account for every area', () => {
    const a = viewAsAccess(SARBJIT, FIXTURE);
    expect([a.openCount, a.viaListCount, a.withheldCount]).toEqual([1, 1, 2]);
    expect(a.openCount + a.viaListCount + a.withheldCount).toBe(a.areas.length);
  });

  it('gives an empty section list no areas and no pinned links', () => {
    const a = viewAsAccess([], FIXTURE);
    expect(a.openCount).toBe(0);
    expect(a.viaListCount).toBe(0);
    expect(a.withheldCount).toBe(a.areas.length);
    expect(a.pinnedOpen).toEqual([]);
    expect(viewAsSummary(a)).toBe('No admin areas. All 4 are withheld.');
  });

  it('ignores a section the sidebar has no home for', () => {
    const real = viewAsAccess(SARBJIT, FIXTURE);
    const withJunk = viewAsAccess([...SARBJIT, 'not_a_section'], FIXTURE);
    expect(withJunk).toEqual(real);
  });

  it('is pure: the same input twice gives the same answer and the sidebar is not mutated', () => {
    const before = JSON.stringify(FIXTURE.groups.map((g) => g.links.map((l) => l.path)));
    expect(viewAsAccess(SARBJIT, FIXTURE)).toEqual(viewAsAccess(SARBJIT, FIXTURE));
    expect(JSON.stringify(FIXTURE.groups.map((g) => g.links.map((l) => l.path)))).toBe(before);
  });

  it('summarises what the badge opens, and says when a reach depends on a list', () => {
    expect(viewAsSummary(viewAsAccess(SARBJIT, FIXTURE)))
      .toBe('2 of 4 admin areas, 1 of them only through a list.');
    // No via_list reach, so no clause about one.
    expect(viewAsSummary(viewAsAccess(['campaigns'], FIXTURE))).toBe('1 of 4 admin areas.');
  });
});

describe('viewAsAccess, against the live sidebar', () => {
  it('defaults to the live sidebar', () => {
    expect(viewAsAccess(SARBJIT).areas).toHaveLength(NAV_GROUPS.length);
    expect(LIVE_VIEW_AS_NAV.pinned).toBe(PINNED_LINKS);
  });

  it('classifies every live group exactly once', () => {
    const a = viewAsAccess(SARBJIT);
    expect(a.openCount + a.viaListCount + a.withheldCount).toBe(NAV_GROUPS.length);
    expect(a.pinnedOpen.length + a.pinnedWithheld.length).toBe(PINNED_LINKS.length);
  });

  it("can represent Sarbjit's reported case: something open and something reachable only by list", () => {
    // Not an assertion about particular labels, which a nav edit may legitimately change. The
    // claim is that her grants produce both states, which is what made the panel necessary.
    const a = viewAsAccess(SARBJIT);
    expect(a.openCount).toBeGreaterThan(0);
    expect(a.viaListCount).toBeGreaterThan(0);
  });

  /**
   * THE AGREEMENT TEST. `viewAsAccess` holds a second copy of `visibleNavGroups`' access rule
   * because that function cannot be asked about an injected sidebar. This is what stops the two
   * drifting: the groups this panel calls reachable must be exactly the groups the sidebar would
   * render, with exactly the same links under each.
   */
  it('agrees with visibleNavGroups about the live sidebar, for every section set tried', () => {
    const sets: readonly string[][] = [
      [],
      SARBJIT,
      ['dashboard'],
      ['agents'],
      ['internship'],
      ['internship', 'agents'],
      ['campaigns', 'brands'],
      // Everything the live sidebar mentions, so the all-access shape is covered too.
      Array.from(new Set(NAV_GROUPS.flatMap((g: NavGroup) => [
        g.section,
        ...g.links.map((l) => l.section ?? g.section),
        ...(g.subLists ?? []).map((sl) => sl.section),
      ]))),
    ];

    for (const sections of sets) {
      const held = new Set(sections);
      const canSection = (s: string): boolean => held.has(s);
      // `() => true` assumes every sub-list has entries, which is the same assumption
      // `viewAsAccess` makes and reports as `via_list` rather than as access.
      const expected = visibleNavGroups(canSection, () => true)
        .map((g) => ({ label: g.label ?? g.section, pages: g.links.map((l) => l.label) }));
      const actual = viewAsAccess(sections).areas
        .filter((a) => a.reach !== 'withheld')
        .map((a) => ({ label: a.label, pages: [...a.pages] }));
      expect(actual).toEqual(expected);
    }
  });
});
