/**
 * publicCaseStudySchema - runtime validation for `/api/public/case-studies*`.
 *
 * Split out of `publicCaseStudyRoutes.ts` so the route file holds handlers and
 * this one holds the boundary contract, matching `src/schemas/`'s role in
 * `backend/CLAUDE.md`. The dependency runs one way: the route imports this;
 * nothing here imports a route, a service or a model.
 *
 * WHAT IS REJECTED AND WHAT IS NOT.
 *   · Unknown VALUES on a known filter are a 400. Never dropped: a dropped
 *     clause silently widens the query to the whole surface, which is the
 *     "silent full-table scan" this endpoint must never perform.
 *   · Unknown KEYS are ignored. `utm_source`, `gclid` and `fbclid` reach real
 *     marketing traffic, and 400-ing a shared link would be a self-inflicted
 *     outage.
 *   · `verification=pending` is a 400, because `pending` is not publicly
 *     representable at all (`PublicVerificationClass` has no such member).
 *
 * Zod v4: read `error.issues`, never `.errors`.
 */

import { z } from 'zod';
import { CASE_STUDY_VERIFICATION_METHODS } from '../types/caseStudy';
import { CASE_STUDY_SORT_KEYS } from '../types/caseStudyFilters';
import { PUBLIC_VERIFICATION_CLASSES } from '../types/caseStudyPublic';
import type {
  CaseStudyBuiltByType,
  CaseStudyRepoVisibility,
  CaseStudyRoadmapStatus,
  CaseStudyVerificationMethod,
} from '../types/caseStudy';
import type { CaseStudyFilterInput } from '../types/caseStudyFilters';
import type { PublicVerificationClass } from '../types/caseStudyPublic';

/** Upper bound on a facet list, so one query cannot become an OR of a thousand. */
const MAX_FACETS = 20;
const MAX_ENUM_MEMBERS = 12;
/** Mirrors `MAX_PAGE_SIZE` in the filter engine; the schema rejects rather than clamps. */
export const MAX_PUBLIC_PAGE_SIZE = 48;

/* ------------------------------------------------------- query vocabulary --- */

/**
 * `Record<union, true>` rather than a bare array, for the same reason
 * `caseStudyPublic.ts` does it: add a member to the union and this stops
 * compiling until the filter vocabulary is updated too, so the query schema
 * cannot silently fall behind the domain.
 */
const BUILT_BY_MAP: Record<CaseStudyBuiltByType, true> = {
  learner: true, intern: true, client_team: true, colaberry_team: true,
  ai_flotation_team: true, joint_team: true,
};
const PROJECT_STATUS_MAP: Record<CaseStudyRoadmapStatus, true> = {
  shipped: true, in_progress: true, paused: true, not_pursued: true, unknown: true,
};
const REPO_VISIBILITY_MAP: Record<CaseStudyRepoVisibility, true> = {
  public: true, private: true, unknown: true,
};

const keys = (map: Record<string, true>): [string, ...string[]] =>
  Object.keys(map) as [string, ...string[]];

const list = (values: readonly string[]): [string, ...string[]] =>
  [...values] as [string, ...string[]];

/* --------------------------------------------------------------- schema --- */

/** `?stack=a,b` and `?stack=a&stack=b` are the same request. */
const toArray = (value: unknown): unknown => {
  if (typeof value === 'string') return value.split(',').map((s) => s.trim()).filter(Boolean);
  return value;
};

const freeList = z
  .preprocess(toArray, z.array(z.string().trim().min(1).max(80)).max(MAX_FACETS))
  .optional();

const enumList = (values: [string, ...string[]]) =>
  z.preprocess(toArray, z.array(z.enum(values)).max(MAX_ENUM_MEMBERS)).optional();

export const PublicCaseStudyListQuery = z.object({
  capability: freeList,
  industry: freeList,
  stack: freeList,
  program: freeList,
  deliverable: freeList,
  built_by: enumList(keys(BUILT_BY_MAP)),
  verification: enumList(list(PUBLIC_VERIFICATION_CLASSES)),
  // Spec §19 names both `method` and `verification_method` for one axis. They
  // are aliases here rather than two fields, so they cannot hold different
  // values; `verification_method` wins when both are sent.
  method: enumList(list(CASE_STUDY_VERIFICATION_METHODS)),
  verification_method: enumList(list(CASE_STUDY_VERIFICATION_METHODS)),
  status: enumList(keys(PROJECT_STATUS_MAP)),
  // Accepted and validated because spec §19 lists it, then DROPPED for public
  // audiences by `sanitizeFiltersForAudience`. The protection is that a
  // well-formed value cannot PARTITION the results - `private` and `public`
  // return identical sets - not that its existence is hidden. A malformed value
  // still 400s, so the parameter is discoverable either way.
  repo_visibility: enumList(keys(REPO_VISIBILITY_MAP)),
  /*
   * Free text. Matched against the PROJECTED card text only - see
   * `caseStudySearch.ts`, where that boundary is a privacy property rather than
   * an implementation detail.
   *
   * Deliberately NOT pattern-restricted: a reader may type anything, and the
   * normaliser strips every character that is not a letter or a digit before the
   * value reaches a comparison. Nothing built from it reaches SQL, a regex or a
   * shell. The length cap is the same one every other string here carries - a
   * query is a filter, not a payload.
   */
  q: z.string().trim().min(1).max(160).optional(),
  collection: z.string().trim().min(1).max(160).optional(),
  featured: z.enum(['true', 'false']).optional(),
  sort: z.enum(list(CASE_STUDY_SORT_KEYS)).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PUBLIC_PAGE_SIZE).optional(),
});

export type PublicCaseStudyListQueryInput = z.infer<typeof PublicCaseStudyListQuery>;

/**
 * Slugs are lowercase kebab. A malformed slug is a MISS, never a 400: a status
 * that differs by reason is a status that can be probed.
 */
export const PUBLIC_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,158}[a-z0-9])?$/;

/**
 * Query params to the canonical filter shape. Every cast below is Zod-checked
 * one line earlier - the schema validated the string against the same union it
 * is being narrowed to, so the assertion restates a fact rather than assuming
 * one.
 */
export function toPublicFilterInput(q: PublicCaseStudyListQueryInput): CaseStudyFilterInput {
  return {
    capability: q.capability,
    industry: q.industry,
    stack: q.stack,
    program: q.program,
    deliverable: q.deliverable,
    builtBy: q.built_by as readonly CaseStudyBuiltByType[] | undefined,
    verificationClass: q.verification as readonly PublicVerificationClass[] | undefined,
    verificationMethod:
      (q.verification_method ?? q.method) as readonly CaseStudyVerificationMethod[] | undefined,
    projectStatus: q.status as readonly CaseStudyRoadmapStatus[] | undefined,
    repoVisibility: q.repo_visibility as readonly CaseStudyRepoVisibility[] | undefined,
    featured: q.featured === undefined ? undefined : q.featured === 'true',
  };
}
