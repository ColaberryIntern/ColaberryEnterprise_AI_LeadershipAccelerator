/**
 * caseStudyAdminTypes — the wire contracts of `/api/admin/case-studies`, mirrored
 * for the admin review desk.
 *
 * WHY MIRRORED RATHER THAN IMPORTED. The frontend has no path to `backend/src`
 * (separate tsconfig, separate build), so every service client in this folder
 * restates the shapes it consumes. The authority is
 * `backend/src/services/caseStudy/caseStudyAdminStore.ts`,
 * `caseStudyAdminReview.ts`, `caseStudyPublishRules.ts` and
 * `backend/src/types/caseStudyPublic.ts`; these declarations track those files
 * and nothing here may add a field the backend does not send.
 *
 * WHAT IS DELIBERATELY ABSENT. No enrollment id, no student email, no card id.
 * The admin API does not return them (see the store's header) and this file
 * gives them no shape to occupy, so no panel can render one by accident.
 *
 * READINESS IS ADVISORY. `CaseStudyReadinessReport` carries no boolean and no
 * field a caller may read as permission. The publish gate
 * (`CaseStudyPublishDecision`) is the sole authority on whether a record may go
 * live, and it is the only shape in this file that says `allowed`.
 */

/* ─────────────────────────────────────────────────────────── vocabulary ──── */

export type CaseStudyStatus = 'draft' | 'review' | 'approved' | 'published' | 'archived';
export type CaseStudyVisibility = 'public' | 'anonymized' | 'private';
export type CaseStudyOrganizationIdentityMode = 'named' | 'anonymized' | 'hidden';
export type CaseStudyBuilderIdentityMode = 'named' | 'role_only' | 'anonymous';
export type CaseStudySnapshotStatus = 'draft' | 'approved' | 'superseded';
export type CaseStudySurfaceKey = 'enterprise' | 'training' | 'ai-flotation' | 'refactored';
export type CaseStudySyncTrigger = 'manual' | 'webhook' | 'reconciliation' | 'project_update';

/** Spec section 10.2's role vocabulary, mirroring `CASE_STUDY_REPO_ROLES`. */
export const CASE_STUDY_REPO_ROLES = [
  'primary', 'frontend', 'backend', 'agents', 'data', 'infra', 'docs', 'evals', 'demo', 'other',
] as const;
export type CaseStudyRepoRole = (typeof CASE_STUDY_REPO_ROLES)[number];

export type CaseStudyRepoVisibility = 'public' | 'private' | 'unknown';
export type CaseStudyRepoAccessStatus =
  | 'connected' | 'read_only' | 'unavailable' | 'deleted' | 'rate_limited' | 'unknown';

/** The one surface publishable in Phase 1; every other key is refused by the gate. */
export const CASE_STUDY_DEFAULT_SURFACE: CaseStudySurfaceKey = 'enterprise';

/* ───────────────────────────────────────────────────────────── records ──── */

export interface CaseStudySummary {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: CaseStudyStatus;
  readonly sourceType: string;
  readonly projectId: string | null;
  readonly canonicalSummary: string | null;
  readonly industry: string | null;
  readonly primaryCapability: string | null;
  readonly programKey: string | null;
  readonly builtByType: string | null;
  readonly visibility: CaseStudyVisibility;
  readonly organizationDisplayName: string | null;
  readonly organizationIsAnonymized: boolean;
  readonly organizationIdentityMode: CaseStudyOrganizationIdentityMode;
  readonly organizationNamingConsent: boolean;
  readonly builderIdentityMode: CaseStudyBuilderIdentityMode;
  readonly builderNamingConsent: boolean;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly archivedAt: string | null;
}

/**
 * A repository as the admin surface sees it. Carries owner and name because an
 * admin attaching a source must see what they attached; NOTHING in this shape
 * may be rendered on a public surface, which is why `PublicCaseStudyProjection`
 * below has a different, narrower repository type.
 */
export interface CaseStudyRepositoryRecord {
  readonly id: string;
  readonly collectionId: string;
  readonly repoOwner: string;
  readonly repoName: string;
  readonly repoUrl: string;
  readonly role: CaseStudyRepoRole;
  readonly visibility: CaseStudyRepoVisibility;
  readonly accessStatus: CaseStudyRepoAccessStatus;
  readonly allowPublicRepoLink: boolean;
  readonly defaultBranch?: string;
  readonly lastSeenSha?: string;
  readonly lastSyncedAt?: string;
}

