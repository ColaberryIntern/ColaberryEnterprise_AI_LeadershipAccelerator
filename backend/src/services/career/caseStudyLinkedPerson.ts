/**
 * caseStudyLinkedPerson - who a case study is ABOUT: the reverse of the portfolio link.
 *
 * `portfolioCaseStudyLinks.ts` answers "which case study does this person's project link
 * to?". hire.refactored.ai also needs the opposite question - "whose project is this case
 * study?" - for the `hire_no_linked_person` publish rule, the admin's person-first
 * preview, and the "Built by" chip on a hire case study. This module answers it, and it is
 * the only place that does.
 *
 * THE SAME TWO ROUTES AS THE FORWARD RULE, never a third. A case study belongs to a
 * project by `case_studies.project_id`, or through a repository it cites
 * (`resolveProjectsThroughRepositories`, which covers `case_study_repositories.project_id`
 * and a matching `github_connections` row, case-insensitively). That resolver is CALLED,
 * not copied. Then a project belongs to an enrollment, and an enrollment has at most one
 * portfolio page (`career_portfolio_pages_enrollment_unique`).
 *
 * WHAT IT RETURNS IS IDENTITY, NOT PERMISSION. Every linked page comes back whatever its
 * status or visibility; the caller decides what may be shown. The hire directory and the
 * hire portfolio route apply `publicViewDecision` themselves.
 *
 * FAILURE-FIRST. (1) A database failure propagates: each caller has a different safe
 * answer (the publish gate fails closed, the preview shows the refusal band). (2) No
 * retry. (3) Handled: no project, an archived project, a project with no portfolio page,
 * several projects for one record (deduplicated, deterministic order). NOT handled: a
 * person whose page was deleted mid-request, which reads as no person.
 */
import { sequelize } from '../../config/database';
import { resolveProjectsThroughRepositories } from '../caseStudy/caseStudyProjectResolution';

/** One portfolio page a case study resolves to. */
export interface LinkedPersonPage {
  readonly enrollmentId: string;
  readonly portfolioSlug: string;
  readonly status: string;
  readonly visibility: string;
}

/** The record fields the reverse link reads. Structural, so a model instance fits. */
export interface LinkedPersonRecord {
  readonly id: string;
  readonly project_id?: string | null;
}

/**
 * The project ids a case study is about, by either route, deduplicated and sorted so the
 * answer does not depend on row order.
 */
export async function projectIdsForCaseStudy(record: LinkedPersonRecord): Promise<string[]> {
  const ids = new Set<string>();
  if (record.project_id) ids.add(String(record.project_id));
  for (const id of await resolveProjectsThroughRepositories(record.id)) ids.add(id);
  return [...ids].sort();
}

/**
 * Normalise raw query rows into pages. Pure: a row missing an enrollment id or a slug is
 * dropped rather than trusted, and one enrollment appears once.
 */
export function toLinkedPersonPages(rows: unknown): LinkedPersonPage[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const pages: LinkedPersonPage[] = [];
  for (const r of rows as Array<Record<string, unknown>>) {
    const enrollmentId = typeof r?.enrollment_id === 'string' ? r.enrollment_id : '';
    const portfolioSlug = typeof r?.slug === 'string' ? r.slug : '';
    if (!enrollmentId || !portfolioSlug || seen.has(enrollmentId)) continue;
    seen.add(enrollmentId);
    pages.push({
      enrollmentId,
      portfolioSlug,
      status: typeof r.status === 'string' ? r.status : '',
      visibility: typeof r.visibility === 'string' ? r.visibility : '',
    });
  }
  return pages;
}

/** Every portfolio page this case study resolves to, in a stable order. */
export async function linkedPeopleForCaseStudy(
  record: LinkedPersonRecord,
): Promise<LinkedPersonPage[]> {
  const projectIds = await projectIdsForCaseStudy(record);
  if (!projectIds.length) return [];
  const [rows] = await sequelize.query(
    `SELECT DISTINCT pg.enrollment_id, pg.slug, pg.status, pg.visibility
       FROM projects p
       JOIN career_portfolio_pages pg ON pg.enrollment_id = p.enrollment_id
      WHERE p.id = ANY($1::uuid[]) AND p.archived_at IS NULL
      ORDER BY pg.slug ASC`,
    { bind: [projectIds] },
  );
  return toLinkedPersonPages(rows);
}

/**
 * The publish gate's `hire` fact. `null` for every surface but `hire`, so the rule is a
 * no-op there and no query runs. On `hire`, a lookup that throws is logged and answered
 * with ZERO people, so the gate refuses rather than publishing an unverifiable listing.
 */
export async function hireGateFacts(
  record: LinkedPersonRecord,
  surfaceKey: string,
): Promise<{ linkedPeople: number } | null> {
  if (surfaceKey !== 'hire') return null;
  try {
    return { linkedPeople: (await linkedPeopleForCaseStudy(record)).length };
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
      event: 'case_study_hire_person_read_failed', outcome: 'failure',
      error_class: err?.name || 'Error',
      context: { case_study_id: record.id, message: String(err?.message || '').slice(0, 200) },
    }));
    return { linkedPeople: 0 };
  }
}
