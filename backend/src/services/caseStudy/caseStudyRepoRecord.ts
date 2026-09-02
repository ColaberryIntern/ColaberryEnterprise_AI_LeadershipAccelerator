import type { CaseStudyRepositoryAttributes } from '../../models/CaseStudyRepository';
import { normaliseScope } from './repoPathScope';
import type {
  CaseStudyRepoRole, CaseStudyRepoVisibility, CaseStudyRepoAccessStatus, CaseStudyRepositoryRef,
} from '../../types/caseStudy';

/**
 * caseStudyRepoRecord — turning a `case_study_repositories` ROW into the record
 * the rest of the system reads.
 *
 * WHY THIS IS ITS OWN MODULE. It was extracted from `caseStudyRepoCollection.ts`
 * when that file reached 497 of this repo's 500-line ceiling and path scoping
 * needed to be added to it. The root CLAUDE.md rule is that the change which
 * would cross the ceiling splits first rather than after, so this is that split.
 * It is not an arbitrary cut: reading a row is a genuinely different job from
 * attaching, removing and re-roling one, and it is the half every OTHER module
 * needs — the sync service, the metric runner and the admin service all want a
 * record and none of them want a transaction.
 *
 * FAIL CLOSED ON THE UNIONS. `role`, `visibility` and `access_status` are plain
 * VARCHARs in Postgres, so a hand-edited row can hold a value the TypeScript
 * union has never heard of. Every one of them is narrowed through `oneOf()` to a
 * safe default rather than cast, because a string that escapes into a typed field
 * as garbage surfaces far from here — in a published snapshot, in a filter, on a
 * public page — with nothing left to point at the row that caused it.
 */

/**
 * Runtime mirror of `CaseStudyRepoRole` (spec §10.2). It lives here rather than
 * in `types/caseStudy.ts` because that file is a leaf type module that imports
 * nothing; the assignment below is a compile-time proof that the two lists stay
 * identical — add a role to the union without adding it here and tsc fails.
 */
export const CASE_STUDY_REPO_ROLES = [
  'primary', 'frontend', 'backend', 'agents', 'data', 'infra', 'docs', 'evals', 'demo', 'other',
] as const;

/** Runtime mirror of `CaseStudyRepoVisibility`; see the totality checks below. */
export const REPO_VISIBILITIES = ['public', 'private', 'unknown'] as const;

// Both directions, checked by tsc rather than by memory: the `_SUBSET` line
// proves list ⊆ union, the `_TOTAL` line proves union ⊆ list. Add a role to the
// union without adding it here (or vice versa) and the build fails.
const ROLE_SUBSET: readonly CaseStudyRepoRole[] = CASE_STUDY_REPO_ROLES;
const ROLE_TOTAL: readonly (typeof CASE_STUDY_REPO_ROLES)[number][] = ROLE_SUBSET;
const VIS_SUBSET: readonly CaseStudyRepoVisibility[] = REPO_VISIBILITIES;
const VIS_TOTAL: readonly (typeof REPO_VISIBILITIES)[number][] = VIS_SUBSET;
void ROLE_TOTAL; void VIS_TOTAL;

/**
 * Runtime mirror of `CaseStudyRepoAccessStatus`.
 *
 * Deliberately a plain `string[]` and not `as const`: it is only ever used as the
 * allow-list argument to `oneOf`, whose type parameter comes from the fallback.
 */
export const ACCESS_STATUSES = [
  'connected', 'read_only', 'unavailable', 'deleted', 'rate_limited', 'unknown',
];

/** A repository row as this service returns it. `CaseStudyRepositoryRef` (T003) plus its id. */
export interface CaseStudyRepositoryRecord extends CaseStudyRepositoryRef {
  readonly id: string;
  readonly collectionId: string;
}

/**
 * Fail closed: a stored value the union does not know becomes the safe default.
 * These columns are plain VARCHARs, so a hand-edited row must degrade to
 * `other` / `unknown` rather than escape into a typed field as garbage.
 */
export function oneOf<T extends string>(allowed: readonly string[], value: unknown, fallback: T): T {
  return allowed.includes(String(value)) ? (value as T) : fallback;
}

export const asRole = (v: unknown): CaseStudyRepoRole => oneOf(CASE_STUDY_REPO_ROLES, v, 'other');

export type RepoRow = CaseStudyRepositoryAttributes & { id: string };

/**
 * Read the stored scope defensively.
 *
 * `path_scope` is a `TEXT[]`, and a driver that has not been told about the
 * column — an older container, a raw query, a fixture built by hand — hands back
 * `undefined`, a string, or a JSON blob rather than an array. Anything that is
 * not an array of strings is read as NO SCOPE, which is the pre-feature
 * behaviour: a case study that cannot prove it is scoped must describe the whole
 * repository rather than silently describe a fraction of it and call that the
 * whole.
 */
function readScope(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return normaliseScope(value.filter((v): v is string => typeof v === 'string'));
}

export function toRecord(row: RepoRow): CaseStudyRepositoryRecord {
  const pathScope = readScope((row as { path_scope?: unknown }).path_scope);
  return {
    id: row.id,
    collectionId: row.collection_id,
    repoOwner: row.repo_owner,
    repoName: row.repo_name,
    repoUrl: row.repo_url,
    role: asRole(row.role),
    visibility: oneOf<CaseStudyRepoVisibility>(REPO_VISIBILITIES, row.visibility, 'unknown'),
    accessStatus: oneOf<CaseStudyRepoAccessStatus>(ACCESS_STATUSES, row.access_status, 'unknown'),
    allowPublicRepoLink: row.allow_public_repo_link === true,
    defaultBranch: row.default_branch ?? undefined,
    lastSeenSha: row.last_seen_sha ?? undefined,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : undefined,
    // OMITTED WHEN EMPTY, not emitted as []. An unscoped repository must produce
    // byte-identical output to the one it produced before scoping existed, because
    // these records feed the published snapshot and its content hash. Emitting an
    // empty array would re-hash every Case Study in the system on deploy and
    // present it as a change to the story.
    ...(pathScope.length > 0 ? { pathScope } : {}),
  };
}

/**
 * Sorted in memory, not by SQL: bounded at 20 rows the cost is nil, and the order
 * is then identical on every database and collation — which is what makes the
 * admin list and the published snapshot agree.
 */
export function sortRecords(rows: CaseStudyRepositoryRecord[]): CaseStudyRepositoryRecord[] {
  return [...rows].sort((a, b) => {
    if (a.role === 'primary' && b.role !== 'primary') return -1;
    if (b.role === 'primary' && a.role !== 'primary') return 1;
    const owner = a.repoOwner.toLowerCase().localeCompare(b.repoOwner.toLowerCase());
    return owner !== 0 ? owner : a.repoName.toLowerCase().localeCompare(b.repoName.toLowerCase());
  });
}
