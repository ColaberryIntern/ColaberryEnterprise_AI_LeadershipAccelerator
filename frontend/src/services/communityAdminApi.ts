import api from '../utils/api';

// Admin surface for assigning community directory roles. Uses the shared admin
// axios instance (attaches the admin_token). Backend: admin/communityMemberRoutes.
export type CommunityMemberRole = 'student' | 'mentor' | 'staff';

export interface AdminCommunityMember {
  id: string;
  display_name: string;
  email: string | null;
  role: CommunityMemberRole;
  // ISO-8601 sign-up (enrollment) timestamp, or null. The roster arrives already
  // ordered newest-first by this from the backend.
  signed_up_at: string | null;
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
