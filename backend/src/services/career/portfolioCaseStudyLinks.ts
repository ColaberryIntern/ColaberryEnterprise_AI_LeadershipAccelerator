/**
 * portfolioCaseStudyLinks - which of a learner's projects may link to a case study.
 *
 * SPLIT OUT OF `careerPortfolioPageService.ts`, which had reached the 500-line ceiling
 * CLAUDE.md sets. The rule below is the only thing on a public portfolio that can turn a
 * project card into a link to somebody's published writing, so it earns a module and a
 * test of its own rather than sitting inline in a page builder.
 *
 * THE RULE, in one sentence: a project card is clickable only when a case study for that
 * project is ACTUALLY PUBLISHED on the surface being rendered.
 *
 * WHY THAT MATTERS MORE THAN IT LOOKS. Ali, on a learner whose work is not ready:
 * "Farhat's is not ready for public." Her case study exists and it syncs; it is not
 * approved and not published. If EXISTENCE alone lit the card up, her portfolio would
 * point strangers at writing that is not hers to show yet. So existence is not the test.
 * Publication is - and this module never decides that for itself.
 *
 * THE VISIBILITY RULE IS NOT RE-IMPLEMENTED HERE. `loadPublishedRecordBySlug` and
 * `isCandidatePubliclyVisible` are the Case Study OS's own gate; they are CALLED, never
 * copied. A second copy of that rule is how a portfolio ends up linking to a page that
 * 404s, and how a draft goes public because only one of the two copies got updated. They
 * arrive here as an injected `gate`, so the rule is testable without a database.
 *
 * TWO WAYS A CASE STUDY BELONGS TO A PROJECT, and the second is the one that matches
 * reality. `case_studies.project_id` is set only when the record was created FROM a
 * project. Every case study published on this platform so far was created from a repo
 * collection instead, so that column is null on all of them - measured 2026-09-04, 8 of
 * 9 rows, including the one live at /stories/the-ai-proposes-a-verified-human-decides,
 * which is Quincy Nkwain Ninying's and was invisible to a project_id-only join. The
 * repository carries the ownership: the case study's repo matches a `github_connections`
 * row, and that row names the project. Matched case-insensitively, because GitHub owner
 * and name are.
 *
 * FAILURE-FIRST. (1) A case study that cannot be resolved costs its LINK, never the page
 * - the caller catches and renders the portfolio with the card unlinked. (2) No retry:
 * an unresolvable link is an answer, not an outage. (3) Recovery: the card renders
 * unlinked, which is the safe direction for a page carrying a person's name. (4)
 * Handled: no projects, no rows, a row missing either column, a slug with no published
 * record, a record the gate refuses, several rows for one project. NOT handled: the
 * database being unavailable, which propagates to the caller that already classifies
 * connection failures.
 */
import { sequelize } from '../../config/database';

/** The surface a public portfolio renders against. */
export const PORTFOLIO_CASE_STUDY_SURFACE = 'enterprise';

/** One `(project_id, slug)` pair as the union query returns it. Both are unknown on
 *  purpose: this is raw query output, not a validated row. */
export interface LinkedCaseStudyRow {
  readonly project_id?: unknown;
  readonly slug?: unknown;
}

/**
 * The Case Study OS's own gate, injected.
 *
 * Typed structurally rather than importing the real signatures, so a test can supply a
 * double without constructing a `PublishedCaseStudyRecord`. The production wiring in
 * `caseStudyLinksForProjects` passes the real functions, so the shapes are checked where
 * it counts.
 */
export interface CaseStudyLinkGate {
  loadPublishedRecordBySlug(slug: string, surfaceKey: any): Promise<{ candidate: any } | null>;
  isCandidatePubliclyVisible(candidate: any, surfaceKey: any): boolean;
}

/** `project_id -> slug`, holding only projects whose case study is publicly readable. */
export type CaseStudyLinksByProject = Record<string, string>;

/**
 * Decide which projects get a drill-in link, given candidate rows and the gate.
 *
 * No database and no clock: everything it needs arrives as an argument, which is what
 * makes the protective rule assertable. The gate is asked about every candidate row and
 * is the ONLY thing that can put an entry in the returned map.
 */
export async function resolveCaseStudyLinks(
  rows: unknown,
  gate: CaseStudyLinkGate,
  surfaceKey: string = PORTFOLIO_CASE_STUDY_SURFACE,
): Promise<CaseStudyLinksByProject> {
  const links: CaseStudyLinksByProject = {};
  if (!Array.isArray(rows)) return links;

  for (const row of rows as LinkedCaseStudyRow[]) {
    const projectId = typeof row?.project_id === 'string' ? row.project_id : '';
    const slug = typeof row?.slug === 'string' ? row.slug : '';
    // A row missing either half links nothing. First published slug per project wins;
    // a project with two case studies gets one link, deterministically the first row.
    if (!projectId || !slug || links[projectId]) continue;

    // eslint-disable-next-line no-await-in-loop -- one lookup per project, bounded by
    // the number of projects on one portfolio, which is a handful.
    const rec = await gate.loadPublishedRecordBySlug(slug, surfaceKey);
    // BOTH checks, not either. `loadPublishedRecordBySlug` finds the publication row for
    // this surface; `isCandidatePubliclyVisible` is what refuses a draft, an unapproved
    // snapshot, an archived record and a record published to a DIFFERENT surface.
    if (rec && gate.isCandidatePubliclyVisible(rec.candidate, surfaceKey)) {
      links[projectId] = slug;
    }
  }
  return links;
}

