import axios from 'axios';
import { getParticipantToken } from '../utils/participantToken';

// Thin axios client for the per-student workspace repo endpoints (Part B).
// Mirrors onboardingApi.ts / portalApi.ts: reads the participant JWT from the
// SAME localStorage key the rest of the portal uses ('participant_token') and
// attaches it as a Bearer token. Kept separate from portalApi so a failure to
// reach these three routes fails soft in the drawer without touching the
// portal-wide 401 redirect interceptor.

/**
 * Where a project is in the connect flow.
 *
 * Student build repos are STUDENT-OWNED (decision, Ali Muwwakkil 2026-08-14):
 * the platform stores a pointer and the evidence, never the code. So the panel
 * has two doors — connect the repo you already have (primary), or have one
 * created and point your existing folder at it (fallback) — and this is the
 * state machine both walk.
 */
export type ConnectStateName = 'not_connected' | 'awaiting_proof' | 'awaiting_push' | 'connected';

export interface ConnectStateView {
  state: ConnectStateName;
  method: 'byo' | 'provisioned' | null;
  owner: string | null;
  repo: string | null;
  url: string | null;
  private: boolean | null;
  default_branch: string | null;
  /** The push proof, while it is outstanding. */
  challenge: { path: string; token: string; file_content: string; commands: string[] } | null;
  /** The `git remote add` / `push -u` block, while a provisioned repo is empty. */
  adopt_commands: string[] | null;
  /** Whether the last read worked. Lost access is a reconnect prompt, not an error. */
  access: { ok: boolean; error_class: string | null; checked_at: string | null } | null;
  connected_at: string | null;
}

export interface WorkspaceRepoView {
  connected: boolean;
  provisioned: boolean;
  repo_url: string | null;
  repo_owner: string | null;
  repo_name: string | null;
  student_github_login: string | null;
  file_count: number | null;
  last_sync: string | null;
  recent_commits: Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
  }>;
  connect: ConnectStateView | null;
}

/** The shape every connect failure comes back in. Never a bare 400. */
export interface ConnectApiError {
  error: string;
  error_class: string | null;
  details?: Record<string, unknown>;
}

/** Pull the classified message out of an axios failure, with a usable fallback. */
export function connectErrorOf(err: any, fallback: string): ConnectApiError {
  const data = err?.response?.data;
  if (data && typeof data.error === 'string') {
    return { error: data.error, error_class: data.error_class ?? null, details: data.details };
  }
  return { error: fallback, error_class: null };
}

const workspaceApi = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
});

