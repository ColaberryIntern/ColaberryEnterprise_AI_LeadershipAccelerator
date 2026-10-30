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
  'leads',                                 // lead-queue subset of the Revenue group
  'career_review',                         // portfolio publication review queue (admins + mentors)
  // AI Internship application review. Like 'students', this is a surface rather
  // than a normal nav group. It is its own key rather than folding into
  // 'program' because the queue carries an applicant's resume, phone number and
  // interview transcript — reviewing an internship application is a materially
  // wider grant than editing curriculum, and the two should not travel together.
  'internship',
  // Brand administration: the brands themselves, their domains, sender profiles and send
  // readiness. It WAS folded into 'campaigns', and that was the right call at the time — brand
  // admin governs the sending identity behind campaigns, so the two travelled together.
  //
  // Split out on 2026-10-16 (Ali, option 2) because the Agent Factory gave it a second, separate
  // reader: the product-experience intern checks the different websites, which is what a brand
  // IS here, and has no business in the campaign tooling that surrounds it.
  //
  // `mgmtSectionGate.brandPaths.test.ts` argued against exactly this, and its objection is
  // specific and answerable: "minting a new key would mean every scoped role that legitimately
  // reaches campaign tooling loses this surface until each role definition is edited — a
  // permissions change disguised as a routing change." Editing them in the same diff is the
  // condition it names. `owner` and `admin` pick the key up automatically because both are
  // derived from ALL_SECTIONS; `marketing` is granted it explicitly below. No role loses brands.
  'brands',
  // The Interns hub's two further tabs (mgmt-portal M0). The hub lives at /admin/internship
  // behind the 'internship' section, but these two surfaces carry their OWN keys rather than
  // folding into it — deliberately, for the same reason 'internship' is not folded into
  // 'program': the application queue holds an applicant's resume, phone and transcript, and the
  // agent build surfaces and government delivery projects are a different grant that should not
  // travel with it. `agents` is the per-agent dashboard + GitHub view; `gov_contracts` is the
  // per-project management view, proposal workspace and AI helper. owner and admin derive from
  // ALL_SECTIONS and pick both up automatically; NO scoped role is granted either here, so
  // Admissions (who holds 'internship') never reaches these tabs. The per-domain and per-project
  // grants, and the backend path->section rows for each tab's routes, land with those routes —
  // this gate is deny-by-default, so a prefix is classified the day it is mounted, not before.
  'agents',
  'gov_contracts',
] as const;
export type SectionKey = typeof SECTION_KEYS[number];

export const ALL_SECTIONS: SectionKey[] = [...SECTION_KEYS];

