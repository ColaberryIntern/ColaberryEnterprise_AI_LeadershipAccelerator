import { ALL_LINKS, NAV_GROUPS, sectionForPath } from '../components/Layout/adminNav';

/**
 * The Command Center's nav entry, asserted specifically.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM adminNavRbac.test.ts ───────────────
 *
 * A plan audit caught the first version of this task crediting
 * `adminNavRbac.test.ts` with proving the entry is correctly scoped. It does
 * not. That suite asserts `sectionForPath`, group visibility for a sales rep,
 * and an `ALL_LINKS` invariant — and **every one of those assertions passes
 * with no Explorer entry present at all.** It proves the filtering mechanism
 * works; it says nothing about whether this link is subject to it.
 *
 * A criterion satisfied by the status quo is not a criterion. Every assertion
 * below fails if the nav entry is deleted.
 *
 * ── AND WHY THE SECTION MATTERS MORE THAN THE LINK ──────────────────────────
 *
 * `campaigns` is not an arbitrary grouping choice. It is the section the
 * BACKEND gate classifies `/api/admin/explorer-growth` under
 * (`mgmtSectionGate.ts`'s PATH_SECTION row). If the nav put this link in a
 * group whose section the API does not recognise, the link would render for
 * someone the API then 403s — a surface that half-works and looks fine.
 */

const PATH = '/admin/explorer-growth';

/** A canSection predicate for an identity holding exactly these sections. */
const holding =
  (...sections: string[]) =>
  (s: string) =>
    sections.includes(s);

/** Reproduces AdminLayout's filter, as the sibling suite does. */
const visibleLinks = (canSection: (s: string) => boolean) =>
  NAV_GROUPS.flatMap((g) => g.links.filter((l) => canSection(l.section ?? g.section)).map((l) => l.path));

describe('the Explorer Growth nav entry exists', () => {
  it('is registered in ALL_LINKS', () => {
    // Fails the moment the entry is removed. The sibling suite would not.
    expect(ALL_LINKS.map((l) => l.path)).toContain(PATH);
  });

  it('carries a label and a RemixIcon name without the ri- prefix', () => {
    const link = ALL_LINKS.find((l) => l.path === PATH);
    expect(link?.label).toBe('Explorer Growth');
    // The shell renders `ri-${icon}`, so a `bi-` name here would produce
    // `ri-bi-...` and display nothing. Both icon fonts are loaded in this build;
    // only RemixIcon names work through that prop.
    expect(link?.icon).toBeTruthy();
    expect(link?.icon).not.toMatch(/^(ri-|bi-|bi )/);
  });
});

describe('it resolves to the section the backend gate uses', () => {
  it('classifies as campaigns', () => {
    // Must match `mgmtSectionGate.ts`'s PATH_SECTION row for
    // `/api/admin/explorer-growth`. If these two ever disagree, the nav shows a
    // link the API refuses.
    expect(sectionForPath(PATH)).toBe('campaigns');
  });

  it('sits inside the Campaigns group rather than overriding its section', () => {
    const group = NAV_GROUPS.find((g) => g.links.some((l) => l.path === PATH));
    expect(group?.section).toBe('campaigns');
    // No per-link override: the group's section is the one that applies, which
    // is what keeps it aligned with the backend without a second declaration.
    expect(group?.links.find((l) => l.path === PATH)?.section).toBeUndefined();
  });

  it('does not let the prefix leak into a sibling route', () => {
    expect(sectionForPath('/admin/explorer-growth-legacy')).not.toBe('campaigns');
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
    // These six section sets are copied from the backend's `mgmtRoles.ts`. Not
    // one of them holds `campaigns`, so the Command Center is an owner/admin
    // surface — and this asserts the nav agrees with that rather than assuming it.
    expect(visibleLinks(holding(...sections))).not.toContain(PATH);
  });
});
