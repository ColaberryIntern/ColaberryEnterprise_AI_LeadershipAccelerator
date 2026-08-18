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
 */
export function writeAccessOf(connection: any): RepoWriteAccess | null {
  const canPush = storedConnect(connection).platform_can_push;
  if (typeof canPush !== 'boolean') return null;
  return canPush ? 'push' : 'pull_only';
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
 * A permission we never recorded stays writable: demoting live builds on a guess
 * would break working repos to fix a reporting problem.
 */
export function isWritableConnection(connection: any): boolean {
  if (!connection?.repo_owner || !connection?.repo_name) return false;
  if (writeAccessOf(connection) === 'pull_only') return false;
  const state = storedConnect(connection).state;
  // No `connect` key at all is a legacy provisioned row — writable, as it was
  // before this step existed.
  return state === undefined || state === 'connected';
}
