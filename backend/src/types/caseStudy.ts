/**
 * Case Study OS — internal domain contracts.
 *
 * WHY THIS FILE EXISTS
 * `case_study_snapshots.content` and `.provenance` are JSONB columns
 * (db/ensureCaseStudySchema.ts). Without a declared shape they become untyped
 * JSON passed between the analyzer, the snapshot builder, the publish gate, the
 * public projection and the admin UI — exactly the "untyped JSON as inter-module
 * currency" CLAUDE.md's Contract Enforcement Layer forbids. Every union below is
 * written to match a constrained VARCHAR in the DDL, so an invalid state is a
 * compile error rather than a row nobody notices until it renders publicly.
 *
 * LEAF MODULE. It imports nothing — no service, no model, no Express, no
 * Sequelize. Anything may depend on it; it depends on nothing, so it can never
 * drag a database connection into a test that does not want one.
 *
 * Siblings, all of which import from here and never the other way round (the
 * split exists to keep every file inside CLAUDE.md's 500-line ceiling, and the
 * one-directional dependency is what keeps it acyclic):
 *   · `caseStudyProvenance.ts` — the seven precedence tiers and the field→source map
 *   · `caseStudyPublic.ts`     — the only shapes the public API may return
 *   · `caseStudyFilters.ts`    — surface profiles and the canonical filter engine
 *   · `caseStudyGuards.ts`     — runtime narrowing plus the exhaustiveness proofs
 */

/* ────────────────────────────────────────────── verification vocabulary ──── */

/**
 * How much of a claim may be shown.
 *
 * These four literals are the SAME vocabulary as `EvidenceClass` in
 * `frontend/src/components/publicV2/Claim.tsx:23`, deliberately, so `/proof` and
 * `/stories` cannot drift into describing the same evidence two different ways.
 * `caseStudyContracts.test.ts` reads that file as text and fails if the two lists
 * stop matching.
 *
 * NOT TO BE CONFUSED WITH `VerificationStatus` in
 * `frontend/src/config/claimsRegistry.ts:26-46`
 * (`VERIFIED | OWNER_ATTESTED | NEEDS_VERIFICATION | ILLUSTRATIVE | DO_NOT_PUBLISH`).
 * That is a second, unrelated vocabulary governing whether a *marketing sentence*
 * may ship. This one governs how much of a *Case Study fact* may be shown. They
 * are deliberately NOT mapped onto each other: a mapping would imply an
 * equivalence that does not exist (`OWNER_ATTESTED` has no Case Study analogue,
 * and `pending` has no claims-registry analogue), and the first person to write
 * `VERIFIED -> 'verified'` would quietly promote an unevidenced claim.
 *
 * `case_study_metrics.verification_class`, `case_study_evidence.verification_class`,
 * `case_study_quotes.verification_class`.
 */
export type CaseStudyVerificationClass = 'verified' | 'anonymized' | 'illustrative' | 'pending';

/**
 * Who established the fact. ORTHOGONAL to the class above — the two are separate
 * axes, not a hierarchy. `class: 'verified', method: 'repo'` (a commit proves it)
 * and `class: 'anonymized', method: 'client'` (the client confirmed it but will
 * not be named) are both valid and mean different things. Spec §14.
 *
 * `case_study_metrics.verification_method`.
 */
export type CaseStudyVerificationMethod =
  | 'client'
  | 'repo'
  | 'platform'
  | 'internal'
  | 'self'
  | 'manual';

/** Runtime mirrors, for validation and for the drift test against Claim.tsx. */
export const CASE_STUDY_VERIFICATION_CLASSES = [
  'verified',
  'anonymized',
  'illustrative',
  'pending',
] as const;

export const CASE_STUDY_VERIFICATION_METHODS = [
  'client',
  'repo',
  'platform',
  'internal',
  'self',
  'manual',
] as const;

/** ISO-8601 instant (`2026-08-22T14:03:00.000Z`). Named for readability only. */
export type IsoDateTime = string;

/** ISO-8601 calendar date (`2026-08-22`). Timeline entries are day-precision. */
export type IsoDate = string;

/** The verification pair carried by every fact that could be doubted. */
export interface CaseStudyVerification {
  readonly class: CaseStudyVerificationClass;
  readonly method: CaseStudyVerificationMethod;
  /** Absent until a human verifies. Its absence is why `pending` exists. */
  readonly verifiedAt?: IsoDateTime;
  /** `case_study_evidence.id`. Internal — never projected publicly. */
  readonly evidenceId?: string;
}

