/**
 * Case Study OS — the public projection.
 *
 * `PublicCaseStudySummary` and `PublicCaseStudyDetail` are the ONLY shapes
 * `/api/public/case-studies*` may return. Everything about them is deliberately
 * narrow.
 *
 * WHY THEY ARE WRITTEN OUT LONGHAND RATHER THAN DERIVED
 * It would be shorter to say `Omit<CaseStudySnapshotContent, 'repositories'>` or
 * `Partial<CaseStudy>`. That is exactly the bug: a derived type inherits every
 * field somebody adds to the internal type LATER. Add `reviewNotes` to the
 * snapshot in six months and a derived public type starts carrying it, silently,
 * with no diff on this file and no test failure. Written longhand, a new internal
 * field reaches the public API only when a human types its name here — and typing
 * its name here is what the forbidden-key test is watching for.
 *
 * WHAT IS STRUCTURALLY IMPOSSIBLE HERE (not merely "filtered out downstream")
 *   · a draft or review note        — no field of any public type accepts one
 *   · an internal id                — no `id`, no `caseStudyId`, no `snapshotId`;
 *                                     `slug` is the only public handle
 *   · a private repo's url or owner — `PublicCaseStudyRepository` has no owner,
 *                                     no name and no visibility discriminant; a
 *                                     private repo is DROPPED, not nulled, and
 *                                     survives only as an opaque count
 *   · a student email / enrollment id / admin id — no field of any type is a
 *                                     person identifier other than a consented
 *                                     `displayName`
 *   · a `pending` metric            — `PublicVerificationClass` has no `pending`
 *                                     member, so a pending figure cannot be
 *                                     represented at all
 *   · an unapproved artifact        — `PublicCaseStudyArtifact` has no `status`
 *                                     field and no `private` access variant
 *
 * LEAF MODULE: type-only import from its sibling contract, nothing else.
 */

import type {
  CaseStudyArtifactType,
  CaseStudyBuiltByType,
  CaseStudyRepoRole,
  CaseStudyRoadmapStatus,
  CaseStudySurfaceKey,
  CaseStudyVerificationMethod,
  IsoDate,
  IsoDateTime,
} from './caseStudy';

/* ─────────────────────────────────────────── public verification classes ──── */

/**
 * The classes a published record may carry.
 *
 * Written out as three literals rather than
 * `Exclude<CaseStudyVerificationClass, 'pending'>` on purpose: `Exclude` would
 * quietly admit any future member of the internal union, so adding
 * `'self_reported'` there would make it publishable here without anyone
 * deciding that. Widening this list has to be a deliberate edit to this line.
 *
 * `illustrative` IS representable — it renders behind an explicit sample label
 * (Claim.tsx's `SampleBadge`) and is hidden from the index by default (spec §14).
 * `pending` is not representable at all.
 */
export type PublicVerificationClass = 'verified' | 'anonymized' | 'illustrative';

export const PUBLIC_VERIFICATION_CLASSES = ['verified', 'anonymized', 'illustrative'] as const;

/* ──────────────────────────────────────────────── public leaf structures ──── */

/** A figure, with the context that makes it readable. No ids, no `pending`. */
export interface PublicCaseStudyMetric {
  readonly label: string;
  readonly valueDisplay: string;
  readonly unit: string | null;
  readonly verificationClass: PublicVerificationClass;
  readonly verificationMethod: CaseStudyVerificationMethod;
  readonly baseline: string | null;
  readonly sample: string | null;
  readonly methodology: string | null;
  readonly limitations: readonly string[];
}

/** Prose. Paragraphs, not HTML — the renderer decides markup, not the API. */
export interface PublicCaseStudyNarrative {
  readonly heading: string;
  readonly body: readonly string[];
}

/**
 * A dated step. `sourceKind` says what KIND of thing evidenced it; the reference
 * itself (`sourceRef`, a commit sha, a stage id) stays internal, because for a
 * private repo the reference is the leak.
 */
export interface PublicCaseStudyTimelineEntry {
  readonly date: IsoDate;
  readonly endDate: IsoDate | null;
  readonly label: string;
  readonly detail: string | null;
  readonly sourceKind: 'repository' | 'delivery' | 'artifact' | 'milestone';
}

