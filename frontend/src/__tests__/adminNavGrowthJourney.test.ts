import { ALL_LINKS, NAV_GROUPS, sectionForPath } from '../components/Layout/adminNav';
import { DOMAINS } from '../adminOs/domains';

/**
 * The Growth Journey workspace's nav entry, asserted specifically (Phase 6, T613).
 *
 * Modelled on `adminNavExplorerGrowth.test.ts`, which records the rule this file
 * follows: a criterion satisfied by the status quo is not a criterion. Every
 * assertion below fails if the nav entry is deleted — `adminNavRbac.test.ts`
 * passes whether or not this link exists, because it tests the filtering
 * mechanism rather than any particular link's membership of it.
 *
 * ── THE SECTION MATTERS MORE THAN THE LINK ──────────────────────────────────
 *
 * `campaigns` is not a grouping preference. It is the section the BACKEND gate
 * classifies `/api/admin/growth-journey` under (`mgmtSectionGate.ts`'s
 * PATH_SECTION row, added in T604). If the nav put this link in a group whose
 * section the API does not recognise, the link would render for someone the API
 * then 403s — a surface that half-works and looks fine.
 */

const PATH = '/admin/growth-journey';
const DETAIL = '/admin/growth-journey/handoffs/30000000-0000-4000-8000-000000000001';

const holding =
  (...sections: string[]) =>
  (s: string) =>
    sections.includes(s);

/** Reproduces AdminLayout's filter, as the sibling suites do. */
const visibleLinks = (canSection: (s: string) => boolean) =>
  NAV_GROUPS.flatMap((g) => g.links.filter((l) => canSection(l.section ?? g.section)).map((l) => l.path));

describe('the Growth Journey nav entry exists', () => {
  it('is registered in ALL_LINKS', () => {
    expect(ALL_LINKS.map((l) => l.path)).toContain(PATH);
  });

  it('carries the label and a RemixIcon name without the ri- prefix', () => {
    const link = ALL_LINKS.find((l) => l.path === PATH);
    expect(link?.label).toBe('Growth Journey');
    // The shell renders `ri-${icon}`, so a `bi-` or pre-prefixed name here
    // produces `ri-ri-...` and displays nothing. Both fonts are loaded in this
    // build; only RemixIcon names work through that prop.
    expect(link?.icon).toBe('route-line');
    expect(link?.icon).not.toMatch(/^(ri-|bi-|bi )/);
  });
});

describe('it resolves to the section the backend gate uses', () => {
  it('classifies as campaigns', () => {
    expect(sectionForPath(PATH)).toBe('campaigns');
  });

  it('sits inside the Campaigns group rather than overriding its section', () => {
    const group = NAV_GROUPS.find((g) => g.links.some((l) => l.path === PATH));
    expect(group?.section).toBe('campaigns');
    // No per-link override: the group's section applies, which is what keeps
    // this aligned with the backend without a second declaration to drift.
    expect(group?.links.find((l) => l.path === PATH)?.section).toBeUndefined();
  });

  it('does not let the prefix leak into a sibling route', () => {
    expect(sectionForPath('/admin/growth-journey-legacy')).not.toBe('campaigns');
  });
});

describe('the handoff detail page needs NO unlisted-path row', () => {
  // THE PLAN ASKED FOR ONE AND IT IS NOT NEEDED. T613's spec lists
  // `UNLISTED_PATH_SECTIONS` for `/admin/growth-journey/handoffs`. But
  // `sectionForPath` matches by LONGEST PREFIX — `pathname.startsWith(link.path + '/')`
  // — so the nav entry above already resolves every path beneath it. Adding the
  // row would be config that changes no answer, and config that changes nothing
  // is the kind that later gets "cleaned up" along with something that mattered.
  // This asserts the resolution instead of trusting the claim.
  it('resolves the detail route through the nav entry alone', () => {
    expect(sectionForPath(DETAIL)).toBe('campaigns');
  });

  it('and resolves it for any id, not just a tidy one', () => {
    expect(sectionForPath('/admin/growth-journey/handoffs/abc')).toBe('campaigns');
    expect(sectionForPath('/admin/growth-journey/handoffs')).toBe('campaigns');
  });

  it('the claim is load-bearing: a path NOT under the entry does not resolve', () => {
    // The positive control. Without it the three cells above would pass under a
    // `sectionForPath` that returned 'campaigns' for everything.
    expect(sectionForPath('/admin/not-a-journey/handoffs/abc')).not.toBe('campaigns');
  });
});

describe('the workspace is placed in a domain', () => {
  it('the growth domain absorbs it', () => {
    // `domains.test.ts` fails a classified path with no domain — the state its
    // own comment calls "reachable and unplaced". This names the expected owner
    // rather than relying on that suite to notice.
    const growth = DOMAINS.find((d) => d.key === 'growth');
    expect(growth?.absorbs).toContain(PATH);
  });
});

describe('who can see it', () => {
  it('is visible to an identity holding campaigns', () => {
    expect(visibleLinks(holding('campaigns'))).toContain(PATH);
  });

  it('is visible to a full admin', () => {
    expect(visibleLinks(() => true)).toContain(PATH);
  });

  it.each([
    ['curriculum', ['dashboard', 'program']],
    ['revenue', ['dashboard', 'revenue', 'leads']],
    ['admissions', ['dashboard', 'lead_ingestion']],
    ['support', ['students']],
    ['mentor', ['dashboard', 'career_review']],
    ['community_organizer', ['dashboard']],
  ])('is hidden from the scoped role %s', (_role, sections) => {
    // The six section sets are copied from the backend's `mgmtRoles.ts`. None
    // holds `campaigns`, so this is an owner/admin surface — and the nav agrees
    // with that rather than it being assumed.
    expect(visibleLinks(holding(...sections))).not.toContain(PATH);
  });
});
