import api from '../utils/api';
import { params } from './queryParams';
import type {
  DecisionsQuery,
  ExplorerContentHealth,
  ExplorerDecisionPage,
  ExplorerDistribution,
  ExplorerLearnerPage,
  ExplorerSummary,
  ExplorerWhy,
  LearnerDecisionSummary,
  LearnerEligibility,
  LearnerProfile,
  LearnerSignals,
  LearnersQuery,
} from './explorerGrowthApi';
import type { CampusActivity, OutreachRow, OutreachView } from './explorerCampusApi';

/**
 * Explorer Growth's reads, brand-scoped, for the Growth Journey workspace.
 *
 * ─── A SEPARATE FILE, AND THE TYPES ARE IMPORTED RATHER THAN COPIED ─────────
 *
 * `explorerGrowthApi.ts` is 793 lines, already 293 over this repo's hard
 * ceiling, and must not grow. So this is its own module.
 *
 * Its PAYLOAD TYPES are imported `import type`, not re-declared. Mirroring
 * thirteen payloads by hand would be some four hundred lines whose only job is
 * to agree with a file three directories away, and the day it stopped agreeing
 * nothing would say so - the drift would surface as a panel rendering blanks.
 * Importing them means the two surfaces cannot disagree, because there is one
 * declaration.
 *
 * ─── WHY A TYPE IMPORT IS ALLOWED WHERE A VALUE IMPORT IS BANNED ────────────
 *
 * The plan banned importing `explorerGrowthApi` from this client and from every
 * panel. The hazard it names is real and specific: a panel that imports
 * Explorer's FETCHERS calls the unscoped surface and silently shows one brand's
 * learners under another brand's name.
 *
 * A type import cannot do that. Types are erased at compile time, so
 * `import type { LearnerProfile }` emits no JavaScript and reaches no network.
 * The ban is therefore enforced against VALUE imports, which is where the
 * hazard lives, and a scan in this module's test asserts exactly that: any
 * import of `explorerGrowthApi` or `explorerCampusApi` from this file or from a
 * Growth Journey panel must be `import type`.
 *
 * ─── `data` IS NULLABLE AND THAT IS THE POINT ───────────────────────────────
 *
 * Out of scope is `data: null` plus a reason, never zeros - "this brand has no
 * explorers yet" and "we cannot show you this brand" are different facts, and a
 * confident `0` asserts the first while meaning the second. Typing `data` as
 * `T | null` is what forces every consumer to handle the second case; a
 * non-nullable `data` would let a panel render an empty table and call it an
 * answer. A `@ts-expect-error` cell in the test pins that, so the nullability
 * cannot be quietly removed.
 *
 * ─── BASE CARRIES `/api`. DO NOT "SIMPLIFY" IT ──────────────────────────────
 *
 * `growthJourneyApi.ts` shipped with `'/admin/growth-journey'`, which nginx does
 * not proxy and which is itself a React route, so every call returned
 * index.html with 200 OK and no test could see it. `healthContract.test.ts`
 * pins this string for every client on this surface, including this one.
 */

const BASE = '/api/admin/growth-journey';

/** Why the server served, or refused, this brand. Mirrors `explorerBrandScope.ts`. */
export type ExplorerScopeReason =
  /** The brand requested IS the one Explorer's population belongs to. */
  | 'explorer_brand'
  /** Nothing is narrowed: no brand asked for, and the caller holds none. */
  | 'all_brands'
  /** A real brand, but not Explorer's. Zero rows, by design. */
  | 'other_brand'
  /** No brand row matches the id, or Explorer's own brand could not be resolved. */
  | 'unknown_brand';

export interface ExplorerBrandScope {
  tenant_id: string;
  brand_id: string | null;
  /**
   * Always `null`. Explorer Growth is one programme, so there is no programme
   * filter, and the server refuses `?program_id=` rather than echoing a filter
   * that never ran. Present because every journey read reports this shape.
   */
  program_id: string | null;
  in_scope: boolean;
  reason: ExplorerScopeReason;
}

/**
 * Does the single-brand assumption still hold? Present on the summary read only.
 *
 * `foreign_brand_profiles: -1` means the check could not run, which is a
 * different fact from `0` meaning it ran and found none.
 */
export interface ExplorerBrandInvariant {
  holds: boolean;
  foreign_brand_profiles: number;
}

export interface ScopedResponse<T> {
  /** `null` when the brand is out of scope. Never zeros. See the module header. */
  data: T | null;
  scope: ExplorerBrandScope;
  invariant?: ExplorerBrandInvariant;
}

/** Explorer's outreach list, with the paging the server sends. */
export interface ScopedOutreachList {
  view: OutreachView;
  rows: OutreachRow[];
  tracked_since: string;
  /**
   * `total` and `offset` are sent by the server and DROPPED by Explorer's own
   * client, which hardcodes a limit of 25 and cannot page. Carried here so the
   * merged panel can.
   */
  total: number;
  offset: number;
}

