import type { EvidenceClass } from '../components/publicV2/Claim';
import type { CaseStudySurfaceKey } from '../config/caseStudySurfaces';

/**
 * caseStudyPublicTypes - the wire contract of `/api/public/case-studies*`,
 * mirrored for the browser.
 *
 * AUTHORITY. `backend/src/types/caseStudyPublic.ts`. The frontend has no path
 * into `backend/src` (separate tsconfig, separate build), so every client in
 * this folder restates the shapes it consumes; `caseStudyAdminTypes.ts` mirrors
 * the admin API the same way and for the same reason. NOTHING here may add a
 * field the backend does not send. The temptation to "just add it on the client
 * for now" is how a UI starts rendering a value no server ever produced.
 *
 * WHAT IS ABSENT, AND WHY IT MUST STAY ABSENT. The backend contract removes
 * these deliberately, and re-adding any of them on this side would let a
 * component compile against a field that will always be `undefined`:
 *   - no `pending` verification class. The public union has three members. A
 *     figure awaiting confirmation is not publishable at all, so there is no
 *     class for it here.
 *   - no repository owner, name, url-for-a-private-repo, or visibility flag. A
 *     private repository is DROPPED by the projection and survives only as
 *     `privateRepositoryCount`. There is no shape here that could hold its
 *     identity.
 *   - no `id` anywhere. `slug` is the only public handle. Architecture diagram
 *     nodes are keyed by `key`, which is a local graph label ("api", "worker")
 *     and not a database identifier - the rename is the point.
 *   - no artifact `status` and no `private` access variant, so an unapproved
 *     artifact has no shape to occupy.
 *
 * TYPE-ONLY MODULE. It exports no runtime value, which is what lets it and
 * `config/caseStudySurfaces.ts` reference each other's types without any
 * possibility of an import cycle at runtime.
 */

/* ------------------------------------------------------------ vocabulary --- */

/**
 * DERIVED FROM THE BADGE VOCABULARY ON PURPOSE.
 *
 * `EvidenceClass` in `components/publicV2/Claim.tsx` is what `/proof` renders
 * and what `<EvidenceBadge>` and `<Metric>` accept. Deriving from it - rather
 * than typing three literals again - makes it structurally impossible for this
 * module to admit a class the badge cannot draw, which is the drift the two
 * surfaces are meant to be protected from. `pending` is subtracted because the
 * public API cannot send it (see the module header).
 */
export type PublicVerificationClass = Exclude<EvidenceClass, 'pending'>;

/** Who or what did the verifying. Orthogonal to the class. */
export type CaseStudyVerificationMethod =
  | 'client'
  | 'repo'
  | 'platform'
  | 'internal'
  | 'self'
  | 'manual';

export type CaseStudyBuiltByType =
  | 'learner'
  | 'intern'
  | 'client_team'
  | 'colaberry_team'
  | 'ai_flotation_team'
  | 'joint_team';

export type CaseStudyRoadmapStatus =
  | 'shipped'
  | 'in_progress'
  | 'paused'
  | 'not_pursued'
  | 'unknown';

/**
 * `photo` is ATMOSPHERE AND NEVER EVIDENCE. The server decides what that means
 * (`caseStudyPublicSections.ts`): a photograph ranks below a screenshot and an
 * architecture image for the hero, it arrives stamped
 * `presentation: 'atmosphere'`, and one whose caption claims to show delivered
 * work never reaches the wire at all. Nothing on the client re-derives any of
 * that — it reads `presentation`.
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

export type CaseStudyArtifactAccess = 'open' | 'request';

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

/**
 * What KIND of thing evidenced a timeline entry. The reference itself - a commit
 * sha, a stage id - stays server-side, because for a private repository the
 * reference is the leak.
 */
export type CaseStudyTimelineSourceKind = 'repository' | 'delivery' | 'artifact' | 'milestone';

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

/** Deterministic and named. Nothing decides what is featured at render time. */
export type CaseStudySortKey = 'featured' | 'newest' | 'strongest-proof' | 'recently-updated';

/* ------------------------------------------------------- leaf structures --- */

/** A figure, with the context that makes it readable. */
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

/** Prose as paragraphs, never HTML. The renderer decides markup, not the API. */
export interface PublicCaseStudyNarrative {
  readonly heading: string;
  readonly body: readonly string[];
}

export interface PublicCaseStudyTimelineEntry {
  readonly date: string;
  readonly endDate: string | null;
  readonly label: string;
  readonly detail: string | null;
  readonly sourceKind: CaseStudyTimelineSourceKind;
}

export interface PublicCaseStudyArchitectureNode {
  /** A local graph label, not a database identifier. See the module header. */
  readonly key: string;
  readonly label: string;
  readonly kind: string;
}

