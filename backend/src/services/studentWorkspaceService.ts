import { GitHubConnection, Enrollment } from '../models';
import Project from '../models/Project';

// studentWorkspaceService — platform-provisioned per-student workspace repos.
//
// Locked model (see feature spec):
//   - Repos are PLATFORM-provisioned: one private repo per student under the
//     ColaberryIntern org, created with the platform GITHUB_TOKEN. The student
//     is added as a PUSH collaborator. There is no student OAuth.
//   - Commit model: the student commits + pushes locally. The portal only
//     SYNCS (pulls) their repo — it never commits for them.
//   - The platform token is NEVER persisted to the DB. GitHubConnection stores
//     repo_owner/repo_name/repo_url + a status_json marker; the token is read
//     from env at call time (the org owner can read the private repo).
//
// Mirrors githubService.ts: raw fetch, Bearer auth, one GitHubConnection row
// per enrollment_id. Failure-first: explicit timeouts, capped retries on reads,
// clear error messages, no silent catches.

const DEFAULT_ORG = 'ColaberryIntern';
const DEFAULT_API = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 20000;
const MAX_READ_RETRIES = 3;

// GitHub logins: 1–39 chars, alphanumeric or single hyphens, not leading/
// trailing hyphen. Used to reject malformed input before any network call.
const GITHUB_LOGIN_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

export function isValidGithubLogin(login: unknown): login is string {
  return typeof login === 'string' && GITHUB_LOGIN_RE.test(login.trim());
}

function org(): string {
  return process.env.GITHUB_WORKSPACE_ORG || DEFAULT_ORG;
}
function apiBase(): string {
  return process.env.GITHUB_API_URL || DEFAULT_API;
}

/** Resolve the platform token or throw a clear error (never a silent skip). */
function requirePlatformToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token || !token.trim()) {
    throw new Error(
      'GITHUB_TOKEN is not configured — the platform token (repo-create + collaborator scope on the workspace org) is required to provision or sync student repos.',
    );
  }
  return token;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/** fetch with an explicit timeout so an upstream hang can never block forever. */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`GitHub request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`);
    }
    throw new Error(`GitHub request failed (${err?.message || 'network error'}): ${url}`);
  } finally {
    clearTimeout(timer);
  }
}

/** GET with capped retries on transient (5xx / 429) failures. */
async function getWithRetry(url: string, token: string): Promise<Response> {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= MAX_READ_RETRIES; attempt++) {
    const res = await fetchWithTimeout(url, { method: 'GET', headers: authHeaders(token) });
    if (res.ok) return res;
    lastStatus = res.status;
    // Retry only transient upstream failures; 4xx (except 429) are terminal.
    if (res.status !== 429 && res.status < 500) return res;
    if (attempt < MAX_READ_RETRIES) {
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }
  throw new Error(`GitHub API error after ${MAX_READ_RETRIES} attempts (last status ${lastStatus}): ${url}`);
}

/**
 * Turn a project name into a GitHub-safe slug. Exported for testing because the
 * repo name is the student's portfolio artifact — the thing an employer opens —
 * and a mangled one is a real cost to them.
 */
export function slugifyProjectName(name: string | null | undefined): string {
  const slug = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'build';
}

/**
 * Deterministic repo name for a PROJECT's workspace (SBP-GH-v1 §4.1).
 *
 * Was `student-workspace-<enrollmentId>` — a bare UUID. This repo is the
 * student's portfolio artifact, so it reads like one: `sponsor-dashboard-248d9d63`.
 * The 8-char project-id suffix makes it unique across the org without a
 * collision check. `projects` has no `slug` column (verified), so the slug is
 * derived from `name` — the display name derived from the idea — falling back to
 * `organization_name`.
 */
export function workspaceRepoName(project: { id: string; name?: string | null; organization_name?: string | null }): string {
  const slug = slugifyProjectName(project.name || project.organization_name);
  return `${slug}-${String(project.id).replace(/-/g, '').slice(0, 8)}`;
}

/**
 * Resolve a project the caller owns, or throw. Every entry point calls this
 * BEFORE any GitHub request, so a foreign projectId never reaches the network —
 * the tests assert the fetch mock is not merely unsuccessful but never invoked.
 */
