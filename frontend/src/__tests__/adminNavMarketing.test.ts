import { sectionForPath, ALL_LINKS, UNLISTED_PATH_SECTIONS } from '../components/Layout/adminNav';

/**
 * Marketing Operations navigation — every route resolves, and no dead links are advertised.
 *
 * TWO SEPARATE OBLIGATIONS, deliberately not conflated:
 *
 *  1. Every marketing route must RESOLVE to a section. `ProtectedRoute` computes
 *     `allowed = section ? canSection(section) : !isScopedRep`, and the backend
 *     `mgmtSectionGate` is deny-by-default for a scoped role. A path that resolves to null
 *     therefore bounces scoped identities off a page the API would happily have served — or
 *     403s them with an error nothing in the code explains. Classification is free; an
 *     unmapped path is a latent bug that surfaces on the day someone's role changes.
 *
 *  2. Only routes that EXIST may appear in the sidebar. The build spec lists fifteen marketing
 *     destinations as the target information architecture; this phase delivers a handful of
 *     them. Registering all fifteen as sidebar links would advertise roughly nine dead ends,
 *     which is worse than an incomplete menu: a link that goes nowhere reads as a broken
 *     product, while an absent one reads as work in progress.
 *
 * These pull in opposite directions and the resolution is the point of this suite: classify
 * everything, link only what is built.
 */

/** Every marketing destination named in build spec section 4. */
const SPEC_ROUTES = [
  '/admin/marketing',
  '/admin/marketing/campaigns',
  '/admin/marketing/campaigns/abc-123',
  '/admin/marketing/calendar',
  '/admin/marketing/compose',
  '/admin/marketing/content',
  '/admin/marketing/publishing',
  '/admin/marketing/ads',
  '/admin/marketing/audiences',
  '/admin/marketing/assets',
  '/admin/marketing/inbox',
  '/admin/marketing/experiments',
  '/admin/marketing/attribution',
  '/admin/marketing/connectors',
  '/admin/marketing/settings',
  '/admin/marketing/brands',
];

describe('every marketing route resolves to a section', () => {
  it.each(SPEC_ROUTES)('%s is not null', (path) => {
    expect(sectionForPath(path)).not.toBeNull();
  });

  it('resolves them all to campaigns, by longest-prefix inheritance', () => {
    // The mechanism worth pinning: `sectionForPath` matches on longest prefix, so the single
    // `/admin/marketing` entry already covers every child. That is why this suite adds no
    // per-route registrations - they would be redundant, and redundancy here is what drifts.
    for (const path of SPEC_ROUTES) {
      expect(sectionForPath(path)).toBe('campaigns');
    }
  });

  it('agrees with the backend section for the same surface', () => {
    // The frontend gate and `mgmtSectionGate` must classify a path identically. When they
    // disagree, ProtectedRoute admits an identity the API then refuses, and the user gets a
    // shell whose every call fails with nothing explaining why.
    expect(sectionForPath('/admin/marketing')).toBe('campaigns');
    expect(sectionForPath('/admin/brands')).toBe(sectionForPath('/admin/marketing'));
  });

  it('a deeply nested future route still resolves', () => {
    // Detail, tab and action routes added later must not fall off the map.
    expect(sectionForPath('/admin/marketing/campaigns/abc/attribution/model/last-touch')).toBe(
      'campaigns',
    );
  });

  it('does not swallow a non-marketing path that merely starts similarly', () => {
    // Guards against a prefix rule that is too greedy. `/admin/marketing-ops` is not a child of
    // `/admin/marketing` and must not inherit by string accident.
    //
    // NOTE: `sectionForPath` requires an exact match or a `/`-delimited prefix, which is what
    // makes this hold. A naive `startsWith(link.path)` would return 'campaigns' here.
    expect(sectionForPath('/admin/marketing-ops-does-not-exist')).toBeNull();
  });
});

describe('the sidebar advertises only what exists', () => {
  const marketingLinks = ALL_LINKS.filter((l) => l.path.startsWith('/admin/marketing'));

  it('links no marketing route that this phase has not built', () => {
    // The nine destinations below are in the spec's target IA and are NOT delivered yet. If a
    // future change adds a sidebar entry for one, it must add the page in the same diff - this
    // assertion is what forces those two to travel together.
    const notBuiltYet = [
      '/admin/marketing/content', '/admin/marketing/publishing', '/admin/marketing/ads',
      '/admin/marketing/audiences', '/admin/marketing/assets', '/admin/marketing/inbox',
      '/admin/marketing/experiments', '/admin/marketing/attribution',
      '/admin/marketing/connectors',
    ];
    const advertised = marketingLinks.map((l) => l.path);
    expect(advertised.filter((p) => notBuiltYet.includes(p))).toEqual([]);
  });

  it('still exposes the marketing command center itself', () => {
    // The inverse failure: pruning so enthusiastically that the built page becomes unreachable.
    expect(marketingLinks.map((l) => l.path)).toContain('/admin/marketing');
  });
});

describe('icon convention', () => {
  it('no nav icon carries the ri- prefix', () => {
    // The prefix is added by the rendering component. An icon stored as `ri-broadcast-line`
    // renders as `ri-ri-broadcast-line` and silently shows nothing - a blank square rather
    // than an error, which is why this is worth a test rather than a code review.
    const offenders = ALL_LINKS.filter((l) => l.icon && l.icon.startsWith('ri-'));
    expect(offenders.map((l) => `${l.path}: ${l.icon}`)).toEqual([]);
  });

  it('every unlisted path section names a section that some link also uses', () => {
    // UNLISTED_PATH_SECTIONS is the contract for routes with no sidebar entry. A section key
    // invented here and used nowhere else is a typo that resolves to a permission nobody holds.
    const known = new Set(ALL_LINKS.map((l) => l.section).filter(Boolean));
    for (const [, section] of UNLISTED_PATH_SECTIONS) {
      expect(known.has(section)).toBe(true);
    }
  });
});
