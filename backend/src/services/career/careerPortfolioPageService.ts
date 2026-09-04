/**
 * careerPortfolioPageService — resolving /u/:slug, and the one rule about who may see it.
 *
 * THE VIEW DECISION LIVES IN EXACTLY ONE PURE FUNCTION. `publicViewDecision` below is
 * the only place that answers "may a stranger see this page?". It is exported and tested
 * on its own so that a second surface — a reviewer preview, an admin tool, an OG-image
 * renderer — cannot quietly grow a more generous idea of "viewable" than the public
 * reader has. Every caller asks it; nobody re-implements it.
 *
 * STATUS AND VISIBILITY ARE INDEPENDENT AXES, deliberately.
 *
 *   status      draft | published      has a human approved this page?
 *   visibility  private | unlisted | public    who did the LEARNER choose to show it to?
 *
 * Both must pass. A published page set back to `private` disappears, and an `unlisted`
 * page that was never approved was never visible in the first place. Collapsing these
 * into one column would make "approved" and "shared" the same act, and they are not:
 * a mentor approves that the work is ready, the learner decides the audience.
 *
 * `unlisted` RETURNS 200 AND ASKS NOT TO BE INDEXED. It is a real page for anyone
 * holding the link — that is the point of sharing one — but `indexable` is false, so the
 * route sends `X-Robots-Tag: noindex`. Only `public` is an opt-in to being findable.
 *
 * A PAGE THAT MAY NOT BE SEEN IS 404, NOT 403. A 403 confirms the slug exists and that
 * someone by that name has a portfolio; a 404 says nothing at all. For a page keyed on a
 * person's name that difference is the whole disclosure.
 *
 * FAILURE-FIRST. (1) A missing profile or a failed record query degrades to a shorter
 * page, never a 500 — the projection is defensive and a portfolio with no records is a
 * legitimate portfolio. (2) No retry: one DB read each, no external calls. (3) Recovery:
 * fix the underlying profile and the next request reflects it, because capabilities are
 * read live. (4) Handled: unknown slug, unapproved page, revoked visibility, missing
 * profile, unreadable records. Not handled: nothing that reaches the caller.
 */

import { sequelize } from '../../config/database';
import { getCareerProfile } from './careerProfileService';
import { projectPublicPortfolio, type PublicPortfolio } from './careerPortfolioPublicProjection';
import {
  readResumeHistory, approvedResumeHistoryOf, EMPTY_RESUME_HISTORY, type ResumeHistory,
} from './resumeHistoryAdapter';

export type PortfolioPageStatus = 'draft' | 'published';
export type PortfolioPageVisibility = 'private' | 'unlisted' | 'public';

export interface PortfolioPageRow {
  enrollment_id: string;
  slug: string;
  status: PortfolioPageStatus;
  visibility: PortfolioPageVisibility;
  approved_identity: unknown;
}

export interface ViewDecision {
  /** May a stranger holding this URL see the page at all? */
  viewable: boolean;
  /** May a search engine index it? Only ever true for an explicit `public` opt-in. */
  indexable: boolean;
}

/**
 * The whole access rule, in one pure function. No I/O, no clock, no request object.
 *
 * Written as a positive allow-list on both axes: an unrecognised status or visibility
 * (a value added next year, a typo, a hand-edited row) is NOT viewable. The safe default
 * for a page carrying a person's name is invisible.
 */
export function publicViewDecision(page: Pick<PortfolioPageRow, 'status' | 'visibility'> | null): ViewDecision {
  if (!page) return { viewable: false, indexable: false };
  const approved = page.status === 'published';
  if (!approved) return { viewable: false, indexable: false };

  switch (page.visibility) {
    case 'public':
      return { viewable: true, indexable: true };
    case 'unlisted':
      return { viewable: true, indexable: false };
    // 'private', and anything unrecognised, falls through to invisible.
    default:
      return { viewable: false, indexable: false };
  }
}

/** Slugs are compared case-insensitively; `/u/Ali` and `/u/ali` are the same address. */
async function findPageBySlug(slug: string): Promise<PortfolioPageRow | null> {
  const [rows] = await sequelize.query(
    `SELECT enrollment_id, slug, status, visibility, approved_identity
       FROM career_portfolio_pages
      WHERE LOWER(slug) = LOWER($1)
      LIMIT 1`,
    { bind: [slug] },
  );
  const row = (rows as any[])[0];
  return row ? (row as PortfolioPageRow) : null;
}

