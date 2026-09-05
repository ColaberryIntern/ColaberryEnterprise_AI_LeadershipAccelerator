import { ALL_LINKS, NavLink, sectionForPath } from '../components/Layout/adminNav';

/**
 * The six management domains — a PRESENTATION layer over the existing RBAC.
 *
 * THE DECISION THIS ENCODES. The backend enforces 13 section keys via
 * `mgmtSectionGate`, and every scoped role is defined in terms of them. Redefining
 * roles around six domains would re-scope who can reach what — a mentor holds only
 * ['dashboard','career_review'], so folding career_review into a larger domain
 * either grants them more or removes their only surface.
 *
 * So the domains group links for NAVIGATION and nothing else. Section keys remain
 * the sole authorization truth, unchanged, and `mgmtSectionGate` remains the single
 * enforcement point. A domain is visible when the identity can reach ANY link
 * inside it; each link still carries its own section and is still filtered
 * individually. Consolidation therefore cannot broaden access — the property the
 * brief makes non-negotiable — and this file could be deleted tomorrow without
 * changing a single permission.
 */

export type DomainKey = 'command_center' | 'growth' | 'learning' | 'revenue' | 'people' | 'operations';

export interface DomainDef {
  key: DomainKey;
  label: string;
  icon: string;
  /** The canonical route for the domain dashboard. */
  path: string;
  /**
   * Existing nav paths this domain absorbs. Every one keeps working; they become
   * views inside the domain rather than sidebar siblings.
   *
   * Nav paths only. Route aliases that already redirect elsewhere (e.g.
   * /admin/ops-center -> /admin/workforce) are a route-table concern and must not
   * appear here, or they would contribute a section the nav never granted.
   */
  absorbs: readonly string[];

  /**
   * Sections this domain requires DIRECTLY, for a domain that absorbs no legacy
   * nav path. Only People is in that position — it is genuinely new surface, so
   * there is no existing link to inherit a section from, and deriving from an
   * empty `absorbs` would silently hide it from every role including owner.
   */
  ownSections?: readonly string[];
}

/**
 * `command_center` deliberately sits on the `dashboard` section.
 *
 * Every scoped role holds `dashboard` — mentor, community_organizer, curriculum,
 * revenue and admissions all do — while NONE of them holds `war_room`. Building
 * the executive home on the War Room route would strip the landing page from five
 * of eight roles and bounce them on login, because LANDING_PREFERENCE starts at
 * /admin/dashboard. The composition comes from War Room; the route and section do
 * not.
 */
export const DOMAINS: readonly DomainDef[] = [
  {
    key: 'command_center',
    label: 'Command Center',
    icon: 'dashboard-line',
    path: '/admin/command-center',
    absorbs: ['/admin/dashboard', '/admin/war-room'],
  },
  {
    key: 'growth',
    label: 'Growth',
    icon: 'line-chart-line',
    path: '/admin/growth',
    absorbs: [
      '/admin/visitors',
      '/admin/leads',
      '/admin/pipeline',
      '/admin/funnel',
      '/admin/campaigns',
      '/admin/communications',
      '/admin/marketing',
      '/admin/opportunities',
      '/admin/business-accounts',
      '/admin/explorer-growth',
      '/admin/sources',
      '/admin/ingest-logs',
      '/admin/routing-rules',
      '/admin/autonomous',
    ],
  },
  {
    key: 'learning',
    label: 'Learning',
    icon: 'graduation-cap-line',
    path: '/admin/learning',
    absorbs: [
      '/admin/accelerator',
      '/admin/students',
      '/admin/community-roles',
      '/admin/cape-settings',
      '/admin/cert-prep',
      '/admin/projects',
      '/admin/case-studies',
      '/admin/career-review',
    ],
  },
  {
    key: 'revenue',
    label: 'Revenue',
    icon: 'money-dollar-circle-line',
    path: '/admin/revenue',
    // Refunds becomes a view inside Revenue — non-negotiable #8.
    absorbs: ['/admin/refunds'],
  },
  {
    key: 'people',
    label: 'People',
    icon: 'team-line',
    path: '/admin/people',
    // No legacy nav path becomes People — the 360 profile is new surface, not a
    // renamed page. Its sections are therefore declared rather than inherited.
    absorbs: [],
    // Every section that already grants person-level data. Holding ANY of them
    // opens the roster; each PANEL inside a profile is then gated on its own
    // section by `widgetIsVisible`, so a mentor sees the learning panel and a
    // revenue rep sees the billing panel, and neither sees the other. That is
    // the property that lets a 360 view exist without becoming a 360 grant.
    ownSections: ['leads', 'revenue', 'students', 'program', 'career_review'],
  },
  {
    key: 'operations',
    label: 'AI & Operations',
    icon: 'cpu-line',
    path: '/admin/operations',
    absorbs: [
      '/admin/workforce',
      '/admin/brain',
      '/admin/intelligence',
      '/admin/insights',
      '/admin/ceo',
      '/admin/cb-system',
      '/admin/governance',
      '/admin/governance-policy',
      '/admin/tickets',
      '/admin/reports',
      '/admin/settings',
      '/admin/trust',
      '/admin/orchestration',
      '/admin/feed-control-governance',
      '/admin/inbox',
      '/admin/missed-opportunities',
      '/admin/content-queue',
    ],
  },
];