workspaceApi.interceptors.request.use((config) => {
  // Same resolution portalApi.ts uses — the participant session JWT.
  const token = getParticipantToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A repo belongs to a PROJECT, not to an enrollment (FR-037) — a student with
// two projects has two repos. All three routes therefore require project_id,
// and every caller here must pass it. It was missing when the backend was
// re-keyed: the routes answered 400, the drawer's fail-soft turned that into
// silence, and the whole "Your workspace repo" section rendered as nothing.

/** GET the current workspace repo state for one project. */
export async function getWorkspaceRepo(projectId: string): Promise<WorkspaceRepoView> {
  const { data } = await workspaceApi.get<WorkspaceRepoView>(
    '/api/portal/workspace/repo',
    { params: { project_id: projectId } },
  );
  return data;
}

/**
 * DOOR A, step 1 — validate a repo the student already has and get the push
 * proof they need to run.
 *
 * `confirmReplace` is how a student says "yes, move this build off the repo it
 * is on, I know it has commits". Without it the backend refuses, so a rebind
 * can never happen by accident.
 */
export async function startRepoConnect(
  projectId: string, repo: string, confirmReplace = false,
): Promise<ConnectStateView> {
  const { data } = await workspaceApi.post<ConnectStateView>(
    '/api/portal/workspace/repo/connect',
    { project_id: projectId, repo, ...(confirmReplace ? { confirm_replace: true } : {}) },
  );
  return data;
}

/** DOOR A, step 2 — read the proof back and bind the repo. Idempotent. */
export async function confirmRepoConnect(projectId: string): Promise<ConnectStateView> {
  const { data } = await workspaceApi.post<ConnectStateView>(
    '/api/portal/workspace/repo/connect/confirm',
    { project_id: projectId },
  );
  return data;
}

/**
 * DOOR B — create an EMPTY private repo and get the commands that point the
 * student's existing folder at it. Idempotent.
 */
export async function provisionWorkspaceRepo(
  projectId: string, githubLogin: string,
): Promise<ConnectStateView> {
  const { data } = await workspaceApi.post<ConnectStateView>(
    '/api/portal/workspace/repo/provision',
    { project_id: projectId, github_login: githubLogin },
  );
  return data;
}

/**
 * The no-git fallback — the same documents as a zip.
 *
 * Deliberately a blob fetch rather than a plain link: the endpoint is
 * participant-authed, and an `<a href>` carries no Authorization header.
 */
export async function downloadDocsBundle(projectId: string): Promise<{ blob: Blob; filename: string }> {
  const res = await workspaceApi.get('/api/portal/workspace/docs/bundle', {
    params: { project_id: projectId },
    responseType: 'blob',
  });
  const disposition = String(res.headers?.['content-disposition'] ?? '');
  const match = /filename="?([^"';]+)"?/.exec(disposition);
  return { blob: res.data as Blob, filename: match?.[1] ?? 'build-docs.zip' };
}

/** Sync (pull) the student's repo — the portal never commits for them. */
export async function syncWorkspaceRepo(projectId: string): Promise<WorkspaceRepoView> {
  const { data } = await workspaceApi.post<WorkspaceRepoView>(
    '/api/portal/workspace/repo/sync',
    { project_id: projectId },
  );
  return data;
}

// ── story verification ───────────────────────────────────────────────────────

/** What the platform concluded about one story, last time it looked at the repo. */
export interface StoryVerificationDto {
  state: 'not_started' | 'in_progress' | 'submitted' | 'verified';
  criteria_total: number;
  criteria_passed: number;
  /** The exact text of every criterion still outstanding. Drives the checkboxes. */
  outstanding: string[];
  commit_sha: string | null;
  commit_at: string | null;
  /** Plain-language "why this is not verified yet". Drives the disabled-button copy. */
  reasons: string[];
  rejected_claims: string[];
  checked_at: string | null;
  /**
   * Held at `verified` by the immutable latch rather than by the current repo
   * read — history rewritten, progress file deleted, evidence commit aged out.
   * Still verified; we just cannot re-check it.
   */
  latched: boolean;
  /** What the CURRENT read concluded, when it disagrees with the latch. Diagnostic only. */
  live_state: StoryVerificationDto['state'] | null;
  /**
   * Set when the last sync could not READ `.colaberry/progress.json` — bad
   * JSON, wrong shape, an unknown version. One sentence, written for the
   * student, rendered verbatim.
   *
   * WHEN THIS IS SET EVERYTHING ABOVE IT IS STALE: it is the last verdict the
   * platform could actually reach, not a conclusion about the push that just
   * landed. Render this INSTEAD of `outstanding` and `reasons`, never beside
   * them. Optional because a row written before this field existed will not
   * carry it.
   */
  read_error?: string | null;
  /** `ProgressFileSchemaMismatch`, `ProgressFileNotJson`, … For triage, not display. */
  read_error_class?: string | null;
}

export interface StoryVerificationView {
  project_id: string;
  story_id: string;
  status: string;
  /** The completion gate. Non-null means the platform confirmed it. Never moves. */
  verified_at: string | null;
  verified_by: string | null;
  verification: StoryVerificationDto | null;
  /** The criteria as the PLAN has them, in plan order. The authority for pairing. */
  acceptance: string[];
  /**
   * Builder XP banked for this story — an 800 budget for the capstone split
   * across its stories. Shown only when above zero: the split fails closed at 0
   * if the config row is missing, and a "+0" celebration would announce an
   * award that did not happen.
   */
  xp_awarded: number;
}

/**
 * GET one story's verification state.
 *
 * Read-only and cheap — this is the endpoint the workspace page polls while a
 * story is open. It reports the last verdict; it never triggers a GitHub read,
 * so polling it cannot cost the student their rate limit.
 */
export async function getStoryVerification(
  projectId: string, storyId: string,
): Promise<StoryVerificationView> {
  const { data } = await workspaceApi.get<StoryVerificationView>(
    '/api/portal/workspace/story-verification',
    { params: { project_id: projectId, story_id: storyId } },
  );
  return data;
}

// ── webhook setup ────────────────────────────────────────────────────────────

/**
 * What a student needs to register their own push webhook.
 *
 * CARRIES A SIGNING SECRET. Fetched only by the panel that shows it, never
 * folded into the general repo view, and never persisted client-side.
 */
export interface WebhookSetupView {
  supported: boolean;
  owner: string | null;
  repo: string | null;
  payload_url: string | null;
  secret: string | null;
  content_type: 'json';
  events: string[];
  /** One paste. Updates an existing hook on our URL rather than adding a second. */
  gh_command: string | null;
  settings_url: string | null;
  /**
   * Last delivery of ANY kind from this repo. A `ping` counts — GitHub fires one
   * the instant a hook is created, which is what lets "registered" confirm itself
   * seconds after the student runs the command instead of waiting on a push.
   */
  last_delivery_at: string | null;
  /** Last delivery that carried the student's own work through verification. */
  last_push_at: string | null;
}

export async function getWebhookSetup(projectId: string): Promise<WebhookSetupView> {
  const { data } = await workspaceApi.get<WebhookSetupView>(
    '/api/portal/workspace/webhook-setup',
    { params: { project_id: projectId } },
  );
  return data;
}
