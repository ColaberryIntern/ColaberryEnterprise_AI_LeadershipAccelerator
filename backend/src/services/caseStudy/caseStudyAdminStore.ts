/**
 * caseStudyAdminStore — the contracts, the row mapping and the shared error and
 * log plumbing for the admin Case Study surface.
 *
 * WHY IT IS ITS OWN FILE. `caseStudyAdminService` (the record lifecycle) and
 * `caseStudyAdminReview` (the snapshot review desk) both need the same error
 * type, the same `case_studies` → API projection and the same structured
 * logger. Declaring them in one of the two and importing from the other would
 * make the dependency run both ways, which CLAUDE.md forbids: "A imports B
 * imports A is a code smell that signals a missing third module C that both
 * depend on." This is C. It is also what keeps both callers under the file-size
 * ceiling, the same reason `caseStudyPublicationStore` sits beneath
 * `caseStudyPublicationService`.
 *
 * WHAT NEVER LEAVES HERE. `projects.enrollment_id`, card ids and student emails
 * are not fields of any contract below, and `AdminLogContext` is a FIXED shape
 * with no spread — so there is no path by which a caller's object could carry
 * one onto stdout. Repository identities are logged only through
 * `repoLogIdentity` at the call sites that have them, which fails closed on
 * `unknown` visibility.
 */
import { z } from 'zod';
import CaseStudy from '../../models/CaseStudy';
import CaseStudySnapshot from '../../models/CaseStudySnapshot';
import type { CaseStudyRepositoryRecord } from './caseStudyRepoCollection';
import type { CaseStudyReadinessReport } from './caseStudyReadinessService';
import type {
  CaseStudyBuilderIdentityMode,
  CaseStudyOrganizationIdentityMode,
  CaseStudySnapshotStatus,
  CaseStudyStatus,
  CaseStudyVisibility,
} from '../../types/caseStudy';

/* ─────────────────────────────────────────────────────────────── errors ──── */

export type CaseStudyAdminErrorClass =
  | 'ValidationError'
  | 'CaseStudyNotFound'
  /** Raised by `caseStudyAdminReview` — declared here so one error type covers both. */
  | 'SnapshotNotFound'
  | 'SlugConflict'
  /** Archive refused: the record is still live on a public surface. */
  | 'CaseStudyPublished';

const HTTP_STATUS: Record<CaseStudyAdminErrorClass, number> = {
  ValidationError: 400,
  CaseStudyNotFound: 404,
  SnapshotNotFound: 404,
  SlugConflict: 409,
  CaseStudyPublished: 409,
};

/** Tagged, in the shape `caseStudyPublicationStore.ts` established. */
export class CaseStudyAdminError extends Error {
  public readonly error_class: CaseStudyAdminErrorClass;
  public readonly http_status: number;
  public readonly details: Record<string, unknown>;

  constructor(
    error_class: CaseStudyAdminErrorClass,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'CaseStudyAdminError';
    this.error_class = error_class;
    this.http_status = HTTP_STATUS[error_class];
    this.details = Object.freeze({ ...details });
  }
}

export function isCaseStudyAdminError(err: unknown): err is CaseStudyAdminError {
  return err instanceof CaseStudyAdminError;
}

/* ──────────────────────────────────────────────────────────── contracts ──── */

/** One `case_studies` row as the admin surface sees it. No enrollment id, ever. */
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

export interface CaseStudyDetail {
  readonly caseStudy: CaseStudySummary;
  readonly repositories: readonly CaseStudyRepositoryRecord[];
  readonly latestSnapshot: CaseStudySnapshotSummary | null;
  readonly approvedSnapshot: CaseStudySnapshotSummary | null;
  readonly publications: readonly CaseStudyPublicationSummary[];
  /**
   * ADVISORY ONLY. `caseStudyReadinessService` says so in its own header and
   * this field repeats it: nothing reads this to decide whether to publish.
   */
  readonly readiness: CaseStudyReadinessReport | null;
}

export interface CaseStudyListPage {
  readonly items: readonly CaseStudySummary[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/** A create that got the row but not everything after it. Never silent. */
export interface CaseStudyCreateResult {
  readonly caseStudy: CaseStudySummary;
  readonly repositories: readonly CaseStudyRepositoryRecord[];
  readonly warnings: readonly string[];
}

/* ─────────────────────────────────────────────────────────────── logging ──── */

/**
 * FIXED shape, per `services/artifacts/artifactRepoSync.ts:92-102`. There is no
 * spread of an arbitrary object, so no title, actor, email or repository
 * identity can reach stdout by accident.
 */
export interface AdminLogContext {
  case_study_id?: string;
  project_id?: string;
  repo_count?: number;
  repo_ref?: string;
  owner?: string;
  repo?: string;
  status?: string;
  changed_fields?: readonly string[];
  total?: number;
  error_class?: string;
}

export function log(
  event: string, outcome: string, correlationId: string, ctx: AdminLogContext,
): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'case-study-admin',
    event,
    correlation_id: correlationId,
    outcome,
    context: ctx,
  }));
}

