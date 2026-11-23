import {
  NAV_GROUPS,
  PINNED_LINKS,
  type NavGroup,
  type NavLink,
} from '../../components/Layout/adminNav';

/**
 * AF12.18 - what the person you are viewing as can reach in the admin sidebar.
 *
 * ## Why this exists
 *
 * Ali, 2026-11-22, from a campus screenshot: *"The access is messed up. Sarbjit should be able
 * to open Marketing but can't."* Her access was never broken. What he could not do was SEE her
 * access, so a withheld bridge read as a missing grant and cost a round trip and a false alarm
 * that a builder had lost her section.
 *
 * ## Why there are three answers and not two
 *
 * `visibleNavGroups` keeps a group the viewer can reach ONLY through a sub-list, which is the bug
 * Quincy Ninying reported on 2 Nov: he held `agents` but not `internship`, and the whole Interns
 * group vanished before its sub-lists were looked at. A sub-list's entries are row scoped on the
 * server, so holding its section is necessary and not sufficient: whether anything appears under
 * it depends on which rows are hers.
 *
 * Collapsing that into a boolean has to pick a lie. `false` hides a node she is entitled to,
 * which is Quincy's bug again, now inside the tool built to explain it. `true` promises a node
 * that may be empty. So it is its own state, `via_list`, and the panel says what it depends on.
 * Sarbjit sits exactly here: `marketing` grants `dashboard`, `campaigns` and `brands`, and her
 * one extra section is `agents`, whose only home in the sidebar is a sub-list of Interns.
 *
 * ## Why the rule is written here as well as in adminNav
 *
 * `visibleNavGroups` is the canonical rule and this would rather have called it. It cannot: it
 * closes over the module-level `NAV_GROUPS`, so it is not answerable about an injected sidebar,
 * and a test that pins this panel's labels against the live sidebar would fail on any unrelated
 * nav edit. So the rule is restated once, in `openLinksOf` below, and
 * `viewAsAccess.test.ts` asserts the two AGREE on the live sidebar across several real
 * section sets. The duplication is real and is held shut by that test rather than by hope: if
 * someone changes the rule in `adminNav.ts`, the agreement test fails here.
 *
 * ## Read only, and no route anywhere
 *
 * This describes access; it never opens it. There is deliberately no href in the result: the
 * management bridge stays refused during view-as for the reason in `mgmtBridgeGate.ts`, and a
 * panel that explained the refusal while offering a way around it would be worth less than no
 * panel. Pure, so the answer is assertable without a browser or a session.
 */

/** How the viewer reaches an area of the sidebar. */
export type ViewAsReach = 'open' | 'via_list' | 'withheld';

/** One sidebar group as this viewer would find it. */
export interface ViewAsArea {
  /** The group's own label, or its section key when the sidebar gives it no label. */
  label: string;
  section: string;
  reach: ViewAsReach;
  /** Page labels inside the group that their sections open. */
  pages: readonly string[];
  /** Page labels inside the group that their sections do not open. */
  withheldPages: readonly string[];
  /** Sub-list labels whose section they hold. Entries under each are row scoped on the server. */
  lists: readonly string[];
}

/** A pinned link, which has no group to belong to. */
export interface ViewAsPinned {
  label: string;
  /** True when the link needs a linked staff portal account as well as the section. */
  conditional: boolean;
}

export interface ViewAsAccess {
  pinnedOpen: readonly ViewAsPinned[];
  pinnedWithheld: readonly string[];
  areas: readonly ViewAsArea[];
  openCount: number;
  viaListCount: number;
  withheldCount: number;
}

/** The sidebar to read. Injectable so a test can pin exact labels without depending on the live nav. */
export interface ViewAsNav {
  pinned: readonly NavLink[];
  groups: readonly NavGroup[];
}

export const LIVE_VIEW_AS_NAV: ViewAsNav = { pinned: PINNED_LINKS, groups: NAV_GROUPS };

const groupLabel = (g: NavGroup): string => g.label ?? g.section;

/**
 * The links in a group this viewer opens.
 *
 * THIS IS THE RULE, and it is `visibleNavGroups`' rule: a link's own section when it has one,
 * otherwise the group's. Nothing else in this file decides access. See the note above on why it
 * is restated here and on the test that keeps it honest.
 */
const openLinksOf = (g: NavGroup, canSection: (s: string) => boolean): readonly NavLink[] =>
  g.links.filter((l) => canSection(l.section ?? g.section));

/**
 * What the holder of `sections` would find in the admin sidebar.
 *
 * `sections` is the list `GET /api/portal/mgmt/status` returns for whoever's token the request
 * carried. In a view-as tab that is the VIEWED person, which is the whole reason this is useful:
 * nothing here is inferred from the admin's own session.
 */
export function viewAsAccess(sections: readonly string[], nav: ViewAsNav = LIVE_VIEW_AS_NAV): ViewAsAccess {
  const held = new Set(sections);
  const canSection = (s: string): boolean => held.has(s);

  const areas: ViewAsArea[] = nav.groups.map((g) => {
    const open = openLinksOf(g, canSection);
    const openPaths = new Set(open.map((l) => l.path));
    const lists = (g.subLists ?? []).filter((sl) => canSection(sl.section)).map((sl) => sl.label);
    const reach: ViewAsReach = open.length > 0 ? 'open' : lists.length > 0 ? 'via_list' : 'withheld';
    return {
      label: groupLabel(g),
      section: g.section,
      reach,
      pages: open.map((l) => l.label),
      withheldPages: g.links.filter((l) => !openPaths.has(l.path)).map((l) => l.label),
      lists,
    };
  });

  const pinnedOpen: ViewAsPinned[] = [];
  const pinnedWithheld: string[] = [];
  for (const l of nav.pinned) {
    // A link with no section is unreachable rather than public, the same rule the campus tower's
    // `room()` applies and the same one `accessibleLinksForDomain` applies in Admin OS.
    if (l.section && canSection(l.section)) pinnedOpen.push({ label: l.label, conditional: !!l.requiresMgmtBridge });
    else pinnedWithheld.push(l.label);
  }

  return {
    pinnedOpen,
    pinnedWithheld,
    areas,
    openCount: areas.filter((a) => a.reach === 'open').length,
    viaListCount: areas.filter((a) => a.reach === 'via_list').length,
    withheldCount: areas.filter((a) => a.reach === 'withheld').length,
  };
}

/** One line for the top of the panel: how much of the sidebar this badge opens, counted. */
export function viewAsSummary(a: ViewAsAccess): string {
  const total = a.areas.length;
  const reach = a.openCount + a.viaListCount;
  if (reach === 0) return `No admin areas. All ${total} are withheld.`;
  const via = a.viaListCount > 0 ? `, ${a.viaListCount} of them only through a list` : '';
  return `${reach} of ${total} admin areas${via}.`;
}
