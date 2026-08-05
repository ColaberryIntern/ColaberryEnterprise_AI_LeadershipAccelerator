/**
 * mgmtRoles — the single source of truth for the management-portal RBAC.
 *
 * A staff member (community role 'staff') can be given ONE management role. Each
 * role maps to the set of admin sidebar SECTIONS they may see AND reach. The
 * frontend hides nav/routes by these sections; the backend ENFORCES them per
 * router (hiding nav is not access control). Keep this list in step with the
 * frontend `adminNav.ts` section keys — the server is the authority (the admin
 * `/me` endpoint returns the caller's allowed sections from here).
 */

// Section keys — one per pinned link + one per nav group in adminNav.ts, plus
// 'students' (the Support-only read-only student-story surface, which is NOT a
// normal nav group).
export const SECTION_KEYS = [
  'dashboard', 'trust', 'war_room',        // pinned
  'revenue', 'campaigns', 'lead_ingestion', 'inbox_content',
  'program', 'intelligence', 'system',     // groups
  'students',                              // support-only surface
] as const;
export type SectionKey = typeof SECTION_KEYS[number];

export const ALL_SECTIONS: SectionKey[] = [...SECTION_KEYS];

// The management roles. 'owner' sees everything; the rest are scoped.
export const MGMT_ROLES = ['owner', 'admin', 'curriculum', 'revenue', 'admissions', 'support', 'community_organizer'] as const;
export type MgmtRole = typeof MGMT_ROLES[number];

export interface MgmtRoleDef {
  role: MgmtRole;
  label: string;
  sections: SectionKey[];   // sections this role may see AND reach
}

const ADMIN_EXCEPT_INBOX: SectionKey[] = ALL_SECTIONS.filter((s) => s !== 'inbox_content');

export const MGMT_ROLE_DEFS: Record<MgmtRole, MgmtRoleDef> = {
  owner: { role: 'owner', label: 'Owner', sections: ALL_SECTIONS },
  // Everything except Inbox & Content (per Ali).
  admin: { role: 'admin', label: 'Admin', sections: ADMIN_EXCEPT_INBOX },
  // Curriculum → the Program group (accelerator, community-roles, orchestration,
  // AI org, enterprise intelligence, projects) + a Dashboard landing.
  curriculum: { role: 'curriculum', label: 'Curriculum', sections: ['dashboard', 'program'] },
  // Revenue → the Revenue group.
  revenue: { role: 'revenue', label: 'Revenue', sections: ['dashboard', 'revenue'] },
  // Admissions → the Lead Ingestion group (placeholder scope until assigned).
  admissions: { role: 'admissions', label: 'Admissions', sections: ['dashboard', 'lead_ingestion'] },
  // Support → NO normal admin nav; only the read-only student-story surface.
  support: { role: 'support', label: 'Support', sections: ['students'] },
  // Community Organizer → no management-portal data section of its own (v1).
  // Its actual grant — delete-any post/comment in the Belong feed — is
  // enforced directly against mgmt_role in the community moderation surface
  // (see COMMUNITY_MODERATOR_ROLES below / staffAccess.isCommunityModerator),
  // not via this admin-section gate. 'dashboard' just gives a landing page.
  community_organizer: { role: 'community_organizer', label: 'Community Organizer', sections: ['dashboard'] },
};

export function isMgmtRole(role: string | undefined | null): role is MgmtRole {
  return !!role && (MGMT_ROLES as readonly string[]).includes(role);
}

/** The sections a role may access. Unknown roles get nothing (deny by default). */
export function sectionsForRole(role: string | undefined | null): SectionKey[] {
  return isMgmtRole(role) ? MGMT_ROLE_DEFS[role].sections : [];
}

/** Authoritative access check — may this role reach this section? */
export function roleCanAccessSection(role: string | undefined | null, section: SectionKey): boolean {
  return sectionsForRole(role).includes(section);
}

// Roles allowed to remove ANY member's post/comment in the community feed
// (not just their own — self-delete isn't built yet). Owner/Admin get this
// implicitly (per Ali); Community Organizer is the dedicated, narrow role for
// staff like Jackie whose job is moderating the feed, without the broader
// Program-section access Curriculum/Admin/Owner have.
export const COMMUNITY_MODERATOR_ROLES: readonly MgmtRole[] = ['owner', 'admin', 'community_organizer'];

/** Deny-by-default — may this mgmt_role delete other members' posts/comments? */
export function isCommunityModeratorRole(role: string | undefined | null): boolean {
  return isMgmtRole(role) && COMMUNITY_MODERATOR_ROLES.includes(role);
}
