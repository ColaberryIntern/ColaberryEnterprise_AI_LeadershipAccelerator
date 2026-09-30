import api from '../utils/api';

/**
 * Client for the admin business-account API (`/api/admin/organizations`).
 *
 * These endpoints are new: before them there was no admin-side view of business
 * accounts at all, because every `/api/portal/org/*` route resolves the
 * organization from the *requesting participant's own* enrollment and so cannot
 * answer "show me every company".
 *
 * Every call here requires an admin session. Callers must surface failures rather
 * than swallowing them into an empty list — the leads page shipped that bug and
 * told an operator their database was empty when the request had simply failed.
 */

export type OrganizationStatus = 'active' | 'suspended';

export interface OrgListRow {
  id: string;
  name: string;
  status: OrganizationStatus;
  auto_staff_sync: boolean;
  created_at: string | null;
  owner_email: string | null;
  owner_name: string | null;
  member_count: number;
  active_member_count: number;
  cohort_count: number;
  lead_id: number | null;
}

export interface OrgListResponse {
  organizations: OrgListRow[];
  total: number;
  page: number;
  totalPages: number;
}

export interface OrgPortfolioStats {
  total: number;
  active: number;
  suspended: number;
  with_cohorts: number;
}

export interface OrgMemberRow {
  id: string;
  email: string;
  role: string;
  team: string | null;
  invite_status: string;
  joined_at: string | null;
  /** Null when the teammate was invited but never activated an account. */
  enrollment_id: string | null;
  cohort_id: string | null;
  full_name: string | null;
  tier: string | null;
  enrollment_status: string | null;
  portal_enabled: boolean | null;
}

export interface OrgCohortRow {
  link_id: string;
  cohort_id: string;
  name: string;
  start_date: string | null;
  status: string | null;
  seats_sponsored: number | null;
  /** Roster members actually placed in this cohort. Differs from seats_sponsored. */
  members_placed: number;
}

export interface OrgDetailResponse {
  organization: {
    id: string;
    name: string;
    status: OrganizationStatus;
    auto_staff_sync: boolean;
    created_at: string | null;
    status_changed_at: string | null;
    status_changed_by: string | null;
  };
  owner: { id: string; email: string; full_name: string } | null;
  lead: {
    id: number;
    email: string;
    company: string | null;
    status: string;
    source: string | null;
  } | null;
  members: OrgMemberRow[];
  cohorts: OrgCohortRow[];
  stats: {
    member_count: number;
    active_member_count: number;
    invited_member_count: number;
    manager_count: number;
    cohort_count: number;
    members_with_cohort: number;
    members_without_cohort: number;
  };
}

export interface ListOrgParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: OrganizationStatus | '';
}

export async function listOrganizations(params: ListOrgParams = {}): Promise<OrgListResponse> {
  const query: Record<string, string> = {};
  if (params.page) query.page = String(params.page);
  if (params.limit) query.limit = String(params.limit);
  if (params.search) query.search = params.search;
  if (params.status) query.status = params.status;
  const res = await api.get('/api/admin/organizations', { params: query });
  return res.data;
}

export async function getOrganizationStats(): Promise<OrgPortfolioStats> {
  const res = await api.get('/api/admin/organizations/stats');
  return res.data.stats;
}

export async function getOrganization(id: string): Promise<OrgDetailResponse> {
  const res = await api.get(`/api/admin/organizations/${id}`);
  return res.data;
}

export async function setOrganizationStatus(
  id: string,
  status: OrganizationStatus,
): Promise<{ id: string; status: OrganizationStatus; changed: boolean }> {
  const res = await api.patch(`/api/admin/organizations/${id}/status`, { status });
  return res.data;
}

export async function addCohortToOrganization(
  id: string,
  cohortId: string,
  seatsSponsored: number | null,
): Promise<{ link_id: string; created: boolean }> {
  const res = await api.post(`/api/admin/organizations/${id}/cohorts`, {
    cohort_id: cohortId,
    seats_sponsored: seatsSponsored,
  });
  return res.data;
}

export async function removeCohortFromOrganization(
  id: string,
  cohortId: string,
): Promise<void> {
  await api.delete(`/api/admin/organizations/${id}/cohorts/${cohortId}`);
}

export interface AdminCohortOption {
  id: string;
  name: string;
  status: string | null;
  start_date: string | null;
}

/**
 * Cohorts available to link, from the existing admin cohort endpoint.
 *
 * Lives here rather than in services/cohortApi.ts because that module is the
 * PUBLIC next-cohort API (fetchNextCohort / fetchNextCohortStart) and has no
 * admin listing — reaching into it would blur a real trust boundary.
 *
 * Unlike the Accelerator page this does not filter to `status === 'open'`: a
 * company is routinely linked to a cohort that has already started or completed,
 * and hiding those would make historical relationships unrecordable.
 */
export async function listCohortsForLinking(): Promise<AdminCohortOption[]> {
  const res = await api.get('/api/admin/cohorts');
  const rows = (res.data?.cohorts ?? []) as AdminCohortOption[];
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status ?? null,
    start_date: c.start_date ?? null,
  }));
}

/**
 * Mint a READ-ONLY "view as" URL for someone's portal.
 *
 * Reuses the existing accelerator endpoint that the Accelerator and Community
 * Roles pages already use, rather than adding a second impersonation path --
 * one audited way in is the point. The token it returns is read-only and carries
 * `impersonated_by`, so the admin observes the account without being able to
 * change anything, and the action is attributable.
 *
 * Opens in a new tab by design: the participant session lives under a separate
 * `participant_token`, so viewing an account does NOT log the admin out.
 */
export async function getViewAsUrl(enrollmentId: string): Promise<string | null> {
  const res = await api.get(`/api/admin/accelerator/enrollments/${enrollmentId}/view-as-token`);
  return res.data?.url ?? null;
}

/**
 * Turns an axios failure into a sentence an operator can act on.
 *
 * Exported because both business-account pages need the same wording, and
 * because "it failed" and "there is nothing here" must never render the same.
 */
export function describeApiError(err: unknown, subject: string): string {
  const status = (err as { response?: { status?: number } })?.response?.status;

  // 401 and 403 are DIFFERENT FACTS and must not share a sentence.
  //
  // 401 means the caller is not authenticated: the session is missing or
  // expired, and signing in again is exactly the fix.
  //
  // 403 means the caller IS authenticated and still may not do this. Signing in
  // again cannot possibly help, and telling an operator to do it sends them
  // around a loop that always ends where it started. This was observed on
  // production on 2026-08-27: the Story Studio's surface lab and its PREVIEW tab
  // both answer 403 for any surface outside the default, because the backend
  // allowlist `CASE_STUDY_SURFACE_LAB_USER_IDS` is unset — a configuration
  // decision, not a session problem. Both told the admin to sign in again, and
  // no number of sign-ins would ever have changed the answer.
  if (status === 401) {
    return `Your session is no longer valid. Sign in again to reach ${subject}.`;
  }
  if (status === 403) {
    return `Your account is not permitted to access ${subject}. Signing in again will not `
      + 'change this — it is a permission or configuration setting, not an expired session.';
  }
  if (status === 404) return `${subject} not found.`;
  return `Could not load ${subject}${status ? ` (HTTP ${status})` : ''}. This is a load failure, not an empty result.`;
}