export interface PublicCaseStudyArchitecture {
  readonly narrative: readonly string[];
  readonly stack: readonly string[];
  readonly capabilities: readonly string[];
  readonly integrations: readonly string[];
  /**
   * Nodes are keyed by `key`, not `id`, deliberately: `id` is on the
   * forbidden-key list because on every other shape in this system it means a
   * database identifier, and a public payload carrying a field called `id`
   * invites exactly the wrong thing to be put in it. This one is a local graph
   * label ("api", "worker") with no meaning outside the diagram.
   */
  readonly diagram: {
    readonly nodes: readonly {
      readonly key: string;
      readonly label: string;
      readonly kind: string;
    }[];
    readonly edges: readonly {
      readonly from: string;
      readonly to: string;
      readonly label: string | null;
    }[];
  } | null;
  /**
   * Mermaid source for the human-authored chart, or null.
   *
   * SEPARATE FROM `diagram` BECAUSE THEY ARE DIFFERENT CLAIMS. `diagram` is what
   * the repository evidenced, rendered as text. This is what a person drew. The
   * renderer shows both, labels this one as the human-authored view, and hides
   * this band entirely when the field is null — which is the normal case.
   */
  readonly diagramSource: string | null;
}

export interface PublicCaseStudyMeasurement {
  readonly narrative: readonly string[];
  readonly metrics: readonly PublicCaseStudyMetric[];
}

export interface PublicCaseStudyRoadmapItem {
  readonly label: string;
  readonly status: CaseStudyRoadmapStatus;
  readonly detail: string | null;
}

/**
 * A contributor who consented to appear. There is no `anonymous` variant: an
 * anonymous contributor is not projected at all, and survives only in
 * `anonymousContributorCount`, so honest crediting never costs somebody their
 * privacy.
 */
export type PublicCaseStudyContributor =
  | {
      readonly displayMode: 'named';
      readonly displayName: string;
      readonly role: string;
      readonly kind: CaseStudyBuiltByType;
    }
  | {
      readonly displayMode: 'role_only';
      readonly role: string;
      readonly kind: CaseStudyBuiltByType;
    };

/**
 * WHAT AN IMAGE ON THIS PAGE IS ALLOWED TO MEAN.
 *
 * `evidence` is a picture of the delivered work — a screenshot, an architecture
 * image. `atmosphere` is a photograph, which shows a room or a working session
 * and evidences nothing about the system. The distinction is the whole reason
 * `photo` exists as an artifact type, and it is DERIVED FROM THE TYPE by
 * `artifactPresentation()`, never supplied by whoever uploaded the file — an
 * author-set flag would make "is this evidence?" an editorial field, which is
 * exactly the decision that must not be editable.
 */
export type PublicArtifactPresentation = 'evidence' | 'atmosphere';

/**
 * An approved artifact. No `status` field exists, so a `candidate` or `rejected`
 * artifact has no shape to occupy; and `private` is not an `access` variant, so a
 * private artifact is dropped rather than rendered as a dead control. Spec §23:
 * do not create fake request/download controls.
 */
export type PublicCaseStudyArtifact =
  | {
      readonly access: 'open';
      readonly artifactType: CaseStudyArtifactType;
      readonly presentation: PublicArtifactPresentation;
      readonly title: string;
      readonly description: string | null;
      readonly url: string;
      readonly previewUrl: string | null;
    }
  | {
      readonly access: 'request';
      readonly artifactType: CaseStudyArtifactType;
      readonly presentation: PublicArtifactPresentation;
      readonly title: string;
      readonly description: string | null;
    };

/**
 * A repository the reader may actually open.
 *
 * Only exists for a repo that is public AND has `allow_public_repo_link` AND is
 * approved by the published snapshot — spec §16's three independent gates. There
 * is no owner, no name, no visibility field: a private repo cannot be rendered
 * "without its url", because it cannot be rendered.
 */
export interface PublicCaseStudyRepository {
  readonly label: string;
  readonly role: CaseStudyRepoRole;
  readonly url: string;
  readonly lastCommitDate: IsoDate | null;
}

export interface PublicCaseStudyCta {
  readonly eyebrow: string;
  readonly heading: string;
  readonly buttonLabel: string;
  readonly href: string;
}

