/**
 * adminNav.ts — admin sidebar information architecture.
 * Pinned links always show; labeled groups are collapsible (see AdminLayout).
 * `icon` is a RemixIcon name without the `ri-` prefix (the brand icon set,
 * loaded via src/colaberry/tokens/fonts.css).
 */
// `section` is the management-portal RBAC section key (mirrors backend
// mgmtRoles.ts SECTION_KEYS). AdminLayout hides a link/group when the logged-in
// admin's role can't access its section; the backend enforces the same.
// `newTab` renders the link as a plain <a target="_blank"> instead of a router
// <Link> (mirrors the portal sidebar's identical NavItem.newTab pattern) — for
// external destinations (My Day) or internal bridge-landing pages (AI Training)
// where the current admin tab should stay put. `requiresMgmtBridge` hides the
// link unless AuthContext's `hasPortalAccount` is true — true for either a
// bridge-minted staff session OR a direct admin_users login whose email is
// linked to a staff CommunityMember (see mgmtBridgeService.loadStaffPortalLinkByEmail).
// A legacy admin with no staff link at all has no enrollment to send to, so the
// link would always 403 for them.
export interface NavLink { path: string; label: string; icon: string; section?: string; newTab?: boolean; requiresMgmtBridge?: boolean; }
export interface NavGroup { label: string | null; section: string; links: NavLink[]; }

/** Always-visible quick set above the collapsible groups. */
export const PINNED_LINKS: NavLink[] = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard-line', section: 'dashboard' },
  { path: '/admin/trust', label: 'Trust Center', icon: 'shield-check-line', section: 'trust' },
  { path: '/admin/war-room', label: 'War Room', icon: 'radar-line', section: 'war_room' },
  // Support role's sole surface (also visible to owner/admin who hold 'students').
  { path: '/admin/students', label: 'Student Story', icon: 'file-user-line', section: 'students' },
  // advisor.colaberry.ai's own "My Day" queue — a separate app with its own
  // Google SSO, so this is a plain external link, no session bridge needed.
  { path: 'https://advisor.colaberry.ai/my-day/', label: 'My Day', icon: 'calendar-check-line', section: 'students', newTab: true },
  // Reverse of "Management Portal": a staff member jumps back into their OWN
  // connected student portal account with no separate login. Lands on
  // /admin/ai-training-enter, which mints a portal token and redirects.
  { path: '/admin/ai-training-enter', label: 'AI Training', icon: 'book-open-line', section: 'students', newTab: true, requiresMgmtBridge: true },
];

