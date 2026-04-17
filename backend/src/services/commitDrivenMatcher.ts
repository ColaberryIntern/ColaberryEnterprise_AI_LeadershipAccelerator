/**
 * Commit-Driven Requirement Matcher
 *
 * When the GitHub file tree is synced, this service:
 *   1. Fetches recent commit details (files changed per commit)
 *   2. Maps changed files → affected BPs (by path + keyword proximity)
 *   3. Runs the content-aware verifier on only the affected BPs
 *   4. Updates requirement statuses automatically
 *
 * This closes the loop: push code → portal sees it → BP status updates.
 * No manual Resync required for recent work.
 */

import { Op } from 'sequelize';
import { Capability, RequirementsMap, Project } from '../models';
import { getConnection, readFileFromRepo } from './githubService';
import { verifyWithFileContent } from './contentAwareVerifier';

interface ChangedFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
}

interface CommitDetail {
  sha: string;
  message: string;
  files: ChangedFile[];
}

/**
 * Fetch details (including changed files) for recent commits from GitHub API.
 */
async function fetchRecentCommitDetails(
  enrollmentId: string,
  maxCommits: number = 10,
): Promise<CommitDetail[]> {
  const connection = await getConnection(enrollmentId);
  if (!connection?.repo_owner || !connection?.repo_name) return [];

  const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' };
  if (connection.access_token_encrypted) {
    headers['Authorization'] = `Bearer ${connection.access_token_encrypted}`;
  }

  // Get recent commit SHAs
  const listRes = await fetch(
    `https://api.github.com/repos/${connection.repo_owner}/${connection.repo_name}/commits?per_page=${maxCommits}`,
    { headers },
  );
  if (!listRes.ok) return [];
  const commits: any[] = await listRes.json() as any[];

  // Fetch file details for each commit (in parallel, capped)
  const details: CommitDetail[] = [];
  const batch = commits.slice(0, maxCommits);
  await Promise.all(batch.map(async (c: any) => {
    try {
      const detailRes = await fetch(
        `https://api.github.com/repos/${connection.repo_owner}/${connection.repo_name}/commits/${c.sha}`,
        { headers },
      );
      if (!detailRes.ok) return;
      const detail: any = await detailRes.json();
      details.push({
        sha: c.sha?.substring(0, 7) || '',
        message: (detail.commit?.message || '').split('\n')[0],
        files: (detail.files || []).map((f: any) => ({
          filename: f.filename || '',
          status: f.status || 'modified',
        })),
      });
    } catch {}
  }));

  return details;
}

/**
 * Map changed files to BPs. A file affects a BP if:
 *   - The file path shares keywords with the BP name or its requirements
 *   - The commit message mentions the BP name or related terms
 */
function mapFilesToBPs(
  commits: CommitDetail[],
  bps: Array<{ id: string; name: string; requirementTexts: string[] }>,
): Map<string, { bpId: string; bpName: string; changedFiles: string[]; commitMessages: string[] }> {
  const affected = new Map<string, { bpId: string; bpName: string; changedFiles: string[]; commitMessages: string[] }>();

  // Build keyword index for each BP
  const bpKeywords = bps.map(bp => {
    const words = new Set<string>();
    const text = [bp.name, ...bp.requirementTexts.slice(0, 20)].join(' ').toLowerCase();
    for (const w of text.split(/\W+/)) {
      if (w.length > 3) words.add(w);
    }
    return { ...bp, keywords: words };
  });

  // Collect all unique changed files across commits
  const allChangedFiles = new Map<string, string[]>(); // file → commit messages
  for (const commit of commits) {
    for (const f of commit.files) {
      if (f.status === 'removed') continue;
      const existing = allChangedFiles.get(f.filename) || [];
      existing.push(commit.message);
      allChangedFiles.set(f.filename, existing);
    }
  }

  // Score each file against each BP
  for (const [filePath, commitMsgs] of allChangedFiles) {
    const fileTokens = filePath.toLowerCase().split(/[/\\_.\-]+/).filter(t => t.length > 2);
    const msgTokens = commitMsgs.join(' ').toLowerCase().split(/\W+/).filter(t => t.length > 3);
    const allTokens = new Set([...fileTokens, ...msgTokens]);

    for (const bp of bpKeywords) {
      let score = 0;
      for (const kw of bp.keywords) {
        if (allTokens.has(kw)) score++;
        // Partial match: 'security' matches 'secur' stem
        for (const t of allTokens) {
          if (t.length > 4 && kw.length > 4 && (t.includes(kw.substring(0, 5)) || kw.includes(t.substring(0, 5)))) {
            score += 0.5;
            break;
          }
        }
      }

      if (score >= 2) {
        const entry = affected.get(bp.id) || { bpId: bp.id, bpName: bp.name, changedFiles: [], commitMessages: [] };
        if (!entry.changedFiles.includes(filePath)) entry.changedFiles.push(filePath);
        for (const m of commitMsgs) {
          if (!entry.commitMessages.includes(m)) entry.commitMessages.push(m);
        }
        affected.set(bp.id, entry);
      }
    }
  }

  return affected;
}

