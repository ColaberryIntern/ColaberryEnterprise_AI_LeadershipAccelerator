import type { Blockers } from './caseStudyPublishRules';
import type { CaseStudyPublishGateInput } from './caseStudyPublishVocabulary';
import { isOutsideSourceType } from './caseStudySourceKind';

/**
 * caseStudyPublishServiceLinkRule - two Services Upgrade (SV1) rules. PURE.
 *
 * MUST LINK (package spec 1C). A case study is evidence FOR a service; a record that proves nothing in Our Services
 * is sitting unlinked, and Ali's rule is that nothing sits unlinked. So a record with zero CONFIRMED links into the
 * gov tenant's catalog cannot publish, on any surface. Suggested links do not count - a keyword match nobody agreed
 * with is not a link. FAILS CLOSED: `serviceLinks` absent, null or zero all refuse, because a lookup that threw is
 * not a link found (the publication service resolves the count; see caseStudyServiceLinkGateFacts). No override.
 *
 * OUTSIDE = INTERNAL ONLY (Ali, 2026-11-13, decision 2). A case study made from an outside document is a set of
 * CLAIMS from a PDF, not verified build evidence; it may back a Gov proposal but never appear on a published
 * surface. Keyed to the two explicit outside source types, so an unknown `source_type` (which classifies as inside)
 * is not treated as outside, and this rule never depends on the classifier's warning path.
 *
 * Both lines follow the house style: they name the FIELD and its VALUE, then say what closes them.
 */
export const NO_CONFIRMED_SERVICE_LINK_REMEDY =
  'attach this case study to at least one service in Our Services and confirm the link (or propose a new service from it)';
export const OUTSIDE_INTERNAL_ONLY_REMEDY =
  'keep it as internal evidence for Gov proposals; publish an inside case study (from a project or repository) instead';

export function ruleConfirmedServiceLink(input: CaseStudyPublishGateInput, b: Blockers): void {
  const confirmed = input.serviceLinks?.confirmedCount ?? 0;
  if (Number.isFinite(confirmed) && confirmed > 0) return;
  b.add(
    'no_confirmed_service_link',
    'case_study_service_links',
    'no confirmed service link (case_study_service_links has 0 confirmed rows for this case study): attach this case study to at least one service in Our Services',
    NO_CONFIRMED_SERVICE_LINK_REMEDY,
  );
}

export function ruleOutsideInternalOnly(input: CaseStudyPublishGateInput, b: Blockers): void {
  const sourceType = input.caseStudy.sourceType;
  if (!isOutsideSourceType(sourceType)) return;
  b.add(
    'outside_case_study_internal_only',
    'case_studies.source_type',
    `case_studies.source_type is "${sourceType}": outside case studies are internal evidence only and are never published`,
    OUTSIDE_INTERNAL_ONLY_REMEDY,
  );
}