/* ───────────────────────────────────────────────────────────── internals ──── */

/** Zod v4: `error.issues`. `.errors` was removed in v4 and reads as undefined. */
export function validate<S extends z.ZodType>(
  schema: S, input: unknown, what: string,
): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const detail = parsed.error.issues
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  throw new CaseStudyAdminError('ValidationError', `Malformed ${what}: ${detail}`, {
    issue_count: parsed.error.issues.length,
  });
}

const iso = (v: Date | string | null | undefined): string | null =>
  (v ? new Date(v).toISOString() : null);

const obj = (v: unknown): Record<string, unknown> =>
  (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

/**
 * `title` ⇒ `title-like-this`. Not unique by construction — the unique index on
 * `case_studies.slug` is what decides, and a collision becomes `SlugConflict`
 * rather than a silently suffixed slug the admin never asked for.
 */
export function slugifyCaseStudyTitle(title: string): string {
  const base = title.toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160)
    .replace(/-+$/g, '');
  return base.length > 0 ? base : 'case-study';
}

export function toSummary(row: CaseStudy): CaseStudySummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status as CaseStudyStatus,
    sourceType: row.source_type,
    projectId: row.project_id ?? null,
    canonicalSummary: row.canonical_summary ?? null,
    industry: row.industry ?? null,
    primaryCapability: row.primary_capability ?? null,
    programKey: row.program_key ?? null,
    builtByType: row.built_by_type ?? null,
    visibility: row.visibility as CaseStudyVisibility,
    organizationDisplayName: row.organization_display_name ?? null,
    organizationIsAnonymized: row.organization_is_anonymized === true,
    organizationIdentityMode: row.organization_identity_mode as CaseStudyOrganizationIdentityMode,
    organizationNamingConsent: row.organization_naming_consent === true,
    builderIdentityMode: row.builder_identity_mode as CaseStudyBuilderIdentityMode,
    builderNamingConsent: row.builder_naming_consent === true,
    approvedBy: row.approved_by ?? null,
    approvedAt: iso(row.approved_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    archivedAt: iso(row.archived_at),
  };
}

export function toSnapshotSummary(row: CaseStudySnapshot): CaseStudySnapshotSummary {
  return {
    id: row.id,
    version: row.version,
    status: row.status as CaseStudySnapshotStatus,
    contentHash: row.content_hash,
    generatedAt: iso(row.generated_at),
    generatedBy: row.generated_by,
    approvedBy: row.approved_by ?? null,
    approvedAt: iso(row.approved_at),
    content: obj(row.content),
    provenance: obj(row.provenance),
    sourceCommitMap: obj(row.source_commit_map),
  };
}

/** Shared by every operation that takes an id. Throws rather than returning null. */
export async function loadCaseStudyRow(caseStudyId: string): Promise<CaseStudy> {
  const row = await CaseStudy.findByPk(caseStudyId);
  if (!row) {
    throw new CaseStudyAdminError('CaseStudyNotFound', `No Case Study ${caseStudyId}`, {
      case_study_id: caseStudyId,
    });
  }
  return row;
}

/**
 * Turn the slug unique-index violation into the named 409 an admin can act on,
 * and re-throw anything else untouched. The database is the authority on slug
 * uniqueness — a pre-flight SELECT would be a race, not a check.
 */
export function rethrowSlugConflict(err: unknown, slug: string | undefined): never {
  if ((err as { name?: string })?.name !== 'SequelizeUniqueConstraintError') throw err;
  throw new CaseStudyAdminError('SlugConflict',
    `A Case Study with the slug "${slug ?? ''}" already exists; choose another slug.`,
    { slug: slug ?? null });
}

export async function createCaseStudyRow(
  values: Record<string, unknown>, slug: string,
): Promise<CaseStudy> {
  try {
    return await CaseStudy.create(values as never);
  } catch (err) {
    return rethrowSlugConflict(err, slug);
  }
}

/** A stable class for a warning string. Never the message — a message can quote. */
export function errorClassOf(err: unknown): string {
  const tagged = (err as { error_class?: string })?.error_class;
  if (typeof tagged === 'string') return tagged;
  return (err as { name?: string })?.name ?? 'Error';
}
