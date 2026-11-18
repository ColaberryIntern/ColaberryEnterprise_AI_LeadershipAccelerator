/**
 * W10 (approved by Ali 2026-11-16; "We need to label our dept", 2026-11-17): the departments a case
 * study can be tagged with. One closed vocabulary, the six departments the public site draws on
 * the home page band (frontend DepartmentMap.tsx) and the header Proof menu (navMenus.ts), as
 * facet slugs. A study can touch several.
 *
 * MARKETING (Ali, 2026-11-18, for the Open House funnel case study) is the seventh. It is not on the
 * home page band, which keeps its six; it reaches the /proof filter and the header Proof menu the
 * moment a published study carries it, because both are built from the counted facets.
 *
 * WHERE THE TAG LIVES. In the snapshot content, `taxonomy.departments`, beside `taxonomy.industry`:
 * the public site reads only the frozen, approved snapshot, so a tag that lived on the record alone
 * would never reach a published page. It is written through the existing human-override path, so no
 * migration and no live record changes until someone tags a study and it is republished.
 */
export const CASE_STUDY_DEPARTMENTS = ['finance', 'operations', 'customer-service', 'sales', 'marketing', 'hr', 'it-data'] as const;
export type CaseStudyDepartment = (typeof CASE_STUDY_DEPARTMENTS)[number];

export const DEPARTMENTS_OVERRIDE_PATH = 'taxonomy.departments';

const KNOWN: ReadonlySet<string> = new Set(CASE_STUDY_DEPARTMENTS);

/**
 * The reason a departments override value is refused, or null when it is a valid list: an array of
 * known slugs, no repeats. An empty array is valid (it clears the tag).
 */
export function departmentsOverrideProblem(value: unknown): string | null {
  if (!Array.isArray(value)) return 'departments must be a list';
  const unknown = value.filter((v) => typeof v !== 'string' || !KNOWN.has(v));
  if (unknown.length > 0) return `unknown department(s): ${unknown.map(String).join(', ')}; allowed: ${CASE_STUDY_DEPARTMENTS.join(', ')}`;
  if (new Set(value).size !== value.length) return 'departments repeat';
  return null;
}
