import api from '../utils/api';
import type {
  ApplyOverrideResult, ApproveSnapshotResult, AttachRepositoryResult, CaseStudyCreateResult,
  CaseStudyDetail, CaseStudyListPage, CaseStudyPublishBlocker, CaseStudyRepoRole,
  CaseStudyRepositoryRecord, CaseStudyStatus, CaseStudySurfaceKey, CaseStudySurfacePreview,
  CaseStudySyncResult, CaseStudySyncRunPage, CaseStudySyncTrigger, CaseStudySummary,
  PublishCaseStudyResult, UnpublishCaseStudyResult,
} from './caseStudyAdminTypes';

/**
 * caseStudyAdminApi — the typed client for `/api/admin/case-studies` (spec §20).
 *
 * Every call goes through `utils/api` (axios), which injects `admin_token` and
 * bounces a 401 to `/admin/login`. There is no second axios instance and no
 * bare `fetch` here, so there is exactly one place a session is attached.
 *
 * FAILURES ARE RE-THROWN, NEVER SWALLOWED. No function returns an empty list on
 * error. The admin leads page shipped the collapsed version of that and told an
 * operator their database was empty when the request had simply failed; both
 * Case Study pages therefore distinguish a load failure from an empty result,
 * and can only do so because this file refuses to hide one as the other.
 *
 * PUBLISH REFUSALS ARE STRUCTURED. A blocked publish is an axios 400 whose body
 * carries `blockers` verbatim (`code`, `field`, `message`, `remedy`).
 * `publishBlockersFrom()` lifts them out so the UI can render EVERY one; a
 * generic "cannot publish" would throw away the entire point of the gate.
 */

const BASE = '/api/admin/case-studies';

/* ─────────────────────────────────────────────────────────────── reading ──── */

