/**
 * Student workspace repo — platform-provisioned GitHub repos for build files.
 *
 * Model (locked with the product owner):
 *   - Each student gets ONE private repo under the ColaberryIntern org, created
 *     by the platform token (no student OAuth). The student is added as a push
 *     collaborator, clones it, and builds their Claude Code work there.
 *   - "Commit each time" = the student commits + pushes locally; the portal
 *     SYNCS (pulls) the repo tree + recent commits so the portal reflects their
 *     files. Their git is the source of truth; the portal never commits for them.
 *
 * Reuses the existing `GitHubConnection` (one row per enrollment). The platform
 * token lives ONLY in env (never written to the DB), so a DB leak can't expose
 * it — that's why sync here uses the env token directly rather than the shared
 * githubService path (which reads a per-connection token).
 *
 * Requires env:
 *   GITHUB_TOKEN            platform PAT/app token with repo-create + collaborator
 *                           rights in the org (already used by agentGitHubService)
 *   GITHUB_WORKSPACE_ORG    org to create student repos under (default ColaberryIntern)
 *   GITHUB_API_URL          default https://api.github.com
 */
import { GitHubConnection, Enrollment } from '../models';

const ORG = () => process.env.GITHUB_WORKSPACE_ORG || 'ColaberryIntern';
const API = () => process.env.GITHUB_API_URL || 'https://api.github.com';
const TOKEN = () => process.env.GITHUB_TOKEN || '';

export interface WorkspaceRepo {
  connected: boolean;
  provisioned: boolean;
  repo_url?: string;
  repo_owner?: string;
  repo_name?: string;
  student_github_login?: string;
  file_count?: number;
  last_sync?: Date | null;
  recent_commits?: any[];
}

class WorkspaceError extends Error {}

async function gh(path: string, init: { method?: string; body?: any } = {}): Promise<{ status: number; json: any }> {
  const token = TOKEN();
  if (!token) {
    throw new WorkspaceError(
      'GITHUB_TOKEN is not configured — cannot provision or sync student workspace repos.');
  }
  const res = await fetch(`${API()}${path}`, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* 204s have no body */ }
  return { status: res.status, json };
}

function slugify(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'student';
}

/** Stable, unique repo name for an enrollment: `<name>-workspace-<shortid>`. */
function repoNameFor(enrollment: Enrollment): string {
  const base = slugify((enrollment.full_name || enrollment.email || 'student').split('@')[0]);
  const shortid = String(enrollment.id).replace(/-/g, '').slice(0, 6);
  return `${base}-workspace-${shortid}`;
}

/**
 * Provision (idempotently) the student's workspace repo and add them as a
 * collaborator. Safe to call repeatedly — creating an existing repo or
 * re-adding an existing collaborator is treated as success.
 */
export async function provisionWorkspaceRepo(
  enrollmentId: string,
  githubLogin: string,
): Promise<WorkspaceRepo> {
  const login = (githubLogin || '').trim().replace(/^@/, '');
  if (!login) throw new WorkspaceError('A GitHub username is required to provision your workspace repo.');

  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) throw new WorkspaceError('Enrollment not found.');

  const org = ORG();
  const existing = await GitHubConnection.findOne({ where: { enrollment_id: enrollmentId } });
  // Reuse the already-provisioned repo name so re-provision is idempotent.
  const repoName = (existing?.repo_owner === org && existing?.repo_name)
    ? existing.repo_name
    : repoNameFor(enrollment);

  // 1. Create the repo in the org (idempotent: 422 name-exists → proceed).
  const create = await gh(`/orgs/${org}/repos`, {
    method: 'POST',
    body: {
      name: repoName,
      private: true,
      auto_init: true,
      description: `Colaberry AI Systems Architect workspace — ${enrollment.full_name || enrollment.email}`,
    },
  });
  if (create.status !== 201) {
    const alreadyExists = create.status === 422
      && JSON.stringify(create.json?.errors || create.json || '').includes('already exists');
    if (!alreadyExists) {
      throw new WorkspaceError(
        `GitHub repo create failed (${create.status}): ${create.json?.message || 'unknown error'}`);
    }
  }

  // 2. Add the student as a push collaborator (201 invited / 204 already a member).
  const collab = await gh(`/repos/${org}/${repoName}/collaborators/${login}`, {
    method: 'PUT',
    body: { permission: 'push' },
  });
  if (collab.status !== 201 && collab.status !== 204) {
    throw new WorkspaceError(
      `Could not invite "${login}" as a collaborator (${collab.status}): ${collab.json?.message || 'check the GitHub username'}`);
  }

  // 3. Record the connection (platform token is NOT persisted).
  const repoUrl = `https://github.com/${org}/${repoName}`;
  const statusJson = { ...(existing?.status_json || {}), provisioned: true, student_github_login: login };
  if (existing) {
    existing.repo_url = repoUrl;
    existing.repo_owner = org;
    existing.repo_name = repoName;
    existing.status_json = statusJson;
    await existing.save();
  } else {
    await GitHubConnection.create({
      enrollment_id: enrollmentId,
      repo_url: repoUrl,
      repo_owner: org,
      repo_name: repoName,
      access_token_encrypted: '',
      status_json: statusJson,
    } as any);
  }

  return getWorkspaceRepo(enrollmentId);
}

