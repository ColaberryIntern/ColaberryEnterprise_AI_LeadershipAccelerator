/**
 * Case Study OS — provenance.
 *
 * `case_study_snapshots.provenance` is a JSONB column. Its job is to answer, for
 * any value on a published page, "where did this come from and who is
 * accountable for it?" — which is the difference between a case study and a
 * brochure. Typing it is what lets the admin UI render a provenance panel and
 * what lets the merge step in T009 decide, deterministically, whether an
 * incoming value is allowed to overwrite the one already there.
 *
 * LEAF MODULE: type-only import from `./caseStudy`, nothing else.
 */

import type { CaseStudyVerification, IsoDateTime } from './caseStudy';

/**
 * The seven precedence tiers of spec §9, highest authority first. A later sync
 * may only overwrite a value whose recorded tier is weaker than the incoming
 * one, which is what stops a repo sync from silently eating a human override.
 */
export type CaseStudyProvenanceTier =
  | 'human_override'
  | 'approved_metric_evidence'
  | 'project_facts'
  | 'evidence_or_artifact'
  | 'repo_manifest'
  | 'repo_extraction'
  | 'ai_draft';

/**
 * Ordered strongest → weakest. The INDEX is the precedence: a lower index wins,
 * so the merge rule is `indexOf(incoming) < indexOf(existing)` and there is no
 * second place for the ordering to be written down and disagree.
 */
export const CASE_STUDY_PROVENANCE_PRECEDENCE = [
  'human_override',
  'approved_metric_evidence',
  'project_facts',
  'evidence_or_artifact',
  'repo_manifest',
  'repo_extraction',
  'ai_draft',
] as const;

/**
 * Where a value actually came from, in enough detail for a reviewer to go and
 * look. Discriminated on `kind`, so the fields that matter for a repo extraction
 * (owner, name, commit sha) are required there and absent everywhere else —
 * rather than nine optional fields of which eight are always null.
 */
export type CaseStudyProvenanceOrigin =
  | { readonly kind: 'human'; readonly actor: string; readonly note?: string }
  | { readonly kind: 'case_study_metric'; readonly metricId: string }
  | { readonly kind: 'case_study_evidence'; readonly evidenceId: string }
  | { readonly kind: 'project_field'; readonly projectId: string; readonly fieldName: string }
  | { readonly kind: 'evidence_record'; readonly evidenceRecordId: string }
  | { readonly kind: 'portfolio_artifact'; readonly portfolioArtifactId: string }
  | {
      readonly kind: 'manifest';
      readonly repoOwner: string;
      readonly repoName: string;
      readonly manifestPath: string;
      readonly commitSha?: string;
    }
  | {
      readonly kind: 'repo_extraction';
      readonly repoOwner: string;
      readonly repoName: string;
      /** Required: an extraction without the commit it came from is not evidence. */
      readonly commitSha: string;
      readonly filePath?: string;
    }
  | {
      readonly kind: 'ai_draft';
      readonly model: string;
      readonly promptKey: string;
      /**
       * The extracted facts the draft was permitted to use. Spec §12: AI may only
       * phrase facts it was handed. Recording the inputs is what makes that
       * auditable after the fact rather than a promise.
       */
      readonly factInputs: readonly string[];
    };

export interface CaseStudyProvenanceEntry {
  readonly tier: CaseStudyProvenanceTier;
  readonly origin: CaseStudyProvenanceOrigin;
  readonly recordedAt: IsoDateTime;
  readonly verification?: CaseStudyVerification;
}

/**
 * A dotted path into `CaseStudySnapshotContent` — either a whole section
 * (`architecture`) or one field (`heroMetrics[0].valueDisplay`). Spec §7.4 allows
 * field-level OR section-level provenance; one map expresses both, so a builder
 * never has to choose which of two structures to write into.
 */
export type CaseStudyProvenancePath = string;

/** `case_study_snapshots.provenance`, typed. */
export type CaseStudyProvenance = Readonly<
  Record<CaseStudyProvenancePath, CaseStudyProvenanceEntry>
>;
