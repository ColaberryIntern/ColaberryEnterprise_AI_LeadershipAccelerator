/**
 * githubPushVerification — turn a GitHub push into a story verification pass.
 *
 * This is the trigger the manual "Sync from GitHub" button was always standing
 * in for. The student pushes; the platform re-reads their repo and re-decides
 * which stories are done, without anybody pressing anything.
 *
 * ── WHAT THIS MODULE WILL NOT DO ─────────────────────────────────────────────
 *
 * IT DOES NOT TRUST THE PAYLOAD. The webhook body is used for exactly three
 * things, all of them routing decisions: which repo this concerns, which commits
 * came in (only to answer "were they all ours?"), and the delivery id. Every
 * fact that decides whether a student gets credit — the contents of
 * `.colaberry/progress.json`, the real commit messages, how many files each
 * commit touched — is re-read from GitHub by `verifyBuildFromRepo`, authenticated
 * as the platform.
 *
 * That is deliberate and worth stating plainly: anyone who could forge a payload
 * past the HMAC check still could not hand us a fake commit, because we never
 * read commits out of what they sent. The signature protects the endpoint; this
 * rule protects the award.
 *
 * ── THE THREE GUARDS ─────────────────────────────────────────────────────────
 *
 * 1. BOT COMMITS. The pipeline writes CLAUDE.md, docs/ and .colaberry/ into the
 *    student's repo, committed with `BOT_COMMIT_PREFIX`. Those pushes arrive
 *    here like any other. A push whose commits are ENTIRELY ours is ignored — it
 *    is our own echo, and acting on it is how a sync loop starts. A push that
 *    mixes our commits with the student's is NOT ignored: their work in it is
 *    real, and dropping it because we happened to write in the same push would
 *    lose a genuine completion.
 *
 * 2. DELIVERY ID. GitHub retries deliveries it thinks failed, including ones we
 *    handled correctly but answered slowly. `github_webhook_deliveries` has
 *    `delivery_id` as its primary key, so the insert either wins or collides,
 *    and a collision means "already handled" — no second verification pass, no
 *    second set of GitHub reads.
 *
 * 3. THE AWARD ITSELF. Untouched by any of the above, and that is the point:
 *    `verifyBuildFromRepo` is idempotent three ways over (first-write-wins
 *    latch, transition-only evidence, unique key on `<story>@<sha>`). The guards
 *    here save work; they are not what makes double-awarding impossible. If both
 *    guards failed simultaneously the student would still be paid exactly once.
 */
import { randomUUID } from 'crypto';
import { sequelize } from '../../../config/database';
import { QueryTypes } from 'sequelize';
import GitHubConnection from '../../../models/GitHubConnection';
import { BOT_COMMIT_PREFIX } from '../repoWriter';

export type PushVerificationOutcome =
  | 'verified'          // a verification pass ran
  | 'duplicate'         // this delivery id was already handled
  | 'bot_only'          // every commit in the push was ours
  | 'no_project'        // repo is not bound to a project we know
  | 'no_commits'        // nothing to act on (branch delete, tag, ping)
  | 'failed';           // the pass threw; logged, never surfaced to GitHub

export interface PushCommit {
  message?: unknown;
}

export interface HandlePushInput {
  /** GitHub's X-GitHub-Delivery. Stable across retries of the same delivery. */
  deliveryId: string;
  event: string;
  owner: string;
  repo: string;
  commits: PushCommit[];
  correlationId?: string;
}

export interface HandlePushResult {
  outcome: PushVerificationOutcome;
  project_id: string | null;
}

function log(event: string, outcome: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-verification',
    event,
    outcome,
    context: ctx,
  }));
}

/**
 * Is every commit in this push one of ours?
 *
 * An EMPTY commit list is not "all ours" — it is "nothing to judge", handled by
 * the caller as `no_commits`. Answering true here would silently swallow every
 * push whose payload omitted commits, which is a much larger class of event than
 * this filter is meant to catch.
 */
export function isBotOnlyPush(commits: PushCommit[]): boolean {
  if (!Array.isArray(commits) || commits.length === 0) return false;
  return commits.every((c) => {
    const message = typeof c?.message === 'string' ? c.message : '';
    return message.trimStart().startsWith(BOT_COMMIT_PREFIX);
  });
}

/**
 * Claim this delivery, or discover somebody already did.
 *
 * `ON CONFLICT DO NOTHING` + `RETURNING` makes the claim atomic: two concurrent
 * redeliveries race on the primary key and exactly one gets a row back. A
 * SELECT-then-INSERT would leave a window where both saw "not handled".
 *
 * Fail-OPEN on a database error. If the ledger is unavailable we would rather
 * run a verification pass twice than drop a student's push on the floor — and
 * the award layer makes a duplicate pass harmless, which is precisely why fail-
 * open is the safe direction here rather than a gamble.
 */