export interface ScopedLearnerDecisionPage {
  rows: LearnerDecisionSummary[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * The brand is sent only when one is selected; absent means "nothing narrowed yet".
 *
 * `boolean` is in the value union because `DecisionsQuery.executed` is one.
 * `params` stringifies it to `"true"` / `"false"`, which is exactly what the
 * server's `booleanParam` accepts, and `false` is SENT rather than skipped - the
 * skip is on `undefined` and `''` only. That distinction is load-bearing:
 * `explorerGrowthSchema` says in its own comment that a dropped `false` makes
 * the filter silently invert itself.
 */
const scoped = (
  brandId: string | null,
  q: Record<string, string | number | boolean | undefined> = {}
) => params({ ...(brandId ? { brand_id: brandId } : {}), ...q });

async function read<T>(path: string, query: string): Promise<ScopedResponse<T>> {
  const { data } = await api.get<ScopedResponse<T>>(`${BASE}${path}${query}`);
  return data;
}

const EXPLORERS = '/explorers';

/* ── The thirteen reads ──────────────────────────────────────────────────────── */

export function getExplorerSummary(brandId: string | null): Promise<ScopedResponse<ExplorerSummary>> {
  return read(`${EXPLORERS}/summary`, scoped(brandId));
}

export function getExplorerDistribution(
  brandId: string | null,
  days = 30
): Promise<ScopedResponse<ExplorerDistribution>> {
  return read(`${EXPLORERS}/distribution`, scoped(brandId, { days }));
}

export function getExplorerCampus(brandId: string | null): Promise<ScopedResponse<CampusActivity>> {
  return read(`${EXPLORERS}/campus`, scoped(brandId));
}

export function getExplorerOutreach(
  brandId: string | null,
  q: { view?: OutreachView; limit?: number; offset?: number } = {}
): Promise<ScopedResponse<ScopedOutreachList>> {
  return read(`${EXPLORERS}/outreach`, scoped(brandId, { ...q }));
}

export function getExplorerLearners(
  brandId: string | null,
  q: LearnersQuery = {}
): Promise<ScopedResponse<ExplorerLearnerPage>> {
  return read(`${EXPLORERS}/learners`, scoped(brandId, { ...q }));
}

export function getExplorerLearner(
  brandId: string | null,
  enrollmentId: string
): Promise<ScopedResponse<LearnerProfile>> {
  return read(`${EXPLORERS}/learners/${enrollmentId}`, scoped(brandId));
}

export function getExplorerLearnerSignals(
  brandId: string | null,
  enrollmentId: string,
  days = 90
): Promise<ScopedResponse<LearnerSignals>> {
  return read(`${EXPLORERS}/learners/${enrollmentId}/signals`, scoped(brandId, { days }));
}

export function getExplorerLearnerDecisions(
  brandId: string | null,
  enrollmentId: string,
  q: { limit?: number; offset?: number } = {}
): Promise<ScopedResponse<ScopedLearnerDecisionPage>> {
  return read(`${EXPLORERS}/learners/${enrollmentId}/decisions`, scoped(brandId, { ...q }));
}

export function getExplorerEligibility(
  brandId: string | null,
  enrollmentId: string
): Promise<ScopedResponse<LearnerEligibility>> {
  return read(`${EXPLORERS}/eligibility/${enrollmentId}`, scoped(brandId));
}

export function getExplorerDecisions(
  brandId: string | null,
  q: DecisionsQuery = {}
): Promise<ScopedResponse<ExplorerDecisionPage>> {
  return read(`${EXPLORERS}/decisions`, scoped(brandId, { ...q }));
}

export function getExplorerWhy(
  brandId: string | null,
  decisionId: string
): Promise<ScopedResponse<ExplorerWhy>> {
  return read(`${EXPLORERS}/decisions/${decisionId}`, scoped(brandId));
}

export function getExplorerShadow(
  brandId: string | null,
  q: { date?: string; limit?: number; offset?: number } = {}
): Promise<ScopedResponse<ExplorerDecisionPage>> {
  return read(`${EXPLORERS}/shadow`, scoped(brandId, { ...q }));
}

export function getExplorerContent(
  brandId: string | null,
  q: { date?: string; limit?: number; offset?: number } = {}
): Promise<ScopedResponse<ExplorerContentHealth>> {
  return read(`${EXPLORERS}/content`, scoped(brandId, { ...q }));
}

/**
 * Every READ this client exposes, so a test can assert one per route.
 *
 * T4's route list drifted from T2's read list once already in this build's own
 * plan - six reads became thirteen while the route task still said eight,
 * leaving four panels unreachable. Two lists and a count cell are what stopped
 * it there; the same pin belongs here, because a client is a third list.
 */
export const EXPLORER_BRAND_READS_API = [
  'getExplorerSummary',
  'getExplorerDistribution',
  'getExplorerCampus',
  'getExplorerOutreach',
  'getExplorerLearners',
  'getExplorerLearner',
  'getExplorerLearnerSignals',
  'getExplorerLearnerDecisions',
  'getExplorerEligibility',
  'getExplorerDecisions',
  'getExplorerWhy',
  'getExplorerShadow',
  'getExplorerContent',
] as const;