/**
 * The section keys a domain touches, derived from the links it absorbs rather
 * than hand-listed — a hand-written map would drift the moment a nav entry moved,
 * and drift here means a link that renders for an identity the API then 403s.
 */
export function sectionsForDomain(domain: DomainDef): string[] {
  const sections = new Set<string>();
  for (const path of domain.absorbs) {
    const section = sectionForPath(path);
    if (section) sections.add(section);
  }
  for (const section of domain.ownSections ?? []) sections.add(section);
  // The domain's own dashboard route needs a section too. Command Center is
  // pinned to 'dashboard' (see above); the rest inherit from what they absorb.
  if (domain.key === 'command_center') sections.add('dashboard');
  return [...sections];
}

/** A domain is visible when the identity can reach at least one thing inside it. */
export function visibleDomains(canSection: (section: string) => boolean): DomainDef[] {
  return DOMAINS.filter((d) => sectionsForDomain(d).some((s) => canSection(s)));
}

/**
 * Links inside a domain that this identity may actually reach.
 *
 * Filtered per link, not per domain. Domain-level filtering alone would show a
 * revenue-scoped user the Growth domain and then every link in it, including the
 * lead-ingestion surfaces they cannot open.
 */
export function accessibleLinksForDomain(
  domain: DomainDef,
  canSection: (section: string) => boolean,
): NavLink[] {
  return ALL_LINKS.filter(
    // A link with no section is not treated as public — it is treated as
    // unreachable. Defaulting the other way would render an ungated link into a
    // consolidated view and rely on the API to say no, which is the pattern the
    // brief forbids.
    (l) => !l.newTab && domain.absorbs.includes(l.path) && !!l.section && canSection(l.section),
  );
}

/**
 * May this identity open the domain's own landing page?
 *
 * NO SINGLE SECTION COVERS A DOMAIN, and that is not an oversight in the role
 * map — it is the shape of the roles. Growth spans `revenue`, `campaigns`,
 * `lead_ingestion` and `leads`; the revenue role holds two of those and the
 * admissions role holds a different one. Gating the Growth landing on any one
 * section would lock out a role that legitimately works there every day.
 *
 * So the landing route is gated on holding ANY constituent section, and the page
 * renders only the widgets that identity's sections cover (`widgetIsVisible`).
 * That is safe because the landing page owns no data of its own: every widget
 * reads an endpoint that enforces its own section server-side, and widgets
 * outside the identity's sections are never requested. The page is a composition
 * of already-gated parts, so composing them cannot grant more than the parts.
 */
export function canOpenDomain(domain: DomainDef, canSection: (section: string) => boolean): boolean {
  return sectionsForDomain(domain).some((s) => canSection(s));
}

/**
 * Whether a single widget may render on a domain landing page.
 *
 * Checked per widget rather than per page. Without this a support user — whose
 * only grant is `students` — would open Learning and be shown curriculum and
 * career-review panels that then fail at the API, which reads as breakage rather
 * than as permission.
 */
export function widgetIsVisible(
  widgetSection: string,
  canSection: (section: string) => boolean,
): boolean {
  return canSection(widgetSection);
}

/**
 * Where a domain's nav entry should point for this identity.
 *
 * Falls through to the first link they can actually reach, so a nav entry never
 * lands on a page that immediately bounces.
 */
export function domainEntryPath(
  domain: DomainDef,
  canSection: (section: string) => boolean,
): string | null {
  if (canOpenDomain(domain, canSection)) return domain.path;
  const links = accessibleLinksForDomain(domain, canSection);
  return links.length > 0 ? links[0].path : null;
}

/** Which domain a legacy path now lives in, for compatibility redirects. */
export function domainForLegacyPath(pathname: string): DomainDef | undefined {
  return DOMAINS.find((d) => d.absorbs.some((p) => pathname === p || pathname.startsWith(p + '/')));
}
