import type { Blockers } from './caseStudyPublishRules';
import type { CaseStudyPublishGateInput } from './caseStudyPublishVocabulary';

/**
 * caseStudyPublishHireRule - a hire record must resolve to a PERSON. PURE.
 *
 * hire.refactored.ai is a directory of people, and a person is listed only because a
 * case study about a project THEY built was published there (PROMPT §1.1). A record
 * published to `hire` that links to nobody would be a live publication row that puts no
 * one in the directory - "a record marked live that nobody can read", the exact state
 * `PUBLISHABLE_SURFACE_KEYS` exists to prevent, arriving by a different door.
 *
 * WHO "A PERSON" IS. Somebody with a career portfolio page, reached by the reverse of the
 * portfolio's own link rule: the record's `project_id`, or a repository it cites that
 * belongs to a student project (`caseStudyProjectResolution.ts`), then that project's
 * enrollment, then the enrollment's portfolio page. The page need not be public yet:
 * whether the person APPEARS is decided at read time by the portfolio's visibility, and
 * refusing to publish until it is public would make the publish order matter.
 *
 * FAILS CLOSED. The input carries `hire.linkedPeople` resolved by the publication
 * service. Absent, null or zero all refuse: a lookup that threw is not a person found.
 * A no-op on every surface other than `hire`, so the library it was added to is untouched.
 */
export const HIRE_NO_LINKED_PERSON_REMEDY =
  "link the case study's repository to the builder's project (github_connections) "
  + 'or set case_studies.project_id';

export function ruleHireLinkedPerson(input: CaseStudyPublishGateInput, b: Blockers): void {
  if (input.surfaceKey !== 'hire') return;
  const people = input.hire?.linkedPeople ?? 0;
  if (people > 0) return;
  b.add(
    'hire_no_linked_person',
    'case_studies.project_id',
    'no person is linked to this case study, so publishing it to Hire would list nobody',
    HIRE_NO_LINKED_PERSON_REMEDY,
  );
}
