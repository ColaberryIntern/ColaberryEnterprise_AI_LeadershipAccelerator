/**
 * caseStudyFilterService - the ONE canonical filter/collection engine (spec §31).
 *
 * WHY ONE ENGINE. Spec §31 requires the public index, the admin preview, saved
 * collections and the future Training / AI Flotation renderers to share a single
 * filter implementation. The moment the admin preview owns a second predicate,
 * the preview stops predicting what the public page will show, which is the
 * specific way preview features turn into lies. So this module holds the
 * predicate, the sorts, the pagination and the facet counts, and every caller
 * passes its own candidates in.
 *
 * SURFACE IS A PARAMETER, NEVER A CONSTANT. Nothing here hardcodes
 * `'enterprise'`. `isCandidatePubliclyVisible()` takes the surface it is
 * resolving for, and `caseStudySurfaceProfiles.ts` carries all four keys. Adding
 * the Training renderer is a caller passing a different key, not an edit here.
 *
 * PURE. No model import, no Express, no `fetch`, no clock beyond what the caller
 * supplies. It cannot reach a database or GitHub, which is what makes "a public
 * read never calls GitHub" a property of the file layout rather than a promise.
 *
 * FAILURE-FIRST. (1) A malformed candidate cannot throw: every field is read
 * defensively and an unrecognised value simply fails to match, so a bad row is
 * excluded rather than crashing an index page. (2) No retry - there is no I/O.
 * (3) Recovery: the caller fixes the row. (4) Handled: missing arrays, unknown
 * facet spellings, an out-of-range page, an unknown surface. Not handled:
 * nothing, because nothing here can fail.
 */

import { assertNever } from '../../types/caseStudyGuards';
import type {
  CaseStudyBuiltByType,
  CaseStudyPublicationStatus,
  CaseStudyRepoVisibility,
  CaseStudyRoadmapStatus,
  CaseStudyStatus,
  CaseStudySurfaceKey,
  CaseStudyVerificationClass,
  CaseStudyVerificationMethod,
  IsoDateTime,
} from '../../types/caseStudy';
import type {
  CaseStudyFilterInput,
  CaseStudyPagedResult,
  CaseStudyQueryInput,
  CaseStudySortKey,
} from '../../types/caseStudyFilters';
import type {
  PublicCaseStudyFacet,
  PublicCaseStudyTaxonomyFacets,
  PublicVerificationClass,
} from '../../types/caseStudyPublic';

/* --------------------------------------------------------------- paging --- */

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;

/* ------------------------------------------------------- normalisation --- */

/**
 * The one spelling of a facet. `"Agentic AI"`, `"agentic_ai"` and `"agentic-ai"`
 * all become `agentic-ai`, so a filter written by a human in the admin UI and a
 * facet extracted from a repository manifest cannot become two menu entries that
 * each match half the records. `.` and `+` survive because `node.js` and `c++`
 * are real stack names.
 */