/* ────────────────────────────────────────────────── lifecycle vocabulary ──── */

/** `case_studies.status`. */
export type CaseStudyStatus = 'draft' | 'review' | 'approved' | 'published' | 'archived';

/** `case_studies.source_type`. */
export type CaseStudySourceType = 'platform_project' | 'repo_collection' | 'manual' | 'engagement';

/** `case_studies.visibility`. */
export type CaseStudyVisibility = 'public' | 'anonymized' | 'private';

/** `case_studies.organization_identity_mode`. Spec §16. */
export type CaseStudyOrganizationIdentityMode = 'named' | 'anonymized' | 'hidden';

/**
 * `case_studies.builder_identity_mode` and `case_study_quotes.attribution_mode`,
 * and the per-contributor display mode.
 * Consent, expressed as a type: naming a person is one of three states, not a
 * nullable string somebody forgets to check.
 */
export type CaseStudyBuilderIdentityMode = 'named' | 'role_only' | 'anonymous';

/** Who did the work. `case_study_quotes.attribution_kind`. Spec §23 "Who built it". */
export type CaseStudyBuiltByType =
  | 'learner'
  | 'intern'
  | 'client_team'
  | 'colaberry_team'
  | 'ai_flotation_team'
  | 'joint_team';

/** `case_study_snapshots.status`. */
export type CaseStudySnapshotStatus = 'draft' | 'approved' | 'superseded';

/** `case_study_snapshots.generated_by`. */
export type CaseStudySnapshotGeneratedBy = 'repo_sync' | 'platform_sync' | 'human_edit';

/** `case_study_metrics.metric_type`. */
export type CaseStudyMetricType =
  | 'business_outcome'
  | 'delivery'
  | 'performance'
  | 'scale'
  | 'quality'
  | 'adoption'
  | 'technical';

/** `case_study_evidence.source_type`. */
export type CaseStudyEvidenceSourceType =
  | 'evidence_record'
  | 'github_commit'
  | 'github_pr'
  | 'repo_file'
  | 'artifact'
  | 'client_confirmation'
  | 'internal_measurement'
  | 'manual';

/**
 * `case_study_artifacts.artifact_type`.
 *
 * `photo` IS ATMOSPHERE AND IS NEVER EVIDENCE. It exists so a record can carry a
 * photograph — a room, a working session, a stock frame — without that
 * photograph being able to stand in for a screenshot of the delivered system.
 * `docs/V2_CUTOVER_CARRYOVER.md` states the rule the whole system inherits from
 * the claims registry: *"a picture presented as evidence of something that did
 * not happen is a fabricated claim, it just happens to be made of pixels."*
 *
 * Three consequences are enforced in code rather than asked for in review, all
 * of them in the public projection (`caseStudyPublicSections.ts`):
 *   1. `HERO_IMAGE_PRIORITY` ranks `photo` BELOW `screenshot` and
 *      `architecture`, so a real product image always wins the hero when one
 *      exists and a photograph can only be the hero of a record that has no
 *      product image at all;
 *   2. `projectArtifacts` stamps every `photo` `presentation: 'atmosphere'`,
 *      derived from the type and never supplied by an author, so no renderer can
 *      be told a photograph is evidence;
 *   3. a `photo` whose title or description makes a delivered-work claim is
 *      DROPPED from the public payload entirely — `describesDeliveredWork()`.
 */
export type CaseStudyArtifactType =
  | 'screenshot'
  | 'architecture'
  | 'photo'
  | 'demo'
  | 'deck'
  | 'roadmap'
  | 'report'
  | 'evaluation'
  | 'code'
  | 'document'
  | 'other';

/** `case_study_artifacts.source_type`. */
export type CaseStudyArtifactSourceType = 'repo' | 'portfolio_artifact' | 'manual' | 'generated';

/** `case_study_artifacts.visibility`. `request_only` renders a real ask, never a fake download. */
export type CaseStudyArtifactVisibility = 'public' | 'request_only' | 'private';

/** `case_study_artifacts.status`. Candidates are never publishable. */
export type CaseStudyArtifactStatus = 'candidate' | 'approved' | 'rejected';

/** `case_study_repositories.role`. */
export type CaseStudyRepoRole =
  | 'primary'
  | 'frontend'
  | 'backend'
  | 'agents'
  | 'data'
  | 'infra'
  | 'docs'
  | 'evals'
  | 'demo'
  | 'other';

/** `case_study_repositories.visibility`. `unknown` is not `public` — fail closed. */
export type CaseStudyRepoVisibility = 'public' | 'private' | 'unknown';