export interface PublicCaseStudySeo {
  readonly title: string;
  readonly description: string;
  readonly canonicalUrl: string;
  /** Only ever an approved media asset. Null is the normal case. */
  readonly ogImageUrl: string | null;
  readonly ogType: 'article';
}

/* ─────────────────────────────────────────────────── public projections ──── */

/** One card on `/stories`. */
export interface PublicCaseStudySummary {
  readonly slug: string;
  readonly title: string;
  readonly standfirst: string | null;
  /** Already consent-resolved: a real name, an anonymised descriptor, or null. */
  readonly organizationLabel: string | null;
  readonly industry: string | null;
  readonly primaryCapability: string | null;
  readonly capabilities: readonly string[];
  readonly stack: readonly string[];
  readonly programLabel: string | null;
  /** A category ("colaberry_team"), never a person. The renderer supplies the label. */
  readonly builtBy: CaseStudyBuiltByType | null;
  readonly verificationClass: PublicVerificationClass;
  readonly verificationMethod: CaseStudyVerificationMethod;
  /** Null when nothing is verified — the card shows a proof point, not a number. */
  readonly headlineMetric: PublicCaseStudyMetric | null;
  readonly deliverables: readonly string[];
  readonly featured: boolean;
  readonly publishedAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly heroImageUrl: string | null;
}

/** One page at `/stories/:slug`. Empty arrays and nulls mean "hide the section". */
export interface PublicCaseStudyDetail {
  readonly surfaceKey: CaseStudySurfaceKey;
  readonly slug: string;
  readonly title: string;
  readonly standfirst: string | null;
  readonly organizationLabel: string | null;
  readonly industry: string | null;
  readonly primaryCapability: string | null;
  readonly capabilities: readonly string[];
  readonly stack: readonly string[];
  readonly programLabel: string | null;
  readonly builtBy: CaseStudyBuiltByType | null;
  readonly verificationClass: PublicVerificationClass;
  readonly verificationMethod: CaseStudyVerificationMethod;
  readonly publishedAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly heroImageUrl: string | null;
  /** Renders only when verified, hence a plain label rather than raw dates. */
  readonly engagementDuration: string | null;
  readonly productionStatus: CaseStudyRoadmapStatus | null;
  readonly heroMetrics: readonly PublicCaseStudyMetric[];
  readonly situation: PublicCaseStudyNarrative | null;
  readonly timeline: readonly PublicCaseStudyTimelineEntry[];
  readonly architecture: PublicCaseStudyArchitecture | null;
  readonly measurement: PublicCaseStudyMeasurement | null;
  readonly roadmap: readonly PublicCaseStudyRoadmapItem[];
  readonly contributors: readonly PublicCaseStudyContributor[];
  readonly artifacts: readonly PublicCaseStudyArtifact[];
  readonly repositories: readonly PublicCaseStudyRepository[];
  /** An opaque count. Honest about provenance without naming anything. */
  readonly privateRepositoryCount: number;
  readonly anonymousContributorCount: number;
  readonly cta: PublicCaseStudyCta;
  readonly seo: PublicCaseStudySeo;
}

/* ──────────────────────────────────────────── runtime key allow-lists ────── */

/**
 * `Record<keyof T, true>` is what keeps these honest. Add a field to the public
 * type and this object stops compiling until the key is added here; add a key
 * here that is not on the type and the excess-property check rejects it. So the
 * runtime allow-list cannot drift from the shape it claims to mirror — which is
 * the whole reason a runtime list exists for a compile-time type.
 */
const PUBLIC_SUMMARY_KEY_MAP: Record<keyof PublicCaseStudySummary, true> = {
  slug: true,
  title: true,
  standfirst: true,
  organizationLabel: true,
  industry: true,
  primaryCapability: true,
  capabilities: true,
  stack: true,
  programLabel: true,
  builtBy: true,
  verificationClass: true,
  verificationMethod: true,
  headlineMetric: true,
  deliverables: true,
  featured: true,
  publishedAt: true,
  updatedAt: true,
  heroImageUrl: true,
};