export interface PublicCaseStudyArchitectureEdge {
  readonly from: string;
  readonly to: string;
  readonly label: string | null;
}

export interface PublicCaseStudyArchitecture {
  readonly narrative: readonly string[];
  readonly stack: readonly string[];
  readonly capabilities: readonly string[];
  readonly integrations: readonly string[];
  readonly diagram: {
    readonly nodes: readonly PublicCaseStudyArchitectureNode[];
    readonly edges: readonly PublicCaseStudyArchitectureEdge[];
  } | null;
  /**
   * Mermaid source for a chart a PERSON drew, or null — which is the normal
   * case, and the band hides entirely when it is null.
   *
   * It is an addition to `diagram`, never a replacement for it.
   * `CaseStudyArchitecture` renders the verified node and edge lists as text on
   * purpose, and that stays. This is the human-authored view, labelled as such,
   * so a reader can tell which picture the repository evidenced and which one
   * somebody chose to draw.
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
 * anonymous contributor is not projected at all and survives only in
 * `anonymousContributorCount`, so crediting people honestly never costs anybody
 * their privacy.
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

/** An approved artifact. `request` carries no url, so no control can link one. */
/**
 * What an image on this page is allowed to MEAN. `evidence` is a picture of the
 * delivered work; `atmosphere` is a photograph, which shows a room and
 * evidences nothing. The server derives it from `artifactType` and the client
 * never re-derives it, so there is one definition and it is not on the client.
 */
export type PublicArtifactPresentation = 'evidence' | 'atmosphere';

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

/** Only ever a repository a reader may actually open. */
export interface PublicCaseStudyRepository {
  readonly label: string;
  readonly role: CaseStudyRepoRole;
  readonly url: string;
  readonly lastCommitDate: string | null;
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
  readonly ogImageUrl: string | null;
  readonly ogType: 'article';
}

/* ---------------------------------------------------------- projections --- */

/** One card on the index. */
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
  readonly builtBy: CaseStudyBuiltByType | null;
  readonly verificationClass: PublicVerificationClass;
  readonly verificationMethod: CaseStudyVerificationMethod;
  /** Null when nothing is verified. The card then shows a proof point, not a number. */
  readonly headlineMetric: PublicCaseStudyMetric | null;
  readonly deliverables: readonly string[];
  readonly featured: boolean;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly heroImageUrl: string | null;
}

/** One detail page. Empty arrays and nulls mean "hide the section". */
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
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly heroImageUrl: string | null;
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
  /** Opaque counts. Honest about provenance without naming anything. */
  readonly privateRepositoryCount: number;
  readonly anonymousContributorCount: number;
  readonly cta: PublicCaseStudyCta;
  readonly seo: PublicCaseStudySeo;
}

/* ------------------------------------------------------------- envelopes --- */

/**
 * The server-side surface profile, returned on every response. This is the
 * authority on hero copy, CTA, section order and emphasis; the client-side
 * profile in `config/caseStudySurfaces.ts` only knows routes and labels.
 */
export interface PublicSurfaceView {
  readonly key: CaseStudySurfaceKey;
  readonly brandLabel: string;
  readonly hero: { readonly eyebrow: string; readonly title: string; readonly description: string };
  readonly cta: PublicCaseStudyCta;
  readonly sectionOrder: readonly CaseStudySectionKey[];
  readonly hiddenSections: readonly CaseStudySectionKey[];
  readonly emphasis: readonly string[];
  readonly defaultSort: CaseStudySortKey;
}

/** Counts derived from what is published. Never a literal on a page. */
export interface CaseStudyLedgerCounts {
  readonly projects: number;
  readonly verifiedOutcomes: number;
  readonly publicRepositories: number;
  readonly shipped: number;
}

export interface PublicCaseStudyCollectionMeta {
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
}

export interface PublicCaseStudyListResponse {
  readonly surface: PublicSurfaceView;
  readonly collection: PublicCaseStudyCollectionMeta | null;
  readonly items: readonly PublicCaseStudySummary[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly hasMore: boolean;
  readonly ledger: CaseStudyLedgerCounts;
}

export interface PublicCaseStudyDetailResponse {
  readonly surface: PublicSurfaceView;
  readonly caseStudy: PublicCaseStudyDetail;
}

export interface PublicCaseStudyFacet {
  readonly slug: string;
  readonly label: string;
  readonly count: number;
}

/**
 * Facets are derived from what is actually published, so an empty database
 * yields empty arrays and the index renders its truthful zero-data state rather
 * than a hardcoded menu of filters that match nothing.
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

export interface PublicCaseStudyTaxonomyResponse {
  readonly surface: PublicSurfaceView;
  readonly facets: PublicCaseStudyTaxonomyFacets;
}