async function requireOwnedProject(enrollmentId: string, projectId: string): Promise<Project> {
  if (!enrollmentId) throw new Error('enrollmentId is required');
  if (!projectId) throw new Error('projectId is required');
  const project = await Project.findByPk(projectId);
  if (!project || String((project as any).enrollment_id) !== String(enrollmentId)) {
    // Deliberately indistinguishable from "does not exist": a caller must not be
    // able to probe for the existence of another student's project.
    const err: any = new Error('Project not found');
    err.status = 404;
    throw err;
  }
  return project;
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
  recent_commits: Array<{ sha: string; message: string; author: string; date: string }>;
}

// ── provision ────────────────────────────────────────────────────────────────

/**
 * Idempotently provision a private workspace repo for the student and add them
 * as a push collaborator. Safe to call twice: a 422 "name already exists" on
 * repo create is treated as success (the repo is reused).
 */
export async function provisionWorkspaceRepo(
  enrollmentId: string,
  projectId: string,
  githubLogin: string,
): Promise<WorkspaceRepoView> {
  // Ownership and input validation FIRST — nothing reaches GitHub until the
  // caller is proven to own this project and the login is well-formed.
  const project = await requireOwnedProject(enrollmentId, projectId);
  if (!isValidGithubLogin(githubLogin)) {
    throw new Error('A valid GitHub username is required');
  }
  const login = githubLogin.trim();
  const token = requirePlatformToken();
  const owner = org();
  const repo = workspaceRepoName(project as any);

  // Guard: the enrollment must exist (avoids orphan connections).
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) throw new Error(`Enrollment not found: ${enrollmentId}`);

  // 1) Create the private repo (idempotent on 422 name-exists).
  const createRes = await fetchWithTimeout(`${apiBase()}/orgs/${owner}/repos`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: repo,
      private: true,
      auto_init: true,
      description: `Colaberry Accelerator workspace for ${enrollment.full_name || login}`,
    }),
  });
  if (!createRes.ok) {
    const body = await createRes.text().catch(() => '');
    const nameExists = createRes.status === 422 && /already exists/i.test(body);
    if (!nameExists) {
      throw new Error(`GitHub repo create failed (${createRes.status}): ${body}`);
    }
    // 422 name-exists → reuse the existing repo, fall through to collaborator + upsert.
  }

  // 2) Add the student as a push collaborator (201 invited / 204 already ok).
  const collabRes = await fetchWithTimeout(
    `${apiBase()}/repos/${owner}/${repo}/collaborators/${login}`,
    {
      method: 'PUT',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ permission: 'push' }),
    },
  );
  if (collabRes.status !== 201 && collabRes.status !== 204) {
    const body = await collabRes.text().catch(() => '');
    throw new Error(`GitHub add-collaborator failed (${collabRes.status}): ${body}`);
  }

  // 3) Upsert the connection. Do NOT persist the platform token.
  const repoUrl = `https://github.com/${owner}/${repo}`;
  // Keyed on the PROJECT now (FR-037), not the enrollment.
  const [connection] = await GitHubConnection.findOrCreate({
    where: { project_id: projectId },
    defaults: {
      project_id: projectId,
      enrollment_id: enrollmentId,
      repo_url: repoUrl,
      repo_owner: owner,
      repo_name: repo,
      access_token_encrypted: '', // platform-provisioned: token stays in env, never in DB
      status_json: { provisioned: true, student_github_login: login },
    } as any,
  });
  connection.repo_url = repoUrl;
  connection.repo_owner = owner;
  connection.repo_name = repo;
  connection.status_json = {
    ...(connection.status_json || {}),
    provisioned: true,
    student_github_login: login,
  };
  await connection.save();

  return viewFromConnection(connection);
}

// ── sync (pull only) ──────────────────────────────────────────────────────────

/**
 * Sync the student's repo: read the default branch → recursive tree → recent
 * commits, and persist file_tree_json / file_count / repo_language /
 * commit_summary_json / last_sync_at on the connection. Read-only — the portal
 * never commits. Uses the platform token (org owner reads the private repo).
 */
