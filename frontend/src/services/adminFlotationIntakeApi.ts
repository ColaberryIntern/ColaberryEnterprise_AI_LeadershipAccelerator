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

// ── The interview itself, from the management side ──────────────────────────────────────
//
//     "I want that same exact intake on the Mgmt side so I can build projects for students."
//
// The server runs the same `runIntakeTurn` the public /start page calls. This client does
// what /start's does: keeps the transcript, mints one session id, posts the whole thing
// each turn. The session id is the extraction's idempotency key.

export interface IntakeTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface IntakeStudent {
  id: string;
  full_name: string | null;
  email: string;
  tier: string;
  cohort_id: string | null;
}

export type IntakeTurnResult =
  | { done: false; message: string; exchanges?: number; error_class?: string }
  | {
      done: true;
      message: string;
      understanding: 'created' | 'deduplicated' | 'failed' | 'skipped';
      understanding_id?: string;
      build?: { started: boolean; project_id?: string; reason?: string };
    };

export async function searchIntakeStudents(q: string): Promise<IntakeStudent[]> {
  const { data } = await api.get<{ enrollments: IntakeStudent[] }>('/api/admin/flotation/intake/enrollments', { params: { q } });
  return data.enrollments ?? [];
}

export async function sendIntakeTurn(params: { enrollmentId: string; sessionId: string; turns: IntakeTurn[] }): Promise<IntakeTurnResult> {
  const { data } = await api.post<IntakeTurnResult>('/api/admin/flotation/intake/turn', {
    enrollment_id: params.enrollmentId,
    session_id: params.sessionId,
    turns: params.turns,
  });
  return data;
}