/**
 * THE ONE DEFINITION of "this case study belongs to this project", as a SQL relation of
 * `(project_id, case_study_id, slug)`. Two routes, exactly:
 *   1. `case_studies.project_id` - the record was created from the project;
 *   2. a repository the record cites matches a `github_connections` row (owner + name,
 *      case-insensitively) and that row names the project.
 *
 * BOTH DIRECTIONS READ THIS STRING. The forward query (a person's projects -> their case
 * studies, which decides who is LISTED on hire.refactored.ai and which portfolio cards
 * link) and the reverse query (a case study -> its projects, which the
 * `hire_no_linked_person` publish rule uses) select from this same relation. Before
 * 2026-11-06 the reverse direction used a different resolver that also counted
 * `case_study_repositories.project_id`, so a record could pass the publish gate on a link
 * the listing would never follow and go live listing nobody. One relation makes the two
 * agree by construction.
 *
 * `archived_at IS NULL` keeps out rows the gate would refuse anyway; it is not itself the
 * visibility rule.
 */
export const CASE_STUDY_PROJECT_LINKS_SQL = `
       SELECT c.project_id, c.id AS case_study_id, c.slug
         FROM case_studies c
        WHERE c.project_id IS NOT NULL AND c.archived_at IS NULL
       UNION
       SELECT g.project_id, c.id AS case_study_id, c.slug
         FROM github_connections g
         JOIN case_study_repositories r
           ON lower(r.repo_owner) = lower(g.repo_owner)
          AND lower(r.repo_name)  = lower(g.repo_name)
         JOIN case_study_repo_collections col ON col.id = r.collection_id
         JOIN case_studies c ON c.id = col.case_study_id
        WHERE g.project_id IS NOT NULL AND c.archived_at IS NULL`;

/**
 * Forward: every case study reachable from these projects. Returns CANDIDATES, not
 * permissions - the gate decides what may be shown.
 */
export async function queryLinkedCaseStudyRows(
  projectIds: readonly string[],
): Promise<LinkedCaseStudyRow[]> {
  if (!projectIds.length) return [];
  const [rows] = await sequelize.query(
    `SELECT DISTINCT project_id, slug FROM (${CASE_STUDY_PROJECT_LINKS_SQL}
     ) linked
     WHERE linked.project_id = ANY($1::uuid[])`,
    { bind: [projectIds as string[]] },
  );
  // Raw query output, typed at the call site (CLAUDE.md: raw SQL results are typed where read).
  return Array.isArray(rows) ? (rows as LinkedCaseStudyRow[]) : [];
}

/** Reverse: the projects this case study belongs to, by the same relation. Sorted. */
export async function queryProjectIdsForCaseStudy(caseStudyId: string): Promise<string[]> {
  const [rows] = await sequelize.query(
    `SELECT DISTINCT project_id FROM (${CASE_STUDY_PROJECT_LINKS_SQL}
     ) linked
     WHERE linked.case_study_id = $1
     ORDER BY project_id`,
    { bind: [caseStudyId] },
  );
  return (Array.isArray(rows) ? (rows as { project_id?: unknown }[]) : [])
    .map((r) => (typeof r?.project_id === 'string' ? r.project_id : ''))
    .filter(Boolean);
}

/**
 * Production entry point: read the candidates, then ask the real gate about each.
 *
 * The gate is imported lazily for the same reason the inline version did - it pulls the
 * Case Study public store and filter engine into a request that usually needs neither.
 */
export async function caseStudyLinksForProjects(
  projects: unknown,
  surfaceKey: string = PORTFOLIO_CASE_STUDY_SURFACE,
): Promise<CaseStudyLinksByProject> {
  const projectIds = (Array.isArray(projects) ? projects : [])
    .map((p: any) => p?.id)
    .filter((id: unknown): id is string => typeof id === 'string' && !!id);
  if (!projectIds.length) return {};

  const rows = await queryLinkedCaseStudyRows(projectIds);
  if (!rows.length) return {};

  const [store, filters] = await Promise.all([
    import('../caseStudy/caseStudyPublicStore'),
    import('../caseStudy/caseStudyFilterService'),
  ]);
  return resolveCaseStudyLinks(rows, {
    loadPublishedRecordBySlug: store.loadPublishedRecordBySlug as any,
    isCandidatePubliclyVisible: filters.isCandidatePubliclyVisible as any,
  }, surfaceKey);
}