export async function syncWorkspaceRepo(enrollmentId: string, projectId: string): Promise<WorkspaceRepoView> {
  await requireOwnedProject(enrollmentId, projectId);
  const token = requirePlatformToken();

  const connection = await GitHubConnection.findOne({ where: { project_id: projectId } });
  if (!connection || !connection.repo_owner || !connection.repo_name) {
    throw new Error('No workspace repo provisioned for this student');
  }
  const owner = connection.repo_owner;
  const repo = connection.repo_name;

  // 1) Default branch.
  const repoRes = await getWithRetry(`${apiBase()}/repos/${owner}/${repo}`, token);
  if (!repoRes.ok) throw new Error(`GitHub repo read failed (${repoRes.status})`);
  const repoData: any = await repoRes.json();
  const branch: string = repoData.default_branch || 'main';

  // 2) Recursive tree.
  const treeRes = await getWithRetry(
    `${apiBase()}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    token,
  );
  if (!treeRes.ok) throw new Error(`GitHub tree read failed (${treeRes.status})`);
  const treeData: any = await treeRes.json();
  const files = (treeData.tree || []).filter((item: any) => item.type === 'blob');
  const fileCount: number = files.length;
  const language = detectLanguage(files);

  // 3) Recent commits.
  const commitsRes = await getWithRetry(
    `${apiBase()}/repos/${owner}/${repo}/commits?per_page=20`,
    token,
  );
  const commits: any[] = commitsRes.ok ? ((await commitsRes.json()) as any[]) : [];
  const summary = commits.map((c: any) => ({
    sha: (c.sha || '').substring(0, 7),
    message: (c.commit?.message || '').split('\n')[0],
    author: c.commit?.author?.name || '',
    date: c.commit?.author?.date || '',
  }));

  connection.file_tree_json = treeData;
  connection.file_count = fileCount;
  connection.repo_language = language || '';
  connection.commit_summary_json = summary;
  connection.last_sync_at = new Date();
  await connection.save();

  return viewFromConnection(connection);
}

// ── read ──────────────────────────────────────────────────────────────────────

/** Return the workspace repo state for the student (never throws on not-connected). */
export async function getWorkspaceRepo(enrollmentId: string, projectId: string): Promise<WorkspaceRepoView> {
  await requireOwnedProject(enrollmentId, projectId);
  const connection = await GitHubConnection.findOne({ where: { project_id: projectId } });
  if (!connection) {
    return {
      connected: false,
      provisioned: false,
      repo_url: null,
      repo_owner: null,
      repo_name: null,
      student_github_login: null,
      file_count: null,
      last_sync: null,
      recent_commits: [],
    };
  }
  return viewFromConnection(connection);
}

// ── helpers ───────────────────────────────────────────────────────────────────

function viewFromConnection(connection: GitHubConnection): WorkspaceRepoView {
  const status = (connection.status_json || {}) as { provisioned?: boolean; student_github_login?: string };
  const commits = Array.isArray(connection.commit_summary_json)
    ? (connection.commit_summary_json as WorkspaceRepoView['recent_commits'])
    : [];
  return {
    connected: true,
    provisioned: Boolean(status.provisioned && connection.repo_owner && connection.repo_name),
    repo_url: connection.repo_url || null,
    repo_owner: connection.repo_owner || null,
    repo_name: connection.repo_name || null,
    student_github_login: status.student_github_login || null,
    file_count: typeof connection.file_count === 'number' ? connection.file_count : null,
    last_sync: connection.last_sync_at ? new Date(connection.last_sync_at).toISOString() : null,
    recent_commits: commits,
  };
}

function detectLanguage(files: Array<{ path?: string }>): string | null {
  const extCounts: Record<string, number> = {};
  for (const file of files) {
    const ext = (file.path || '').split('.').pop()?.toLowerCase();
    if (ext && ext.length <= 10) extCounts[ext] = (extCounts[ext] || 0) + 1;
  }
  const langMap: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
    py: 'Python', go: 'Go', rs: 'Rust', java: 'Java', rb: 'Ruby', cs: 'C#',
  };
  const topExt = Object.entries(extCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  return topExt ? (langMap[topExt] || topExt) : null;
}
