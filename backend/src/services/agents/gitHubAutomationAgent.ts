// ─── GitHub Automation Agent ────────────────────────────────────────────────
// On-demand agent that creates branches, applies code changes, and opens PRs.
// Called by Cory when user requests GitHub operations.

import {
  isGitHubConfigured,
  createBranch,
  commitFile,
  createPullRequest,
  getDefaultBranch,
} from '../agentGitHubService';
import type { AgentExecutionResult } from './types';

export interface GitHubAutomationRequest {
  action: 'create_pr' | 'commit_file' | 'create_branch';
  branch?: string;
  baseBranch?: string;
  filePath?: string;
  fileContent?: string;
  commitMessage?: string;
  prTitle?: string;
  prBody?: string;
}

export async function runGitHubAutomation(
  request: GitHubAutomationRequest,
): Promise<AgentExecutionResult> {
  const actions: Array<{ action: string; details: string; result: string }> = [];

  if (!isGitHubConfigured()) {
    return {
      status: 'skipped',
      summary: 'GitHub not configured. Set GITHUB_TOKEN and GITHUB_REPO environment variables.',
      actions,
      metrics: {},
    };
  }

  try {
    const defaultBranch = await getDefaultBranch();
    const base = request.baseBranch || defaultBranch;

    switch (request.action) {
      case 'create_branch': {
        const branchName = request.branch || `agent/${Date.now()}`;
        await createBranch(base, branchName);
        actions.push({ action: 'create_branch', details: branchName, result: 'success' });
        return {
          status: 'success',
          summary: `Created branch ${branchName} from ${base}`,
          actions,
          metrics: { branches_created: 1 },
        };
      }

      case 'commit_file': {
        if (!request.filePath || !request.fileContent) {
          return { status: 'error', summary: 'filePath and fileContent are required for commit_file', actions, metrics: {} };
        }
        const branch = request.branch || `agent/update-${Date.now()}`;
        // Create branch if it doesn't exist on the default
        if (branch !== base) {
          try { await createBranch(base, branch); } catch { /* branch may already exist */ }
        }
        const sha = await commitFile(branch, request.filePath, request.fileContent, request.commitMessage || `Update ${request.filePath}`);
        actions.push({ action: 'commit_file', details: `${request.filePath} on ${branch}`, result: sha });
        return {
          status: 'success',
          summary: `Committed ${request.filePath} to ${branch} (${sha.slice(0, 7)})`,
          actions,
          metrics: { files_committed: 1 },
        };
      }

      case 'create_pr': {
        const branch = request.branch;
        if (!branch) {
          return { status: 'error', summary: 'branch is required for create_pr', actions, metrics: {} };
        }
        const pr = await createPullRequest(
          branch,
          request.prTitle || `Agent update from ${branch}`,
          request.prBody || 'Automated PR created by AI agent.',
          base,
        );
        actions.push({ action: 'create_pr', details: `PR #${pr.number}`, result: pr.url });
        return {
          status: 'success',
          summary: `Created PR #${pr.number}: ${pr.url}`,
          actions,
          metrics: { prs_created: 1 },
        };
      }

      default:
        return { status: 'error', summary: `Unknown action: ${request.action}`, actions, metrics: {} };
    }
  } catch (err: any) {
    return {
      status: 'error',
      summary: `GitHub automation failed: ${err.message}`,
      actions,
      metrics: {},
    };
  }
}
