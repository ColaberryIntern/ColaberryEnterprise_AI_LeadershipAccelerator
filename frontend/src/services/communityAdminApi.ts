import api from '../utils/api';

// Admin surface for assigning community directory roles. Uses the shared admin
// axios instance (attaches the admin_token). Backend: admin/communityMemberRoutes.
export type CommunityMemberRole = 'student' | 'mentor' | 'staff';

// Management-portal roles a staff member can hold. Empty string = no mgmt role.
//
// THIS IS THE THIRD COPY of the role list. The other two are the TypeScript union in
// `backend/src/services/access/mgmtRoles.ts` and the CHECK constraint in `backend/src/server.ts`.
// The frontend cannot import backend code, so the list is restated here — and it had already
// drifted: `mentor` was added to both backend copies and never to this one, so the role could not
// be selected in this picker even once the database would accept it. A parity test now compares
// all three and names whichever is missing (mgmtRoleConstraintParity.test.ts).
//
// This list is what the role picker renders, so a role absent here is a role nobody can assign.
export type MgmtRole = 'owner' | 'admin' | 'curriculum' | 'revenue' | 'admissions' | 'support'
  | 'community_organizer' | 'mentor'
  | 'marketing' | 'platform' | 'executive' | 'lead_intake' | 'internship_review' | 'product_experience';
export const MGMT_ROLES: MgmtRole[] = ['owner', 'admin', 'curriculum', 'revenue', 'admissions', 'support', 'community_organizer', 'mentor', 'marketing', 'platform', 'executive', 'lead_intake', 'internship_review', 'product_experience'];
export const MGMT_ROLE_LABEL: Record<MgmtRole, string> = {
  owner: 'Owner', admin: 'Admin', curriculum: 'Curriculum',
  revenue: 'Revenue', admissions: 'Admissions', support: 'Support',
  community_organizer: 'Community Organizer', mentor: 'Mentor',
  // Agent Factory domain roles (AF2.3). Each scopes one intern to one department.
  marketing: 'Marketing', platform: 'Platform', executive: 'Executive',
  lead_intake: 'Lead Intake', internship_review: 'Internship Review',
  product_experience: 'Product Experience',
};

export interface AdminCommunityMember {
  id: string;
  // Enrollment id — used to open the read-only "View as" session. Null if the
  // member somehow has no linked enrollment.
  enrollment_id: string | null;
  display_name: string;
  email: string | null;
  role: CommunityMemberRole;
  // ISO-8601 sign-up (enrollment) timestamp, or null. The roster arrives already
  // ordered newest-first by this from the backend.
  signed_up_at: string | null;
  // True when this member holds an active comped ("Free Access") seat.
  free_access: boolean;
  // Management-portal role for staff (null when none / not staff).
  mgmt_role: string | null;
  // C82: admin sections granted on top of mgmt_role, and the sections the role itself gives.
  mgmt_extra_sections: string[];
  mgmt_role_sections: string[];
  // The business account this person belongs to, or null for a regular
  // individual account. Lets the roster distinguish the two at a glance.
  org: { id: string; name: string; membership: 'manager' | 'member' } | null;
}

export async function fetchCommunityMembers(search?: string): Promise<AdminCommunityMember[]> {
  const { data } = await api.get<{ members: AdminCommunityMember[] }>(
    '/api/admin/community/members',
    search?.trim() ? { params: { search: search.trim() } } : undefined,
  );
  return data.members;
}

// Returns the updated member's role (the endpoint returns the full profile; we
// only need the role for the admin list row).
export async function setCommunityMemberRole(memberId: string, role: CommunityMemberRole): Promise<CommunityMemberRole> {
  const { data } = await api.patch<{ member: { role: CommunityMemberRole } }>(
    `/api/admin/community/members/${memberId}/role`,
    { role },
  );
  return data.member.role;
}

// Grant (grant=true) or revoke (grant=false) a comped "Free Access" seat for a
// member. Returns the resulting free_access state. Backend resolves the member
// to its enrollment and creates/cancels the comp subscription.
export async function setCommunityMemberFreeAccess(memberId: string, grant: boolean): Promise<boolean> {
  if (grant) {
    const { data } = await api.post<{ member: { free_access: boolean } }>(
      `/api/admin/community/members/${memberId}/free-access`,
    );
    return data.member.free_access;
  }
  const { data } = await api.delete<{ member: { free_access: boolean } }>(
    `/api/admin/community/members/${memberId}/free-access`,
  );
  return data.member.free_access;
}

// Assign (or clear, with mgmtRole=null) the management-portal role for a staff
// member. The backend rejects a non-null role unless the member is 'staff'.
// Returns the resulting mgmt_role. Backend: PATCH .../members/:id/mgmt-role.
export async function setCommunityMemberMgmtRole(memberId: string, mgmtRole: MgmtRole | null): Promise<string | null> {
  const { data } = await api.patch<{ member: { mgmt_role: string | null } }>(
    `/api/admin/community/members/${memberId}/mgmt-role`,
    { mgmt_role: mgmtRole },
  );
  return data.member.mgmt_role;
}

// C82: set the admin sections granted on top of a staff member's management role (the whole list). The backend keeps only real
// sections the role does not already give, and refuses sections the caller does not hold. Returns what was stored.
export async function setCommunityMemberExtraSections(memberId: string, sections: string[]): Promise<string[]> {
  const { data } = await api.patch<{ member: { mgmt_extra_sections: string[] } }>(
    `/api/admin/community/members/${memberId}/mgmt-extra-sections`,
    { sections },
  );
  return data.member.mgmt_extra_sections;
}

// Mint a read-only "View as member" URL for an enrollment (server enforces
// read-only) and return it. The caller opens it in a new tab. Reuses the
// accelerator view-as-token endpoint (admin-authenticated).
export async function fetchViewAsUrl(enrollmentId: string): Promise<string> {
  const { data } = await api.get<{ url: string }>(
    `/api/admin/accelerator/enrollments/${enrollmentId}/view-as-token`,
  );
  return data.url;
}
