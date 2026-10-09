import api from '../utils/api';
import {
  LIFECYCLE_API_BASE,
  type LifecycleDisabled,
  type ProjectKind,
} from './projectLifecycleApi';

/**
 * Client for the blueprint REVIEW routes: compare two revisions, request changes to one.
 *
 * Split out of `projectLifecycleApi.ts` because these eight symbols pushed that module past
 * CLAUDE.md's hard ceiling of 12 public symbols, and the rule is that the change which crosses
 * the ceiling splits the file rather than deferring it. The seam is real: that module answers
 * "where does this project stand", this one answers "what changed, and what must change".
 *
 * `LIFECYCLE_API_BASE` and the two shared types are IMPORTED, never re-declared. A second copy of
 * the base path is a second place the `/api` prefix can go missing, and a missing prefix returns
 * `index.html` with a 200 that no mocked test can tell from a real response.
 */

const BASE = LIFECYCLE_API_BASE;

/**
 * ── THE TYPES BELOW MIRROR THE BACKEND BY HAND ───────────────────────────────
 * The two stacks have separate tsconfigs, so there is no shared type to import, and this file
 * already mirrors `LifecycleStatus` the same way. That mirror is a known drift risk in this repo
 * — a hand-copied response type has gone stale here before — so the fields are kept deliberately
 * few, and the compare test asserts against a payload shaped like the route's actual response
 * rather than against this interface.
 */

/** How a collection's elements are identified. `tuple` elements have no id and no revision. */
export type ElementIdentity = 'pinned' | 'tuple' | 'indeterminate';

export interface CollectionDiff {
  collection: string;
  identity: ElementIdentity;
  added: string[];
  removed: string[];
  /** Same id, a different pinned revision — an EDIT, which added/removed alone would miss. */
  revised: string[];
}

export interface RevisionDiff {
  collections: CollectionDiff[];
  changed: boolean;
  /** Collections that could not be compared. NOT the same as unchanged. */
  unreadable: string[];
}

export interface RevisionMeta {
  id: string;
  revision: number;
  status: string | null;
  contentSha256: string | null;
}

/**
 * Every answer the compare endpoint can give, each one its own case.
 *
 * `single_revision` and `no_manifest` are NOT empty diffs. A reviewer shown an all-clear screen
 * for a blueprint that was never revised would be approving a comparison that never happened.
 */
export type CompareResult =
  | { state: 'compared'; from: RevisionMeta; to: RevisionMeta; diff: RevisionDiff }
  | { state: 'single_revision'; only: RevisionMeta }
  | { state: 'no_manifest' }
  | { state: 'revision_not_found'; requested: number[]; available: number[] }
  | { state: 'disabled'; detail: LifecycleDisabled }
  | { state: 'error'; message: string };

/**
 * Read what changed between two revisions. With neither bound given, the newest two.
 *
 * Never throws, for the same reason `fetchLifecycleStatus` does not: every outcome here is
 * something the page must render differently, and an exception would collapse them into one.
 */
export async function fetchRevisionCompare(
  projectId: string,
  kind: ProjectKind,
  from?: number,
  to?: number,
): Promise<CompareResult> {
  try {
    const r = await api.get(`${BASE}/${projectId}/revisions/compare`, {
      params: { kind, ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) },
    });
    return r.data as CompareResult;
  } catch (e: any) {
    const body = e?.response?.data;
    if (body?.lifecycleDisabled === true) return { state: 'disabled', detail: body as LifecycleDisabled };
    // The server's own refusal states arrive as 404 bodies that already carry `state`, so they
    // are passed through rather than flattened into a generic error — flattening would lose the
    // `available` list that makes the refusal actionable.
    if (body?.state === 'no_manifest') return { state: 'no_manifest' };
    if (body?.state === 'revision_not_found') {
      return {
        state: 'revision_not_found',
        requested: body.requested ?? [],
        available: body.available ?? [],
      };
    }
    return { state: 'error', message: body?.error ?? 'Could not compare the revisions.' };
  }
}

export type ChangeRequestOutcome =
  | { state: 'recorded'; applied: boolean; revision: number }
  | { state: 'refused'; message: string; refusal: string }
  | { state: 'disabled'; detail: LifecycleDisabled }
  | { state: 'error'; message: string };

/**
 * Ask for changes to one exact revision.
 *
 * `applied: false` is a SUCCESS, not an error: it means this exact request was already on record.
 * Surfacing it as a failure would make a reviewer send it again.
 */
export async function requestBlueprintChanges(
  projectId: string,
  kind: ProjectKind,
  revision: number,
  text: string,
): Promise<ChangeRequestOutcome> {
  try {
    const r = await api.post(`${BASE}/${projectId}/request-changes`, { kind, revision, text });
    return { state: 'recorded', applied: r.data?.applied === true, revision: r.data?.revision ?? revision };
  } catch (e: any) {
    const body = e?.response?.data;
    if (body?.lifecycleDisabled === true) return { state: 'disabled', detail: body as LifecycleDisabled };
    if (body?.refusal) return { state: 'refused', message: body.error ?? 'Refused.', refusal: body.refusal };
    return { state: 'error', message: body?.error ?? 'Could not record the change request.' };
  }
}
