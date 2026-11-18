/**
 * W10: the departments a case study can be tagged with, and how a reader says them.
 *
 * The slugs are the server's closed vocabulary (backend caseStudyDepartments.ts); the labels are
 * the words the public site already uses on the home department band (DepartmentMap.tsx) and the
 * header Proof menu. One file, so the /proof filter, the header menu and the admin picker print the
 * same words. The generic facet humaniser would render `it-data` as "It Data" and `hr` as "Hr".
 */
export const CASE_STUDY_DEPARTMENTS: readonly { readonly slug: string; readonly label: string }[] = [
  { slug: 'finance', label: 'Finance' },
  { slug: 'operations', label: 'Operations' },
  { slug: 'customer-service', label: 'Customer service' },
  { slug: 'sales', label: 'Sales' },
  { slug: 'marketing', label: 'Marketing' },
  { slug: 'hr', label: 'HR' },
  { slug: 'it-data', label: 'IT & Data' },
];

const LABEL = new Map(CASE_STUDY_DEPARTMENTS.map((d) => [d.slug, d.label]));

/** The reader's word for a department slug; an unknown slug is shown as given. */
export const departmentLabel = (slug: string): string => LABEL.get(slug) ?? slug;
