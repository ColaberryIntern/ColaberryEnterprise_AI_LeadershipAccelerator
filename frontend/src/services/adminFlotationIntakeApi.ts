import api from '../utils/api';

/**
 * The management door into the one project intake.
 *
 * These call `/api/admin/flotation/*`, which calls the same `startBuild` the portal wizard
 * does. An admin building a project from here gets exactly what a prospect converting from
 * AI Flotation gets, which is exactly what a student creating one in the portal gets - not
 * because three surfaces are kept aligned, but because there is one pipeline.
 */

export interface FlotationUnderstandingRow {
  id: string;
  title: string | null;
  source: string;
  items: number;
  confirmed_at: string | null;
  lead: { id: number; name: string | null; email: string; company: string | null } | null;
  enrollment: { id: string; tier: string; cohort_id: string | null } | null;
  build: { project_id: string; started_at: string } | null;
}

export interface StartedBuild {
  ok: true;
  projectId: string;
  correlationId: string;
  status: string;
  reused: boolean;
  intake: { name: string; answers: Array<{ id: string; question: string; answer: string }>; dropped: unknown[] };
}

export async function listFlotationUnderstandings(): Promise<FlotationUnderstandingRow[]> {
  const { data } = await api.get<{ understandings: FlotationUnderstandingRow[] }>('/api/admin/flotation/understandings');
  return data.understandings ?? [];
}

export async function buildFromUnderstanding(
  understandingId: string,
  opts: { enrollmentId?: string; requireConfirmed?: boolean } = {},
): Promise<StartedBuild> {
  const { data } = await api.post<StartedBuild>(`/api/admin/flotation/understandings/${understandingId}/build`, {
    ...(opts.enrollmentId ? { enrollment_id: opts.enrollmentId } : {}),
    ...(opts.requireConfirmed ? { require_confirmed: true } : {}),
  });
  return data;
}

/**
 * The reason a build could not start, in a sentence. The server distinguishes "nowhere to
 * land" (409) from "not found" (404) from "it broke" (500), and so must this.
 */
export function describeBuildError(err: unknown): string {
  const res = (err as { response?: { status?: number; data?: { error?: string; reason?: string } } })?.response;
  if (res?.data?.error) return res.data.error;
  if (res?.status === 404) return 'That understanding no longer exists.';
  if (res?.status === 401 || res?.status === 403) return 'Your session cannot do this. Sign in again.';
  return 'The build could not be started. Nothing was created.';
}
