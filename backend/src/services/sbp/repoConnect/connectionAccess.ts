/**
 * connectionAccess — what the PLATFORM may do with one `github_connections` row.
 *
 * PURE, and deliberately in a file of its own with no model imports. These
 * predicates are asked by the verification loop, the publisher and the connect
 * panel alike; putting them in `repoConnectService` would drag the whole
 * Sequelize model barrel into every one of those callers, which is exactly what
 * `workspaceRepo.ts` has been dodging with a dynamic import.
 *
 * The row shape is read defensively (`any`), because these are also asked of
 * legacy rows written years apart.
 */

export type ConnectStateName = 'not_connected' | 'awaiting_proof' | 'awaiting_push' | 'connected';
export type ConnectMethod = 'byo' | 'provisioned';

/**
 * What the PLATFORM can do with this repo, as GitHub reported it at connect time.
 *
 * `pull_only` is a legitimate choice, not an error — a student may simply not
 * want a third party committing to their repository, and everything that
 * matters still works: we read their commits, we read their progress file, and
 * every verification and every point they earn is recorded in OUR tables, never
 * in the repo.
 *
 * What stops working is the writing half, and silently is the one way it must
 * not stop. On a pull-only repo the platform never installs the managed block in
 * their CLAUDE.md and never seeds `.colaberry/progress.json`, so their agent has
 * nothing in-repo to copy the contract from and invents a shape the reader
 * rejects. That is the whole of the 2026-08-17 failure, and the fix begins with
 * being able to say which of the two we have.
 */
export type RepoWriteAccess = 'push' | 'pull_only';

/** What we persist under `github_connections.status_json.connect`. */
export interface StoredConnect {
  state?: ConnectStateName;
  method?: ConnectMethod;
  owner?: string;
  repo?: string;
  url?: string;
  private?: boolean;
  default_branch?: string;
  challenge_token?: string;
  challenge_issued_at?: string;
  connected_at?: string;
  /**
   * `permissions.push` as GitHub reported it when the repo was validated.
   *
   * `fetchRepoFacts` has always returned this and nothing read it, which is how
   * a repo the platform holds READ access to came to be recorded as a fully
   * working connection. Absent on every row that predates the capture.
   */
  platform_can_push?: boolean;
}

export function storedConnect(connection: any): StoredConnect {
  const status = (connection?.status_json ?? {}) as Record<string, unknown>;
  return (status.connect ?? {}) as StoredConnect;
}

/**
 * What the platform can do with this repo, or null when it was never recorded.
 *
 * Reading `undefined` as `null` rather than as `pull_only` is the load-bearing
 * half: an unrecorded permission is ignorance, not a refusal, and every
 * connection made before this shipped is in that state.
 *
 * `null` is REPORTED faithfully and ACTED ON conservatively. This function keeps
 * saying "I do not know"; `writeBlockReason` below is where not-knowing stops
 * meaning yes.
 */
export function writeAccessOf(connection: any): RepoWriteAccess | null {
  const canPush = storedConnect(connection).platform_can_push;
  if (typeof canPush !== 'boolean') return null;
  return canPush ? 'push' : 'pull_only';
}

/**
 * The two status keys that record one write-access answer, as one value.
 *
 * `platform_can_push` lives under `status_json.connect`; `provisioned` is a
 * sibling of `connect` at the top of `status_json`. Two keys, two nesting
 * levels, one fact — and they drifted apart exactly as that shape invites.
 * `confirmConnect` derived `provisioned` from `platform_can_push` while
 * `recordWriteAccess` wrote only `platform_can_push`, so the 2026-08-19 audit
 * left ten production rows reading `platform_can_push: false` next to
 * `provisioned: true`: correctly gated for the writer, still "usable" to
 * everything that reads the legacy flag.
 *
 * Returning both together is the fix. A caller cannot record half of this
 * answer, because there is no longer a way to name half of it.
 *
 * PURE.
 */
export function writeAccessPatch(canPush: boolean): { platform_can_push: boolean; provisioned: boolean } {
  return { platform_can_push: canPush, provisioned: canPush };
}

