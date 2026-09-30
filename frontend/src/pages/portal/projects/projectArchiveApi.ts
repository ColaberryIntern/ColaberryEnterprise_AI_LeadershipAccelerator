/**
 * projectArchiveApi — the client half of "remove my own project".
 *
 * Result convention matches `sbpApi`: every call resolves to a discriminated
 * `{ ok: true, … } | { ok: false, error }` and NEVER throws. A destructive
 * action must not depend on the caller remembering a try/catch, and a rejected
 * promise inside a confirmation dialog is how a student ends up staring at a
 * spinner that will not stop.
 */
import portalApi from '../../../utils/portalApi';

/** What the student is being asked to give up. Mirrors the server's ArchivePreview. */
export interface ArchivePreview {
  project_id: string;
  name: string | null;
  is_active: boolean;
  task_count: number;
  completed_task_count: number;
  task_list_count: number;
  confirmed_story_count: number;
  has_published_plan: boolean;
  points_awarded: number;
  repo_connected: boolean;
  repo_full_name: string | null;
  next_active_project_id: string | null;
  next_active_project_name: string | null;
}

export interface ArchiveResult {
  project_id: string;
  archived_at: string;
  active_project_id: string | null;
  changed: boolean;
}

export interface ArchivedProjectSummary {
  id: string;
  name: string | null;
  archived_at: string | null;
}

export interface ApiError { status?: number; message: string }
export type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError };

function toError(err: unknown): ApiError {
  const status = (err as { response?: { status?: number } })?.response?.status;
  const serverMessage = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return {
    status,
    // The server's own message is preferred because it is the one written for a
    // human: "This project is part of the platform itself and cannot be
    // archived." says something; "Request failed with status code 403" does not.
    message: serverMessage || (err as Error)?.message || 'Something went wrong.',
  };
}

export async function fetchArchivePreview(projectId: string): Promise<Result<ArchivePreview>> {
  try {
    const res = await portalApi.get(`/api/portal/projects/${encodeURIComponent(projectId)}/archive-preview`);
    return { ok: true, value: res.data as ArchivePreview };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

/**
 * Archive it. `confirmName` is echoed to the server, which checks it against the
 * name IT holds — the client is not trusted to grade its own confirmation.
 */
export async function archiveProject(projectId: string, confirmName: string): Promise<Result<ArchiveResult>> {
  try {
    const res = await portalApi.post(
      `/api/portal/projects/${encodeURIComponent(projectId)}/archive`,
      { confirm_name: confirmName },
    );
    return { ok: true, value: res.data as ArchiveResult };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function restoreProject(projectId: string): Promise<Result<{ project_id: string; changed: boolean }>> {
  try {
    const res = await portalApi.post(`/api/portal/projects/${encodeURIComponent(projectId)}/restore`, {});
    return { ok: true, value: res.data };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function fetchArchivedProjects(): Promise<Result<ArchivedProjectSummary[]>> {
  try {
    const res = await portalApi.get('/api/portal/projects/archived');
    const rows = res.data?.projects;
    return { ok: true, value: Array.isArray(rows) ? rows as ArchivedProjectSummary[] : [] };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}
