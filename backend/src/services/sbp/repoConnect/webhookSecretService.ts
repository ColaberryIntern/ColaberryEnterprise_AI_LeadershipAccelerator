/**
 * webhookSecretService — one webhook secret per student repo.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * The platform used to install every webhook itself, so one shared
 * `GITHUB_WEBHOOK_SECRET` was never shown to anybody and one secret was fine.
 *
 * Students now register their own hook (Story 000), which means the secret has
 * to be SHOWN to whoever registers it. A single shared secret displayed to
 * thirty students is a secret that lets any one of them forge push events for
 * every other student's repo — and student repos are public by default, so one
 * careless `git add .` would hand that capability to the internet.
 *
 * So: one secret per connection. A leaked secret then costs exactly one repo,
 * and the student who leaked it is the student it belongs to.
 *
 * ── WHAT A LEAKED SECRET ACTUALLY BUYS AN ATTACKER ───────────────────────────
 *
 * Less than it looks, and this is deliberate. Forging a push event gets you a
 * verification pass on ONE repo. It does not get you a verified story, because
 * nothing that decides credit is read from the payload — the progress file and
 * the commits are re-read from GitHub by us. The worst outcome is making us
 * re-read a repo we would have read anyway. The defence in depth is the reason
 * this is a contained problem rather than a credit forgery.
 */
import { randomBytes } from 'crypto';
import GitHubConnection from '../../../models/GitHubConnection';

/**
 * 32 bytes of CSPRNG, hex. GitHub accepts an arbitrary string; this is well
 * past the point where guessing is the attack. Hex rather than base64 so it
 * survives being pasted into a shell, a form field, and a YAML file without
 * anybody having to think about quoting.
 */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * The secret for this project's repo, minting one on first request.
 *
 * IDEMPOTENT, and it has to be: a student who opens the panel twice, or runs
 * Story 000 again, must get the SAME secret. Rotating it silently would leave a
 * correctly-registered hook signing with a secret we no longer accept, and the
 * symptom would be "my pushes stopped working" with nothing in the UI to
 * explain it.
 *
 * Returns null when there is no connected repo — there is nothing to key a
 * secret to, and minting one would be inventing state for a repo that does not
 * exist.
 */
export async function getOrCreateWebhookSecret(projectId: string): Promise<string | null> {
  if (!projectId) return null;

  const connection = await GitHubConnection.findOne({ where: { project_id: projectId } });
  if (!connection) return null;

  const existing = typeof connection.webhook_secret === 'string' ? connection.webhook_secret.trim() : '';
  if (existing) return existing;

  const secret = generateWebhookSecret();
  // Conditional UPDATE, not a blind save: two tabs opening the panel at the same
  // moment must not each mint a secret and have the second overwrite the first,
  // because the student may already have registered a hook with the first.
  // Whoever writes into the NULL wins; everybody else re-reads the winner.
  const [updated] = await GitHubConnection.update(
    { webhook_secret: secret },
    { where: { id: connection.id, webhook_secret: null as unknown as string } },
  );
  if (updated > 0) return secret;

  const fresh = await GitHubConnection.findByPk(connection.id);
  const winner = typeof fresh?.webhook_secret === 'string' ? fresh.webhook_secret.trim() : '';
  return winner || secret;
}

/**
 * The secret a webhook delivery for `owner/repo` should be verified against.
 *
 * Falls back to the shared `GITHUB_WEBHOOK_SECRET` when the connection carries
 * none of its own. That fallback is NOT dead weight: every hook the platform
 * installed through the old OAuth flow was registered with the shared secret and
 * is still signing with it. Dropping the fallback would silently break every one
 * of those repos, which is the kind of migration that looks clean in a diff and
 * takes a cohort offline.
 *
 * Returns null when neither exists, and the caller must treat that as "reject",
 * never as "skip the check".
 */
export async function resolveWebhookSecret(owner: string, repo: string): Promise<string | null> {
  const shared = process.env.GITHUB_WEBHOOK_SECRET || null;
  if (!owner || !repo) return shared;

  try {
    const connection = await GitHubConnection.findOne({
      where: { repo_owner: owner, repo_name: repo },
      attributes: ['id', 'webhook_secret'],
    });
    const perRepo = typeof connection?.webhook_secret === 'string' ? connection.webhook_secret.trim() : '';
    return perRepo || shared;
  } catch {
    // A database blip must not become "verify against nothing". Falling back to
    // the shared secret keeps legacy hooks working; if that is unset too, the
    // caller rejects, which is the correct direction for a signature check.
    return shared;
  }
}
