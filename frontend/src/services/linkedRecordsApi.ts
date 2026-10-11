import api from '../utils/api';
import {
  LIFECYCLE_API_BASE,
  type LifecycleDisabled,
  type ProjectKind,
} from './projectLifecycleApi';

/**
 * Client for the linked-views route: the records connected to one record.
 *
 * Its own module rather than more surface on `blueprintReviewApi.ts`, which would have reached 13
 * public symbols against CLAUDE.md's hard ceiling of 12. The seam is the same one the backend
 * draws: comparing revisions and requesting changes is one job, traversing connections is another.
 *
 * `LIFECYCLE_API_BASE` is imported, never re-declared — one definition of the `/api` prefix,
 * because a missing prefix returns `index.html` with a 200 that no mocked test can tell from a
 * real response.
 */

const BASE = LIFECYCLE_API_BASE;

/** The six view kinds the backend registry declares. */
export type ViewKind =
  | 'requirements' | 'workflow' | 'allocation' | 'workspaces' | 'controls' | 'design';

export interface ConnectedGroup {
  target: 'proposal_sections' | 'downstream_stories' | 'delivery_role';
  via: 'track_proposal_section' | 'track_solution_story' | 'assignment_role';
  ids: string[];
}

/**
 * Why there are no connected records, when there are none.
 *
 * Two causes, because they lead to different actions: the id is not in this blueprint at all, or
 * the blueprint carries no edge of that kind. An empty list conflating them would read as "this
 * record stands alone", which the manifest never says.
 */
export type UnlinkedReason =
  | { kind: 'entity_not_in_manifest'; detail: string }
  | { kind: 'no_edge_recorded'; detail: string };

export type LinkedResult =
  | {
    state: 'linked';
    revision: number;
    entity: { id: string; viewKind: ViewKind; collection: string } | null;
    groups: ConnectedGroup[];
    unlinked: UnlinkedReason | null;
  }
  | { state: 'no_manifest' }
  | { state: 'disabled'; detail: LifecycleDisabled }
  | { state: 'error'; message: string };

/**
 * Read the records connected to one record.
 *
 * `entityId` goes in the QUERY STRING, matching the route: assignment ids are composite
 * (`ROLE:responsibility`) so they contain colons and spaces, and one containing a slash would
 * split a path segment in two and 404.
 *
 * Never throws. Every outcome is something the panel renders differently.
 */
export async function fetchLinkedRecords(
  projectId: string,
  kind: ProjectKind,
  entityId: string,
): Promise<LinkedResult> {
  try {
    const r = await api.get(`${BASE}/${projectId}/linked`, { params: { kind, entityId } });
    return r.data as LinkedResult;
  } catch (e: any) {
    const body = e?.response?.data;
    if (body?.lifecycleDisabled === true) return { state: 'disabled', detail: body as LifecycleDisabled };
    if (body?.state === 'no_manifest') return { state: 'no_manifest' };
    return { state: 'error', message: body?.error ?? 'Could not read the connected records.' };
  }
}
