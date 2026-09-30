/**
 * caseStudyPublicStore - every database READ the public API makes, and nothing
 * else.
 *
 * WHY IT IS A SEPARATE FILE. Same precedent as `caseStudyPublicationStore.ts`:
 * the read side is kept away from the logic that decides what may be shown, so
 * "the public API cannot write" is a property of the file layout rather than a
 * promise in a comment. THERE IS NO WRITE IN THIS FILE - no `create`, no
 * `update`, no `upsert`, no `destroy`, no transaction. It also keeps
 * `publicCaseStudyRoutes.ts` and the pure filter/projection modules free of
 * model imports, which is what lets their suites run with `DATABASE_URL` unset.
 *
 * PUBLISHED CONTENT COMES FROM THE PIN, NEVER FROM "THE NEWEST".
 * `case_study_publications.published_snapshot_id` is the only route to content
 * here. A sync that wrote a new draft snapshot this morning is invisible until
 * somebody republishes, and a pinned row that is not actually approved
 * (`approved_at` and `approved_by` both set, status not `draft`) is DROPPED
 * rather than rendered - so an unreviewed draft cannot become live by being
 * recent, and cannot become live by being pointed at either.
 *
 * WHAT IS FILTERED WHERE. Only `surface_key` is filtered in SQL. Editorial state
 * (publication status, Case Study status, archive) is evaluated in memory by
 * `isCandidatePubliclyVisible()`, deliberately: a rule enforced only by a WHERE
 * clause is invisible to a unit test whose fake ignores the clause, and this is
 * the rule that decides whether a draft reaches the internet.
 *
 * FAILURE-FIRST. (1) A read failure propagates to the route, which returns a
 * generic 500 and logs an `error_class` only. (2) No retry - a public GET is
 * cheap to repeat and a retry loop here would amplify an outage. (3) Recovery:
 * the caller retries the request. (4) Handled: missing rows, a dangling pin, a
 * malformed JSONB payload, more rows than the cap. Not handled: the database
 * being unavailable.
 */

import { Op } from 'sequelize';
import CaseStudy from '../../models/CaseStudy';
import CaseStudyCollection from '../../models/CaseStudyCollection';
import CaseStudyPublication from '../../models/CaseStudyPublication';
import CaseStudySnapshot from '../../models/CaseStudySnapshot';
import { normalizeFacetList, normalizeFacetSlug } from './caseStudyFilterService';
import { resolveRecordVerification } from './caseStudyPublicProjection';
import type { CaseStudyFilterCandidate } from './caseStudyFilterService';
import type { PublicProjectionPublicationFacts } from './caseStudyPublicProjection';
import type {
  CaseStudyBuiltByType,
  CaseStudyPublicationStatus,
  CaseStudyRepoVisibility,
  CaseStudyRoadmapStatus,
  CaseStudySnapshotContent,
  CaseStudyStatus,
  CaseStudySurfaceKey,
} from '../../types/caseStudy';
import type {
  CaseStudyFilterInput,
  CaseStudySavedCollection,
  CaseStudySortKey,
} from '../../types/caseStudyFilters';
import { isCaseStudySortKey } from '../../types/caseStudyGuards';

/**
 * A hard ceiling on how much a single public request may load. The Enterprise
 * proof library is editorial and will hold tens of records, not thousands; the
 * cap exists so a future bulk import cannot turn `/stories` into an unbounded
 * memory read. If it is ever hit, the fix is a paged SQL query, not a bigger
 * number.
 */
export const MAX_PUBLIC_RECORDS = 500;

/** One published record: what the engine filters on, plus what the page renders. */
export interface PublishedCaseStudyRecord {
  readonly candidate: CaseStudyFilterCandidate;
  readonly content: CaseStudySnapshotContent;
  readonly publication: PublicProjectionPublicationFacts;
}

/* ------------------------------------------------------------- mapping --- */

const iso = (value: unknown): string | null => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * A snapshot counts as approved only with a status that is not `draft` AND both
 * approval stamps present. `superseded` is accepted on purpose: it means "was
 * approved, then a newer one was approved too", and refusing it would 404 a live
 * page the moment a second snapshot is approved. `draft` is refused absolutely.
 */
function isApprovedSnapshot(row: CaseStudySnapshot | undefined): boolean {
  if (!row) return false;
  if (str(row.status) === 'draft') return false;
  return Boolean(row.approved_at) && str(row.approved_by).length > 0;
}

