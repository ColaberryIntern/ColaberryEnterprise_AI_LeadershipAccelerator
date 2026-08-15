/**
 * webhookSetupService — everything a student needs to register their own push
 * webhook, assembled server-side so the UI renders it rather than composes it.
 *
 * ── WHY THE STUDENT REGISTERS IT ─────────────────────────────────────────────
 *
 * Webhooks are per repository, so this is one hook per student — about thirty on
 * a cohort Thursday. The platform cannot install them: student build repos are
 * STUDENT-OWNED, and the connect flow deliberately holds no OAuth token, only a
 * pointer plus a push proof. Asking for an `admin:repo_hook` grant to automate
 * thirty one-time setups would trade the whole student-owned-repo position for a
 * minute of convenience.
 *
 * Claude Code is already running in the student's folder, authenticated as them.
 * So it registers the hook with THEIR access, as part of Story 000. We never
 * hold a token and never ask for a scope — the same decision, one level further.
 *
 * ── THE SECRET NEVER TOUCHES A FILE ──────────────────────────────────────────
 *
 * This is the part that has to be right. Student repos are public by default,
 * and Story 000's prompt is RENDERED INTO THE REPO as part of their docs — so
 * the secret can never appear in the prompt, in CLAUDE.md, in a .env the agent
 * helpfully creates, or in anything else that a `git add .` would sweep up.
 *
 * It is therefore surfaced ONLY here, behind participant auth, and passed as a
 * command-line argument. The copy says so in the imperative, because Claude Code
 * will otherwise offer to "save this somewhere convenient" out of helpfulness,
 * and we would rather it stop and ask.
 */
import GitHubConnection from '../../../models/GitHubConnection';
import Project from '../../../models/Project';
import { sequelize } from '../../../config/database';
import { QueryTypes } from 'sequelize';
import { getOrCreateWebhookSecret } from './webhookSecretService';

export interface WebhookSetupView {
  /** False when GITHUB_WEBHOOK_URL is unset — the whole feature is unavailable. */
  supported: boolean;
  owner: string | null;
  repo: string | null;
  payload_url: string | null;
  /** The per-repo signing secret. NEVER logged, never in another DTO. */
  secret: string | null;
  content_type: 'json';
  events: string[];
  /** One paste. Finds an existing hook on our URL and updates it, or creates one. */
  gh_command: string | null;
  /** Door two: the page to paste the two values into by hand. */
  settings_url: string | null;
  /**
   * When we last received a delivery from this repo — the only honest evidence
   * the hook works, since we cannot list their hooks without their credentials.
   * Null means "we have never heard from it", which reads as not set up yet.
   */
  last_delivery_at: string | null;
}

const unavailable = (): WebhookSetupView => ({
  supported: false,
  owner: null,
  repo: null,
  payload_url: null,
  secret: null,
  content_type: 'json',
  events: ['push'],
  gh_command: null,
  settings_url: null,
  last_delivery_at: null,
});

/**
 * Build the one-paste registration command.
 *
 * IDEMPOTENT BY CONSTRUCTION — it looks for a hook already pointing at our URL
 * and PATCHes it, and only creates one when there is none. Running Story 000
 * twice, or re-running this after a failure, therefore leaves exactly one hook.
 * A bare `--method POST` would happily stack duplicates, and a student with
 * three hooks gets three deliveries per push, which our delivery-id dedupe would
 * absorb but nobody should have to rely on.
 *
 * `repo` scope is enough for a repo the student owns; `admin:repo_hook` is only
 * needed if GitHub refuses, which the panel copy covers.
 */
function buildGhCommand(owner: string, repo: string, url: string, secret: string): string {
  const slug = `${owner}/${repo}`;
  // ONE LINE, deliberately, even though it reads worse than the block form.
  //
  // The student pastes this into a CHAT with Claude Code, not only into a
  // terminal. A multi-line block pasted into a message box gets sent on the
  // first newline, so the student ships a truncated first line, gets an error
  // about an unterminated `if`, and now has a debugging problem instead of a
  // setup step. One line survives every paste target we actually use.
  return [
    `HOOK_ID=$(gh api repos/${slug}/hooks --jq '.[] | select(.config.url=="${url}") | .id' | head -1);`,
    `if [ -n "$HOOK_ID" ];`,
    `then gh api repos/${slug}/hooks/$HOOK_ID --method PATCH`,
    `-f 'config[url]=${url}' -f 'config[content_type]=json' -f 'config[secret]=${secret}' -F active=true;`,
    `else gh api repos/${slug}/hooks --method POST -f name=web -F active=true -f 'events[]=push'`,
    `-f 'config[url]=${url}' -f 'config[content_type]=json' -f 'config[secret]=${secret}';`,
    `fi`,
  ].join(' ');
}

/**
 * Assemble the setup view for one project's repo.
 *
 * Returns `supported: false` rather than throwing when the platform has no
 * webhook URL configured, because that is an operator gap and the student's page
 * should degrade to "press Sync" rather than show them an error they cannot act
 * on. Ownership is proven by the caller before this runs.
 */
export async function getWebhookSetup(
  enrollmentId: string,
  projectId: string,
): Promise<WebhookSetupView | null> {
  // Ownership FIRST, before a secret is read or minted. Not-yours and
  // does-not-exist both return null and the route renders 404 for both, so this
  // cannot be used to probe for somebody else's project.
  if (!enrollmentId || !projectId) return null;
  const project = await Project.findByPk(projectId);
  if (!project || String((project as any).enrollment_id) !== String(enrollmentId)) return null;

  const url = process.env.GITHUB_WEBHOOK_URL;
  if (!url) return unavailable();

  const connection = await GitHubConnection.findOne({ where: { project_id: projectId } });
  if (!connection?.repo_owner || !connection?.repo_name) return unavailable();

  const secret = await getOrCreateWebhookSecret(projectId);
  if (!secret) return unavailable();

  const owner = connection.repo_owner;
  const repo = connection.repo_name;

  return {
    supported: true,
    owner,
    repo,
    payload_url: url,
    secret,
    content_type: 'json',
    events: ['push'],
    gh_command: buildGhCommand(owner, repo, url, secret),
    settings_url: `https://github.com/${owner}/${repo}/settings/hooks/new`,
    last_delivery_at: await lastDeliveryAt(owner, repo),
  };
}

/**
 * The most recent delivery we have received from this repo.
 *
 * This is the only proof of a working hook available to us: listing a student's
 * hooks needs their credentials, which we deliberately do not have. "We have
 * heard from this repo" is weaker evidence than "a hook is configured" but it is
 * evidence we can actually stand behind, and it is the thing the student cares
 * about anyway.
 *
 * Fail-soft: a missing ledger costs a timestamp on a panel.
 */
async function lastDeliveryAt(owner: string, repo: string): Promise<string | null> {
  try {
    const rows = await sequelize.query<{ received_at: Date | string }>(
      `SELECT received_at FROM github_webhook_deliveries
       WHERE repo_full_name = $slug ORDER BY received_at DESC LIMIT 1`,
      { bind: { slug: `${owner}/${repo}` }, type: QueryTypes.SELECT },
    );
    const at = rows[0]?.received_at;
    if (!at) return null;
    const d = at instanceof Date ? at : new Date(at);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}
