import api from '../utils/api';

/**
 * Client for `/api/admin/project-lifecycle`.
 *
 * The `/api` prefix is not optional: without it the dev server answers `index.html` with a 200,
 * which a mocked test suite cannot tell from a real response.
 *
 * Every route behind this is behind `ENABLE_PROJECT_LIFECYCLE`, default off, and answers
 * `409 { lifecycleDisabled: true }` when it is off. Callers must render that state rather than
 * treating it as an empty result.
 */

export type ProjectKind = 'student' | 'delivery';

/** `not_assessed` means nobody measured it. It is not the same as measured-and-missing. */
export type GapKind = 'unmet' | 'not_assessed';

export interface LifecycleGap {
  rule: string;
  message: string;
  subject?: string | null;
  kind: GapKind;
}

export interface LifecycleStatus {
  projectId: string;
  kind: ProjectKind;
  stage: string;
  condition: string | null;
  conditionReason: string | null;
  completedStages: string[];
  /** The whole ladder, in order, SERVED by the API so this client keeps no copy of it. */
  stages: string[];
  /**
   * What this viewer holds and may do, computed by the SERVER.
   *
   * The page offers an action only when it appears in `permittedActions`. Deciding that on the
   * client would need a copy of the role-to-permission table, and a stale copy offers a button
   * the server refuses.
   */
  viewerPersonas: string[];
  permittedActions: string[];
  nextStage: string | null;
  blockers: LifecycleGap[];
  nextActorRole: string | null;
  nextAction: string;
}

export interface LifecycleDisabled {
  lifecycleDisabled: true;
  error: string;
  remedy: string;
}

export type LifecycleResult =
  | { state: 'ok'; status: LifecycleStatus }
  | { state: 'disabled'; detail: LifecycleDisabled }
  | { state: 'error'; message: string };

/**
 * The one definition of this path prefix, exported because the review client shares it.
 *
 * The `/api` is not decorative: without it the dev server answers `index.html` with a
 * 200, which a mocked suite cannot tell from a real response. One constant means one
 * place that can be wrong.
 */
export const LIFECYCLE_API_BASE = '/api/admin/project-lifecycle';
const BASE = LIFECYCLE_API_BASE;

/**
 * Read a project's lifecycle status.
 *
 * Returns a discriminated result rather than throwing, because the three outcomes are all
 * things the page must render differently: a status, a disabled feature, and a failure. An
 * earlier page in this repo collapsed a failure into an empty list and told an operator their
 * database was empty when the request had simply failed.
 */
export async function fetchLifecycleStatus(
  projectId: string,
  kind: ProjectKind,
): Promise<LifecycleResult> {
  try {
    const r = await api.get(`${BASE}/${projectId}`, { params: { kind } });
    return { state: 'ok', status: r.data as LifecycleStatus };
  } catch (e: any) {
    const body = e?.response?.data;
    if (body?.lifecycleDisabled === true) {
      return { state: 'disabled', detail: body as LifecycleDisabled };
    }
    return { state: 'error', message: body?.error ?? 'Could not load the lifecycle status.' };
  }
}