export function normalizeFacetSlug(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, '-')
    .replace(/[^a-z0-9.+-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

const slugSet = (values: readonly unknown[] | undefined | null): Set<string> => {
  const out = new Set<string>();
  if (!Array.isArray(values)) return out;
  for (const v of values) {
    const slug = normalizeFacetSlug(v);
    if (slug) out.add(slug);
  }
  return out;
};

/** Dedupe while preserving first-seen order, so a list is stable across runs. */
export function normalizeFacetList(values: readonly unknown[] | undefined | null): string[] {
  return Array.from(slugSet(values));
}

/* ---------------------------------------------------------- candidates --- */

/**
 * What the engine needs to decide about one record - and nothing more.
 *
 * Deliberately NOT the snapshot: a filter engine that took the whole internal
 * record would be a second place a private repo URL travels through. The only
 * repository information here is a bare visibility list, which carries no
 * identity at all and exists solely so the ADMIN facet can be evaluated.
 */
export interface CaseStudyFilterCandidate {
  readonly slug: string;
  readonly surfaceKey: CaseStudySurfaceKey;
  readonly caseStudyStatus: CaseStudyStatus;
  readonly archived: boolean;
  readonly publicationStatus: CaseStudyPublicationStatus;
  /** The pinned `published_snapshot_id` resolved to an actually-approved row. */
  readonly hasApprovedSnapshot: boolean;
  readonly industry: string | null;
  readonly primaryCapability: string | null;
  readonly capabilities: readonly string[];
  readonly stack: readonly string[];
  readonly programKey: string | null;
  readonly builtBy: CaseStudyBuiltByType | null;
  readonly deliverables: readonly string[];
  readonly projectStatus: CaseStudyRoadmapStatus | null;
  readonly verificationClass: CaseStudyVerificationClass;
  readonly verificationMethod: CaseStudyVerificationMethod;
  /** Visibilities only - never an owner, a name or a URL. */
  readonly repoVisibilities: readonly CaseStudyRepoVisibility[];
  readonly featured: boolean;
  readonly featuredRank: number | null;
  readonly publishedAt: IsoDateTime | null;
  readonly updatedAt: IsoDateTime;
}

/* ------------------------------------------------------- surface profiles --- */

/**
 * Re-exported so callers need ONE import site for the engine and the profiles
 * (the arrangement `caseStudyPublicationService.ts` uses for the gate and the
 * store). The profiles themselves are data and live in their own file.
 */
export { CASE_STUDY_SURFACE_PROFILES, getCaseStudySurfaceProfile } from './caseStudySurfaceProfiles';

/* ------------------------------------------------------------- audience --- */

export type CaseStudyFilterAudience = 'public' | 'admin';

/**
 * `repoVisibility` is an ADMIN facet and this is where it dies on a public
 * request. Answering "show me the ones backed by private repositories" leaks the
 * fact itself, one bit at a time, without ever returning a repository. Spec §19
 * lists `repo_visibility` among the query parameters, so the route ACCEPTS and
 * validates it - it is dropped here rather than rejected, because rejecting a
 * documented parameter would break the published contract for the admin preview
 * and the future surfaces that legitimately use it.
 *
 * NOT because rejection would "hide the axis" - it would not, and an earlier
 * version of this comment claimed so falsely. A malformed value still returns
 * 400 from the route, which necessarily reveals that the parameter is known.
 * What matters is that a WELL-FORMED value cannot be used to partition results:
 * `?repo_visibility=private` and `?repo_visibility=public` return byte-identical
 * sets, so the axis cannot be read one bit at a time. Concealment was never the
 * mechanism; non-discrimination is.
 *
 * `collection` is dropped for a different reason: it is a saved filter SET, not
 * a facet, so the caller resolves it to real filters before matching. Leaving it
 * in would silently widen a query to the whole surface, which is the exact
 * "silent full-table scan" this engine must never perform.
 */
export function sanitizeFiltersForAudience(
  filters: CaseStudyFilterInput,
  audience: CaseStudyFilterAudience,
): CaseStudyFilterInput {
  const { repoVisibility, collection, ...rest } = filters;
  if (audience === 'admin') return { ...rest, repoVisibility };
  return rest;
}

/** Later wins per axis; absent keys inherit. Used to layer a query over a preset. */
export function mergeCaseStudyFilters(
  base: CaseStudyFilterInput,
  override: CaseStudyFilterInput,
): CaseStudyFilterInput {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    merged[key] = value;
  }
  // Double assertion for the same reason as `toFilterInput`: the value is built
  // from two already-typed filter inputs, but the accumulator is a plain record.
  return merged as unknown as CaseStudyFilterInput;
}

/* ------------------------------------------------------------ visibility --- */

/**
 * The public gate, and the only place it is written down.
 *
 * Five independent conditions, all of which must hold. Surface equality is one
 * of them, which is why a `training` publication is invisible to `enterprise`
 * even before the route's own surface-scoped read - the isolation is asserted
 * twice, at the query and at the predicate, because a single check is one
 * refactor away from being removed.
 */
export function isCandidatePubliclyVisible(
  candidate: CaseStudyFilterCandidate,
  surfaceKey: CaseStudySurfaceKey,
): boolean {
  if (candidate.surfaceKey !== surfaceKey) return false;
  if (candidate.publicationStatus !== 'published') return false;
  if (!candidate.hasApprovedSnapshot) return false;
  if (candidate.archived) return false;
  return candidate.caseStudyStatus === 'approved' || candidate.caseStudyStatus === 'published';
}

/* ------------------------------------------------------------- matching --- */

const anyOf = (
  wanted: readonly string[] | undefined,
  held: readonly string[],
): boolean => {
  if (!wanted || wanted.length === 0) return true;
  const heldSet = slugSet(held);
  return wanted.some((w) => heldSet.has(normalizeFacetSlug(w)));
};

const oneOf = <T extends string>(
  wanted: readonly T[] | undefined,
  held: T | null,
): boolean => {
  if (!wanted || wanted.length === 0) return true;
  return held !== null && wanted.includes(held);
};

/** OR within an axis, AND across axes. `collection` is never evaluated here. */
export function matchesCaseStudyFilters(
  candidate: CaseStudyFilterCandidate,
  filters: CaseStudyFilterInput,
): boolean {
  if (filters.surface && candidate.surfaceKey !== filters.surface) return false;
  if (!anyOf(filters.capability, [
    ...candidate.capabilities,
    ...(candidate.primaryCapability ? [candidate.primaryCapability] : []),
  ])) return false;
  if (!anyOf(filters.industry, candidate.industry ? [candidate.industry] : [])) return false;
  if (!anyOf(filters.stack, candidate.stack)) return false;
  if (!anyOf(filters.program, candidate.programKey ? [candidate.programKey] : [])) return false;
  if (!anyOf(filters.deliverable, candidate.deliverables)) return false;
  if (!oneOf(filters.builtBy, candidate.builtBy)) return false;
  if (!oneOf(filters.verificationClass, candidate.verificationClass)) return false;
  if (!oneOf(filters.verificationMethod, candidate.verificationMethod)) return false;
  if (!oneOf(filters.projectStatus, candidate.projectStatus)) return false;
  if (filters.repoVisibility && filters.repoVisibility.length > 0) {
    const held = new Set(candidate.repoVisibilities);
    if (!filters.repoVisibility.some((v) => held.has(v))) return false;
  }
  if (typeof filters.featured === 'boolean' && candidate.featured !== filters.featured) {
    return false;
  }
  return true;
}

/* ---------------------------------------------------------------- sorts --- */

const PROOF_RANK: Readonly<Record<CaseStudyVerificationClass, number>> = Object.freeze({
  verified: 3, anonymized: 2, illustrative: 1, pending: 0,
});

const time = (iso: string | null): number => {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
};

/** Ties break on slug, so two runs over the same data return the same order. */
function compare(
  a: CaseStudyFilterCandidate, b: CaseStudyFilterCandidate, sort: CaseStudySortKey,
): number {
  switch (sort) {
    case 'featured': {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      const ra = a.featuredRank ?? Number.MAX_SAFE_INTEGER;
      const rb = b.featuredRank ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return time(b.publishedAt) - time(a.publishedAt) || a.slug.localeCompare(b.slug);
    }
    case 'newest':
      return time(b.publishedAt) - time(a.publishedAt) || a.slug.localeCompare(b.slug);
    case 'strongest-proof': {
      const d = PROOF_RANK[b.verificationClass] - PROOF_RANK[a.verificationClass];
      if (d !== 0) return d;
      return time(b.publishedAt) - time(a.publishedAt) || a.slug.localeCompare(b.slug);
    }
    case 'recently-updated':
      return time(b.updatedAt) - time(a.updatedAt) || a.slug.localeCompare(b.slug);
    default:
      return assertNever(sort, 'CaseStudySortKey');
  }
}

export function sortCaseStudyCandidates<T extends CaseStudyFilterCandidate>(
  candidates: readonly T[], sort: CaseStudySortKey,
): T[] {
  return [...candidates].sort((a, b) => compare(a, b, sort));
}

/* ----------------------------------------------------------- the query --- */

/**
 * Filter, sort, paginate. `page` is 1-based; a page past the end returns an
 * empty array with the true `total`, never a wrapped or clamped page - a UI that
 * asks for page 40 of 3 must be told there is nothing there.
 */
export function runCaseStudyQuery<T extends CaseStudyFilterCandidate>(
  candidates: readonly T[], query: CaseStudyQueryInput,
): CaseStudyPagedResult<T> {
  const limit = Math.min(Math.max(Math.trunc(query.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const page = Math.max(Math.trunc(query.page) || 1, 1);
  const matched = candidates.filter((c) => matchesCaseStudyFilters(c, query.filters));
  const sorted = sortCaseStudyCandidates(matched, query.sort);
  const start = (page - 1) * limit;
  const items = sorted.slice(start, start + limit);
  return { items, page, limit, total: sorted.length, hasMore: start + items.length < sorted.length };
}

/* --------------------------------------------------------------- facets --- */

function countFacets(
  candidates: readonly CaseStudyFilterCandidate[],
  pick: (c: CaseStudyFilterCandidate) => readonly string[],
): PublicCaseStudyFacet[] {
  const counts = new Map<string, number>();
  for (const c of candidates) {
    for (const slug of slugSet(pick(c))) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([slug, count]) => ({ slug, label: slug, count }))
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}

function countKeyed<T extends string>(
  candidates: readonly CaseStudyFilterCandidate[],
  pick: (c: CaseStudyFilterCandidate) => T | null,
): { slug: T; count: number }[] {
  const counts = new Map<T, number>();
  for (const c of candidates) {
    const key = pick(c);
    if (key === null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}

/**
 * `GET /api/public/case-study-taxonomy`. Derived from what is actually
 * published, so an empty database yields empty arrays and the index renders its
 * truthful zero-data state rather than a hardcoded menu matching nothing.
 *
 * `label` is the slug. The renderer owns display copy (spec §32); inventing a
 * title-cased label here would put the same vocabulary in two places.
 */
export function buildCaseStudyTaxonomy(
  candidates: readonly CaseStudyFilterCandidate[],
): PublicCaseStudyTaxonomyFacets {
  return {
    capabilities: countFacets(candidates, (c) => [
      ...c.capabilities, ...(c.primaryCapability ? [c.primaryCapability] : []),
    ]),
    industries: countFacets(candidates, (c) => (c.industry ? [c.industry] : [])),
    stack: countFacets(candidates, (c) => c.stack),
    programs: countFacets(candidates, (c) => (c.programKey ? [c.programKey] : [])),
    builtBy: countKeyed<CaseStudyBuiltByType>(candidates, (c) => c.builtBy),
    verificationClasses: countKeyed<PublicVerificationClass>(candidates, (c) => (
      c.verificationClass === 'pending' ? null : c.verificationClass
    )),
  };
}

/** Spec §22's dynamic ledger. Counts only, computed - never a hardcoded number. */
export interface CaseStudyLedger {
  readonly projects: number;
  readonly verifiedOutcomes: number;
  readonly publicRepositories: number;
  readonly shipped: number;
}

export function buildCaseStudyLedger(
  candidates: readonly CaseStudyFilterCandidate[],
): CaseStudyLedger {
  let verifiedOutcomes = 0;
  let publicRepositories = 0;
  let shipped = 0;
  for (const c of candidates) {
    if (c.verificationClass === 'verified') verifiedOutcomes += 1;
    publicRepositories += c.repoVisibilities.filter((v) => v === 'public').length;
    if (c.projectStatus === 'shipped') shipped += 1;
  }
  return { projects: candidates.length, verifiedOutcomes, publicRepositories, shipped };
}
