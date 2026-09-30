/**
 * caseStudySnapshotInput — the contract the snapshot builder is fed, and the
 * draft it hands back.
 *
 * WHY IT IS ITS OWN FILE. The builder, the pure section assemblers and the
 * override applier all need these shapes. Declaring them in the builder and
 * importing them from the sections module would make the dependency run both
 * ways, and CLAUDE.md forbids the cycle: "A imports B imports A is a code smell
 * that signals a missing third module C that both depend on." This is C.
 *
 * LEAF MODULE, TYPES ONLY. Every import is `import type`, so nothing here emits
 * a `require` — a test may import the contract without pulling in the GitHub
 * client that `caseStudyRepoAnalyzer` sits on top of.
 *
 * THE CLOCK IS AN INPUT, AND IT IS NOT ALLOWED IN THE HASH. `now` exists so a
 * test can build the same snapshot at two instants and prove the content hash
 * did not move (spec §30, and the discipline `sbp/buildProgressSnapshot.ts`
 * states as "NOTHING VOLATILE MAY LEAVE THIS MODULE"). Every value it produces
 * — `generatedAt`, provenance `recordedAt` — is returned OUTSIDE
 * `CaseStudySnapshotContent`, which is the only thing that gets hashed.
 */
import type {
  CaseStudyArtifactRef,
  CaseStudyArchitectureEdge,
  CaseStudyArchitectureNode,
  CaseStudyBuilderIdentityMode,
  CaseStudyBuiltByType,
  CaseStudyContributor,
  CaseStudyMetricEntry,
  CaseStudyOrganizationIdentityMode,
  CaseStudyRepoRole,
  CaseStudyRoadmapItem,
  CaseStudyRoadmapStatus,
  CaseStudySituationSection,
  CaseStudySnapshotContent,
  CaseStudySnapshotGeneratedBy,
  CaseStudyTimelineEntry,
  CaseStudyVerification,
  IsoDate,
  IsoDateTime,
} from '../../types/caseStudy';
import type { CaseStudyProvenance, CaseStudyProvenancePath } from '../../types/caseStudyProvenance';
import type { CaseStudyRepoFacts } from './caseStudyRepoAnalyzer';
import type { CaseStudyManifest } from './caseStudyManifestReader';

/**
 * One analysed repository, plus the two decisions the analyzer cannot make:
 * which role it plays in the story, and whether the org consented to the link
 * being shown. Both live on the `case_study_repositories` row.
 */
export interface SnapshotRepoInput {
  readonly facts: CaseStudyRepoFacts;
  readonly role: CaseStudyRepoRole;
  readonly allowPublicRepoLink: boolean;
  /** Parsed `case-study.json` from this repo, when it had one (spec §8). */
  readonly manifest?: CaseStudyManifest | null;
}

/**
 * Everything the platform already knows: the `case_studies` row, its approved
 * metrics, evidence-backed timeline entries, consented contributors, approved
 * artifacts. Tier `project_facts` in spec §9 — it outranks anything extracted
 * from a repository, and the builder resolves conflicts in that direction.
 */
export interface SnapshotPlatformFacts {
  readonly slug: string;
  readonly title: string;
  readonly standfirst?: string;
  readonly summary?: string;
  /** `projects.id`, when the Case Study came from a platform Project. */
  readonly projectId?: string;
  readonly organizationDisplayName?: string;
  readonly organizationIdentityMode: CaseStudyOrganizationIdentityMode;
  readonly organizationNamingConsent: boolean;
  readonly builderIdentityMode: CaseStudyBuilderIdentityMode;
  readonly builderNamingConsent: boolean;
  readonly builtByType?: CaseStudyBuiltByType;
  readonly programLabel?: string;
  readonly programKey?: string;
  readonly industry?: string;
  readonly primaryCapability?: string;
  readonly deliverables?: readonly string[];
  readonly projectStatus?: CaseStudyRoadmapStatus;
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
  readonly situation?: CaseStudySituationSection;
  readonly timeline?: readonly CaseStudyTimelineEntry[];
  readonly roadmap?: readonly CaseStudyRoadmapItem[];
  readonly contributors?: readonly CaseStudyContributor[];
  readonly artifacts?: readonly CaseStudyArtifactRef[];
  /** Approved rows from `case_study_metrics`. `isHeadline` picks the hero set. */
  readonly metrics?: readonly CaseStudyMetricEntry[];
  readonly architectureNarrative?: readonly string[];
  readonly measurementNarrative?: readonly string[];
  /** Only ever hand-curated: spec §23 says hide the diagram rather than guess one. */
  readonly architectureDiagram?: {
    readonly nodes: readonly CaseStudyArchitectureNode[];
    readonly edges: readonly CaseStudyArchitectureEdge[];
  };
}

/**
 * A human's edit, pinned to a dotted path into `CaseStudySnapshotContent`.
 *
 * Tier `human_override` is index 0 of `CASE_STUDY_PROVENANCE_PRECEDENCE`, so it
 * beats every generated tier by construction. Overrides are applied AFTER
 * generation for exactly that reason — a rebuild regenerates the field, then the
 * override puts the human's value back, and the provenance map records who.
 */
export interface CaseStudySnapshotOverride {
  readonly path: CaseStudyProvenancePath;
  readonly value: unknown;
  /** Who made the edit. Reaches provenance, never a log line. */
  readonly actor: string;
  /** When the HUMAN edited — a stable recorded fact, not a clock read at build. */
  readonly recordedAt: IsoDateTime;
  readonly note?: string;
}

export interface CaseStudySnapshotInput {
  readonly caseStudyId: string;
  readonly platform: SnapshotPlatformFacts;
  readonly repos?: readonly SnapshotRepoInput[];
  readonly overrides?: readonly CaseStudySnapshotOverride[];
  readonly generatedBy?: CaseStudySnapshotGeneratedBy;
  readonly correlationId?: string;
  /** Injected in tests only. Production omits it and the builder reads the wall clock. */
  readonly now?: () => Date;
}

/**
 * The builder's output. `content` + `sourceCommitMap` are the hashed identity;
 * everything else is metadata about the build that produced them.
 */
export interface CaseStudySnapshotDraft {
  readonly content: CaseStudySnapshotContent;
  readonly provenance: CaseStudyProvenance;
  /** `owner/name` ⇒ commit sha, for `case_study_snapshots.source_commit_map`. */
  readonly sourceCommitMap: Readonly<Record<string, string>>;
  readonly contentHash: string;
  /** VOLATILE BY DESIGN, and therefore deliberately not inside `content`. */
  readonly generatedAt: IsoDateTime;
  readonly generatedBy: CaseStudySnapshotGeneratedBy;
  readonly appliedOverrides: readonly CaseStudyProvenancePath[];
  /** Paths whose parent does not exist in the generated content. Reported, never guessed at. */
  readonly ignoredOverrides: readonly CaseStudyProvenancePath[];
}