export interface CaseStudySnapshotSummary {
  readonly id: string;
  readonly version: number;
  readonly status: CaseStudySnapshotStatus;
  readonly contentHash: string;
  readonly generatedAt: string | null;
  readonly generatedBy: string;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly content: Record<string, unknown>;
  readonly provenance: Record<string, unknown>;
  readonly sourceCommitMap: Record<string, unknown>;
}

export interface CaseStudyPublicationSummary {
  readonly id: string;
  readonly surfaceKey: string;
  readonly status: string;
  readonly publishedSnapshotId: string | null;
  readonly publishedAt: string | null;
  readonly unpublishedAt: string | null;
}

/* ──────────────────────────────────────────────────── readiness (advisory) ── */

export type CaseStudyReadinessCategory =
  | 'identity' | 'technical' | 'story' | 'artifacts'
  | 'evidence' | 'outcome' | 'consent' | 'publication';

export interface CaseStudyReadinessGap {
  readonly category: CaseStudyReadinessCategory;
  readonly categoryLabel: string;
  readonly checkKey: string;
  readonly pointsLost: number;
  readonly pointsPossible: number;
  readonly detail: string;
  readonly remedy: string;
}

export interface CaseStudyReadinessCategoryScore {
  readonly category: CaseStudyReadinessCategory;
  readonly label: string;
  readonly weight: number;
  readonly awarded: number;
  readonly summary: string;
  readonly gaps: readonly CaseStudyReadinessGap[];
}

/** Descriptive only. `band` is not permission and `score` is not a threshold. */
export interface CaseStudyReadinessReport {
  readonly score: number;
  readonly maxScore: number;
  readonly band: 'thin' | 'developing' | 'substantial';
  readonly categories: readonly CaseStudyReadinessCategoryScore[];
  readonly gaps: readonly CaseStudyReadinessGap[];
  readonly advisory: string;
}

/* ────────────────────────────────────────────────── the publish gate ─────── */

export type CaseStudyPublishBlockerCode =
  | 'surface_not_publishable' | 'case_study_not_approved' | 'snapshot_not_approved'
  | 'metric_pending' | 'organization_consent' | 'builder_consent' | 'private_repo_exposed'
  | 'proof_metadata_missing' | 'self_attested_verification' | 'ai_generated_quote'
  | 'unverified_claim';

/**
 * One named reason a publish was refused. Every field is rendered verbatim: an
 * admin told "cannot publish" cannot act, an admin told which metric is pending
 * and what would close it can.
 */
export interface CaseStudyPublishBlocker {
  readonly code: CaseStudyPublishBlockerCode;
  readonly field: string;
  readonly message: string;
  readonly remedy: string;
}

export interface CaseStudyPublishDecision {
  readonly allowed: boolean;
  readonly blockers: readonly CaseStudyPublishBlocker[];
  readonly codes: readonly CaseStudyPublishBlockerCode[];
  readonly summary: string;
}

/* ───────────────────────────────────────────── responses, one per route ──── */