export interface CaseStudyListQuery {
  status?: CaseStudyStatus;
  search?: string;
  industry?: string;
  projectId?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Query strings are text on the wire and the backend refuses `z.coerce.boolean`
 * for exactly one reason: it reads "false" as true. `includeArchived` is
 * therefore serialised as the literal 'true' / 'false' the route's enum expects.
 */
function listParams(query: CaseStudyListQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (query.status) params.status = query.status;
  if (query.search) params.search = query.search;
  if (query.industry) params.industry = query.industry;
  if (query.projectId) params.projectId = query.projectId;
  if (query.includeArchived !== undefined) {
    params.includeArchived = query.includeArchived ? 'true' : 'false';
  }
  if (query.limit !== undefined) params.limit = query.limit;
  if (query.offset !== undefined) params.offset = query.offset;
  return params;
}

export async function listCaseStudies(query: CaseStudyListQuery = {}): Promise<CaseStudyListPage> {
  const { data } = await api.get<CaseStudyListPage>(BASE, { params: listParams(query) });
  return data;
}

export async function getCaseStudy(caseStudyId: string): Promise<CaseStudyDetail> {
  const { data } = await api.get<CaseStudyDetail>(`${BASE}/${caseStudyId}`);
  return data;
}

export async function listCaseStudyRepositories(
  caseStudyId: string,
): Promise<readonly CaseStudyRepositoryRecord[]> {
  const { data } = await api.get<{ repositories: readonly CaseStudyRepositoryRecord[] }>(
    `${BASE}/${caseStudyId}/repositories`,
  );
  return data.repositories;
}

export async function listCaseStudySyncRuns(
  caseStudyId: string, query: { limit?: number; offset?: number } = {},
): Promise<CaseStudySyncRunPage> {
  const { data } = await api.get<CaseStudySyncRunPage>(`${BASE}/${caseStudyId}/sync-runs`, {
    params: query,
  });
  return data;
}

/**
 * Preview one surface. Writes nothing, and returns BOTH the snapshot and the
 * `projection` a visitor would actually see, plus the real gate decision.
 * Passing `snapshotId` previews that exact version, which is how the desk shows
 * the published version beside the current draft.
 */
export async function previewCaseStudy(
  caseStudyId: string,
  query: { surfaceKey?: CaseStudySurfaceKey; snapshotId?: string } = {},
): Promise<CaseStudySurfacePreview> {
  const { data } = await api.get<CaseStudySurfacePreview>(`${BASE}/${caseStudyId}/preview`, {
    params: query,
  });
  return data;
}

/* ────────────────────────────────────────────────────────────── creating ──── */

export async function createCaseStudyFromProject(
  body: { projectId: string; title?: string; slug?: string },
): Promise<CaseStudyCreateResult> {
  const { data } = await api.post<CaseStudyCreateResult>(`${BASE}/from-project`, body);
  return data;
}

export async function createCaseStudyFromRepositories(
  body: { title: string; slug?: string; repositories: string[] },
): Promise<CaseStudyCreateResult> {
  const { data } = await api.post<CaseStudyCreateResult>(`${BASE}/from-repositories`, body);
  return data;
}

/* ────────────────────────────────────────────────────────────── editing ──── */

/** The human-owned editorial and consent columns (spec §34). */
export interface CaseStudyUpdatePatch {
  title?: string;
  slug?: string;
  status?: 'draft' | 'review' | 'approved' | 'archived';
  canonicalSummary?: string | null;
  industry?: string | null;
  primaryCapability?: string | null;
  programKey?: string | null;
  builtByType?: string | null;
  visibility?: 'public' | 'anonymized' | 'private';
  organizationDisplayName?: string | null;
  organizationIsAnonymized?: boolean;
  organizationIdentityMode?: 'named' | 'anonymized' | 'hidden';
  organizationNamingConsent?: boolean;
  builderIdentityMode?: 'named' | 'role_only' | 'anonymous';
  builderNamingConsent?: boolean;
}

export async function updateCaseStudy(
  caseStudyId: string, patch: CaseStudyUpdatePatch,
): Promise<CaseStudySummary> {
  const { data } = await api.patch<CaseStudySummary>(`${BASE}/${caseStudyId}`, patch);
  return data;
}

/**
 * One human override, applied as a NEW snapshot version carrying
 * `human_override` provenance. A later sync updates the generated value
 * underneath but never silently overwrites the approved human copy (spec §34).
 */
export async function applyCaseStudyOverride(
  caseStudyId: string, body: { path: string; value: unknown; note?: string },
): Promise<ApplyOverrideResult> {
  const { data } = await api.post<ApplyOverrideResult>(`${BASE}/${caseStudyId}/overrides`, body);
  return data;
}

/* ────────────────────────────────────────────────────────── repositories ──── */

export async function attachCaseStudyRepository(
  caseStudyId: string,
  body: { reference: string; role?: CaseStudyRepoRole; allowPublicRepoLink?: boolean },
): Promise<AttachRepositoryResult> {
  const { data } = await api.post<AttachRepositoryResult>(
    `${BASE}/${caseStudyId}/repositories`, body,
  );
  return data;
}

export async function setCaseStudyRepositoryRole(
  caseStudyId: string, repositoryId: string, role: CaseStudyRepoRole,
): Promise<CaseStudyRepositoryRecord> {
  const { data } = await api.patch<CaseStudyRepositoryRecord>(
    `${BASE}/${caseStudyId}/repositories/${repositoryId}`, { role },
  );
  return data;
}

/** Idempotent: removing a repository already gone answers `removed: false`. */
export async function removeCaseStudyRepository(
  caseStudyId: string, repositoryId: string,
): Promise<{ removed: boolean }> {
  const { data } = await api.delete<{ removed: boolean }>(
    `${BASE}/${caseStudyId}/repositories/${repositoryId}`,
  );
  return data;
}

/* ─────────────────────────────────────────────────────────── the lifecycle ── */

export async function syncCaseStudy(
  caseStudyId: string, body: { trigger?: CaseStudySyncTrigger } = {},
): Promise<CaseStudySyncResult> {
  const { data } = await api.post<CaseStudySyncResult>(`${BASE}/${caseStudyId}/sync`, body);
  return data;
}

export async function approveCaseStudySnapshot(
  caseStudyId: string, snapshotId: string,
): Promise<ApproveSnapshotResult> {
  const { data } = await api.post<ApproveSnapshotResult>(
    `${BASE}/${caseStudyId}/snapshots/${snapshotId}/approve`, {},
  );
  return data;
}

/**
 * Publish. The gate runs server-side on EVERY call, including a repeat publish
 * of something already live; a refusal arrives as a 400 whose `blockers` the
 * caller must render in full (see `publishBlockersFrom`).
 */
export async function publishCaseStudy(
  caseStudyId: string, body: { surfaceKey?: CaseStudySurfaceKey; snapshotId?: string } = {},
): Promise<PublishCaseStudyResult> {
  const { data } = await api.post<PublishCaseStudyResult>(`${BASE}/${caseStudyId}/publish`, body);
  return data;
}

/** Removes public visibility. Deletes nothing: snapshots and history survive. */
export async function unpublishCaseStudy(
  caseStudyId: string, body: { surfaceKey?: CaseStudySurfaceKey } = {},
): Promise<UnpublishCaseStudyResult> {
  const { data } = await api.post<UnpublishCaseStudyResult>(
    `${BASE}/${caseStudyId}/unpublish`, body,
  );
  return data;
}

/** Soft-archive (spec §35). Refused with 409 while the record is still live. */
export async function archiveCaseStudy(caseStudyId: string): Promise<CaseStudySummary> {
  const { data } = await api.post<CaseStudySummary>(`${BASE}/${caseStudyId}/archive`, {});
  return data;
}

/* ────────────────────────────────────────────────────────── error reading ──── */

function isBlocker(value: unknown): value is CaseStudyPublishBlocker {
  const b = value as Partial<CaseStudyPublishBlocker> | null;
  return !!b && typeof b.code === 'string' && typeof b.field === 'string'
    && typeof b.message === 'string' && typeof b.remedy === 'string';
}

/**
 * Every named blocker on a refused publish, or an empty list when the failure
 * was something else (a 500, a network drop). Callers render EVERY entry —
 * showing only the first is the same information loss as showing none.
 */
export function publishBlockersFrom(err: unknown): CaseStudyPublishBlocker[] {
  const body = (err as { response?: { data?: { blockers?: unknown } } })?.response?.data;
  const raw = body?.blockers;
  return Array.isArray(raw) ? raw.filter(isBlocker) : [];
}

/**
 * The house wording for a failed request, shared with the business-account
 * pages so "it failed" and "there is nothing here" never render the same
 * sentence anywhere in the admin.
 */
export { describeApiError } from './adminOrgApi';

/**
 * TYPES ONLY. The wire shapes are re-exported so a page can import them beside
 * the calls; the runtime constants in that module (`CASE_STUDY_REPO_ROLES`) are
 * deliberately NOT re-exported here, because `jest.mock()` of this module
 * replaces its runtime exports and a component reading a vocabulary through a
 * mocked module would silently see nothing.
 */
export type * from './caseStudyAdminTypes';