const PUBLIC_DETAIL_KEY_MAP: Record<keyof PublicCaseStudyDetail, true> = {
  surfaceKey: true,
  slug: true,
  title: true,
  standfirst: true,
  organizationLabel: true,
  industry: true,
  primaryCapability: true,
  capabilities: true,
  stack: true,
  programLabel: true,
  builtBy: true,
  verificationClass: true,
  verificationMethod: true,
  publishedAt: true,
  updatedAt: true,
  heroImageUrl: true,
  engagementDuration: true,
  productionStatus: true,
  heroMetrics: true,
  situation: true,
  timeline: true,
  architecture: true,
  measurement: true,
  roadmap: true,
  contributors: true,
  artifacts: true,
  repositories: true,
  privateRepositoryCount: true,
  anonymousContributorCount: true,
  cta: true,
  seo: true,
};

export const PUBLIC_SUMMARY_KEYS: readonly string[] = Object.freeze(
  Object.keys(PUBLIC_SUMMARY_KEY_MAP),
);

export const PUBLIC_DETAIL_KEYS: readonly string[] = Object.freeze(
  Object.keys(PUBLIC_DETAIL_KEY_MAP),
);

/**
 * Names that must never appear on a public payload, in either casing, at any
 * depth. Kept as data rather than prose so `caseStudyContracts.test.ts` can
 * assert it is disjoint from both allow-lists: the moment somebody adds one of
 * these to a public type, the suite fails by name.
 */
export const FORBIDDEN_PUBLIC_KEYS = [
  // drafting and review
  'review_notes', 'reviewNotes', 'internal_notes', 'internalNotes',
  'draft_notes', 'draftNotes', 'notes',
  // who touched it
  'created_by', 'createdBy', 'approved_by', 'approvedBy',
  'published_by', 'publishedBy', 'verified_by', 'verifiedBy',
  'reviewed_by', 'reviewedBy',
  // people
  'student_email', 'studentEmail', 'email', 'user_id', 'userId',
  'enrollment_id', 'enrollmentId', 'lead_id', 'leadId',
  'admin_id', 'adminId', 'participant_id', 'participantId',
  // repository identity (a private repo leaks through any one of these)
  'repo_url', 'repoUrl', 'repo_owner', 'repoOwner', 'repo_name', 'repoName',
  'default_branch', 'defaultBranch', 'last_seen_sha', 'lastSeenSha',
  'github_connection_id', 'githubConnectionId',
  // secrets
  'access_token', 'accessToken', 'github_token', 'githubToken',
  'installation_id', 'installationId', 'webhook_secret', 'webhookSecret',
  // internal machinery
  'file_tree_json', 'fileTreeJson', 'project_variables', 'projectVariables',
  'provenance', 'content_hash', 'contentHash', 'source_commit_map', 'sourceCommitMap',
  'source_ref', 'sourceRef', 'metadata',
  // internal identifiers — `slug` is the only public handle
  'id', 'case_study_id', 'caseStudyId', 'snapshot_id', 'snapshotId',
  'published_snapshot_id', 'publishedSnapshotId', 'project_id', 'projectId',
  'evidence_id', 'evidenceId', 'portfolio_artifact_id', 'portfolioArtifactId',
  'tenant_id', 'tenantId', 'brand_id', 'brandId',
] as const;

/* ────────────────────────────────────────────────────── taxonomy facets ──── */

/**
 * `GET /api/public/case-study-taxonomy`. Counts only — the facet list is derived
 * from what is actually published, so an empty database yields empty arrays and
 * the index renders its truthful zero-data state rather than a hardcoded menu of
 * filters that match nothing.
 */
export interface PublicCaseStudyTaxonomyFacets {
  readonly capabilities: readonly PublicCaseStudyFacet[];
  readonly industries: readonly PublicCaseStudyFacet[];
  readonly stack: readonly PublicCaseStudyFacet[];
  readonly programs: readonly PublicCaseStudyFacet[];
  readonly builtBy: readonly { readonly slug: CaseStudyBuiltByType; readonly count: number }[];
  readonly verificationClasses: readonly {
    readonly slug: PublicVerificationClass;
    readonly count: number;
  }[];
}

export interface PublicCaseStudyFacet {
  readonly slug: string;
  readonly label: string;
  readonly count: number;
}