export interface CaseStudyListPage {
  readonly items: readonly CaseStudySummary[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface CaseStudyDetail {
  readonly caseStudy: CaseStudySummary;
  readonly repositories: readonly CaseStudyRepositoryRecord[];
  readonly latestSnapshot: CaseStudySnapshotSummary | null;
  readonly approvedSnapshot: CaseStudySnapshotSummary | null;
  readonly publications: readonly CaseStudyPublicationSummary[];
  readonly readiness: CaseStudyReadinessReport | null;
}

export interface CaseStudyCreateResult {
  readonly caseStudy: CaseStudySummary;
  readonly repositories: readonly CaseStudyRepositoryRecord[];
  readonly warnings: readonly string[];
}

export interface AttachRepositoryResult {
  readonly repository: CaseStudyRepositoryRecord;
  readonly collectionId: string;
  readonly created: boolean;
}

export interface CaseStudySyncCounts {
  readonly reposAttempted: number;
  readonly reposSucceeded: number;
  readonly reposFailed: number;
  readonly factsExtracted: number;
  readonly candidateMetrics: number;
}

export interface CaseStudySyncRepoError {
  readonly repositoryId: string | null;
  readonly repoRef: string;
  readonly errorClass: string;
  readonly message: string;
}

export interface CaseStudySyncResult {
  readonly syncRunId: string;
  readonly caseStudyId: string;
  readonly status: 'success' | 'partial' | 'unchanged' | 'failed';
  readonly trigger: CaseStudySyncTrigger;
  readonly counts: CaseStudySyncCounts;
  readonly snapshotId: string | null;
  readonly snapshotVersion: number | null;
  readonly snapshotOutcome: 'created' | 'unchanged' | 'skipped';
  readonly contentHash: string | null;
  readonly repoErrors: readonly CaseStudySyncRepoError[];
  readonly repoIssues: readonly { readonly repoRef: string; readonly errorClass: string }[];
  readonly errorClass: string | null;
  readonly errorSummary: string | null;
  readonly unknownProvenanceFields: readonly string[];
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface CaseStudySyncRunSummary {
  readonly id: string;
  readonly trigger: string;
  readonly status: string;
  readonly reposAttempted: number;
  readonly reposSucceeded: number;
  readonly reposFailed: number;
  readonly factsExtracted: number;
  readonly candidateMetrics: number;
  readonly snapshotId: string | null;
  readonly errorClass: string | null;
  readonly errorSummary: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}

export interface CaseStudySyncRunPage {
  readonly items: readonly CaseStudySyncRunSummary[];
  readonly limit: number;
  readonly offset: number;
}

export interface ApplyOverrideResult {
  readonly outcome: 'unchanged' | 'created';
  readonly snapshotId: string;
  readonly version: number;
  readonly contentHash: string;
  readonly path: string;
}

export interface ApproveSnapshotResult {
  readonly outcome: 'unchanged' | 'approved';
  readonly snapshot: CaseStudySnapshotSummary;
  readonly supersededSnapshotIds: readonly string[];
  readonly caseStudyStatus: CaseStudyStatus;
}

export interface PublishCaseStudyResult {
  readonly outcome: 'unchanged' | 'published';
  readonly publicationId: string;
  readonly caseStudyId: string;
  readonly surfaceKey: CaseStudySurfaceKey;
  readonly publishedSnapshotId: string;
  readonly snapshotVersion: number;
  readonly publishedAt: string | null;
}

export interface UnpublishCaseStudyResult {
  readonly outcome: 'unchanged' | 'unpublished';
  readonly publicationId: string | null;
  readonly publishedSnapshotId: string | null;
  readonly unpublishedAt: string | null;
}

/**
 * What a visitor would actually see, already sanitised by
 * `caseStudyPublicProjection`. The admin desk renders the fields below beside
 * the raw snapshot so the difference between the two is visible; the complete
 * payload is also shown verbatim, which is why the index signature is here
 * rather than a partial restatement of the whole public contract (that contract
 * belongs to the public module, not to this admin client).
 */
export interface PublicCaseStudyProjection {
  readonly slug: string;
  readonly title: string;
  readonly standfirst: string | null;
  readonly organizationLabel: string | null;
  readonly industry: string | null;
  readonly primaryCapability: string | null;
  readonly capabilities: readonly string[];
  readonly stack: readonly string[];
  readonly verificationClass: 'verified' | 'anonymized' | 'illustrative';
  readonly heroMetrics: readonly { readonly label: string; readonly valueDisplay: string }[];
  readonly contributors: readonly { readonly role: string; readonly displayMode: string }[];
  readonly artifacts: readonly { readonly title: string; readonly access: string }[];
  readonly repositories: readonly { readonly label: string; readonly url: string }[];
  readonly privateRepositoryCount: number;
  readonly anonymousContributorCount: number;
  readonly [key: string]: unknown;
}

export interface CaseStudySurfacePreview {
  readonly surfaceKey: CaseStudySurfaceKey;
  readonly snapshot: CaseStudySnapshotSummary | null;
  readonly source: 'approved_snapshot' | 'latest_draft' | 'none';
  /** The REAL gate decision, not a second opinion. Blockers are verbatim. */
  readonly decision: CaseStudyPublishDecision;
  /** ADVISORY, reported beside the decision and never consulted by it. */
  readonly readiness: CaseStudyReadinessReport | null;
  readonly projection: PublicCaseStudyProjection | null;
}
