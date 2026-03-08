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