export const NAV_GROUPS: NavGroup[] = [
  // Leads and Pipeline carry their own 'leads' section: it is the narrow slice
  // of this group a sales rep may reach (backend requireSalesOrAdmin covers
  // exactly these two surfaces). Everyone who holds 'revenue' also holds
  // 'leads', so this changes nothing for owner/admin/revenue identities.
  { label: 'Revenue', section: 'revenue', links: [
    { path: '/admin/revenue', label: 'Revenue', icon: 'money-dollar-circle-line' },
    { path: '/admin/refunds', label: 'Refunds', icon: 'refund-2-line' },
    { path: '/admin/leads', label: 'Leads', icon: 'group-line', section: 'leads' },
    { path: '/admin/pipeline', label: 'Pipeline', icon: 'filter-3-line', section: 'leads' },
    { path: '/admin/opportunities', label: 'Opportunities', icon: 'line-chart-line' },
    { path: '/admin/funnel', label: 'Funnel', icon: 'filter-2-line' },
  ]},
  { label: 'Campaigns', section: 'campaigns', links: [
    { path: '/admin/campaigns', label: 'Campaigns', icon: 'megaphone-line' },
    { path: '/admin/communications', label: 'Communications', icon: 'chat-3-line' },
    { path: '/admin/marketing', label: 'Marketing', icon: 'broadcast-line' },
    { path: '/admin/visitors', label: 'Visitors', icon: 'eye-line' },
  ]},
  { label: 'Lead Ingestion', section: 'lead_ingestion', links: [
    { path: '/admin/sources', label: 'Sources', icon: 'upload-cloud-2-line' },
    { path: '/admin/ingest-logs', label: 'Ingest Logs', icon: 'file-list-3-line' },
    { path: '/admin/routing-rules', label: 'Routing Rules', icon: 'node-tree' },
    { path: '/admin/autonomous', label: 'Autonomous', icon: 'lightbulb-flash-line' },
  ]},
  { label: 'Inbox & Content', section: 'inbox_content', links: [
    { path: '/admin/inbox', label: 'Inbox COS', icon: 'inbox-2-line' },
    { path: '/admin/missed-opportunities', label: 'Missed Opportunities', icon: 'mail-close-line' },
    { path: '/admin/content-queue', label: 'Content Queue', icon: 'article-line' },
  ]},
  { label: 'Program', section: 'program', links: [
    { path: '/admin/accelerator', label: 'Accelerator', icon: 'graduation-cap-line' },
    { path: '/admin/community-roles', label: 'Community Roles', icon: 'user-star-line' },
    { path: '/admin/orchestration', label: 'Orchestration', icon: 'flow-chart' },
    { path: '/admin/cape-settings', label: 'Architecture Skills', icon: 'radar-line' },
    { path: '/admin/feed-control-governance', label: 'Feed Control Governance', icon: 'shield-star-line' },
    { path: '/admin/workforce', label: 'AI Organization', icon: 'team-line' },
    { path: '/admin/brain', label: 'Enterprise Intelligence', icon: 'brain-line' },
    { path: '/admin/projects', label: 'Projects', icon: 'rocket-2-line' },
  ]},
  { label: 'Intelligence', section: 'intelligence', links: [
    { path: '/admin/ceo', label: 'CEO Command', icon: 'vip-crown-line' },
    { path: '/admin/cb-system', label: 'CB System', icon: 'robot-2-line' },
    { path: '/admin/intelligence', label: 'Intelligence OS', icon: 'cpu-line' },
    { path: '/admin/insights', label: 'Insights', icon: 'lightbulb-line' },
    { path: '/admin/governance', label: 'Governance', icon: 'shield-keyhole-line' },
    { path: '/admin/governance-policy', label: 'Governance Policies', icon: 'shield-star-line' },
  ]},
  { label: 'System', section: 'system', links: [
    { path: '/admin/tickets', label: 'Tickets', icon: 'ticket-2-line' },
    { path: '/admin/reports', label: 'Automated Reports', icon: 'mail-send-line' },
    { path: '/admin/settings', label: 'Settings', icon: 'settings-3-line' },
  ]},
];

/** Flat list for the "jump to" search — each link carries its section (a group's
 *  links inherit the group's section) so search results can be RBAC-filtered too. */
export const ALL_LINKS: NavLink[] = [
  ...PINNED_LINKS,
  ...NAV_GROUPS.flatMap((g) => g.links.map((l) => ({ ...l, section: l.section ?? g.section }))),
];

/**
 * Admin routes every authenticated admin identity may reach regardless of
 * section, because they are about the account itself rather than any data
 * surface. Kept tiny on purpose.
 */
export const UNIVERSAL_ADMIN_PATHS: readonly string[] = ['/admin/change-password'];

/**
 * The RBAC section governing an admin route, or null when the path has no nav
 * entry (detail routes under a nav path resolve to their parent's section).
 *
 * Longest-prefix wins so a more specific entry beats a shorter one, and the
 * match is `/`-delimited so '/admin/leads' never claims '/admin/leadsomething'.
 * `newTab` entries are external or bridge destinations, not routes in this app,
 * so they are skipped.
 */
export function sectionForPath(pathname: string): string | null {
  let best: NavLink | null = null;
  for (const link of ALL_LINKS) {
    if (link.newTab) continue;
    if (pathname === link.path || pathname.startsWith(link.path + '/')) {
      if (!best || link.path.length > best.path.length) best = link;
    }
  }
  return (best?.section as string) ?? null;
}

// Where a role would rather land, in order, before falling back to whatever it
// can reach. Keeps a sales rep on Leads instead of Pipeline purely because
// Pipeline sorts earlier in some future nav edit.
const LANDING_PREFERENCE = ['/admin/dashboard', '/admin/leads', '/admin/students'];

/**
 * The best landing route for an identity, given its section predicate. Used for
 * the post-login destination and as the bounce target when someone reaches a
 * route outside their scope, so the redirect always terminates somewhere real.
 */
export function firstAccessiblePath(canSection: (section: string) => boolean): string {
  for (const path of LANDING_PREFERENCE) {
    const section = sectionForPath(path);
    if (section && canSection(section)) return path;
  }
  const link = ALL_LINKS.find((l) => !l.newTab && canSection(l.section as string));
  return link ? link.path : UNIVERSAL_ADMIN_PATHS[0];
}
