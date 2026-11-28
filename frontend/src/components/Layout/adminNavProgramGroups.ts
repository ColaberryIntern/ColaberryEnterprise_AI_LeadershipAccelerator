/**
 * The Program, Intelligence and System groups of the admin sidebar, split out of adminNav.ts so that
 * file stays under the 500-line ceiling (CLAUDE.md Modular Composition Rule). Order and content are
 * unchanged: adminNav.ts spreads PROGRAM_NAV_GROUPS at the end of NAV_GROUPS, exactly where they were.
 */
import type { NavGroup } from './adminNav';

export const PROGRAM_NAV_GROUPS: NavGroup[] = [
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
    /*
     * D4 (P4-01) Colaberry Live Studio setup. `newTab` because this is show-running tooling:
     * an operator configuring a class should not lose their place in admin, and the live
     * surfaces render outside AdminLayout rather than inheriting the operations sidebar.
     *
     * Points at the INDEX, not a session. A nav entry is a fixed string and cannot carry a
     * session id, so the menu lands on the list and the operator picks the class from there.
     */
    { path: '/admin/live/studio', label: 'Live Studio setup', icon: 'broadcast-line', newTab: true },
    // Renamed from "Orchestration": this is the curriculum authoring surface
    // (Composer, Experience Studio, Timeline, Feed Control), and "Curriculum"
    // is what it is called everywhere except this label. The PATH is unchanged
    // so every existing deep link, bookmark and ?tab= link keeps working.
    { path: '/admin/orchestration', label: 'Curriculum', icon: 'flow-chart' },
    { path: '/admin/workforce', label: 'AI Organization', icon: 'team-line' },
    // AF12.1. ONE entry where My Domain, Change Requests, Tool Requests and the Capability
    // Board used to be four. Ali, 17 Nov 2026: those pages "should be removed from the left
    // navigation and located inside the Agent dashboard for the 10 agents."
    //
    // One rather than zero, and the difference is not cosmetic. The obvious reading is to fold
    // them under Agents -> <agent>, but that sub-list sits on section 'agents', and NO builder
    // role carries 'agents' or 'internship' (checked against mgmtRoles: all six return false).
    // Deleting these four outright would have left all seven builders with no route to their own
    // work, on the morning after they are told to go and file tool requests. That is the AF11.9
    // failure again, one level up, in the navigation instead of the gate.
    //
    // CARRIES ITS OWN SECTION for the reason the removed My Domain line recorded: inheriting the
    // Program group's 'program' would 403 exactly the people it is for. The four pages keep their
    // routes, so every existing bookmark and deep link still works; they are simply reached from
    // the dashboard now instead of from the sidebar.
    //
    // AF12.2, 2026-11-20. Labelled "Agents", not "Agent Dashboard", because it is no longer a
    // page you visit: it is the door everything agent-shaped is behind. Ali: *"I think they need
    // to be combined like marketing."* Marketing's own comment below records the same move and the
    // same reason: eight rows made the rail the navigation; now the page is. The PATH is unchanged,
    // so every bookmark, deep link and test that names the route keeps working.
    { path: '/admin/agent-dashboard', label: 'Agents', icon: 'robot-2-line', section: 'dashboard' },
    // AF2.1. Sits in the Program group and is therefore gated on 'program', the same section
    // the backend's agent-domain routes require. The page itself scopes by OWNERSHIP, so a
    // full admin who opens it sees only the domains they are accountable for, not all ten.
    // CARRIES ITS OWN SECTION, and that is the whole point of this line.
    // The route behind it, /api/admin/agent-domains-mine, is gated on 'dashboard'
    // because AF8.3 moved it there after all six interns got 403 on 'program'. The nav
    // filter uses `l.section ?? g.section`, so without this the link inherits the
    // Program group's 'program' and the people it was built for cannot see it. Found
    // live on 19 Oct when an intern's sidebar showed only Dashboard and Brands.
    // Same shape as Leads/Pipeline, which sit in the Revenue group on 'leads'.
    // AF4.2 — an intern asks for a platform change; a named human decides it.
    // CARRIES ITS OWN SECTION, for exactly the reason the My Domain line above records: the
    // people this was built for hold 'dashboard', and inheriting the Program group's 'program'
    // would 403 all seven of them on the surface meant for them. That failure has already
    // happened once here, on 19 Oct.
    //
    // 'dashboard' is the one section every mgmt role carries, so this link is also visible to a
    // mentor, a support rep and a community organizer. That is intended and safe: the DECIDE and
    // queue-read routes behind it carry `requireAdmin`, and the page renders the decision queue
    // only when the API returns it. Visibility here is not the access control.
    // AF11.3 - reading and settling a tool request. DELIBERATELY WITHOUT its own section, so it
    // inherits the Program group's 'program' rather than the 'dashboard' the two lines above
    // carry. Those two are surfaces an intern needs; this is the approver's queue, and 'dashboard'
    // is the one section every mgmt role holds. Matches the backend PATH_SECTION row for
    // '/api/admin/agent-domain-tool-requests', and both routes behind it also carry requireAdmin.
    // AF11.10. Beside the review console on purpose: the board says what is waiting, the
    // console is where it gets decided.
    // Maya's go-live console and her outbound queue were two nav entries here on 2026-11-15 and
    // are not any more: both folded into the agent workspace, reachable through Agents -> Maya.
    // Removed rather than repointed at `/admin/agents/<id>`, because `ai_agents.id` is
    // database-generated and differs per environment, so a nav link to one would be correct in
    // production and broken everywhere else.
    // AF12.2. "All Domains" and "Builder Path" were two more rows here until 2026-11-20. Both are
    // programme-wide reads of the same ten domains, both are 'program', and from the rail there
    // was no way to tell which of the two you wanted. They now sit in the Agents hub's
    // "Across everyone" group, which renders only for a viewer who holds 'program' — so a builder
    // gets a SHORTER page rather than two more cards they cannot open.
    //
    // Their routes are unchanged and both are restated in UNLISTED_PATH_SECTIONS below. That
    // restatement is not optional bookkeeping: without it sectionForPath returns null, and
    // ProtectedRoute's `section ? canSection(section) : !isScopedRep` would admit every identity
    // that is not a plain sales rep to two owner-only pages, which would then render and 403 their
    // own data. Dropping a nav entry without the restatement is the failure this file warns about
    // twice above, and it has already happened once.
    // Reese manager-growth mission, Phase 3 (T09/T10) — fleet-wide tool/
    // capability catalog, reconciled read-only across every real authority
    // source. Sibling to "AI Organization" (agents), not nested under it.
    { path: '/admin/tools', label: 'Tools', icon: 'tools-line' },
    // AI Project Factory Command Center (Phase 3). A delivery contract is program-domain work; the
    // backend mgmtSectionGate maps /api/admin/factory to 'program', so the nav and the API agree.
    { path: '/admin/factory', label: 'Project Factory', icon: 'node-tree' },
    // The gov-contract surfaces (Gov Opportunities + the live per-contract sub-list) moved to their own
    // top-level "Gov Contracts" group on 2026-11-17. Our Services left the sidebar entirely and is now a
    // link on the Gov Opportunities page — its /admin/gov-services route stays live, classified in
    // UNLISTED_PATH_SECTIONS so ProtectedRoute still resolves its 'program' section (and the Gov Company
    // Dossier still lives under it at /admin/gov-services#dossier; /admin/gov-dossier redirects there).
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
    // Platform Operations. The link is what classifies /admin/system/operations as 'system'
    // for sectionForPath(); without an entry here it would fall through to null and
    // ProtectedRoute would admit every identity except a plain sales login.
    { path: '/admin/system/operations', label: 'Platform Operations', icon: 'pulse-line' },
    // Orchestration Health, read-only. Carries its OWN section rather than inheriting the
    // group's 'system', which is the whole point: it is reachable by the three reads split out
    // of 'program' on 2026-11-24, not by System access.
    //
    // It is a SEPARATE ROUTE rather than a deep link to the Curriculum page's Health tab
    // because the nav's model is one section per path and sectionForPath never sees a query
    // string. Pointing it at /admin/orchestration?tab=health would resolve to 'program' and
    // ProtectedRoute would bounce the very people this link exists for, before a tab rendered.
    {
      path: '/admin/orchestration-health',
      label: 'Orchestration Health',
      icon: 'heart-pulse-line',
      section: 'orchestration_health',
    },
    { path: '/admin/tickets', label: 'Tickets', icon: 'ticket-2-line' },
    { path: '/admin/reports', label: 'Automated Reports', icon: 'mail-send-line' },
    { path: '/admin/settings', label: 'Settings', icon: 'settings-3-line' },
  ]},
];
