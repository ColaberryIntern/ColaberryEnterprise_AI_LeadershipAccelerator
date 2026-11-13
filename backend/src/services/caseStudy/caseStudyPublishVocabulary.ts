/**
 * caseStudyPublishVocabulary - the publish gate's codes and the shapes its rules read.
 *
 * Split out of `caseStudyPublishRules.ts` (605 lines, over CLAUDE.md's 500-line ceiling)
 * before the `hire_no_linked_person` rule was added. `caseStudyPublishRules.ts` re-exports
 * every symbol here, so `caseStudyPublishGate.ts` and every other importer are unchanged.
 *
 * PURE TYPES AND ONE CONSTANT. No I/O, no logic.
 */
import type {
  CaseStudyBuilderIdentityMode,
  CaseStudyOrganizationIdentityMode,
  CaseStudySnapshotContent,
  CaseStudySnapshotStatus,
  CaseStudyStatus,
  CaseStudySurfaceKey,
} from '../../types/caseStudy';
import type { CaseStudyProvenance } from '../../types/caseStudyProvenance';


/**
 * One code per rejection reason. Codes are what a LOG LINE carries — a blocker's
 * message can quote a client's name or a builder's name, and a code never can —
 * and what the admin UI anchors its remediation links to. Stable identifiers:
 * retire one, never rename it.
 */
export type CaseStudyPublishBlockerCode =
  | 'surface_not_publishable'
  | 'case_study_not_approved'
  | 'snapshot_not_approved'
  | 'metric_pending'
  | 'organization_consent'
  | 'builder_consent'
  | 'private_repo_exposed'
  | 'proof_metadata_missing'
  | 'self_attested_verification'
  | 'ai_generated_quote'
  | 'unverified_claim'
  | 'metric_shape_payload_mismatch'
  | 'metric_ratio_missing_denominator'
  | 'metric_members_count_mismatch'
  | 'metric_collected_sha_mismatch'
  // Unified Project Discovery, Phase 7: a record linked to a student project
  // carries that project's computed maturity. See caseStudyPublishMaturityRule.
  | 'maturity_below_operational_result'
  | 'project_truth_has_open_questions'
  // The hero row. See caseStudyPublishHeroRules for the card row that made the
  // library worse and why the skill alone could not stop it.
  | 'headline_metric_is_a_bare_count'
  | 'headline_metric_missing_plain_answers'
  // 20 — the visual story failed `validateVisualStory` (graph, text or figure
  // rule). Written stories are validated on save, so this catches a story that
  // was valid then and is not now: a metric it cites lost its verification, or
  // a snapshot was assembled by a path that skipped the write-time check.
  | 'visual_story_invalid'
  // 21 — the snapshot carries no visual story, or one that draws no workflow.
  // Every published record carries one since the CORA pilot was approved
  // (Ali, 2026-09-16); presence and a workflow are required, figures are not.
  | 'visual_story_missing'
  // hire.refactored.ai lists PEOPLE; a hire record that resolves to nobody lists nobody
  // (2026-11-06). Raised only for surface `hire`.
  | 'hire_no_linked_person'
  // Services Upgrade SV1 (Ali, 2026-11-13): no case study may sit unlinked - zero CONFIRMED links into the gov
  // tenant's Our Services catalog refuses every surface. See caseStudyPublishServiceLinkRule.
  | 'no_confirmed_service_link'
  // Outside case studies (from a PDF/deck, not our own build) are INTERNAL ONLY - Gov proposals, never a site.
  | 'outside_case_study_internal_only';

export const CASE_STUDY_PUBLISH_BLOCKER_CODES = [
  'surface_not_publishable',
  'case_study_not_approved',
  'snapshot_not_approved',
  'metric_pending',
  'organization_consent',
  'builder_consent',
  'private_repo_exposed',
  'proof_metadata_missing',
  'self_attested_verification',
  'ai_generated_quote',
  'unverified_claim',
  'metric_shape_payload_mismatch',
  'metric_ratio_missing_denominator',
  'metric_members_count_mismatch',
  'metric_collected_sha_mismatch',
  'maturity_below_operational_result',
  'project_truth_has_open_questions',
  'headline_metric_is_a_bare_count',
  'headline_metric_missing_plain_answers',
  'visual_story_invalid',
  'visual_story_missing',
  'hire_no_linked_person',
  'no_confirmed_service_link',
  'outside_case_study_internal_only',
] as const;

/** One reason a publish was refused. `message` names the FIELD and its VALUE. */
export interface CaseStudyPublishBlocker {
  readonly code: CaseStudyPublishBlockerCode;
  /** Dotted path into the snapshot content, or a column name on the record. */
  readonly field: string;
  readonly message: string;
  readonly remedy: string;
}

/** The `case_studies` columns the gate reads. Never the model instance itself. */
export interface CaseStudyPublishRecord {
  readonly id: string;
  readonly status: CaseStudyStatus;
  readonly organizationIdentityMode: CaseStudyOrganizationIdentityMode;
  readonly organizationNamingConsent: boolean;
  readonly organizationDisplayName?: string | null;
  readonly builderIdentityMode: CaseStudyBuilderIdentityMode;
  readonly builderNamingConsent: boolean;
  readonly archivedAt?: string | null;
  /** `case_studies.source_type`; classified inside/outside by caseStudySourceKind. Absent reads as inside. */
  readonly sourceType?: string | null;
}

/** The `case_study_snapshots` row under consideration. `null` means none exists. */
export interface CaseStudyPublishSnapshot {
  readonly id: string;
  readonly version: number;
  readonly status: CaseStudySnapshotStatus;
  readonly approvedBy?: string | null;
  readonly approvedAt?: string | null;
  readonly content: CaseStudySnapshotContent;
  readonly provenance?: CaseStudyProvenance;
}

export interface CaseStudyPublishGateInput {
  readonly surfaceKey: CaseStudySurfaceKey;
  readonly caseStudy: CaseStudyPublishRecord;
  readonly snapshot: CaseStudyPublishSnapshot | null;
  /**
   * The student project's computed maturity and open questions, when the
   * record is about one: linked by `project_id`, or found through a cited
   * repository that belongs to a student project (`via`). Absent or null means
   * "nothing to judge" and the maturity rule is a no-op, so every record about
   * our own work is untouched.
   */
  readonly foundation?: {
    readonly maturity: string;
    readonly openQuestions: number;
    readonly via?: 'linked' | 'repository';
  } | null;
  /**
   * Who this record resolves to, for surface `hire` only: the publication service runs the
   * reverse link (case study -> project -> enrollment -> portfolio page) before calling the
   * gate. ABSENT OR NULL ON `hire` MEANS NOBODY, and the gate refuses - a lookup that failed
   * must not be read as a person found. Ignored on every other surface.
   */
  readonly hire?: {
    readonly linkedPeople: number;
  } | null;
  /**
   * How many CONFIRMED links this record has into the gov tenant's services, resolved by the publication service
   * (caseStudyServiceLinkGateFacts). ABSENT, NULL OR ZERO REFUSES on every surface: a lookup that failed is not a
   * link found. Pending suggestions are not counted.
   */
  readonly serviceLinks?: {
    readonly confirmedCount: number;
  } | null;
}

export interface CaseStudyPublishDecision {
  readonly allowed: boolean;
  readonly blockers: readonly CaseStudyPublishBlocker[];
  /** Deduplicated codes, in rule order. The log line carries these, not messages. */
  readonly codes: readonly CaseStudyPublishBlockerCode[];
  /** Spec §15's block, ready to hand to an admin. Empty when allowed. */
  readonly summary: string;
}
