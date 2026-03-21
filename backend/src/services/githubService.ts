import { GitHubConnection } from '../models';
import * as variableService from './variableService';

export async function connectRepo(
  enrollmentId: string,
  repoUrl: string,
  accessToken?: string
): Promise<GitHubConnection> {
  // Parse GitHub URL to extract owner/name
  const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  const repoOwner = match?.[1] || '';
  const repoName = match?.[2] || '';

  const [connection] = await GitHubConnection.findOrCreate({
    where: { enrollment_id: enrollmentId },
    defaults: {
      enrollment_id: enrollmentId,
      repo_url: repoUrl,
      repo_owner: repoOwner,
      repo_name: repoName,
      access_token_encrypted: accessToken || '',
      status_json: {},
    } as any,
  });

  if (connection.repo_url !== repoUrl) {
    connection.repo_url = repoUrl;
    connection.repo_owner = repoOwner;
    connection.repo_name = repoName;
    if (accessToken) connection.access_token_encrypted = accessToken;
    await connection.save();
  }

  return connection;
}

export async function getConnection(enrollmentId: string): Promise<GitHubConnection | null> {
  return GitHubConnection.findOne({ where: { enrollment_id: enrollmentId } });
}

export async function checkRequiredFiles(
  enrollmentId: string,
  requiredFiles: string[] = ['requirements.md', 'README.md', 'project_status.md']
): Promise<{ found: string[]; missing: string[]; error?: string }> {
  const connection = await getConnection(enrollmentId);
  if (!connection || !connection.repo_owner || !connection.repo_name) {
    return { found: [], missing: requiredFiles, error: 'No GitHub repository connected' };
  }

  const found: string[] = [];
  const missing: string[] = [];

  for (const file of requiredFiles) {
    try {
      const url = `https://api.github.com/repos/${connection.repo_owner}/${connection.repo_name}/contents/${file}`;
      const headers: any = { 'Accept': 'application/vnd.github.v3+json' };
      if (connection.access_token_encrypted) {
        headers['Authorization'] = `Bearer ${connection.access_token_encrypted}`;
      }

      const response = await fetch(url, { headers });
      if (response.ok) {
        found.push(file);
      } else {
        missing.push(file);
      }
    } catch {
      missing.push(file);
    }
  }

  // Update status
  connection.last_checked_at = new Date();
  connection.status_json = { found, missing, checkedAt: new Date().toISOString() };
  await connection.save();

  return { found, missing };
}

export async function getRepoStatus(enrollmentId: string): Promise<any> {
  const connection = await getConnection(enrollmentId);
  if (!connection) return null;

  return {
    repoUrl: connection.repo_url,
    repoOwner: connection.repo_owner,
    repoName: connection.repo_name,
    lastChecked: connection.last_checked_at,
    status: connection.status_json,
  };
}

// ---------------------------------------------------------------------------
// File Tree Sync (Artifact V2)
// ---------------------------------------------------------------------------

export async function syncFileTree(enrollmentId: string): Promise<{
  fileCount: number;
  language: string | null;
}> {
  const connection = await getConnection(enrollmentId);
  if (!connection || !connection.repo_owner || !connection.repo_name) {
    throw new Error('No GitHub repository connected');
  }

  const headers: any = { 'Accept': 'application/vnd.github.v3+json' };
  if (connection.access_token_encrypted) {
    headers['Authorization'] = `Bearer ${connection.access_token_encrypted}`;
  }

  // Get default branch
  const repoRes = await fetch(
    `https://api.github.com/repos/${connection.repo_owner}/${connection.repo_name}`,
    { headers }
  );
  if (!repoRes.ok) throw new Error(`GitHub API error: ${repoRes.status}`);
  const repoData: any = await repoRes.json();
  const branch = repoData.default_branch || 'main';

  // Get recursive tree
  const treeRes = await fetch(
    `https://api.github.com/repos/${connection.repo_owner}/${connection.repo_name}/git/trees/${branch}?recursive=1`,
    { headers }
  );
  if (!treeRes.ok) throw new Error(`GitHub tree API error: ${treeRes.status}`);
  const treeData: any = await treeRes.json();

  const files = (treeData.tree || []).filter((item: any) => item.type === 'blob');
  const fileCount = files.length;

  // Detect primary language from file extensions
  const extCounts: Record<string, number> = {};
  for (const file of files) {
    const ext = (file.path || '').split('.').pop()?.toLowerCase();
    if (ext && ext.length <= 10) {
      extCounts[ext] = (extCounts[ext] || 0) + 1;
    }
  }
  const langMap: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
    py: 'Python', go: 'Go', rs: 'Rust', java: 'Java', rb: 'Ruby', cs: 'C#',
  };
  const topExt = Object.entries(extCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const language = topExt ? (langMap[topExt] || topExt) : null;

  connection.file_tree_json = treeData;
  connection.file_count = fileCount;
  connection.repo_language = language || '';
  connection.last_sync_at = new Date();
  await connection.save();

  return { fileCount, language };
}

