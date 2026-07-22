import api from '../utils/api';

// Admin surface for assigning community directory roles. Uses the shared admin
// axios instance (attaches the admin_token). Backend: admin/communityMemberRoutes.
export type CommunityMemberRole = 'student' | 'mentor' | 'staff';

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

// Mint a read-only "View as member" URL for an enrollment (server enforces
// read-only) and return it. The caller opens it in a new tab. Reuses the
// accelerator view-as-token endpoint (admin-authenticated).
export async function fetchViewAsUrl(enrollmentId: string): Promise<string> {
  const { data } = await api.get<{ url: string }>(
    `/api/admin/accelerator/enrollments/${enrollmentId}/view-as-token`,
  );
  return data.url;
}
