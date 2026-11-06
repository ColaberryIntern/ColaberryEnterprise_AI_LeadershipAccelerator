/**
 * hireTalentIndex - the listing predicate (SPEC §1), computed once, for many people.
 *
 *   listed(person) := page.status = 'published' AND page.visibility = 'public'
 *                     AND EXISTS a case study linked to one of their projects that is
 *                     published on surface `hire` and passes isCandidatePubliclyVisible.
 *
 * `reachable` is the same predicate with visibility IN ('public','unlisted'); it decides
 * whether /talent/<slug>/ renders at all.
 *
 * ONE GATE, NOT A SECOND COPY. The link rule is `queryLinkedCaseStudyRows` (the portfolio's
 * own union query, by project_id OR by repository); the visibility rule is the Case Study
 * OS's `loadSurfacePublications` + `isCandidatePubliclyVisible`. Both are CALLED here.
 * Neither is restated.
 *
 * NO N+1. Pages are selected once, their approved project ids batched into ONE link query,
 * and the hire publications loaded ONCE; the intersection happens in memory. The public
 * projection of each case study is pure.
 *
 * FAILURE-FIRST. The three reads propagate a database failure to the route (500). One
 * person whose case studies cannot be projected is DROPPED, never the page.
 */
import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import { queryLinkedCaseStudyRows } from '../career/portfolioCaseStudyLinks';
import { loadSurfacePublications, type PublishedCaseStudyRecord } from '../caseStudy/caseStudyPublicStore';
import { isCandidatePubliclyVisible } from '../caseStudy/caseStudyFilterService';
import { projectPublicDetail } from '../caseStudy/caseStudyPublicProjection';
import { toHireCaseStudyCard, type HireCaseStudyCard, type HirePageFacts } from './hireTalentProjection';

export const HIRE_SURFACE = 'hire' as const;

/** A career_portfolio_pages row as this module reads it. */
export interface HirePageRow {
  readonly enrollment_id: string;
  readonly slug: string;
  readonly status: string;
  readonly visibility: string;
  readonly approved_identity: unknown;
  readonly availability_status: string | null;
  readonly availability_label: string | null;
  readonly hire_spotlight: boolean | null;
}

export interface HireIndexEntry {
  readonly page: HirePageRow;
  readonly facts: HirePageFacts;
  readonly cases: readonly HireCaseStudyCard[];
}

/**
 * The project ids a page links from. The PUBLIC portfolio reads the APPROVED project set
 * (learner-authored text is frozen at review), so the listing must read the same set:
 * otherwise a person could be listed for a project their public page does not show.
 */
export function approvedProjectIds(approvedIdentity: unknown): string[] {
  const a = approvedIdentity as { projects?: unknown } | null;
  const projects = a && typeof a === 'object' && Array.isArray(a.projects) ? a.projects : [];
  return projects
    .map((p: unknown) => {
      const id = (p as { id?: unknown } | null)?.id;
      return typeof id === 'string' ? id : '';
    })
    .filter((id: string) => /^[0-9a-f-]{36}$/i.test(id));
}

const PAGE_COLUMNS = `enrollment_id, slug, status, visibility, approved_identity,
       availability_status, availability_label, hire_spotlight`;

/** Pages that could be listed (published, and public or unlisted). One query. */
export async function loadCandidatePages(
  visibilities: readonly ('public' | 'unlisted')[],
  slug?: string,
): Promise<HirePageRow[]> {
  const [rows] = await sequelize.query(
    `SELECT ${PAGE_COLUMNS}
       FROM career_portfolio_pages
      WHERE status = 'published' AND visibility = ANY($1::text[])
        ${slug ? 'AND LOWER(slug) = LOWER($2)' : ''}
      ORDER BY slug ASC`,
    { bind: slug ? [visibilities as string[], slug] : [visibilities as string[]] },
  );
  return Array.isArray(rows) ? (rows as HirePageRow[]) : [];
}

/** The hire publications that pass the gate, by slug. Loaded once per request. */
export async function loadVisibleHireRecords(): Promise<Map<string, PublishedCaseStudyRecord>> {
  const records = await loadSurfacePublications(HIRE_SURFACE);
  const bySlug = new Map<string, PublishedCaseStudyRecord>();
  for (const r of records) {
    if (isCandidatePubliclyVisible(r.candidate, HIRE_SURFACE)) bySlug.set(r.candidate.slug, r);
  }
  return bySlug;
}

/** A visible hire record, as the public sees it. Pure over the record. */
export function cardForRecord(record: PublishedCaseStudyRecord): HireCaseStudyCard {
  const detail = projectPublicDetail({
    surfaceKey: HIRE_SURFACE,
    slug: record.candidate.slug,
    content: record.content,
    publication: record.publication,
    canonicalBaseUrl: env.publicAppUrl,
  });
  return toHireCaseStudyCard(detail, { featured: record.publication.featured, publishedAt: record.publication.publishedAt });
}

/**
 * Intersect pages, links and visible records. Pure: every input is already loaded.
 * A page with no visible linked hire record is absent from the result - that is the gate.
 */
export function buildHireIndex(
  pages: readonly HirePageRow[],
  links: readonly { project_id?: unknown; slug?: unknown }[],
  visible: ReadonlyMap<string, PublishedCaseStudyRecord>,
  project: (r: PublishedCaseStudyRecord) => HireCaseStudyCard = cardForRecord,
  onDrop: (slug: string, err: unknown) => void = () => undefined,
): HireIndexEntry[] {
  const slugsByProject = new Map<string, Set<string>>();
  for (const l of links) {
    const pid = typeof l?.project_id === 'string' ? l.project_id : '';
    const slug = typeof l?.slug === 'string' ? l.slug : '';
    if (!pid || !slug || !visible.has(slug)) continue;
    if (!slugsByProject.has(pid)) slugsByProject.set(pid, new Set());
    slugsByProject.get(pid)!.add(slug);
  }
  const out: HireIndexEntry[] = [];
  for (const page of pages) {
    const slugs = new Set<string>();
    for (const pid of approvedProjectIds(page.approved_identity)) {
      for (const s of slugsByProject.get(pid) ?? []) slugs.add(s);
    }
    if (!slugs.size) continue;
    try {
      const cases = [...slugs].sort().map((s) => project(visible.get(s)!));
      out.push({
        page,
        facts: {
          slug: page.slug,
          availabilityStatus: page.availability_status ?? null,
          availabilityLabel: page.availability_label ?? null,
          hireSpotlight: page.hire_spotlight === true,
        },
        cases,
      });
    } catch (err) {
      onDrop(page.slug, err); // one unprojectable person costs that person, never the page
    }
  }
  return out;
}

function logDrop(slug: string, err: unknown): void {
  const e = err instanceof Error ? err : new Error(String(err));
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
    event: 'hire_talent_person_dropped', outcome: 'partial',
    error_class: e.name || 'Error',
    context: { slug, message: e.message.slice(0, 200) },
  }));
}

/** The production entry point: three reads, then the pure intersection. */
export async function loadHireIndex(
  visibilities: readonly ('public' | 'unlisted')[],
  slug?: string,
): Promise<HireIndexEntry[]> {
  const pages = await loadCandidatePages(visibilities, slug);
  if (!pages.length) return [];
  const projectIds = [...new Set(pages.flatMap((p) => approvedProjectIds(p.approved_identity)))];
  if (!projectIds.length) return [];
  const [links, visible] = await Promise.all([queryLinkedCaseStudyRows(projectIds), loadVisibleHireRecords()]);
  if (!visible.size) return [];
  return buildHireIndex(pages, links, visible, cardForRecord, logDrop);
}