/**
 * WHY the platform may not write here, or null when it may.
 *
 * Split out of `isWritableConnection` so the refusal can be NAMED. The predicate
 * on its own is a boolean that four call sites turn into silence: publish takes
 * the `awaiting_repo` path, the doc refresh returns `no_repo`, and nothing
 * anywhere records which of four quite different situations it was. Nine months
 * of "we never asked GitHub" and "GitHub said no" were indistinguishable in the
 * logs, which is the direct reason the read-only cohort went unnoticed until a
 * human counted the repos by hand.
 *
 * PURE.
 */
export type WriteBlockReason =
  /** No repo is bound to this project — a candidate mid-connect, or day one. */
  | 'no_repo'
  /** GitHub reported `permissions.push: false`. A refusal, and a legitimate choice. */
  | 'pull_only'
  /** Nobody ever asked GitHub. Not a refusal — but not a yes either. See below. */
  | 'access_unknown'
  /** Bound, but the connect flow has not finished; there is no branch to commit onto. */
  | 'not_connected';

export function writeBlockReason(connection: any): WriteBlockReason | null {
  if (!connection?.repo_owner || !connection?.repo_name) return 'no_repo';

  /**
   * UNKNOWN IS NOT YES. This is the inversion, and it is the whole of the bug.
   *
   * `platform_can_push` was captured at exactly one moment — `startConnect` —
   * and every row that predates that capture is missing it. The old reading was
   * "a permission we never recorded stays writable", justified as back-compat:
   * demoting live builds on a guess would break working repos to fix a reporting
   * problem.
   *
   * The justification did not survive contact with the data. On 2026-08-19,
   * eleven of twelve student repositories turned out to be read-only to us, and
   * every one of them had been answering "writable" on an absent key. So the
   * permissive default was not protecting working repos; it was manufacturing
   * doomed commits against repos GitHub was always going to refuse, and doing it
   * invisibly. "We have never checked" had been reading as "yes, go ahead".
   *
   * Refusing here is safe precisely because it is not permanent.
   * `reconcileRepoAccess` runs on EVERY sync (workspaceRoutes, before
   * verification) and records the true answer from GitHub, so an unknown row
   * becomes a known one the first time the student presses Sync. The cost of
   * being wrong is one deferred document refresh on an already-supported path;
   * the cost of the old default was a silent, permanent write failure.
   */
  const access = writeAccessOf(connection);
  if (access === null) return 'access_unknown';
  if (access === 'pull_only') return 'pull_only';

  // No `connect` key at all is a legacy provisioned row — its state was never
  // recorded, and its permission now has been, which is the half that mattered.
  const state = storedConnect(connection).state;
  if (state !== undefined && state !== 'connected') return 'not_connected';

  return null;
}

/**
 * Is this repo ready for the platform to WRITE documents into?
 *
 * A candidate awaiting proof has no repo bound at all; a provisioned repo
 * awaiting its first push has no branch for a commit to sit on. Publishing into
 * either fails at the GitHub boundary, so callers ask here first and take the
 * already-built "no repo yet" path instead.
 *
 * A PULL-ONLY REPO IS THE THIRD CASE, and it was missing. GitHub reports
 * `permissions.push: false` and this predicate said "writable" anyway, so every
 * publish and every sync queued a commit GitHub was always going to refuse. The
 * student's side of that was total silence. Refusing here routes them onto the
 * same `awaiting_repo` path an unbound repo takes — a supported outcome that
 * publishes the plan and skips the documents.
 *
 * AN UNRECORDED PERMISSION IS THE FOURTH, and it is now a refusal too. See
 * `writeBlockReason` for why the back-compat reading did not survive the
 * 2026-08-19 audit.
 *
 * Callers that need to say WHY should ask `writeBlockReason` directly — a bare
 * boolean is how nine months of "never asked" and "GitHub said no" ended up
 * indistinguishable in the logs.
 */
export function isWritableConnection(connection: any): boolean {
  return writeBlockReason(connection) === null;
}