/** `case_study_repositories.access_status`. */
export type CaseStudyRepoAccessStatus =
  | 'connected'
  | 'read_only'
  | 'unavailable'
  | 'deleted'
  | 'rate_limited'
  | 'unknown';

/** `case_study_publications.status`. */
export type CaseStudyPublicationStatus = 'draft' | 'published' | 'unpublished';

/** `case_study_sync_runs.trigger`. */
export type CaseStudySyncTrigger = 'manual' | 'webhook' | 'reconciliation' | 'project_update';

/** `case_study_sync_runs.status`. `unchanged` is the idempotent-rerun outcome. */
export type CaseStudySyncStatus = 'running' | 'success' | 'partial' | 'failed' | 'unchanged';

/** `case_study_collections.status`. */
export type CaseStudyCollectionStatus = 'draft' | 'published';

/**
 * `case_study_repo_collections.status`.
 *
 * The column is a bare VARCHAR with a DEFAULT of 'active' and no CHECK, so this
 * union is the only statement of what belongs in it. Only `active` is written
 * today — `caseStudyRepoCollection.ts` supplies it as the findOrCreate default
 * and nothing archives a collection. `archived` is kept because the column is
 * unconstrained and the value would be accepted, which is a different situation
 * from a value some guard actively rejects.
 */
export type CaseStudyRepoCollectionStatus = 'active' | 'archived';

/**
 * "What happened next" (spec §23) AND the `project_status` filter (spec §31).
 *
 * ONE union serves both deliberately. The spec names the roadmap states in §23
 * and lists a `project_status` filter in §31 without defining its values; adding
 * a second near-identical vocabulary is how two lists start disagreeing about
 * what "shipped" means. Showing stalled work is allowed and is often more
 * credible, which is why `paused` and `not_pursued` are first-class rather than
 * simply absent.
 */
export type CaseStudyRoadmapStatus =
  | 'shipped'
  | 'in_progress'
  | 'paused'
  | 'not_pursued'
  | 'unknown';

/** The renderable sections of a detail page, in spec §23's order. */
export type CaseStudySectionKey =
  | 'hero'
  | 'situation'
  | 'build'
  | 'architecture'
  | 'measurement'
  | 'roadmap'
  | 'contributors'
  | 'artifacts'
  | 'repositories'
  | 'cta';

/** Where a timeline entry came from. AI may summarise chronology, never invent it. */
export type CaseStudyTimelineSource =
  | 'commit'
  | 'pull_request'
  | 'release'
  | 'project_stage'
  | 'artifact'
  | 'milestone'
  | 'manual';

/* ─────────────────────────────────────────────────── snapshot content ────── */

/**
 * A measured figure with the context that makes it honest.
 *
 * `limitations` is a required array, not an optional field: spec §23 says a
 * high-impact number without evidence context is incomplete, and an optional
 * field is one a builder forgets. An empty array is an explicit "none", which is
 * a different statement from "nobody considered it".
 */
export interface CaseStudyMeasurementContext {
  readonly baseline?: string;
  readonly sample?: string;
  readonly measured?: string;
  readonly methodology?: string;
  readonly limitations: readonly string[];
}

/** One metric. Used for hero figures and for the measurement section alike. */
export interface CaseStudyMetricEntry {
  /** Stable key (`case_study_metrics.metric_key`), e.g. `deploy_frequency`. */
  readonly key: string;
  readonly label: string;
  readonly valueDisplay: string;
  readonly numericValue?: number;
  readonly unit?: string;
  readonly metricType: CaseStudyMetricType;
  readonly verification: CaseStudyVerification;
  readonly isHeadline: boolean;
  /** Mirrors `case_study_metrics.publishable`, which defaults false. */
  readonly publishable: boolean;
  readonly measurement?: CaseStudyMeasurementContext;
}

/** Hero identity: who, what, and under which consent settings. */
export interface CaseStudyIdentitySection {
  readonly slug: string;
  readonly title: string;
  /** One-sentence standfirst under the title. */
  readonly standfirst?: string;
  readonly summary?: string;
  readonly organizationDisplayName?: string;
  readonly organizationIdentityMode: CaseStudyOrganizationIdentityMode;
  readonly organizationNamingConsent: boolean;
  readonly builderIdentityMode: CaseStudyBuilderIdentityMode;
  readonly builderNamingConsent: boolean;
  readonly builtByType?: CaseStudyBuiltByType;
  readonly programLabel?: string;
  /**
   * The cover image this record CHOOSES, when the type-priority default is not
   * the right picture. Honoured by `resolveHeroImage` only when it matches an
   * artifact that is already approved and publicly viewable — naming a URL here
   * cannot publish an image the artifact gate never saw.
   *
   * Absent means "decide for me": the priority list picks screenshot, then
   * architecture, then photo.
   */
  readonly heroImageUrl?: string;
  /** Duration renders only when verified, hence the paired verification. */
  readonly engagementWindow?: {
    readonly start: IsoDate;
    readonly end?: IsoDate;
    readonly durationLabel?: string;
    readonly verification: CaseStudyVerification;
  };
  readonly productionStatus?: {
    readonly status: CaseStudyRoadmapStatus;
    readonly verification: CaseStudyVerification;
  };
}