/**
 * The learner's live project rows, shaped for the projection.
 *
 * `share_token`, the score columns and the internal documents are never selected -- the
 * projection would refuse them anyway, and not fetching them means they cannot be logged
 * by accident either.
 */
export async function readLiveProjects(enrollmentId: string, now: Date = new Date()): Promise<any[]> {
  try {
    const [rows] = await sequelize.query(
      // `id` is selected ONLY to join a project to its capstone record below. The
      // projection never publishes it -- it emits the record's slug instead, which is a
      // public address, where the id is an internal key.
      `SELECT id, name, organization_name, industry, primary_business_problem,
              selected_use_case, automation_goal, project_stage,
              github_repo_url, portfolio_url
         FROM projects
        WHERE enrollment_id = $1 AND archived_at IS NULL
        ORDER BY created_at ASC`,
      { bind: [enrollmentId] },
    );
    return rows as any[];
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: now.toISOString(), level: 'warn', service: 'backend',
      event: 'public_portfolio_projects_unavailable', outcome: 'partial',
      error_class: err?.error_class || err?.name || 'Error',
      context: { enrollment_id: enrollmentId },
    }));
    return [];
  }
}

/**
 * The learner-authored fields a human approved, overlaid onto the live profile.
 *
 * This is why `approved_identity` exists. Capabilities and records are read live because
 * the system authored them; a headline is read from the review artifact because the
 * learner authored it and a reviewer signed off on that exact text.
 */
function withApprovedIdentity(profile: any, approved: unknown): any {
  if (!approved || typeof approved !== 'object') return profile;
  const a: any = approved;
  return {
    ...profile,
    identity: {
      ...(profile?.identity ?? {}),
      // Only these two are learner-authored. Everything else stays as the system has it.
      ...(typeof a.title === 'string' ? { title: a.title } : {}),
      ...(typeof a.avatar_data_url === 'string' ? { avatar_data_url: a.avatar_data_url } : {}),
    },
  };
}

/**
 * The approved project set, or `[]`.
 *
 * `[]` and not "read live": a page approved before projects were ever projected has no
 * approved set, and showing unreviewed text would defeat the freeze. The learner asks for
 * review again and their work appears.
 */
function approvedProjectsOf(approved: unknown): any[] {
  const a: any = approved;
  return a && typeof a === 'object' && Array.isArray(a.projects) ? a.projects : [];
}

export interface PublicPortfolioResult {
  portfolio: PublicPortfolio;
  indexable: boolean;
}

/**
 * Resolve a slug to a public payload, or null if it may not be seen.
 *
 * Null covers "no such slug" AND "exists but not viewable" on purpose — see the 404-not-403
 * note above. The caller cannot tell them apart, which is the intent.
 */
/**
 * The SAME payload a stranger would see, for a reviewer deciding on an unpublished page.
 *
 * WHY THIS EXISTS. The reviewer screen shipped with Approve and Ask-for-changes buttons
 * and nothing to look at. Ali: "It's just asking me to give changes but I can't view what
 * I'm supposed to be approving." A review gate where the reviewer cannot see the thing is
 * not a review gate.
 *
 * It bypasses `publicViewDecision` deliberately -- everything awaiting review is by
 * definition unpublished, so the public reader 404s on all of it. It bypasses NOTHING
 * else: the payload is built by the same `projectPublicPortfolio` allow-list, so a
 * reviewer sees exactly what a stranger would and no more. The projection is pure, which
 * is what makes that guarantee real rather than aspirational.
 *
 * The CALLER checks `canReview` before calling this.
 */
export async function getPortfolioPreview(enrollmentId: string, now: Date = new Date()) {
  return { portfolio: await buildPortfolio(enrollmentId, now) };
}

