// ─── Agent GitHub Service ───────────────────────────────────────────────────
// Provides GitHub automation for AI agents: branch creation, file commits, PRs.
// Uses Octokit REST API. Requires GITHUB_TOKEN and GITHUB_REPO env vars.

import { env } from '../config/env';

interface GitHubConfig {
  token: string;
  repo: string; // "owner/repo" format
  baseUrl?: string;
}

function getConfig(): GitHubConfig | null {
  const token = (env as any).githubToken || process.env.GITHUB_TOKEN;
  const repo = (env as any).githubRepo || process.env.GITHUB_REPO;
  if (!token || !repo) return null;
  return { token, repo, baseUrl: process.env.GITHUB_API_URL };
}

async function githubApi(path: string, options: RequestInit = {}): Promise<any> {
  const config = getConfig();
  if (!config) throw new Error('GitHub not configured (GITHUB_TOKEN / GITHUB_REPO missing)');

  const baseUrl = config.baseUrl || 'https://api.github.com';
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function isGitHubConfigured(): boolean {
  return getConfig() !== null;
}

export async function getDefaultBranch(): Promise<string> {
  const config = getConfig()!;
  const repo = await githubApi(`/repos/${config.repo}`);
  return repo.default_branch || 'main';
}

export async function createBranch(baseBranch: string, newBranch: string): Promise<void> {
  const config = getConfig()!;
  const ref = await githubApi(`/repos/${config.repo}/git/ref/heads/${baseBranch}`);
  const sha = ref.object.sha;

  await githubApi(`/repos/${config.repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha }),
  });

  console.log(`[GitHub] Created branch ${newBranch} from ${baseBranch} (${sha.slice(0, 7)})`);
}

export async function commitFile(
  branch: string,
  filePath: string,
  content: string,
  commitMessage: string,
): Promise<string> {
  const config = getConfig()!;

  // Get current file SHA if it exists
  let existingSha: string | undefined;
  try {
    const existing = await githubApi(`/repos/${config.repo}/contents/${filePath}?ref=${branch}`);
    existingSha = existing.sha;
  } catch {
    // File doesn't exist yet
  }

  const result = await githubApi(`/repos/${config.repo}/contents/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: commitMessage,
      content: Buffer.from(content).toString('base64'),
      branch,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });

  console.log(`[GitHub] Committed ${filePath} to ${branch}`);
  return result.commit.sha;
}

export async function createPullRequest(
  branch: string,
  title: string,
  body: string,
  baseBranch?: string,
): Promise<{ number: number; url: string }> {
  const config = getConfig()!;
  const base = baseBranch || await getDefaultBranch();

  const pr = await githubApi(`/repos/${config.repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title, body, head: branch, base }),
  });

  console.log(`[GitHub] Created PR #${pr.number}: ${title}`);
  return { number: pr.number, url: pr.html_url };
}

export async function getPRStatus(prNumber: number): Promise<{ state: string; mergeable: boolean | null; checks: string }> {
  const config = getConfig()!;
  const pr = await githubApi(`/repos/${config.repo}/pulls/${prNumber}`);
  return {
    state: pr.state,
    mergeable: pr.mergeable,
    checks: pr.mergeable_state,
  };
}