/** The business problem. Approved Project facts or human narrative — never invented. */
export interface CaseStudySituationSection {
  readonly narrative: readonly string[];
  readonly constraints?: readonly string[];
  readonly goals?: readonly string[];
  readonly verification: CaseStudyVerification;
}

export interface CaseStudyTimelineEntry {
  readonly date: IsoDate;
  readonly endDate?: IsoDate;
  readonly label: string;
  readonly detail?: string;
  readonly source: CaseStudyTimelineSource;
  /** Internal reference (commit sha, stage id). Never projected publicly. */
  readonly sourceRef?: string;
  readonly verification: CaseStudyVerification;
}

export interface CaseStudyArchitectureNode {
  readonly id: string;
  readonly label: string;
  readonly kind: 'service' | 'datastore' | 'agent' | 'ui' | 'integration' | 'job' | 'other';
}

export interface CaseStudyArchitectureEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
}

export interface CaseStudyArchitectureSection {
  readonly narrative?: readonly string[];
  readonly stack: readonly string[];
  readonly capabilities: readonly string[];
  readonly integrations?: readonly string[];
  readonly dataStores?: readonly string[];
  /** Generated only from normalised verified nodes/edges. Hide rather than fabricate. */
  readonly diagram?: {
    readonly nodes: readonly CaseStudyArchitectureNode[];
    readonly edges: readonly CaseStudyArchitectureEdge[];
  };
  /**
   * Mermaid source for a HUMAN-AUTHORED chart, and only ever that.
   *
   * It does not replace `diagram`, and nothing generates it. `diagram` is the
   * normalised node/edge list the repository sync can evidence, and
   * `CaseStudyArchitecture.tsx` renders it as text on purpose — *"a list of
   * verified nodes and verified edges says exactly what the data says and no
   * more"*. A chart drawn from that same list would have to invent a layout the
   * data does not contain. So this field carries a drawing a PERSON made and
   * takes responsibility for, it renders beside the verified list rather than
   * instead of it, and the page labels it as the human-authored view.
   *
   * Sanitised at the public boundary, not here: see `projectDiagramSource()`.
   */
  readonly diagramSource?: string;
}

export interface CaseStudyMeasurementSection {
  readonly narrative?: readonly string[];
  readonly metrics: readonly CaseStudyMetricEntry[];
}

export interface CaseStudyRoadmapItem {
  readonly label: string;
  readonly status: CaseStudyRoadmapStatus;
  readonly detail?: string;
  readonly verification: CaseStudyVerification;
}

/**
 * A contributor, as a discriminated union on consent.
 *
 * This is why it is not one interface with an optional `displayName`: naming
 * somebody requires `consentRecordedAt`, so "named without consent" has no shape
 * to occupy. The publish gate still checks it, but the type makes the mistake
 * hard to write in the first place.
 */
export type CaseStudyContributor =
  | {
      readonly displayMode: 'named';
      readonly displayName: string;
      readonly role: string;
      readonly kind: CaseStudyBuiltByType;
      readonly consentRecordedAt: IsoDateTime;
    }
  | {
      readonly displayMode: 'role_only';
      readonly role: string;
      readonly kind: CaseStudyBuiltByType;
    }
  | {
      readonly displayMode: 'anonymous';
      readonly kind: CaseStudyBuiltByType;
    };

export interface CaseStudyArtifactRef {
  /** `case_study_artifacts.id`. Internal — never projected publicly. */
  readonly id: string;
  readonly artifactType: CaseStudyArtifactType;
  readonly title: string;
  readonly description?: string;
  readonly sourceType: CaseStudyArtifactSourceType;
  readonly sourceRef?: string;
  readonly sourceCommitSha?: string;
  readonly visibility: CaseStudyArtifactVisibility;
  readonly status: CaseStudyArtifactStatus;
  readonly publicUrl?: string;
  readonly previewUrl?: string;
}