export async function getPublicPortfolioBySlug(
  slug: string,
  now: Date = new Date(),
): Promise<PublicPortfolioResult | null> {
  const page = await findPageBySlug(String(slug || '').trim());
  const decision = publicViewDecision(page);
  if (!page || !decision.viewable) return null;

  return {
    portfolio: await buildPortfolio(
      page.enrollment_id,
      now,
      page.approved_identity,
      approvedProjectsOf(page.approved_identity),
      approvedResumeHistoryOf(page.approved_identity),
    ),
    indexable: decision.indexable,
  };
}

/**
 * Build the public payload for one learner. Shared by the public reader and the reviewer
 * preview so the two can never render different things.
 */
async function buildPortfolio(
  enrollmentId: string,
  now: Date,
  approvedIdentity: unknown = null,
  /** null = read projects LIVE (reviewer preview); an array = the APPROVED set. */
  approvedProjects: unknown[] | null = null,
  /** null = read the resume history LIVE (reviewer preview); a value = the APPROVED one. */
  approvedResume: ResumeHistory | null = null,
): Promise<PublicPortfolio> {
  // A profile that fails to load is a shorter page, not a 500. The projection turns an
  // empty profile into an empty portfolio rather than throwing.
  let profile: unknown = null;
  try {
    profile = await getCareerProfile(enrollmentId);
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: now.toISOString(), level: 'warn', service: 'backend',
      event: 'public_portfolio_profile_unavailable', outcome: 'partial',
      error_class: err?.error_class || err?.name || 'Error',
      context: { enrollment_id: enrollmentId },
    }));
  }

  // ONLY published records. An unpublished record is never passed to the projection,
  // so the projection never has to know about draft work at all.
  let records: unknown = [];
  try {
    const [rows] = await sequelize.query(
      // `descriptor` is selected so the projection can fall back to the document's own
      // first heading when `project_name` is null, rather than printing the slug.
      // `project_id` lets the projection put each write-up on the project it is about,
      // so a reader can drill from the project card into the record. Still filtered to
      // PUBLISHED and non-private, so a draft record can never become a link.
      `SELECT slug, project_id,
              content_json->'system'->>'project_name' AS project_name,
              content_json->'system'->>'descriptor'   AS descriptor,
              published_at
         FROM capstone_records
        WHERE enrollment_id = $1 AND status = 'published' AND visibility <> 'private'
        ORDER BY published_at DESC NULLS LAST`,
      { bind: [enrollmentId] },
    );
    records = rows;
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: now.toISOString(), level: 'warn', service: 'backend',
      event: 'public_portfolio_records_unavailable', outcome: 'partial',
      error_class: err?.error_class || err?.name || 'Error',
      context: { enrollment_id: enrollmentId },
    }));
  }

  // PROJECT TEXT IS LEARNER-AUTHORED, so the public page reads the APPROVED set, not the
  // live one -- otherwise a learner could be approved and then rewrite their business
  // problem into anything. The reviewer preview passes null and gets the live rows,
  // because the live text is exactly what they are being asked to approve.
  let projects = approvedProjects ?? await readLiveProjects(enrollmentId, now);
  // The reviewer previews LIVE, so the hero images resolve now - they are approving
  // the exact images that `decidePortfolioReview` will then freeze. A published page
  // never reaches this branch, so a stranger's page load makes no GitHub calls.
  if (!approvedProjects) {
    try {
      const { withHeroImages } = await import('./portfolioHeroImage');
      projects = await withHeroImages(projects as any[]);
    } catch (err: any) {
      console.warn(JSON.stringify({
        timestamp: now.toISOString(), level: 'warn', service: 'backend',
        event: 'portfolio_hero_image_unavailable', outcome: 'partial',
        error_class: err?.error_class || err?.name || 'Error',
        context: { enrollment_id: enrollmentId },
      }));
    }
  }

  // Repo-proven capability. Read LIVE and never frozen: the system observes it, the
  // learner does not author it, so the same rule as the CAPE band applies -- live where
  // the system is the author.
  let capabilities: unknown[] = [];
  try {
    const { readCapabilitiesFromRepo } = await import('../sbp/capabilityRepoReader');
    const inv = await readCapabilitiesFromRepo(enrollmentId);
    capabilities = inv.entries.filter((e: any) => e.present);
    const { capabilityById } = await import('../sbp/capabilityInventory');
    capabilities = capabilities.map((e: any) => ({ ...e, label: capabilityById(e.id)?.label ?? e.id }));
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: now.toISOString(), level: 'warn', service: 'backend',
      event: 'public_portfolio_capabilities_unavailable', outcome: 'partial',
      error_class: err?.error_class || err?.name || 'Error',
      context: { enrollment_id: enrollmentId },
    }));
  }

  // The resume history. Frozen for a stranger, live for the reviewer who is being asked
  // to approve it -- the same rule the project text follows above.
  let resume: ResumeHistory = approvedResume ?? { ...EMPTY_RESUME_HISTORY };
  if (!approvedResume) {
    try {
      resume = await readResumeHistory(enrollmentId);
    } catch (err: any) {
      console.warn(JSON.stringify({
        timestamp: now.toISOString(), level: 'warn', service: 'backend',
        event: 'public_portfolio_resume_unavailable', outcome: 'partial',
        error_class: err?.error_class || err?.name || 'Error',
        context: { enrollment_id: enrollmentId },
      }));
    }
  }

  // The overview counters. Read LIVE and never frozen, for the same reason the capability
  // band is: the system observes them, the learner does not author them.
  //
  // `evidence_records` is NOT the discredited count. Audited against production on
  // 2026-09-03: 546 rows across deliverable / github_commit / prompt_lab / implementation
  // / instructor_review, with not one consumption event among them. Every row is something
  // the learner did, which is what makes it printable beside their name. The count this
  // page previously refused came from `student_skill_evidence`, where all 8,895 rows are
  // `source='timeline'` - a different table meaning a different thing.
  let evidenceRecords: number | null = null;
  let filesCommitted: number | null = null;
  try {
    const [rows]: any = await sequelize.query(
      `SELECT
         (SELECT COUNT(*)::int FROM evidence_records WHERE enrollment_id = $1) AS evidence,
         (SELECT COALESCE(SUM(file_count), 0)::int FROM github_connections
           WHERE enrollment_id = $1) AS files`,
      { bind: [enrollmentId] },
    );
    const counts = rows?.[0];
    evidenceRecords = typeof counts?.evidence === 'number' && counts.evidence > 0
      ? counts.evidence : null;
    filesCommitted = typeof counts?.files === 'number' && counts.files > 0
      ? counts.files : null;
  } catch (err: any) {
    // A missing counter drops its own tile. It never costs the reader the whole page.
    console.warn(JSON.stringify({
      timestamp: now.toISOString(), level: 'warn', service: 'backend',
      event: 'public_portfolio_counters_unavailable', outcome: 'partial',
      error_class: err?.error_class || err?.name || 'Error',
      context: { enrollment_id: enrollmentId },
    }));
  }

  // The competency bands and the evidence behind them. VALIDATED rows only, and summed
  // from each row's own `competency_weights`, so every score names its artefacts.
  // `jsonb_array_elements` throws on a non-array, so the shape is checked in the WHERE
  // rather than trusted -- one malformed row must not cost the whole page its bands.
  let competencies: unknown[] = [];
  let evidenceBySource: unknown[] = [];
  try {
    const [comp]: any = await sequelize.query(
      `SELECT w->>'domain_id' AS domain, SUM((w->>'weight')::numeric)::int AS score
         FROM evidence_records e, jsonb_array_elements(e.competency_weights) w
        WHERE e.enrollment_id = $1
          AND e.validated = true
          AND jsonb_typeof(e.competency_weights) = 'array'
        GROUP BY 1`,
      { bind: [enrollmentId] },
    );
    competencies = Array.isArray(comp) ? comp : [];
    const [src]: any = await sequelize.query(
      `SELECT source_type, COUNT(*)::int AS count
         FROM evidence_records
        WHERE enrollment_id = $1 AND validated = true
        GROUP BY 1`,
      { bind: [enrollmentId] },
    );
    evidenceBySource = Array.isArray(src) ? src : [];
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: now.toISOString(), level: 'warn', service: 'backend',
      event: 'public_portfolio_competencies_unavailable', outcome: 'partial',
      error_class: err?.error_class || err?.name || 'Error',
      context: { enrollment_id: enrollmentId },
    }));
  }

  // Repository facts for the featured block. Distinct languages, and the number of
  // top-level areas the work is organised across, counted from the stored file tree.
  let featuredRepoUrl: string | null = null;
  let featuredLanguages: number | null = null;
  let featuredTopLevelAreas: number | null = null;
  try {
    const [conns]: any = await sequelize.query(
      `SELECT repo_url, repo_language, file_tree_json
         FROM github_connections WHERE enrollment_id = $1`,
      { bind: [enrollmentId] },
    );
    const rows: any[] = Array.isArray(conns) ? conns : [];
    featuredRepoUrl = rows.find((r) => typeof r?.repo_url === 'string')?.repo_url ?? null;
    const langs = new Set(rows.map((r) => r?.repo_language).filter((l) => typeof l === 'string' && l));
    featuredLanguages = langs.size || null;
    const areas = new Set<string>();
    for (const r of rows) {
      const tree = r?.file_tree_json;
      const paths: unknown[] = Array.isArray(tree) ? tree : (Array.isArray(tree?.paths) ? tree.paths : []);
      for (const p of paths) {
        const s = typeof p === 'string' ? p : (p as any)?.path;
        if (typeof s !== 'string' || !s.includes('/')) continue;
        areas.add(s.split('/')[0]);
      }
    }
    featuredTopLevelAreas = areas.size || null;
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: now.toISOString(), level: 'warn', service: 'backend',
      event: 'public_portfolio_repo_facts_unavailable', outcome: 'partial',
      error_class: err?.error_class || err?.name || 'Error',
      context: { enrollment_id: enrollmentId },
    }));
  }

  // Which projects have a case study a stranger may actually open.
  //
  // THE VISIBILITY RULE IS NOT RE-IMPLEMENTED HERE. `loadPublishedRecordBySlug` and
  // `isCandidatePubliclyVisible` are the Case Study OS's own gate, and they are called
  // rather than copied: a second copy of that rule is how a portfolio ends up linking to
  // a page that 404s. Looked up per project (a handful) rather than by loading every
  // publication on the surface.
  const caseStudyByProject: Record<string, string> = {};
  try {
    const projectIds = (projects as any[])
      .map((p) => p?.id).filter((id): id is string => typeof id === 'string' && !!id);
    if (projectIds.length) {
      const [rows]: any = await sequelize.query(
        `SELECT project_id, slug FROM case_studies
          WHERE project_id = ANY($1::uuid[]) AND archived_at IS NULL`,
        { bind: [projectIds] },
      );
      const [store, filters] = await Promise.all([
        import('../caseStudy/caseStudyPublicStore'),
        import('../caseStudy/caseStudyFilterService'),
      ]);
      for (const row of (Array.isArray(rows) ? rows : [])) {
        if (!row?.slug || !row?.project_id || caseStudyByProject[row.project_id]) continue;
        // eslint-disable-next-line no-await-in-loop -- one lookup per project, bounded.
        const rec = await store.loadPublishedRecordBySlug(row.slug, 'enterprise');
        if (rec && filters.isCandidatePubliclyVisible(rec.candidate, 'enterprise')) {
          caseStudyByProject[row.project_id] = row.slug;
        }
      }
    }
  } catch (err: any) {
    // A case study that cannot be resolved costs its link, never the page.
    console.warn(JSON.stringify({
      timestamp: now.toISOString(), level: 'warn', service: 'backend',
      event: 'public_portfolio_case_study_unavailable', outcome: 'partial',
      error_class: err?.error_class || err?.name || 'Error',
      context: { enrollment_id: enrollmentId },
    }));
  }

  // The About paragraph names the project the record is about, in the learner's own words.
  const firstRecord: any = Array.isArray(records) ? (records as any[])[0] : null;

  return projectPublicPortfolio({
    // On an unapproved page `approvedIdentity` is null, so the reviewer sees the LIVE
    // headline -- which is the text they are being asked to approve.
    profile: withApprovedIdentity(profile, approvedIdentity),
    projects,
    capabilities,
    records,
    resume,
    evidenceRecords,
    filesCommitted,
    projectName: firstRecord?.project_name ?? null,
    projectDescriptor: firstRecord?.descriptor ?? null,
    caseStudyByProject,
    competencies,
    evidenceBySource,
    featuredRepoUrl,
    featuredLanguages,
    featuredTopLevelAreas,
    generatedAt: now.toISOString(),
  });
}
