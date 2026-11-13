/**
 * caseStudySourceKind - is a case study INSIDE evidence (our own build) or OUTSIDE evidence (a document)?
 *
 * `case_studies.source_type` is the discriminator; no new column. This file is the ONE place the mapping lives,
 * so the publish gate, the intake queue and (later) the evidence summary cannot disagree about it.
 *
 *   inside  - built and evidenced in our own repos / platform (`project`, `repo_collection`, ...). Claims can be
 *             traced to repo evidence.
 *   outside - turned into a record from an outside document (an uploaded PDF/DOCX/PPTX, or a file imported from
 *             the Drive case-study library). Every claim on it is a CLAIM made by the document, not verified
 *             evidence. Ali, 2026-11-13: outside case studies are INTERNAL ONLY - Gov proposals, never the website.
 *
 * UNKNOWN VALUES MAP TO `inside` AND LOG A WARNING; THIS NEVER THROWS (package spec 1A). That direction is safe
 * for the gate because `inside` is the stricter-evidence class for counting, while the outside-only publish
 * blocker is keyed to the two explicit outside values - an unknown type is never silently treated as publishable
 * outside evidence, and a typo is visible in the logs.
 *
 * PURE except for the warning line. No DB, no model import.
 */

export type CaseStudySourceKind = 'inside' | 'outside';

/** The two source_type values written by the outside intake. Uploads vs Drive imports. */
export const OUTSIDE_SOURCE_TYPES = ['external_document', 'external_drive'] as const;
export type OutsideSourceType = typeof OUTSIDE_SOURCE_TYPES[number];

/**
 * Every source_type value known to be inside evidence. Listed explicitly (rather than "anything not outside") so
 * that only a genuinely unknown value produces the warning. `project` is what `createCaseStudyFromProject`
 * writes; `platform_project`, `manual` and `engagement` are the other values the CaseStudy model documents.
 */
export const INSIDE_SOURCE_TYPES = ['project', 'platform_project', 'repo_collection', 'manual', 'engagement'] as const;

const MAP: Readonly<Record<string, CaseStudySourceKind>> = Object.freeze({
  ...Object.fromEntries(INSIDE_SOURCE_TYPES.map((t) => [t, 'inside' as const])),
  ...Object.fromEntries(OUTSIDE_SOURCE_TYPES.map((t) => [t, 'outside' as const])),
});

/** True only for the explicit outside values. */
export function isOutsideSourceType(sourceType: unknown): sourceType is OutsideSourceType {
  return typeof sourceType === 'string' && (OUTSIDE_SOURCE_TYPES as readonly string[]).includes(sourceType);
}

/**
 * Classify a `case_studies.source_type`. Total: any input returns a kind. An unknown value (including null,
 * empty, or a non-string) returns `inside` and writes ONE structured warning line.
 */
export function classifyCaseStudySource(sourceType: unknown): CaseStudySourceKind {
  if (typeof sourceType === 'string' && Object.prototype.hasOwnProperty.call(MAP, sourceType)) {
    return MAP[sourceType];
  }
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
    event: 'case_study_source_kind_unknown', outcome: 'partial', error_class: 'UnknownSourceType',
    context: { source_type: typeof sourceType === 'string' ? sourceType.slice(0, 60) : typeof sourceType, defaulted_to: 'inside' },
  }));
  return 'inside';
}
