/**
 * writeFailureDiagnosis — tell "you may not write here" apart from "this is gone".
 *
 * ── THE PROBLEM, MEASURED IN PRODUCTION 2026-08-21 ──────────────────────────
 *
 * A backfill across 13 student repos succeeded on 1 and failed on 12. Every
 * failure was the same thing, and it was reported wrongly:
 *
 *   GET  /repos/<owner>/<repo>            -> 200   (we can read it)
 *   POST /repos/<owner>/<repo>/git/trees  -> 404   (we may not write to it)
 *
 * GitHub answers an unauthorised WRITE with 404, not 403 — it hides the resource
 * rather than admitting the permission gap. `repoWriter.isPermissionRefusal`
 * only inspects 403s, so this fell through to `UpstreamError`, which the sync
 * reported to the student as "we'll retry on your next upload".
 *
 * That message is worse than no message. The condition never resolves on its
 * own: the platform needs push access, which only the student can grant. Twelve
 * people would have uploaded indefinitely, told each time that a retry was
 * coming, while the one action that would fix it went unmentioned.
 *
 * ── WHY A 404 ALONE IS NOT ENOUGH TO CONCLUDE "PERMISSIONS" ─────────────────
 *
 * A write can also 404 because the repo was renamed, deleted, or the connection
 * records the wrong owner. Those need a completely different instruction, and
 * telling someone to check permissions on a repo that no longer exists sends
 * them round in circles.
 *
 * The two are separable with evidence rather than a guess: re-read the repo
 * after the failed write.
 *
 *   read OK  + write 404  ->  permissions. The repo is there; we may not write.
 *   read 404 + write 404  ->  gone. Renamed, deleted, or wrong owner recorded.
 *
 * PURE: `diagnoseWriteFailure` decides from facts the caller gathers, so the
 * rule is testable from literals. The probe that gathers them lives beside it
 * and is the only part that touches the network.
 */

export type WriteFailureCause =
  /** The repo exists and we can read it, but we may not write. Student action. */
  | 'no_push_access'
  /** The repo is not reachable at all — renamed, deleted, or wrong owner. */
  | 'repo_missing'
  /** Genuinely upstream: 5xx, throttling, timeouts. Retrying is meaningful. */
  | 'transient';

export interface WriteFailureFacts {
  /** The error_class repoWriter raised. */
  errorClass: string;
  /** HTTP status parsed out of the failure, when one was present. */
  status: number | null;
  /** Did a follow-up read of the repo succeed? Null when not probed. */
  repoReadable: boolean | null;
}

/** Pull the HTTP status out of repoWriter's message, which embeds it as `(404)`. */
export function statusFromMessage(message: string | null | undefined): number | null {
  const m = /\((\d{3})\)/.exec(message ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * PURE. Decide what actually went wrong.
 *
 * `NoPushAccess` from repoWriter is believed without a probe — it already
 * inspected a 403 body and concluded refusal, and second-guessing it here would
 * duplicate that judgement in two places.
 */
export function diagnoseWriteFailure(facts: WriteFailureFacts): WriteFailureCause {
  if (facts.errorClass === 'NoPushAccess') return 'no_push_access';

  // Timeouts and 5xx are the cases where "we'll retry" is a true statement.
  if (facts.errorClass === 'UpstreamTimeout') return 'transient';
  if (facts.status !== null && facts.status >= 500) return 'transient';
  if (facts.status === 429) return 'transient';

  if (facts.status === 404) {
    // The probe is what separates the two. Without it, do NOT guess
    // "permissions" — a wrong instruction about a deleted repo wastes the
    // student's time on something they cannot fix.
    if (facts.repoReadable === true) return 'no_push_access';
    if (facts.repoReadable === false) return 'repo_missing';
    return 'transient';
  }

  return 'transient';
}

/** Student-facing text. Says what happened and, crucially, what to do about it. */
export function messageForCause(cause: WriteFailureCause): string {
  switch (cause) {
    case 'no_push_access':
      return 'Your artifact is saved. It is not in GitHub yet because Colaberry does not have permission to write to your repository — reconnect it, or accept the pending invitation, and everything syncs automatically.';
    case 'repo_missing':
      return 'Your artifact is saved. We could not find the repository you connected — it may have been renamed or deleted. Reconnect it and everything syncs automatically.';
    case 'transient':
    default:
      return 'Your artifact is saved. The GitHub copy did not go through this time; we will retry on your next upload.';
  }
}

/**
 * Probe whether the repo is readable, to separate the two 404 cases.
 *
 * Never throws — a failed probe returns null, which `diagnoseWriteFailure`
 * treats as "not established" and falls back to the retry message. Being unsure
 * is an acceptable outcome; asserting the wrong cause is not.
 */
export async function probeRepoReadable(
  owner: string,
  repo: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean | null> {
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (res.status === 200) return true;
    if (res.status === 404) return false;
    return null;
  } catch {
    return null;
  }
}