async function claimDelivery(input: HandlePushInput, projectId: string | null): Promise<boolean> {
  try {
    const rows = await sequelize.query<{ delivery_id: string }>(
      `INSERT INTO github_webhook_deliveries (delivery_id, event, repo_full_name, project_id, outcome)
       VALUES ($deliveryId, $event, $repoFullName, $projectId, 'claimed')
       ON CONFLICT (delivery_id) DO NOTHING
       RETURNING delivery_id`,
      {
        bind: {
          deliveryId: input.deliveryId,
          event: input.event,
          repoFullName: `${input.owner}/${input.repo}`,
          projectId,
        },
        type: QueryTypes.SELECT,
      },
    );
    return rows.length > 0;
  } catch (err: unknown) {
    log('github_push_delivery_ledger_unavailable', 'partial', {
      delivery_id: input.deliveryId,
      error_class: (err as { name?: string })?.name ?? 'Error',
      message: (err as { message?: string })?.message,
    });
    return true;
  }
}

/** Record how the claimed delivery ended. Best-effort: this is diagnostics, not control flow. */
async function closeDelivery(deliveryId: string, outcome: PushVerificationOutcome): Promise<void> {
  try {
    await sequelize.query(
      `UPDATE github_webhook_deliveries SET outcome = $outcome WHERE delivery_id = $deliveryId`,
      { bind: { outcome, deliveryId } },
    );
  } catch {
    // A missing diagnostic line is not worth failing a delivery over.
  }
}

/**
 * Handle one push.
 *
 * NEVER THROWS. The caller has already answered GitHub 200 by the time this
 * runs, and an exception escaping into an unawaited promise would be an
 * unhandled rejection rather than anything anyone sees. Every failure is
 * classified and logged instead.
 *
 * ORDERING IS A NON-ISSUE BY CONSTRUCTION. Two pushes seconds apart can arrive
 * out of order; each run re-reads the CURRENT repo and re-derives from scratch,
 * so the later run sees at least as much as the earlier one, and verification
 * never revokes. Out-of-order deliveries converge on the same answer rather than
 * needing a sequencer.
 */
export async function handlePushForVerification(input: HandlePushInput): Promise<HandlePushResult> {
  const correlationId = input.correlationId ?? randomUUID();
  const base = { delivery_id: input.deliveryId, repo: `${input.owner}/${input.repo}`, correlation_id: correlationId };

  if (!input.deliveryId) {
    // Every genuine GitHub delivery carries this header. Its absence means
    // something is talking to us that is not GitHub, and we cannot dedupe it.
    log('github_push_missing_delivery_id', 'partial', base);
    return { outcome: 'no_commits', project_id: null };
  }

  if (!Array.isArray(input.commits) || input.commits.length === 0) {
    return { outcome: 'no_commits', project_id: null };
  }

  if (isBotOnlyPush(input.commits)) {
    log('github_push_bot_only_ignored', 'success', { ...base, commits: input.commits.length });
    return { outcome: 'bot_only', project_id: null };
  }

  // Repo → project, read from OUR table rather than from the payload.
  const connection = await GitHubConnection.findOne({
    where: { repo_owner: input.owner, repo_name: input.repo },
  });
  const projectId = connection?.project_id ? String(connection.project_id) : null;
  if (!projectId) {
    // Common and not an error: a repo bound to a legacy enrollment-keyed row, or
    // a student repo with a webhook but no build plan behind it.
    return { outcome: 'no_project', project_id: null };
  }

  const claimed = await claimDelivery(input, projectId);
  if (!claimed) {
    log('github_push_duplicate_delivery', 'success', { ...base, project_id: projectId });
    return { outcome: 'duplicate', project_id: projectId };
  }

  try {
    const { verifyBuildFromRepo } = await import('./buildVerificationService');
    const summary = await verifyBuildFromRepo(projectId, { correlationId });
    log('github_push_verification_ran', summary.ok ? 'success' : 'partial', {
      ...base,
      project_id: projectId,
      ok: summary.ok,
      error_class: summary.error_class,
      verified: summary.rollup.stories_verified,
      newly_verified: summary.rollup.newly_verified,
      xp_awarded: summary.rollup.xp_awarded,
    });
    await closeDelivery(input.deliveryId, 'verified');
    return { outcome: 'verified', project_id: projectId };
  } catch (err: unknown) {
    // verifyBuildFromRepo classifies every EXPECTED state as a returned result,
    // so reaching this branch means a genuine defect (a database failure
    // mid-write, say). Logged loudly, never rethrown: GitHub already has its
    // 200, and a 500 here would only make it retry a delivery that was fine.
    log('github_push_verification_failed', 'failure', {
      ...base,
      project_id: projectId,
      error_class: (err as { name?: string })?.name ?? 'Error',
      message: (err as { message?: string })?.message,
    });
    await closeDelivery(input.deliveryId, 'failed');
    return { outcome: 'failed', project_id: projectId };
  }
}