function toCandidate(
  study: CaseStudy,
  publication: CaseStudyPublication,
  content: CaseStudySnapshotContent,
): CaseStudyFilterCandidate {
  const taxonomy = content?.taxonomy;
  const verification = resolveRecordVerification(content);
  return {
    slug: str(study.slug),
    surfaceKey: str(publication.surface_key) as CaseStudySurfaceKey,
    caseStudyStatus: str(study.status) as CaseStudyStatus,
    archived: Boolean(study.archived_at) || str(study.status) === 'archived',
    publicationStatus: str(publication.status) as CaseStudyPublicationStatus,
    hasApprovedSnapshot: true,
    industry: normalizeFacetSlug(taxonomy?.industry ?? study.industry) || null,
    primaryCapability:
      normalizeFacetSlug(taxonomy?.primaryCapability ?? study.primary_capability) || null,
    capabilities: normalizeFacetList(taxonomy?.capabilities),
    stack: normalizeFacetList(taxonomy?.stack),
    programKey: normalizeFacetSlug(taxonomy?.programKey ?? study.program_key) || null,
    builtBy: (taxonomy?.builtByType
      ?? (str(study.built_by_type) || null)) as CaseStudyBuiltByType | null,
    deliverables: normalizeFacetList(taxonomy?.deliverables),
    projectStatus: (taxonomy?.projectStatus ?? null) as CaseStudyRoadmapStatus | null,
    verificationClass: verification.verificationClass,
    verificationMethod: verification.verificationMethod,
    // Visibilities only. No owner, no name, no URL ever enters a candidate.
    repoVisibilities: (Array.isArray(content?.repositories) ? content.repositories : [])
      .map((r) => (str(r?.visibility) || 'unknown') as CaseStudyRepoVisibility),
    featured: publication.featured === true,
    featuredRank: typeof publication.featured_rank === 'number' ? publication.featured_rank : null,
    publishedAt: iso(publication.published_at) ?? iso(publication.created_at),
    updatedAt: iso(publication.updated_at) ?? iso(publication.created_at) ?? '',
  };
}

function toPublicationFacts(row: CaseStudyPublication): PublicProjectionPublicationFacts {
  const published = iso(row.published_at) ?? iso(row.created_at) ?? '';
  return {
    featured: row.featured === true,
    publishedAt: published,
    updatedAt: iso(row.updated_at) ?? published,
    titleOverride: str(row.surface_title_override) || null,
    summaryOverride: str(row.surface_summary_override) || null,
  };
}

function assemble(
  study: CaseStudy | undefined,
  publication: CaseStudyPublication,
  snapshot: CaseStudySnapshot | undefined,
): PublishedCaseStudyRecord | null {
  if (!study || !isApprovedSnapshot(snapshot)) return null;
  const content = (snapshot?.content ?? {}) as unknown as CaseStudySnapshotContent;
  if (!content?.identity) return null;
  const candidate = toCandidate(study, publication, content);
  if (!candidate.slug) return null;
  return { candidate, content, publication: toPublicationFacts(publication) };
}

/* --------------------------------------------------------------- reads --- */

async function hydrate(
  publications: CaseStudyPublication[],
): Promise<PublishedCaseStudyRecord[]> {
  const pinned = publications.filter((p) => str(p.published_snapshot_id).length > 0);
  if (pinned.length === 0) return [];

  const studies = await CaseStudy.findAll({
    where: { id: { [Op.in]: Array.from(new Set(pinned.map((p) => p.case_study_id))) } },
  });
  const snapshots = await CaseStudySnapshot.findAll({
    where: { id: { [Op.in]: Array.from(new Set(pinned.map((p) => String(p.published_snapshot_id)))) } },
  });

  const studyById = new Map<string, CaseStudy>(
    studies.map((s) => [String(s.id), s] as [string, CaseStudy]),
  );
  const snapshotById = new Map<string, CaseStudySnapshot>(
    snapshots.map((s) => [String(s.id), s] as [string, CaseStudySnapshot]),
  );

  const out: PublishedCaseStudyRecord[] = [];
  for (const publication of pinned) {
    const record = assemble(
      studyById.get(String(publication.case_study_id)),
      publication,
      snapshotById.get(String(publication.published_snapshot_id)),
    );
    if (record) out.push(record);
  }
  return out;
}