// The management roles. 'owner' sees everything; the rest are scoped.
// The last five are the Agent Factory domain roles (AF2.3, Ali approved 2026-10-15). Each exists
// because an intern owns exactly one department and the only roles that reached their surface were
// Admin (13 of 14 sections) and Owner. See MGMT_ROLE_DEFS below for why the admissions split needed
// two roles rather than one.
export const MGMT_ROLES = ['owner', 'admin', 'curriculum', 'revenue', 'admissions', 'support', 'community_organizer', 'mentor', 'marketing', 'platform', 'executive', 'lead_intake', 'internship_review', 'product_experience'] as const;
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
  // Revenue → the Revenue group, including its lead-queue links ('leads' is a
  // narrower slice of that same group, carved out for the sales rep role).
  revenue: { role: 'revenue', label: 'Revenue', sections: ['dashboard', 'revenue', 'leads'] },
  // Admissions → the Lead Ingestion group (placeholder scope until assigned).
  // Admissions → lead intake, plus the AI Internship application queue. Dhee
  // manages the internship end to end (AI_INTERNSHIP_SPEC.md: "the portal
  // REPLACES the email intake entirely … managed by Dhee"), and 'admissions' is
  // the narrowest existing role that fits, so she does not need 'admin' to do it.
  admissions: { role: 'admissions', label: 'Admissions', sections: ['dashboard', 'lead_ingestion', 'internship'] },
  // Support → NO normal admin nav; only the read-only student-story surface.
  support: { role: 'support', label: 'Support', sections: ['students'] },
  // Community Organizer → no management-portal data section of its own (v1).
  // Its actual grant — delete-any post/comment in the Belong feed — is
  // enforced directly against mgmt_role in the community moderation surface
  // (see COMMUNITY_MODERATOR_ROLES below / staffAccess.isCommunityModerator),
  // not via this admin-section gate. 'dashboard' just gives a landing page.
  // Mentor -> the portfolio review queue ONLY, and within it only the learners they
  // are actually over. The section grant here is the coarse gate (may they open the
  // surface at all); WHICH learners they see is a second, per-mentor scope enforced
  // in careerMentorScopeService. A section key alone would let any mentor review
  // every learner on the platform, which is not what was asked for.
  mentor: { role: 'mentor', label: 'Mentor', sections: ['dashboard', 'career_review'] },
  community_organizer: { role: 'community_organizer', label: 'Community Organizer', sections: ['dashboard'] },

  // ---------------------------------------------------------------------------------------------
  // Agent Factory domain roles (AF2.3). Ali approved option A on 2026-10-15.
  //
  // Each intern owns exactly ONE department and must be able to READ AND UPDATE it, because that
  // is link 2 of the capability-transfer chain: they prove the surface by hand, then hand the
  // capability to their agent. Before these, the narrowest role that reached `campaigns`,
  // `system` or `war_room` was `admin` — 13 of the 14 sections — so scoping an intern to their own
  // department was not expressible at all, and the quick path was to call Admin "scoped".
  //
  // Every role below is a STRICT SUBSET of `admin`. None widens an existing definition; the seven
  // roles above are untouched, which is AF2.3's fourth acceptance criterion.
  //
  // `dashboard` rides along with each so the holder has a landing page rather than a 403 on sign-in
  // — the same reason `curriculum` and `revenue` carry it.

  // Marketing → the Campaigns group: brands, content, campaigns, communications, landing pages,
  // publishing, visitors, explorer growth, growth journey, tracking estate. Eleven route prefixes,
  // the widest single-section grant of the five, and the surface demonstrated on the 14 Oct call.
  // `brands` is listed explicitly, and that is the whole reason splitting the key was safe.
  // Before the split, brand admin arrived free with `campaigns`; the moment it became its own
  // key, every role holding campaigns would have silently lost it. Sarbjit keeps brands.
  marketing: {
    role: 'marketing',
    label: 'Marketing',
    sections: ['dashboard', 'campaigns', 'brands'],
  },

  // Platform → the System group: tickets, reports, settings, events, work-ledger health,
  // automation. This is the widest-CONSEQUENCE section on the platform even though it is not the
  // widest by route count, because `/api/admin/settings` is in it.
  platform: { role: 'platform', label: 'Platform', sections: ['dashboard', 'system'] },

  // Executive → the three pinned executive surfaces. `executive-narrative` maps to `dashboard`,
  // which this role already holds, so the three keys here cover the whole domain.
  executive: { role: 'executive', label: 'Executive', sections: ['dashboard', 'trust', 'war_room'] },

  // ---- the admissions split, which needed TWO roles and not one ----
  //
  // `admissions` grants `lead_ingestion` AND `internship` together, so it cannot separate the two
  // interns who own those domains: give it to either and they also get the other's department. The
  // obvious fix — narrowing `admissions` — is the wrong one. Dhee holds that role and runs the
  // internship end to end (AI_INTERNSHIP_SPEC.md), so narrowing it would quietly take a working
  // surface away from someone who is not part of this change.
  //
  // So `admissions` is left exactly as it is, and the two narrow halves are added beside it.
  // Separating them matters more than the usual tidiness argument: the internship queue carries an
  // applicant's resume, phone number and interview transcript, which the comment on that section
  // key already calls "a materially wider grant than editing curriculum".
  lead_intake: { role: 'lead_intake', label: 'Lead Intake', sections: ['dashboard', 'lead_ingestion'] },
  internship_review: {
    role: 'internship_review',
    label: 'Internship Review',
    sections: ['dashboard', 'internship'],
  },

  // Product Experience (Mihret). Ali, 16 Oct: "Mihret should get access to the brands page
  // because the checks she will be doing will be based on the different websites."
  //
  // Brands and NOTHING else. The alternative on the table was handing her the `marketing` role,
  // which would have given her campaigns, communications, visitors, publishing, landing pages,
  // content and growth journey as well — another intern's entire domain, dressed up as scoping.
  // That is the exact trap AF2.3 was written to close, so the section was split instead.
  product_experience: {
    role: 'product_experience',
    label: 'Product Experience',
    sections: ['dashboard', 'brands'],
  },
};

export function isMgmtRole(role: string | undefined | null): role is MgmtRole {
  return !!role && (MGMT_ROLES as readonly string[]).includes(role);
}

/** The sections a role may access. Unknown roles get nothing (deny by default). */
export function sectionsForRole(role: string | undefined | null): SectionKey[] {
  return isMgmtRole(role) ? MGMT_ROLE_DEFS[role].sections : [];
}

/** True for a real admin section key. */
export function isSectionKey(s: unknown): s is SectionKey {
  return typeof s === 'string' && (SECTION_KEYS as readonly string[]).includes(s);
}

/**
 * C82 (Campus HQ H4, option A, Ali's pick): a person may hold EXTRA sections on top of their one management role (Sarbjit:
 * Marketing plus AI Internship). Their EFFECTIVE sections are the role's sections plus the extras, deduplicated and limited to
 * real section keys. This is the ONE function every reader uses (the admin token's sections, mgmtSectionGate, the sidebar via
 * /api/admin/me, /api/portal/mgmt/status and the campus building). An invalid or missing role gets nothing, extras or not
 * (deny by default), so extras can never turn a non-staff account into a management login.
 */
export function effectiveSections(role: string | undefined | null, extras: readonly unknown[] | null | undefined): SectionKey[] {
  if (!isMgmtRole(role)) return [];
  const out = [...MGMT_ROLE_DEFS[role].sections];
  for (const x of extras ?? []) if (isSectionKey(x) && !out.includes(x)) out.push(x);
  return out;
}

/** The extras worth storing: real section keys, deduplicated, without the ones the role already gives. */
export function normalizeExtraSections(role: string | undefined | null, extras: readonly unknown[] | null | undefined): SectionKey[] {
  const base = sectionsForRole(role);
  const out: SectionKey[] = [];
  for (const x of extras ?? []) if (isSectionKey(x) && !base.includes(x) && !out.includes(x)) out.push(x);
  return out;
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
