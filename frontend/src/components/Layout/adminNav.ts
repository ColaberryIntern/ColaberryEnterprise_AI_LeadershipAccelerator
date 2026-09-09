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
  // Admin OS executive home. On 'dashboard' and NOT 'war_room': every scoped
  // role holds the former and none holds the latter, so building it on the War
  // Room's section would have stripped the landing page from five of eight
  // roles. Pinned rather than grouped because it is the destination the other
  // domains hang off.
  { path: '/admin/war-room', label: 'War Room', icon: 'radar-line', section: 'war_room' },
  { path: '/admin/trust', label: 'Trust Center', icon: 'shield-check-line', section: 'trust' },
  // Support role's sole surface (also visible to owner/admin who hold 'students').
  { path: '/admin/students', label: 'Student Story', icon: 'file-user-line', section: 'students' },
  // Portfolio review. Its own section so a Mentor can be granted THIS and nothing
  // else; mgmtRoles gives them ['dashboard','career_review'].
  { path: '/admin/career-review', label: 'Portfolio Review', icon: 'award-line', section: 'career_review' },
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
    { path: '/admin/business-accounts', label: 'Business Accounts', icon: 'building-line' },
    { path: '/admin/opportunities', label: 'Opportunities', icon: 'line-chart-line' },
    { path: '/admin/funnel', label: 'Funnel', icon: 'filter-2-line' },
  ]},
  { label: 'Campaigns', section: 'campaigns', links: [
    { path: '/admin/campaigns', label: 'Campaigns', icon: 'megaphone-line' },
    { path: '/admin/communications', label: 'Communications', icon: 'chat-3-line' },
    { path: '/admin/marketing', label: 'Marketing', icon: 'broadcast-line' },
    { path: '/admin/visitors', label: 'Visitors', icon: 'eye-line' },
    // Explorer Growth OS Command Center (spec §26). Deliberately in the
    // Campaigns group: `section: 'campaigns'` is what the spec assigns the page,
    // and it is the same section the BACKEND gate already classifies
    // `/api/admin/explorer-growth` under (`mgmtSectionGate.ts`'s PATH_SECTION),
    // so nav visibility and API access agree by construction rather than by
    // luck. A link sitting in a group whose section the API does not recognise
    // is a link that renders for someone the API will then 403.
    { path: '/admin/explorer-growth', label: 'Explorer Growth', icon: 'radar-line' },
  ]},
  { label: 'Lead Ingestion', section: 'lead_ingestion', links: [
    { path: '/admin/sources', label: 'Sources', icon: 'upload-cloud-2-line' },
    { path: '/admin/ingest-logs', label: 'Ingest Logs', icon: 'file-list-3-line' },
    { path: '/admin/routing-rules', label: 'Routing Rules', icon: 'node-tree' },
    { path: '/admin/autonomous', label: 'Autonomous', icon: 'lightbulb-flash-line' },
  ]},
  // AI Internship applications. Its own group because it has its own section
  // key: the queue carries an applicant's resume, phone number and interview
  // transcript, which is a wider grant than the Program group's curriculum work.
  // The section matches what mgmtSectionGate classifies /api/admin/internship
  // under, so nav visibility and API access agree by construction — a link that
  // renders for someone the API will then 403 is the failure this file keeps
  // warning about. Admissions (Dhee) holds this section, so she sees it here.
  { label: 'AI Internship', section: 'internship', links: [
    { path: '/admin/internship', label: 'Applications', icon: 'user-follow-line' },
  ]},
  { label: 'Inbox & Content', section: 'inbox_content', links: [
    { path: '/admin/inbox', label: 'Inbox COS', icon: 'inbox-2-line' },
    { path: '/admin/missed-opportunities', label: 'Missed Opportunities', icon: 'mail-close-line' },
    { path: '/admin/content-queue', label: 'Content Queue', icon: 'article-line' },
  ]},
  // The Accelerator is the front door of the Program domain: cohorts, the
  // people in them, what they are taught, and the work they produce all hang
  // off /admin/accelerator's own tabs now. Five surfaces that used to sit here
  // as siblings were folded into those tabs (2026-09-08) and deliberately kept
  // OUT of this list so the sidebar stops competing with the page:
  //
  //   Community Roles          -> a section under the Cohorts tab
  //   Cert Prep / Case Studies / Projects -> Accelerator program-level tabs
  //   Feed Control Governance  -> already reachable from Curriculum > Feed Control
  //
  // Their ROUTES stay live and their pages are unchanged. What changes is only
  // that they are no longer sidebar entries — which is exactly why each one is
  // restated in UNLISTED_PATH_SECTIONS below. Dropping a nav entry without that
  // restatement makes sectionForPath() return null, and ProtectedRoute then
  // bounces every scoped identity off a page the API would have served. That
  // failure is the one the case-studies comment used to warn about here.
  { label: 'Program', section: 'program', links: [
    { path: '/admin/accelerator', label: 'Accelerator', icon: 'graduation-cap-line' },
    // Renamed from "Orchestration": this is the curriculum authoring surface
    // (Composer, Experience Studio, Timeline, Feed Control), and "Curriculum"
    // is what it is called everywhere except this label. The PATH is unchanged
    // so every existing deep link, bookmark and ?tab= link keeps working.
    { path: '/admin/orchestration', label: 'Curriculum', icon: 'flow-chart' },
    { path: '/admin/workforce', label: 'AI Organization', icon: 'team-line' },
  ]},
  { label: 'Intelligence', section: 'intelligence', links: [
    { path: '/admin/ceo', label: 'CEO Command', icon: 'vip-crown-line' },
    { path: '/admin/cb-system', label: 'CB System', icon: 'robot-2-line' },
    { path: '/admin/intelligence', label: 'Intelligence OS', icon: 'cpu-line' },
    // Moved out of the Program group 2026-09-08. The Enterprise Memory Graph
    // spans leads, agents, campaigns and projects; students are one node type
    // among many, so it sits with the other platform-wide intelligence
    // surfaces rather than beside the Accelerator.
    //
    // THE SECTION IS PINNED TO 'program' ON PURPOSE and must not be allowed to
    // inherit this group's 'intelligence'. The backend's mgmtSectionGate maps
    // /api/admin/brain to 'program'; changing the nav section without changing
    // the gate would make the two disagree, and changing BOTH would silently
    // re-scope who can open the page — an access decision, not a nav tidy-up.
    // This is the same presentation-vs-authorization split the Revenue group
    // already uses for Leads and Pipeline (grouped under Revenue, gated on
    // 'leads'). Moving a link between groups must never move access with it.
    { path: '/admin/brain', label: 'Enterprise Intelligence', icon: 'brain-line', section: 'program' },
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
 * Paths whose access the API decides, because one section key cannot express it.
 *
 * The nav's model is one section per path, and ProtectedRoute inherits it. The
 * People roster breaks that model: it legitimately serves five sections (leads,
 * revenue, students, program, career_review), so ANY single key here would bounce
 * roles the API authorises - pick 'students' and a revenue identity is refused a
 * page the backend would happily serve.
 *
 * Listing it here lets an authenticated admin reach the page, where the API makes
 * the real decision. That is not a loosening: /api/admin/people re-checks with
 * hasAnyPersonScope() - stricter than any single section, since it denies
 * community_organizer, who holds 'dashboard' - and applies the row-level
 * lifecycle scope inside the SQL. The page renders the 403 plainly when it comes.
 *
 * This mirrors the AGNOSTIC list in the backend's mgmtSectionGate deliberately,
 * so the two gates cannot drift into disagreeing about this one path.
 *
 * Keep this list tiny. A path belongs here only when it genuinely serves several
 * sections AND its API enforces scope itself.
 */
export const API_ENFORCED_PATHS: readonly string[] = ['/admin/people'];

/**
 * Admin routes that have a SECTION but deliberately no sidebar entry.
 *
 * Discovery for the Admin OS consolidation found 74 admin routes against 44 nav
 * paths. Twelve live surfaces had no nav entry at all, and the two gates then
 * disagreed about them: `sectionForPath()` returned null, so ProtectedRoute's
 * `allowed = section ? canSection(section) : !isScopedRep` ADMITTED every
 * mgmt-role identity, while the backend's `mgmtSectionGate` is deny-by-default
 * and 403d them. Not a data leak — the API is the gate that holds — but a
 * mentor could reach /admin/apollo and get a shell that failed every call with
 * nothing explaining why. That is the latent 403 the mgmtSectionGate comments
 * already warn about twice.
 *
 * Classifying them here fixes the disagreement without adding nine items to a
 * sidebar that is about to be reorganised into six domains. Each row must have
 * a matching prefix in the backend's PATH_SECTION, or the two gates drift
 * apart again — which is the whole failure this closes.
 *
 * Three further orphans were retired outright rather than classified
 * (/admin/refactored/builder, /admin/refactored/client, /admin/va-erp): each
 * documented itself as a prototype or demo-scope surface.
 */
export const UNLISTED_PATH_SECTIONS: ReadonlyArray<readonly [string, string]> = [
  // Acquisition tooling — sits with the lead-ingestion surfaces it feeds.
  ['/admin/apollo', 'lead_ingestion'],
  ['/admin/import', 'lead_ingestion'],
  // Tracking estate across the properties — the same section as Visitors.
  ['/admin/tracking-estate', 'campaigns'],
  // Executive summary — the Command Center's own job, so the landing section.
  ['/admin/executive-narrative', 'dashboard'],
  // Audit ledger. Classified from what it QUERIES (event_type, actor,
  // entity_type, entity_id, payload) rather than from its name — it is a
  // system audit trail, not a marketing events page.
  ['/admin/events', 'system'],
  ['/admin/work-ledger-health', 'system'],
  ['/admin/automation', 'system'],
  // AI workforce and knowledge operations.
  ['/admin/agent-orphans', 'intelligence'],
  ['/admin/knowledge-ops', 'intelligence'],
  // Folded into the Accelerator page's tabs on 2026-09-08 and removed from the
  // Program nav group. Every one of these keeps a live route and a working
  // page, so each MUST keep its section: the backend's mgmtSectionGate maps
  // /api/admin/community, /api/admin/cert-prep, /api/admin/case-studies,
  // /api/admin/projects and /api/admin/feed-control all to 'program', and this
  // list is the frontend half of that contract. Without these rows
  // sectionForPath() returns null for the routes and ProtectedRoute bounces
  // every scoped identity off pages the API would happily serve — while a
  // legacy admin typing the URL still gets a working page, which is the
  // silent, role-dependent breakage this file warns about twice above.
  ['/admin/community-roles', 'program'],
  ['/admin/cert-prep', 'program'],
  ['/admin/case-studies', 'program'],
  ['/admin/projects', 'program'],
  ['/admin/feed-control-governance', 'program'],
  // Architecture Skills (the CAPE rubric) became a tab on the Curriculum page
  // in the same pass — curriculum configuration, authored by the people who
  // author the curriculum. Its route stays live and its section is unchanged.
  ['/admin/cape-settings', 'program'],
];

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
  let bestPath = '';
  let bestSection: string | null = null;

  for (const link of ALL_LINKS) {
    if (link.newTab || !link.section) continue;
    if (pathname === link.path || pathname.startsWith(link.path + '/')) {
      if (link.path.length > bestPath.length) {
        bestPath = link.path;
        bestSection = link.section;
      }
    }
  }

  // Routes with a section but no sidebar entry. Same longest-prefix rule, so a
  // nav entry and an unlisted entry compete on specificity rather than on which
  // list they happen to live in.
  for (const [path, section] of UNLISTED_PATH_SECTIONS) {
    if (pathname === path || pathname.startsWith(path + '/')) {
      if (path.length > bestPath.length) {
        bestPath = path;
        bestSection = section;
      }
    }
  }

  return bestSection;
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
