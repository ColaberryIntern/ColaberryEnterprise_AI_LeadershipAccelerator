/**
 * sweepGithubInvitations — drain the platform's repository-invitation queue.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM THE SYNC PATH ────────────────────────────
 *
 * `reconcileRepoAccess` takes the invitation for ONE project's repo whenever a
 * student syncs, which covers everybody who is actively building. It cannot
 * cover two cases:
 *
 *   - An invitation for a repo no project points at yet. A student who adds the
 *     platform as a collaborator BEFORE connecting their repo has no project row
 *     for the sync path to find.
 *   - A student who invites us and then does not sync for a week. Invitations
 *     lapse after seven days, and an expired one cannot be recovered by anybody
 *     — only a fresh invitation from the student restores the access.
 *
 * Run it on a schedule, or by hand when somebody says "I added you and nothing
 * happened". It is safe either way: an empty queue costs one request, and taking
 * an invitation that is already taken is not possible — accepted invitations
 * leave the queue.
 *
 * ── IT REPORTS EXPIRED ONES RATHER THAN TOUCHING THEM ────────────────────────
 *
 * See repoInvitations for the full reasoning. In short: GitHub answers a PATCH
 * on an expired invitation with 204 while granting nothing and deleting the
 * record, so "accepting" one destroys the only evidence that the student ever
 * invited us. Those are printed for a human to act on — the only fix is to ask
 * the student to send a new invitation.
 *
 * Usage:  ts-node src/scripts/sweepGithubInvitations.ts
 *         node dist/scripts/sweepGithubInvitations.js
 */
import { randomUUID } from 'crypto';
import { sweepPendingInvitations } from '../services/sbp/repoConnect/repoInvitations';

async function main(): Promise<void> {
  const correlationId = randomUUID();
  const out = await sweepPendingInvitations({ correlationId });

  const lines: string[] = [];
  lines.push(`accepted: ${out.accepted.length}`);
  for (const a of out.accepted) {
    // `accepted_no_push` is called out by name: a read-only grant accepts
    // perfectly cleanly and still leaves the platform unable to commit, which
    // looks like success and is not.
    lines.push(`  ${a.full_name} — ${a.can_push ? 'push granted' : 'READ ONLY, cannot commit'}`);
  }
  lines.push(`expired (UNRECOVERABLE — ask the student to re-invite): ${out.expired.length}`);
  for (const e of out.expired) {
    lines.push(`  ${e.full_name} — invited ${e.created_at ?? 'unknown'}`);
  }
  lines.push(`failed: ${out.failed.length}`);
  for (const f of out.failed) {
    lines.push(`  ${f.full_name} — ${f.error_class}`);
  }

  console.log(lines.join('\n'));

  // A non-zero exit when something needs a HUMAN, so a scheduled run is not
  // silently green while a student sits without access. Expired invitations
  // qualify; nothing else here does.
  if (out.expired.length > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error(`sweep failed: ${err?.message ?? err}`);
  process.exitCode = 1;
});
