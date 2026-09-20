/**
 * projectApprovalApi — the client half of "review your project, then approve it".
 *
 * Same Result convention as projectArchiveApi / sbpApi: every call resolves to a
 * discriminated `{ ok: true, value } | { ok: false, error }` and NEVER throws, so
 * a button handler in the review pane cannot leave the student on a stuck spinner.
 */
import portalApi from '../../../utils/portalApi';
import type { Result, ApiError } from './projectArchiveApi';

export type ProjectApprovalState = 'pending_approval' | 'approved' | 'changes_requested';

/** Mirrors the server's ProjectApprovalDto. */
export interface ProjectApprovalResult {
  id: string;
  approval_state: ProjectApprovalState | null;
  approved_at: string | null;
  approval_notes: string | null;
  approval_updated_at: string | null;
}

function toError(err: unknown): ApiError {
  const status = (err as { response?: { status?: number } })?.response?.status;
  const serverMessage = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return { status, message: serverMessage || (err as Error)?.message || 'Something went wrong.' };
}

/** The student approves their build. Idempotent on the server. */
export async function approveProject(projectId: string): Promise<Result<ProjectApprovalResult>> {
  try {
    const res = await portalApi.post(`/api/portal/projects/${encodeURIComponent(projectId)}/approve`, {});
    return { ok: true, value: res.data as ProjectApprovalResult };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

/** The student says the build is not what they wanted; `notes` is what was wrong. */
export async function requestProjectChanges(projectId: string, notes: string): Promise<Result<ProjectApprovalResult>> {
  try {
    const res = await portalApi.post(
      `/api/portal/projects/${encodeURIComponent(projectId)}/request-changes`,
      { notes },
    );
    return { ok: true, value: res.data as ProjectApprovalResult };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}
