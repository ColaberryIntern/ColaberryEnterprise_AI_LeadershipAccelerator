/**
 * repoInvitations — accept the collaborator invitations students send us.
 *
 * ── THE GAP THIS CLOSES ──────────────────────────────────────────────────────
 *
 * Adding a collaborator on GitHub does not grant anything. It creates a
 * REPOSITORY INVITATION that the invitee must accept, and until they do the
 * would-be collaborator has exactly the access they had before. Nothing in this
 * platform ever accepted one, so every student who followed the instruction to
 * "add ColaberryIntern as a collaborator" got a grant that did nothing at all.
 *
 * The cost was not cosmetic. With no push access the platform never wrote
 * `plan.json`, `progress.json` or `manifest.json` into a student repo — while
 * the STORY-000 prompt told them those files "ship beside it as files the
 * platform commits". Students hand-authored twenty-kilobyte files that were
 * supposed to arrive on their own, because a one-call acceptance step was
 * missing.
 *
 * Two cases proved it. Quincy Ninying granted access on 2026-08-18 and the
 * invitation sat unaccepted until a human accepted it by hand — the first time
 * the platform held `push` on any student repo, ever. `Samrawit26/jobflow_Agent`
 * was invited on 2026-07-21 and expired unaccepted; that access is gone and only
 * a fresh invitation from the student can restore it.
 *
 * ── AN EXPIRED INVITATION MUST NEVER BE PATCHED ──────────────────────────────
 *
 * This is the one rule in the file that is not obvious and cost us the only
 * surviving record of Samrawit's grant to learn.
 *
 * `PATCH /user/repository_invitations/{id}` on an EXPIRED invitation returns
 * **204 No Content** — the same success status as a real acceptance. It grants
 * nothing, and it removes the invitation from the queue. So the 204 is a lie in
 * both directions: it reports success that did not happen, and it destroys the
 * evidence that the student ever invited us, which is the thing we need in order
 * to go back and ask them to re-invite.
 *
 * Therefore: expired invitations are SKIPPED and REPORTED, never accepted. And
 * acceptance of a live one is never trusted on the strength of its status code —
 * we re-read the repository and let `permissions.push` settle it.
 *
 * ── WHY ACCEPTANCE IS SAFE TO DO AUTOMATICALLY ───────────────────────────────
 *
 * Accepting is not us taking anything. The student performed a deliberate act on
 * their own repository to give the platform access; the invitation is the offer
 * and this is the handshake they are already waiting on. We accept ONLY
 * invitations that exist, we never solicit one, and the student can revoke at
 * any time — at which point the next reconcile records the loss truthfully.
 */
import { githubApiRequest, isRateLimitedResult, GitHubReadOptions } from './githubRepoClient';

/** One invitation as GitHub reports it, reduced to what we act on. */
export interface PendingInvitation {
  id: number;
  owner: string;
  repo: string;
  /** GitHub's canonical `owner/repo`, which may differ in case from ours. */
  full_name: string;
  /** `read` | `triage` | `write` | `maintain` | `admin`, as GitHub words it. */
  permissions: string;
  created_at: string | null;
  /**
   * GitHub's own verdict, not ours. Invitations lapse after seven days and the
   * API says so on the record; we never compute this from `created_at`, because
   * a policy change on their side would silently make our arithmetic wrong.
   */
  expired: boolean;
}

/**
 * What happened for ONE repo.
 *
 * `accepted_no_push` is separated from `accepted` because a student can invite
 * us as a `read` collaborator, which accepts cleanly and still leaves the
 * platform unable to commit. Collapsing the two would recreate the original bug
 * one level up: a success that does not do the thing.
 */
export type InvitationOutcome =
  | 'accepted'
  | 'accepted_no_push'
  | 'none'
  | 'expired'
  | 'failed';

export interface InvitationResult {
  outcome: InvitationOutcome;
  invitation_id: number | null;
  full_name: string | null;
  /** Only meaningful for the two `accepted*` outcomes. */
  can_push: boolean;
  /** Set when `outcome` is `failed`, for the log and nothing else. */
  error_class: string | null;
}

const nothing = (over: Partial<InvitationResult> = {}): InvitationResult => ({
  outcome: 'none', invitation_id: null, full_name: null, can_push: false, error_class: null, ...over,
});

function log(event: string, correlationId: string | undefined, outcome: string, ctx: {
  invitation_id?: number; full_name?: string; permissions?: string;
  status?: number; error_class?: string; can_push?: boolean; count?: number;
}): void {
  // Fixed field list, as in githubRepoClient: a spread here is how a token ends
  // up in a log line.
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-repo-invitations',
    event,
    correlation_id: correlationId ?? null,
    outcome,
    context: ctx,
  }));
}

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * Every invitation currently sitting in the platform account's queue, expired
 * ones included — the caller needs to see those in order to report them.
 *
 * Returns `[]` rather than throwing on any upstream failure. This runs inside
 * connect and inside sync, and neither may be turned into an error by a
 * housekeeping call that did not answer.
 */