export async function syncCommitHistory(
  enrollmentId: string,
  count: number = 20
): Promise<number> {
  const connection = await getConnection(enrollmentId);
  if (!connection || !connection.repo_owner || !connection.repo_name) {
    throw new Error('No GitHub repository connected');
  }

  const headers: any = { 'Accept': 'application/vnd.github.v3+json' };
  if (connection.access_token_encrypted) {
    headers['Authorization'] = `Bearer ${connection.access_token_encrypted}`;
  }

  const commitsRes = await fetch(
    `https://api.github.com/repos/${connection.repo_owner}/${connection.repo_name}/commits?per_page=${count}`,
    { headers }
  );
  if (!commitsRes.ok) throw new Error(`GitHub commits API error: ${commitsRes.status}`);
  const commits: any[] = (await commitsRes.json()) as any[];

  const summary = commits.map((c: any) => ({
    sha: c.sha?.substring(0, 7),
    message: c.commit?.message?.split('\n')[0] || '',
    author: c.commit?.author?.name || '',
    date: c.commit?.author?.date || '',
    files_changed: c.stats?.total || 0,
  }));

  connection.commit_summary_json = summary;
  await connection.save();

  return summary.length;
}

export async function fullSync(enrollmentId: string): Promise<{
  fileCount: number;
  language: string | null;
  commitCount: number;
}> {
  const { fileCount, language } = await syncFileTree(enrollmentId);
  const commitCount = await syncCommitHistory(enrollmentId);
  return { fileCount, language, commitCount };
}

export async function getFileTree(enrollmentId: string): Promise<any> {
  const connection = await getConnection(enrollmentId);
  return connection?.file_tree_json || null;
}

export async function generateStatusReport(
  enrollmentId: string
): Promise<string | null> {
  const connection = await getConnection(enrollmentId);
  if (!connection || !connection.repo_owner || !connection.repo_name) return null;

  // Fetch repo info
  try {
    const headers: any = { 'Accept': 'application/vnd.github.v3+json' };
    if (connection.access_token_encrypted) {
      headers['Authorization'] = `Bearer ${connection.access_token_encrypted}`;
    }

    const repoRes = await fetch(
      `https://api.github.com/repos/${connection.repo_owner}/${connection.repo_name}`,
      { headers }
    );
    if (!repoRes.ok) return null;
    const repoData: any = await repoRes.json();

    const commitsRes = await fetch(
      `https://api.github.com/repos/${connection.repo_owner}/${connection.repo_name}/commits?per_page=10`,
      { headers }
    );
    const commits: any[] = commitsRes.ok ? (await commitsRes.json()) as any[] : [];

    const report = [
      `# Project Status Report`,
      `**Repository:** ${connection.repo_url}`,
      `**Last Updated:** ${repoData.updated_at}`,
      `**Default Branch:** ${repoData.default_branch}`,
      `**Open Issues:** ${repoData.open_issues_count}`,
      ``,
      `## Recent Commits (Last 10)`,
      ...commits.map((c: any) =>
        `- ${c.commit.message.split('\n')[0]} (${new Date(c.commit.author.date).toLocaleDateString()})`
      ),
    ].join('\n');

    // Store as variable
    await variableService.setVariable(enrollmentId, 'project_status_update', report, 'program');

    return report;
  } catch (err) {
    return null;
  }
}
