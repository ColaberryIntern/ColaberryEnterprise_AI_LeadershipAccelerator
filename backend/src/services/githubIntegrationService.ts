import crypto from 'crypto';
import { Op } from 'sequelize';
import { GitHubConnection, StudentGithubActivity, Enrollment } from '../models';

const GITHUB_API = 'https://api.github.com';
const OAUTH_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const OAUTH_TOKEN_URL = 'https://github.com/login/oauth/access_token';

function ghHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github.v3+json',
    Authorization: `Bearer ${token}`,
  };
}

// ─── OAuth ───────────────────────────────────────────────────────────────────

export function buildOAuthUrl(enrollmentId: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: process.env.GITHUB_OAUTH_REDIRECT_URI!,
    scope: 'repo',
    state: enrollmentId,
  });
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForToken(code: string): Promise<string> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  if (!res.ok) throw new Error(`GitHub token exchange HTTP error: ${res.status}`);
  const data: any = await res.json();
  if (data.error) throw new Error(`GitHub OAuth error: ${data.error_description ?? data.error}`);
  if (!data.access_token) throw new Error('GitHub returned no access_token');
  return data.access_token as string;
}

export async function handleOAuthCallback(code: string, enrollmentId: string): Promise<void> {
  const token = await exchangeCodeForToken(code);

  const [connection, created] = await GitHubConnection.findOrCreate({
    where: { enrollment_id: enrollmentId },
    defaults: { enrollment_id: enrollmentId, access_token_encrypted: token, status_json: {} } as any,
  });

  if (!created && connection.access_token_encrypted !== token) {
    connection.access_token_encrypted = token;
    await connection.save();
  }

  // If repo already connected, register webhook now (best-effort).
  if (connection.repo_owner && connection.repo_name) {
    await registerWebhook(enrollmentId).catch((err: Error) => {
      console.error(JSON.stringify({ level: 'warn', service: 'backend', event: 'github_webhook_register_failed', outcome: 'failure', error_class: err.constructor.name, context: { message: err.message, enrollment_id: enrollmentId } }));
    });
  }

  await syncStudentActivity(enrollmentId).catch((err: Error) => {
    console.error(JSON.stringify({ level: 'warn', service: 'backend', event: 'github_initial_sync_failed', outcome: 'failure', error_class: err.constructor.name, context: { message: err.message, enrollment_id: enrollmentId } }));
  });
}

// ─── Webhook Registration ─────────────────────────────────────────────────────

export async function registerWebhook(enrollmentId: string): Promise<void> {
  const connection = await GitHubConnection.findOne({ where: { enrollment_id: enrollmentId } });
  if (!connection?.access_token_encrypted || !connection.repo_owner || !connection.repo_name) return;

  const webhookUrl = process.env.GITHUB_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('GITHUB_WEBHOOK_URL env var not set');

  const res = await fetch(
    `${GITHUB_API}/repos/${connection.repo_owner}/${connection.repo_name}/hooks`,
    {
      method: 'POST',
      headers: { ...ghHeaders(connection.access_token_encrypted), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['push'],
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret: process.env.GITHUB_WEBHOOK_SECRET ?? '',
          insecure_ssl: '0',
        },
      }),
    },
  );

  // 422 = webhook with this URL already registered — treat as success
  if (!res.ok && res.status !== 422) {
    const body = await res.text();
    throw new Error(`Webhook registration failed (${res.status}): ${body}`);
  }
}

// ─── Activity Sync ────────────────────────────────────────────────────────────

export async function syncStudentActivity(enrollmentId: string): Promise<void> {
  const connection = await GitHubConnection.findOne({ where: { enrollment_id: enrollmentId } });
  if (!connection?.access_token_encrypted || !connection.repo_owner || !connection.repo_name) return;

  const token = connection.access_token_encrypted;
  const headers = ghHeaders(token);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const repoPath = `${connection.repo_owner}/${connection.repo_name}`;

  // Commits in last 7 days
  const commitsRes = await fetch(
    `${GITHUB_API}/repos/${repoPath}/commits?since=${since}&per_page=100`,
    { headers },
  );
  const commits: any[] = commitsRes.ok ? await commitsRes.json() : [];
  const commits_last_7d = Array.isArray(commits) ? commits.length : 0;

  // 7-day contribution graph (date → count)
  const dayCounts: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dayCounts[d.toISOString().slice(0, 10)] = 0;
  }
  if (Array.isArray(commits)) {
    for (const c of commits) {
      const date: string | undefined = c.commit?.author?.date?.slice(0, 10);
      if (date && Object.prototype.hasOwnProperty.call(dayCounts, date)) {
        dayCounts[date]++;
      }
    }
  }
  const contribution_graph_json = Object.entries(dayCounts).map(([date, count]) => ({ date, count }));

  // Open PRs
  const prsRes = await fetch(
    `${GITHUB_API}/repos/${repoPath}/pulls?state=open&per_page=100`,
    { headers },
  );
  const prs: any[] = prsRes.ok ? await prsRes.json() : [];
  const open_prs = Array.isArray(prs) ? prs.length : 0;

  // Repo info (stars + raw snapshot)
  const repoRes = await fetch(`${GITHUB_API}/repos/${repoPath}`, { headers });
  const repoData: any = repoRes.ok ? await repoRes.json() : {};
  const total_stars: number = repoData.stargazers_count ?? 0;
  const raw_repos_json = repoRes.ok ? repoData : null;

  const payload = {
    synced_at: new Date(),
    commits_last_7d,
    open_prs,
    total_stars,
    contribution_graph_json,
    raw_repos_json,
  };

  const existing = await StudentGithubActivity.findOne({ where: { enrollment_id: enrollmentId } });
  if (existing) {
    await existing.update(payload);
  } else {
    await StudentGithubActivity.create({ enrollment_id: enrollmentId, ...payload } as any);
  }
}

// ─── Webhook Validation ───────────────────────────────────────────────────────

export function validateWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function findEnrollmentByRepo(owner: string, repo: string): Promise<string | null> {
  const connection = await GitHubConnection.findOne({ where: { repo_owner: owner, repo_name: repo } });
  return connection?.enrollment_id ?? null;
}

// ─── Batch Sync (Portfolio Agent) ─────────────────────────────────────────────

export async function syncAllActiveStudentGitHubActivity(): Promise<{
  synced: number;
  skipped: number;
  failed: number;
}> {
  const activeEnrollments = await Enrollment.findAll({
    where: { status: 'active' },
    attributes: ['id'],
  });

  if (activeEnrollments.length === 0) return { synced: 0, skipped: 0, failed: 0 };

  const activeIds = activeEnrollments.map((e: any) => e.id as string);

  const allConnections = await GitHubConnection.findAll({
    where: { enrollment_id: { [Op.in]: activeIds } },
    attributes: ['enrollment_id', 'repo_owner', 'repo_name'],
  });

  const connections = allConnections.filter(
    (c: any) => c.repo_owner && c.repo_name,
  );

  const skipped = activeIds.length - connections.length;
  let synced = 0;
  let failed = 0;

  for (const connection of connections) {
    try {
      await syncStudentActivity(connection.enrollment_id);
      synced++;
    } catch (err: any) {
      failed++;
      console.error(JSON.stringify({
        level: 'error',
        service: 'backend',
        event: 'portfolio_github_sync_student_failed',
        outcome: 'failure',
        error_class: err.constructor?.name ?? 'Error',
        context: { enrollment_id: connection.enrollment_id, message: err.message },
      }));
    }
  }

  return { synced, skipped, failed };
}