/**
 * Every publication row on one surface, hydrated through its pin.
 *
 * Editorial state is NOT filtered here - the caller runs
 * `isCandidatePubliclyVisible()` over the result, so the rule that keeps drafts
 * off the internet is exercised by code rather than by a WHERE clause a test
 * fake could ignore.
 */
export async function loadSurfacePublications(
  surfaceKey: CaseStudySurfaceKey,
): Promise<PublishedCaseStudyRecord[]> {
  const publications = await CaseStudyPublication.findAll({
    where: { surface_key: surfaceKey },
    limit: MAX_PUBLIC_RECORDS,
  });
  return hydrate(publications);
}

/**
 * One record by slug, scoped to one surface.
 *
 * Returns `null` for every miss - unknown slug, wrong surface, no publication
 * row, a pin that resolves to an unapproved snapshot - so the caller cannot
 * accidentally render a different status code for a different reason. That
 * uniformity is what makes "published but not on this surface" unprobeable.
 */
export async function loadPublishedRecordBySlug(
  slug: string, surfaceKey: CaseStudySurfaceKey,
): Promise<PublishedCaseStudyRecord | null> {
  const study = await CaseStudy.findOne({ where: { slug } });
  if (!study) return null;
  const publications = await CaseStudyPublication.findAll({
    where: { case_study_id: study.id, surface_key: surfaceKey },
    limit: 1,
  });
  const records = await hydrate(publications);
  return records[0] ?? null;
}

/* ---------------------------------------------------------- collections --- */

const stringList = (value: unknown): string[] | undefined => {
  if (typeof value === 'string') return value.split(',').map((s) => s.trim()).filter(Boolean);
  if (!Array.isArray(value)) return undefined;
  const out = value.map(str).filter(Boolean);
  return out.length > 0 ? out : undefined;
};

/**
 * `case_study_collections.filter_config` is JSONB, so it is read key by known
 * key. An unrecognised member of an enum axis is kept as a string and simply
 * never matches a candidate - a curated path with a typo returns nothing, which
 * is visibly wrong, rather than everything, which is silently wrong.
 */
export function toFilterInput(raw: unknown): CaseStudyFilterInput {
  const cfg = (raw ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]): unknown => keys.map((k) => cfg[k]).find((v) => v !== undefined);
  const filters: Record<string, unknown> = {};
  const set = (key: string, value: unknown): void => {
    if (value !== undefined) filters[key] = value;
  };
  set('capability', stringList(pick('capability', 'capabilities')));
  set('industry', stringList(pick('industry', 'industries')));
  set('stack', stringList(pick('stack')));
  set('program', stringList(pick('program', 'programs')));
  set('deliverable', stringList(pick('deliverable', 'deliverables')));
  set('builtBy', stringList(pick('builtBy', 'built_by')));
  set('verificationClass', stringList(pick('verificationClass', 'verification_class', 'verification')));
  set('verificationMethod', stringList(pick('verificationMethod', 'verification_method', 'method')));
  set('projectStatus', stringList(pick('projectStatus', 'project_status', 'status')));
  const featured = pick('featured');
  if (typeof featured === 'boolean') set('featured', featured);
  // Double assertion: the JSONB has been read key by known key above, but a
  // `Record<string, unknown>` is not structurally comparable to the filter
  // interface, and widening the interface to accept `unknown` would defeat it.
  return filters as unknown as CaseStudyFilterInput;
}

/** A published saved collection on this surface, or `null`. Never a draft. */
export async function loadPublishedCollection(
  slug: string, surfaceKey: CaseStudySurfaceKey,
): Promise<CaseStudySavedCollection | null> {
  const row = await CaseStudyCollection.findOne({ where: { slug } });
  if (!row) return null;
  if (str(row.surface_key) !== surfaceKey) return null;
  if (str(row.status) !== 'published') return null;
  const sortRaw = (row.sort_config ?? {}) as Record<string, unknown>;
  const sort: CaseStudySortKey = isCaseStudySortKey(sortRaw.sort) ? sortRaw.sort : 'featured';
  return {
    slug: str(row.slug),
    surfaceKey,
    title: str(row.title),
    description: str(row.description) || null,
    filters: toFilterInput(row.filter_config),
    sort,
    status: 'published',
  };
}