export async function listPendingInvitations(opts: GitHubReadOptions = {}): Promise<PendingInvitation[]> {
  let result;
  try {
    // 100 is GitHub's page maximum. A cohort produces tens, not hundreds, and a
    // second page would mean something has gone very wrong upstream — better to
    // handle the realistic case simply than to paginate a queue that should be
    // draining continuously.
    result = await githubApiRequest('GET', '/user/repository_invitations?per_page=100', opts);
  } catch (err: any) {
    log('sbp_invitations_list_failed', opts.correlationId, 'failure', {
      error_class: err?.error_class ?? 'UpstreamError',
    });
    return [];
  }
  if (!result.ok) {
    log('sbp_invitations_list_failed', opts.correlationId, 'failure', {
      status: result.status,
      error_class: isRateLimitedResult(result) ? 'RateLimited' : 'UpstreamError',
    });
    return [];
  }
  try {
    const raw = JSON.parse(result.body);
    if (!Array.isArray(raw)) return [];
    return raw.map((i: any): PendingInvitation => ({
      id: Number(i?.id),
      owner: i?.repository?.owner?.login ?? '',
      repo: i?.repository?.name ?? '',
      full_name: i?.repository?.full_name ?? '',
      permissions: String(i?.permissions ?? 'read'),
      created_at: i?.created_at ?? null,
      expired: Boolean(i?.expired),
    })).filter((i) => Number.isFinite(i.id) && i.full_name);
  } catch {
    log('sbp_invitations_list_unreadable', opts.correlationId, 'failure', { error_class: 'UpstreamError' });
    return [];
  }
}

/**
 * Accept one invitation by id.
 *
 * Returns whether GitHub took it. NOT whether we gained push — the 204 says
 * nothing trustworthy about that (see the file header), so every caller
 * verifies against the repository itself afterwards.
 */
async function patchAccept(id: number, opts: GitHubReadOptions): Promise<{ ok: boolean; status: number }> {
  try {
    const result = await githubApiRequest('PATCH', `/user/repository_invitations/${id}`, opts);
    return { ok: result.ok, status: result.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Ask the repo itself what the platform may now do. The only answer we trust. */
async function readCanPush(owner: string, repo: string, opts: GitHubReadOptions): Promise<boolean> {
  try {
    const { fetchRepoFacts } = await import('./githubRepoClient');
    const facts = await fetchRepoFacts(owner, repo, opts);
    return facts.platform_can_push;
  } catch {
    // Unreadable is not "no". The caller records nothing on a false answer it
    // cannot stand behind, so returning false here would be a guess with
    // consequences — it is reported as such by the `failed` outcome instead.
    return false;
  }
}

/**
 * Accept the pending invitation for ONE repo, if there is one.
 *
 * Idempotent by construction: with no invitation in the queue this is a read and
 * a `none`, so it is safe on every connect and every sync forever. The common
 * case — a student who never invited us, or whose invitation we took weeks ago —
 * costs exactly one GET.
 */
export async function acceptInvitationFor(
  owner: string, repo: string, opts: GitHubReadOptions = {},
): Promise<InvitationResult> {
  const wanted = `${owner}/${repo}`;
  const pending = await listPendingInvitations(opts);
  const match = pending.find((i) => sameName(i.full_name, wanted));
  if (!match) return nothing();

  if (match.expired) {
    // Reported, never patched. Accepting would consume the record and grant
    // nothing, leaving nobody able to see that this student ever tried.
    log('sbp_invitation_expired', opts.correlationId, 'partial', {
      invitation_id: match.id, full_name: match.full_name, permissions: match.permissions,
    });
    return nothing({ outcome: 'expired', invitation_id: match.id, full_name: match.full_name });
  }

  const accepted = await patchAccept(match.id, opts);
  if (!accepted.ok) {
    log('sbp_invitation_accept_failed', opts.correlationId, 'failure', {
      invitation_id: match.id, full_name: match.full_name, status: accepted.status,
      error_class: 'UpstreamError',
    });
    return nothing({
      outcome: 'failed', invitation_id: match.id, full_name: match.full_name, error_class: 'UpstreamError',
    });
  }

  const canPush = await readCanPush(match.owner || owner, match.repo || repo, opts);
  log('sbp_invitation_accepted', opts.correlationId, 'success', {
    invitation_id: match.id, full_name: match.full_name, permissions: match.permissions, can_push: canPush,
  });
  return {
    outcome: canPush ? 'accepted' : 'accepted_no_push',
    invitation_id: match.id,
    full_name: match.full_name,
    can_push: canPush,
    error_class: null,
  };
}

export interface SweepResult {
  /** Every live invitation we took, with what it actually bought us. */
  accepted: InvitationResult[];
  /**
   * Invitations GitHub has already expired. Unrecoverable without the student
   * sending a new one, which is why they are surfaced rather than swallowed.
   */
  expired: PendingInvitation[];
  failed: InvitationResult[];
}

/**
 * Drain the whole queue.
 *
 * The per-repo call above covers a student who invites us before connecting or
 * before their next sync. This covers everyone else: an invitation that arrives
 * for a repo no project points at yet, or for a student who simply never syncs.
 * Run it on a schedule or by hand; it is safe either way, and an empty queue
 * costs one request.
 */
export async function sweepPendingInvitations(opts: GitHubReadOptions = {}): Promise<SweepResult> {
  const pending = await listPendingInvitations(opts);
  const out: SweepResult = { accepted: [], expired: [], failed: [] };
  log('sbp_invitations_sweep_started', opts.correlationId, 'success', { count: pending.length });

  for (const invitation of pending) {
    if (invitation.expired) { out.expired.push(invitation); continue; }
    const result = await acceptInvitationFor(invitation.owner, invitation.repo, opts);
    if (result.outcome === 'accepted' || result.outcome === 'accepted_no_push') out.accepted.push(result);
    else if (result.outcome === 'expired') out.expired.push(invitation);
    else if (result.outcome === 'failed') out.failed.push(result);
  }

  log('sbp_invitations_sweep_completed', opts.correlationId, 'success', {
    count: out.accepted.length,
  });
  return out;
}
