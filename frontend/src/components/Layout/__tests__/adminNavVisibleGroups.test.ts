import { NAV_GROUPS, visibleNavGroups, type NavSubList } from '../adminNav';

/**
 * The Agents node, and the six builders who could not see it.
 *
 * Quincy Ninying, 2 Nov 2026: *"The Agents tab is still not in my sidebar... There is no refusal
 * message, the tab is simply not listed."* He held `agents` the whole time. The node hangs off the
 * Interns group, the group was kept or dropped on its LINKS alone, and its one link needs
 * `internship` — so the sub-list was never reached.
 *
 * The control that makes this file mean something is `the OLD rule`: it reproduces link-only
 * filtering and asserts it hides the group. Without it, every test below would pass on code that
 * still had the bug, because they would only be checking that a correct viewer sees a correct nav.
 */

/** The real sections of each role involved, from `backend/src/services/access/mgmtRoles.ts`. */
const SECTIONS: Record<string, string[]> = {
  // Quincy. `platform` plus the `agents` extra. No `internship`.
  quincy: ['dashboard', 'system', 'agents'],
  // Tashima. `internship_review` plus the extra — the one builder who DOES hold `internship`.
  tash: ['dashboard', 'internship', 'agents'],
  // Dhee. Holds `internship` and NOT `agents`: the case the Interns comment protects.
  admissions: ['dashboard', 'lead_ingestion', 'internship'],
};

const can = (who: keyof typeof SECTIONS) => (section: string) => SECTIONS[who].includes(section);

/** Every sub-list feed has rows. The emptiness case is asserted separately. */
const allFeedsFull = () => true;
const allFeedsEmpty = () => false;

/** Link-only filtering: what the sidebar did before this fix. */
function oldRule(canSection: (s: string) => boolean) {
  return NAV_GROUPS
    .map((g) => ({ ...g, links: g.links.filter((l) => canSection(l.section ?? g.section)) }))
    .filter((g) => g.links.length > 0);
}

const groupLabels = (gs: Array<{ label: string | null }>) => gs.map((g) => g.label);
const interns = (gs: Array<{ label: string | null; subLists?: NavSubList[] }>) =>
  gs.find((g) => g.label === 'Interns');

describe('the declaration this rests on', () => {
  it('still has an Interns group whose Agents sub-list is gated on `agents`', () => {
    // If this ever stops being true the rest of the file is asserting nothing, so it is checked
    // rather than assumed.
    const g = NAV_GROUPS.find((x) => x.label === 'Interns');
    expect(g).toBeDefined();
    expect(g?.section).toBe('internship');
    expect(g?.links.every((l) => (l.section ?? g.section) === 'internship')).toBe(true);
    expect((g?.subLists ?? []).some((sl) => sl.source === 'agents' && sl.section === 'agents'))
      .toBe(true);
  });
});

describe('THE CONTROL — the old rule really did hide it', () => {
  it('link-only filtering drops the Interns group for a viewer holding `agents` only', () => {
    expect(groupLabels(oldRule(can('quincy')))).not.toContain('Interns');
  });
});

describe('a viewer who holds `agents` but not `internship`', () => {
  it('now keeps the Interns group, so the Agents node can render', () => {
    expect(groupLabels(visibleNavGroups(can('quincy'), allFeedsFull))).toContain('Interns');
  });

  it('gets NO links under it, because the Interns hub is still not theirs', () => {
    // The honest picture: reachable agents, unreachable hub. Showing the hub link would be a
    // link that 403s, which is the failure `adminNav.ts` keeps warning about.
    const g = interns(visibleNavGroups(can('quincy'), allFeedsFull));
    expect(g?.links).toEqual([]);
  });

  it('loses the group again when the feed is empty, so nothing renders an empty node', () => {
    expect(groupLabels(visibleNavGroups(can('quincy'), allFeedsEmpty))).not.toContain('Interns');
  });
});

describe('what must NOT change', () => {
  it('a holder of `internship` and NOT `agents` still gets the group with its link', () => {
    const g = interns(visibleNavGroups(can('admissions'), allFeedsFull));
    expect(g).toBeDefined();
    expect(g?.links.length).toBeGreaterThan(0);
  });

  it('...and the Agents sub-list is still refused to them by its own section', () => {
    // The group surviving is not the gate. The sub-list gate is `canSection(sl.section)`, both
    // here and at the render site, so Admissions never sees Agents.
    const sl = (NAV_GROUPS.find((g) => g.label === 'Interns')?.subLists ?? [])
      .find((s) => s.source === 'agents') as NavSubList;
    expect(can('admissions')(sl.section)).toBe(false);
  });

  it('the one builder who holds `internship` is unaffected either way', () => {
    // Tashima Diah. She never reported a missing tab, which is why her case is the confirmation
    // that the cause was `internship` and not something about the feed.
    expect(groupLabels(oldRule(can('tash')))).toContain('Interns');
    expect(groupLabels(visibleNavGroups(can('tash'), allFeedsFull))).toContain('Interns');
  });

  it('changes nothing for every other group a viewer already saw', () => {
    for (const who of Object.keys(SECTIONS) as Array<keyof typeof SECTIONS>) {
      const before = groupLabels(oldRule(can(who)));
      const after = groupLabels(visibleNavGroups(can(who), allFeedsFull));
      // Strictly additive: nothing a viewer used to see may disappear.
      for (const label of before) expect(after).toContain(label);
    }
  });

  it('still drops a group whose links are all refused and which has no sub-lists', () => {
    const nobody = () => false;
    expect(visibleNavGroups(nobody, allFeedsFull)).toEqual([]);
  });
});