/**
 * Main entry point: run after GitHub sync to auto-update BP requirement statuses.
 */
export async function matchRecentCommitsToBPs(
  enrollmentId: string,
  projectId: string,
): Promise<{
  commitsAnalyzed: number;
  bpsAffected: number;
  requirementsVerified: number;
}> {
  console.log('[CommitMatcher] Starting commit-driven matching...');

  // 1. Fetch recent commit details with changed files
  const commits = await fetchRecentCommitDetails(enrollmentId, 10);
  if (commits.length === 0) {
    console.log('[CommitMatcher] No recent commits found');
    return { commitsAnalyzed: 0, bpsAffected: 0, requirementsVerified: 0 };
  }

  const totalFiles = commits.reduce((n, c) => n + c.files.length, 0);
  console.log(`[CommitMatcher] ${commits.length} commits, ${totalFiles} file changes`);

  // 2. Load all BPs + their unmatched requirements
  const bps = await Capability.findAll({
    where: { project_id: projectId, source: { [Op.ne]: 'frontend_page' } },
    attributes: ['id', 'name'],
  });
  const bpData = await Promise.all(bps.map(async (bp: any) => {
    const reqs = await RequirementsMap.findAll({
      where: { capability_id: bp.id },
      attributes: ['requirement_text'],
    });
    return {
      id: bp.id,
      name: bp.name,
      requirementTexts: reqs.map((r: any) => r.requirement_text || ''),
    };
  }));

  // 3. Map changed files → affected BPs
  const affected = mapFilesToBPs(commits, bpData);
  console.log(`[CommitMatcher] ${affected.size} BPs affected by recent commits`);

  if (affected.size === 0) {
    return { commitsAnalyzed: commits.length, bpsAffected: 0, requirementsVerified: 0 };
  }

  // 4. For each affected BP, run content-aware verification on unmatched requirements
  const conn = await getConnection(enrollmentId);
  const fileTree: string[] = conn?.file_tree_json?.tree
    ? conn.file_tree_json.tree.filter((t: any) => t.type === 'blob').map((t: any) => t.path)
    : [];
  const implFiles = fileTree.filter(f => {
    const name = (f.split('/').pop() || '').toLowerCase();
    if (name.startsWith('.') || /^\d{14}/.test(name)) return false;
    if (f.includes('node_modules/') || f.includes('dist/') || f.includes('.github/') || f.includes('migrations/')) return false;
    return /\.(ts|tsx|js|jsx|py|go|rs|java|rb)$/.test(name);
  });

  let totalVerified = 0;

  for (const [bpId, info] of affected) {
    const unmatched = await RequirementsMap.findAll({
      where: { capability_id: bpId, status: { [Op.in]: ['unmatched', 'partial'] } },
    });
    if (unmatched.length === 0) {
      console.log(`[CommitMatcher] ${info.bpName}: all requirements already matched, skip`);
      continue;
    }

    console.log(`[CommitMatcher] ${info.bpName}: ${unmatched.length} unmatched, ${info.changedFiles.length} changed files, verifying...`);

    try {
      // Prioritize the changed files in the verification (put them first in the candidate list)
      const prioritizedFiles = [
        ...info.changedFiles.filter(f => implFiles.includes(f)),
        ...implFiles.filter(f => !info.changedFiles.includes(f)),
      ];

      const result = await verifyWithFileContent(
        enrollmentId,
        unmatched.map((r: any) => ({
          id: r.id,
          requirement_key: r.requirement_key,
          requirement_text: r.requirement_text || '',
        })),
        prioritizedFiles,
        info.bpName,
      );

      for (const v of result.verified) {
        const req = await RequirementsMap.findByPk(v.id);
        if (req && ((req as any).status === 'unmatched' || (req as any).status === 'partial')) {
          (req as any).status = 'matched';
          (req as any).github_file_paths = v.matched_files.slice(0, 5);
          (req as any).confidence_score = 0.9;
          (req as any).verified_by = 'commit_driven';
          await req.save();
          totalVerified++;
        }
      }

      if (result.verified.length > 0) {
        console.log(`[CommitMatcher] ${info.bpName}: verified ${result.verified.length} requirements via commit analysis`);
      }
    } catch (err: any) {
      console.error(`[CommitMatcher] ${info.bpName}: verification failed:`, err?.message);
    }
  }

  console.log(`[CommitMatcher] Done: ${commits.length} commits, ${affected.size} BPs, ${totalVerified} requirements verified`);
  return {
    commitsAnalyzed: commits.length,
    bpsAffected: affected.size,
    requirementsVerified: totalVerified,
  };
}