/**
 * Sync (pull) the student's repo — refresh the file tree + recent commits into
 * the connection so the portal reflects what they've pushed. Uses the platform
 * token (org owner can read the private repo).
 */
export async function syncWorkspaceRepo(enrollmentId: string): Promise<WorkspaceRepo> {
  const conn = await GitHubConnection.findOne({ where: { enrollment_id: enrollmentId } });
  if (!conn || !conn.repo_owner || !conn.repo_name) {
    throw new WorkspaceError('No workspace repo to sync — provision one first.');
  }
  const { repo_owner: owner, repo_name: repo } = conn;

  // default branch
  const repoInfo = await gh(`/repos/${owner}/${repo}`);
  if (repoInfo.status !== 200) {
    throw new WorkspaceError(`Repo not reachable (${repoInfo.status}): ${repoInfo.json?.message || ''}`);
  }
  const branch = repoInfo.json?.default_branch || 'main';

  // recursive tree
  const tree = await gh(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
  const blobs: any[] = Array.isArray(tree.json?.tree) ? tree.json.tree.filter((n: any) => n.type === 'blob') : [];
  const language = inferLanguage(blobs.map((b) => b.path));

  // recent commits
  const commits = await gh(`/repos/${owner}/${repo}/commits?per_page=20&sha=${branch}`);
  const commitSummary = Array.isArray(commits.json)
    ? commits.json.map((c: any) => ({
        sha: c.sha?.slice(0, 7),
        message: c.commit?.message?.split('\n')[0],
        author: c.commit?.author?.name,
        date: c.commit?.author?.date,
      }))
    : [];

  conn.file_tree_json = tree.json?.tree || [];
  conn.file_count = blobs.length;
  conn.repo_language = language;
  conn.commit_summary_json = commitSummary;
  conn.last_sync_at = new Date();
  await conn.save();

  return getWorkspaceRepo(enrollmentId);
}

/** Read the current workspace-repo state for the portal. */
export async function getWorkspaceRepo(enrollmentId: string): Promise<WorkspaceRepo> {
  const conn = await GitHubConnection.findOne({ where: { enrollment_id: enrollmentId } });
  if (!conn) return { connected: false, provisioned: false };
  return {
    connected: true,
    provisioned: Boolean((conn.status_json as any)?.provisioned),
    repo_url: conn.repo_url,
    repo_owner: conn.repo_owner,
    repo_name: conn.repo_name,
    student_github_login: (conn.status_json as any)?.student_github_login,
    file_count: conn.file_count,
    last_sync: conn.last_sync_at,
    recent_commits: (conn.commit_summary_json || []).slice(0, 5),
  };
}

const EXT_LANG: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
  py: 'Python', rb: 'Ruby', go: 'Go', java: 'Java', rs: 'Rust', php: 'PHP',
  html: 'HTML', css: 'CSS', md: 'Markdown', json: 'JSON',
};

function inferLanguage(paths: string[]): string | null {
  const counts: Record<string, number> = {};
  for (const p of paths) {
    const ext = p.split('.').pop()?.toLowerCase();
    const lang = ext ? EXT_LANG[ext] : undefined;
    if (lang) counts[lang] = (counts[lang] || 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}