/**
 * A source repository as held internally. Carries owner, name and URL for every
 * repo including private ones — which is precisely why no public type reuses it.
 */
export interface CaseStudyRepositoryRef {
  readonly repoOwner: string;
  readonly repoName: string;
  readonly repoUrl: string;
  readonly role: CaseStudyRepoRole;
  readonly visibility: CaseStudyRepoVisibility;
  readonly accessStatus: CaseStudyRepoAccessStatus;
  readonly allowPublicRepoLink: boolean;
  readonly defaultBranch?: string;
  readonly lastSeenSha?: string;
  readonly lastSyncedAt?: IsoDateTime;
  /**
   * Path prefixes this Case Study is about, when it is about PART of the
   * repository rather than all of it.
   *
   * ABSENT means the whole repository, and absent is the default. The field is
   * omitted entirely rather than emitted as `[]` so an unscoped repository
   * serialises exactly as it did before scoping existed and every already
   * published snapshot keeps its content hash.
   */
  readonly pathScope?: readonly string[];
}

/** Normalised, slug-shaped facets. One vocabulary for filters, cards and SEO. */
export interface CaseStudyTaxonomy {
  readonly industry?: string;
  readonly primaryCapability?: string;
  readonly capabilities: readonly string[];
  readonly stack: readonly string[];
  readonly programKey?: string;
  readonly builtByType?: CaseStudyBuiltByType;
  readonly deliverables: readonly string[];
  readonly projectStatus?: CaseStudyRoadmapStatus;
}

/**
 * `case_study_snapshots.content`, typed.
 *
 * `identity`, `heroMetrics` and `taxonomy` are required because a Case Study
 * cannot be rendered or filtered without them (an empty `heroMetrics` array is
 * legal — a record with no verified figure renders a proof point instead of an
 * invented number). Every other section is optional because spec §23 says the
 * detail page HIDES unsupported sections rather than rendering them empty, so
 * "absent" must be representable and distinct from "present but blank".
 */
export interface CaseStudySnapshotContent {
  readonly identity: CaseStudyIdentitySection;
  readonly heroMetrics: readonly CaseStudyMetricEntry[];
  readonly situation?: CaseStudySituationSection;
  readonly buildTimeline?: readonly CaseStudyTimelineEntry[];
  readonly architecture?: CaseStudyArchitectureSection;
  readonly measurement?: CaseStudyMeasurementSection;
  readonly roadmap?: readonly CaseStudyRoadmapItem[];
  readonly contributors?: readonly CaseStudyContributor[];
  readonly artifacts?: readonly CaseStudyArtifactRef[];
  readonly repositories?: readonly CaseStudyRepositoryRef[];
  readonly taxonomy: CaseStudyTaxonomy;
}

/* ─────────────────────────────────────────────────────────── surfaces ────── */

/**
 * Every surface the platform will ever publish to. All four exist in the
 * contract from day one — that is what makes "adding Training is a publication
 * row, not a schema change" a real property rather than an aspiration — but only
 * `enterprise` is publishable in Phase 1 and the publish gate rejects the rest.
 *
 * `case_study_collections.surface_key`, `case_study_publications.surface_key`.
 */
export type CaseStudySurfaceKey = 'enterprise' | 'training' | 'ai-flotation' | 'refactored';

export const CASE_STUDY_SURFACE_KEYS = [
  'enterprise',
  'training',
  'ai-flotation',
  'refactored',
] as const;

/**
 * The surfaces a record may actually be published to. Enforced again at the
 * publish gate (T012, `ruleSurface`), not only here.
 *
 * `ai-flotation` JOINED 2026-09-05, and the shape of that change is the point:
 * its profile, its band order, its ledger labels and its publication rows all
 * existed already, unused. Ali asked to "control what Case Study is shown on
 * what site", and the answer was one entry in this list plus a resolver that
 * reads the surface off the request - which is exactly what the gate's own
 * refusal message had been promising since Phase 1.
 *
 * `training` and `refactored` stay out deliberately. Neither has a page to
 * appear on yet, and a surface that is publishable but unreachable is a record
 * marked live that nobody can read.
 *
 * ADDING ONE IS NOT A FREE ACTION. Each surface is a brand - AI Flotation runs
 * its own Cloudflare zone specifically to keep the entity boundary clean - so
 * publishing a record there is a statement about whose delivery it was. The
 * per-surface publication row is the control for that judgement. It does not
 * make the judgement.
 */
export const PUBLISHABLE_SURFACE_KEYS = ['enterprise', 'ai-flotation'] as const;
