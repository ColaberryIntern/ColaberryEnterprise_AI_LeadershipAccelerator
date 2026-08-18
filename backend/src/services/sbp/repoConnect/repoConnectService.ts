/**
 * repoConnectService — connect a project to the repo the student ALREADY has.
 *
 * ## The decision this implements
 *
 * **Student-owned repos. The platform stores pointers and evidence, never the
 * code.** (Ali Muwwakkil, 2026-08-14.) Recorded here because it will be
 * re-litigated: the cost of hosting student code is not storage, it is CUSTODY —
 * security review, compliance, deletion requests, breach liability, and running
 * a Git host, which is not this business. The deciding case is corporate: an
 * enterprise learner builds against their own systems, with internal names and
 * data models in the requirements, and "your engineers' work lives on our
 * servers" does not survive procurement. Their own GitHub org, under their
 * existing controls, is the only shape that does. It is also pedagogically
 * right — the student keeps a portfolio that outlives the cohort.
 *
 * The rule that makes it survivable: **evidence never depends on the repo.**
 * When a story verifies, the commit sha, the criteria that passed, the
 * timestamp and the XP are written to OUR tables. Delete the repo, revoke our
 * access, rewrite history — the record and the points stay. We lose the ability
 * to verify NEW work and nothing else. The repo is where verification HAPPENS;
 * it is never where the record LIVES.
 *
 * ## Two doors, one outcome
 *
 * **A — bring your own repo (PRIMARY).** They paste a URL. We check it exists,
 * that it is not claimed by another project, and that they can genuinely push to
 * it, then store the pointer. This is the path someone who set up a folder on
 * day one will take, so it leads.
 *
 * **B — provision and adopt (FALLBACK).** For a student with no repo yet: we
 * create an EMPTY private one and hand them `git remote add` / `push -u`, so
 * their existing folder and its whole history moves across untouched. Empty and
 * not auto-initialised is the load-bearing detail — a repo with a README already
 * in it turns their first push into a rejected non-fast-forward, and the fix a
 * student reaches for is `--force`.
 *
 * Door B creates a repo under the platform org, which is exactly the shape the
 * ruling above rejects. It is a knowing compromise, not an oversight: creating a
 * repo inside a student's own account requires a credential belonging to that
 * student (`POST /user/repos` creates under the token's owner), and there is no
 * student OAuth in this system. See docs/REPO_CONNECT_CONTRACT.md §5.
 */
import { Op } from 'sequelize';
import { GitHubConnection } from '../../../models';
import Project from '../../../models/Project';
import { RepoConnectError } from './connectErrors';
import { parseRepoReference, sameRepo, RepoReference } from './repoReference';
import { fetchRepoFacts, fetchRepoFile, repoHasCommits, GitHubReadOptions } from './githubRepoClient';
import {
  CONNECT_FILE_PATH, mintChallengeToken, matchesChallenge, isChallengeExpired,
  renderChallengeFile, connectCommands, adoptCommands, isChallengeToken,
} from './connectChallenge';
import {
  storedConnect, writeAccessOf,
  ConnectStateName, ConnectMethod, RepoWriteAccess, StoredConnect,
} from './connectionAccess';

/**
 * The row-shape predicates live in `connectionAccess` — pure, model-free, and
 * asked by the verification loop and the publisher as well as by this service.
 * Re-exported here so the many existing importers of `isWritableConnection` and
 * the connect types keep working unchanged.
 */
export {
  isWritableConnection, writeAccessOf, storedConnect,
} from './connectionAccess';
export type {
  ConnectStateName, ConnectMethod, RepoWriteAccess, StoredConnect,
} from './connectionAccess';

export interface ConnectChallengeView {
  path: string;
  token: string;
  file_content: string;
  commands: string[];
}

export interface ConnectStateView {
  state: ConnectStateName;
  method: ConnectMethod | null;
  owner: string | null;
  repo: string | null;
  url: string | null;
  private: boolean | null;
  default_branch: string | null;
  /** Present only while proof is outstanding. */
  challenge: ConnectChallengeView | null;
  /** Present only while the provisioned repo is still empty. */
  adopt_commands: string[] | null;
  /**
   * Whether the PLATFORM can commit to this repo. Null for connections made
   * before the permission was recorded. See RepoWriteAccess — the panel renders
   * `pull_only` as a stated consequence, never as a failure.
   */
  write_access: RepoWriteAccess | null;
  /**
   * Whether the last read of this repo worked. A revoked or deleted repo is a
   * NORMAL state, not an error: everything already verified stays verified, and
   * the student is asked to reconnect rather than told something broke.
   */
  access: { ok: boolean; error_class: string | null; checked_at: string | null } | null;
  connected_at: string | null;
}

const NOT_CONNECTED: ConnectStateView = {
  state: 'not_connected', method: null, owner: null, repo: null, url: null,
  private: null, default_branch: null, challenge: null, adopt_commands: null,
  write_access: null, access: null, connected_at: null,
};

// ── guards ───────────────────────────────────────────────────────────────────

/**
 * The caller owns this project, or it does not exist as far as they are
 * concerned. Both answers are identical on purpose: a student must not be able
 * to probe for the existence of somebody else's project.
 */
async function requireOwnedProject(enrollmentId: string, projectId: string): Promise<any> {
  if (!enrollmentId || !projectId) {
    throw new RepoConnectError('ProjectNotFound', 'Project not found.');
  }
  const project = await Project.findByPk(projectId);
  if (!project || String((project as any).enrollment_id) !== String(enrollmentId)) {
    throw new RepoConnectError('ProjectNotFound', 'Project not found.');
  }
  return project;
}

/**
 * Is another PROJECT already pointed at this repo?
 *
 * Only project-keyed rows count. Legacy enrollment-keyed rows carry a NULL
 * project_id (they predate FR-037 and none of them is a real workspace repo),
 * and letting one of those block a student from connecting their own repo would
 * be a bug with no upside.
 */
async function assertNotClaimedElsewhere(ref: RepoReference, projectId: string): Promise<void> {
  const claimant: any = await GitHubConnection.findOne({
    where: {
      repo_owner: { [Op.iLike]: ref.owner },
      repo_name: { [Op.iLike]: ref.repo },
      project_id: { [Op.ne]: projectId, [Op.not]: null } as any,
    },
  });
  if (claimant) {
    throw new RepoConnectError(
      'RepoAlreadyClaimed',
      `github.com/${ref.owner}/${ref.repo} is already the workspace repo for another build. ` +
        'Each build needs its own repo so their docs do not overwrite each other — create a new one, or connect a different repo to this build.',
      { owner: ref.owner, repo: ref.repo },
    );
  }
}

/**
 * Refuse to silently re-point a project that is already on a different repo
 * WITH COMMITS IN IT. Doing that orphans work: the docs, the progress file and
 * every commit the student pushed stay behind on a repo nothing reads any more.
 *
 * Not a permanent no. `confirmReplace` lets them do it deliberately — the rule
 * is that it cannot happen by accident.
 */
async function assertRebindAllowed(
  existing: any, ref: RepoReference, confirmReplace: boolean, opts: GitHubReadOptions,
): Promise<void> {
  const current = { owner: existing?.repo_owner, repo: existing?.repo_name };
  if (!current.owner || !current.repo) return;
  if (sameRepo(current, ref)) return;
  if (confirmReplace) return;

  // An unreadable current repo is NOT proof it is empty. If we cannot tell, we
  // refuse — the cost of a wrong "it was empty" is a student's work stranded.
  let hasWork = true;
  try {
    hasWork = await repoHasCommits(current.owner, current.repo, opts);
  } catch (err) {
    if (!(err instanceof RepoConnectError)) throw err;
    if (err.error_class === 'RepoNotFound') hasWork = false;  // deleted upstream; nothing to orphan
  }
  if (!hasWork) return;

  throw new RepoConnectError(
    'RepoRebindRefused',
    `This build is already connected to github.com/${current.owner}/${current.repo}, and that repo has commits in it. ` +
      `Pointing it at github.com/${ref.owner}/${ref.repo} would leave that work behind. ` +
      'If that is what you want, confirm the switch and the platform will move — nothing is deleted either way.',
    { current_owner: current.owner, current_repo: current.repo, requires: 'confirm_replace' },
  );
}

// ── state ────────────────────────────────────────────────────────────────────

/**
 * Derive the connect view from a connection row. PURE — no I/O — so the panel's
 * state and the workspace view can be built from the same row without a second
 * query, and so the state machine is testable without a database.
 */
export function connectViewFrom(connection: any): ConnectStateView {
  if (!connection) return NOT_CONNECTED;
  const c = storedConnect(connection);
  const status = (connection.status_json ?? {}) as Record<string, any>;
  const bound = Boolean(connection.repo_owner && connection.repo_name);

  // A row can exist with no repo on it yet (a connect in flight), and a legacy
  // provisioned row can exist with no `connect` key at all. Both resolve here
  // rather than at four call sites.
  const stored: ConnectStateName = c.state
    ?? (bound ? 'connected' : 'not_connected');

  const owner = connection.repo_owner || c.owner || null;
  const repo = connection.repo_name || c.repo || null;
  const url = connection.repo_url || c.url || (owner && repo ? `https://github.com/${owner}/${repo}` : null);

  /**
   * An expired challenge is reported as `not_connected`, not as a challenge.
   *
   * The row keeps saying `awaiting_proof` long after the token stopped being
   * accepted, and rendering it faithfully hands a student a block of commands
   * that CANNOT succeed: they run it, push, click "I've pushed", and only then
   * does `confirmConnect` tell them the code expired. A dead token shown as a
   * live one is worse than no token, so the view degrades to the paste-your-repo
   * step, where `startConnect` mints a fresh one.
   *
   * Nothing is written here — this is a read path. `owner`/`repo`/`url` survive
   * the degrade so the panel can offer their repo back to them pre-filled and
   * the recovery stays one click.
   */
  const challengeLive = isChallengeToken(c.challenge_token) && !isChallengeExpired(c.challenge_issued_at);
  const state: ConnectStateName = stored === 'awaiting_proof' && !challengeLive
    ? 'not_connected'
    : stored;

  return {
    state,
    method: c.method ?? (status.provisioned ? 'provisioned' : bound ? 'byo' : null),
    owner, repo, url,
    private: typeof c.private === 'boolean' ? c.private : null,
    default_branch: c.default_branch ?? null,
    // `url` is part of the guard, not just the payload: the commands name the
    // remote, and a block that says `git remote add origin undefined` is worse
    // than no block. `startConnect` always records the URL, so falling through
    // to the paste-your-repo view is a degradation nobody should ever see.
    challenge: state === 'awaiting_proof' && challengeLive && url
      ? {
        path: CONNECT_FILE_PATH,
        token: c.challenge_token!,
        file_content: renderChallengeFile(c.challenge_token!),
        commands: connectCommands(c.challenge_token!, url),
      }
      : null,
    adopt_commands: state === 'awaiting_push' && url ? adoptCommands(url) : null,
    write_access: writeAccessOf(connection),
    access: status.access
      ? {
        ok: Boolean(status.access.ok),
        error_class: status.access.error_class ?? null,
        checked_at: status.access.checked_at ?? null,
      }
      : null,
    connected_at: c.connected_at ?? null,
  };
}

async function loadConnection(projectId: string): Promise<any | null> {
  return GitHubConnection.findOne({ where: { project_id: projectId } });
}

/** Create the row if it is not there yet. A pending connect gets a row with NO repo on it. */
async function upsertConnection(enrollmentId: string, projectId: string): Promise<any> {
  const [connection] = await GitHubConnection.findOrCreate({
    where: { project_id: projectId },
    defaults: {
      project_id: projectId,
      enrollment_id: enrollmentId,
      access_token_encrypted: '',   // student-owned repos: no token of theirs is ever stored
      status_json: {},
    } as any,
  });
  return connection;
}

function writeConnect(connection: any, patch: StoredConnect): void {
  const status = { ...(connection.status_json ?? {}) };
  status.connect = { ...(status.connect ?? {}), ...patch };
  connection.status_json = status;
}

/** Read-only current state. Never throws for "not connected" — that is day one. */
export async function getConnectState(enrollmentId: string, projectId: string): Promise<ConnectStateView> {
  await requireOwnedProject(enrollmentId, projectId);
  return connectViewFrom(await loadConnection(projectId));
}

// ── door A: bring your own repo ──────────────────────────────────────────────

/**
 * Step 1 of connecting an existing repo: validate it and issue the push proof.
 *
 * Idempotent. Calling it twice for the same repo returns the SAME challenge
 * token rather than minting a new one — a student who refreshes the page mid-
 * flow must not find the command they already ran no longer counts.
 */
export async function startConnect(
  enrollmentId: string,
  projectId: string,
  reference: string,
  opts: { confirmReplace?: boolean } & GitHubReadOptions = {},
): Promise<ConnectStateView> {
  await requireOwnedProject(enrollmentId, projectId);
  const ref = parseRepoReference(reference);     // throws InvalidRepoReference before any network call

  const existing = await loadConnection(projectId);

  // Already connected to exactly this repo — nothing to do, and say so as success.
  if (existing && sameRepo({ owner: existing.repo_owner, repo: existing.repo_name }, ref)
      && storedConnect(existing).state === 'connected') {
    return connectViewFrom(existing);
  }

  await assertNotClaimedElsewhere(ref, projectId);
  await assertRebindAllowed(existing, ref, Boolean(opts.confirmReplace), opts);

  const facts = await fetchRepoFacts(ref.owner, ref.repo, opts);

  if (facts.archived) {
    throw new RepoConnectError(
      'NoPushAccess',
      `github.com/${facts.full_name} is archived, so nobody can push to it — including you. Unarchive it in GitHub settings, then connect it again.`,
      { owner: facts.owner, repo: facts.repo },
    );
  }

  const connection = existing ?? await upsertConnection(enrollmentId, projectId);
  const prior = storedConnect(connection);

  // Reuse a live challenge for the same repo; mint a new one otherwise.
  const reuse = prior.state === 'awaiting_proof'
    && isChallengeToken(prior.challenge_token)
    && !isChallengeExpired(prior.challenge_issued_at)
    && sameRepo({ owner: prior.owner, repo: prior.repo }, ref);

  writeConnect(connection, {
    state: 'awaiting_proof',
    method: 'byo',
    owner: facts.owner,
    repo: facts.repo,
    url: facts.html_url,
    private: facts.private,
    default_branch: facts.default_branch,
    // Recorded at the ONE moment the platform reads this repo's own metadata.
    // Everything downstream — whether we install the contract, whether a
    // rejection may say "Sync" — reads it from here rather than re-asking GitHub.
    platform_can_push: facts.platform_can_push,
    challenge_token: reuse ? prior.challenge_token : mintChallengeToken(),
    challenge_issued_at: reuse ? prior.challenge_issued_at : new Date().toISOString(),
  });
  await connection.save();

  return connectViewFrom(connection);
}

/**
 * Step 2: read the proof file and, if it matches, make this repo the project's
 * workspace repo.
 *
 * This is the only place a BYO repo is bound. Everything before it is a
 * candidate, which is why `repo_owner`/`repo_name` stay empty until here — a
 * half-finished connect must never look like a live repo to the rest of the
 * platform.
 */
export async function confirmConnect(
  enrollmentId: string, projectId: string, opts: GitHubReadOptions = {},
): Promise<ConnectStateView> {
  await requireOwnedProject(enrollmentId, projectId);
  const connection = await loadConnection(projectId);
  const c = storedConnect(connection);

  // Confirming an already-connected project is a no-op success, not an error:
  // a double-click must not read as a failure.
  if (connection && c.state === 'connected' && connection.repo_owner && connection.repo_name) {
    return connectViewFrom(connection);
  }

  if (!connection || c.state !== 'awaiting_proof' || !c.owner || !c.repo || !isChallengeToken(c.challenge_token)) {
    throw new RepoConnectError(
      'NoPendingConnect',
      'There is no repo waiting to be connected for this build. Paste your repo address to start.',
    );
  }
  if (isChallengeExpired(c.challenge_issued_at)) {
    throw new RepoConnectError(
      'ChallengeNotFound',
      'That connection code has expired. Start the connect again to get a fresh one — nothing was changed.',
    );
  }

  const ref: RepoReference = { owner: c.owner, repo: c.repo, url: c.url ?? `https://github.com/${c.owner}/${c.repo}` };

  // Re-check the claim at bind time, not only at start time. Two students
  // connecting the same repo concurrently would both pass the first check.
  await assertNotClaimedElsewhere(ref, projectId);

  const content = await fetchRepoFile(ref.owner, ref.repo, CONNECT_FILE_PATH, opts);
  if (content === null) {
    throw new RepoConnectError(
      'ChallengeNotFound',
      `The platform can see github.com/${ref.owner}/${ref.repo} but ${CONNECT_FILE_PATH} is not on its default branch yet. ` +
        'Run the commands shown, then push — and check you pushed the branch GitHub shows first on the repo page.',
      { path: CONNECT_FILE_PATH, owner: ref.owner, repo: ref.repo },
    );
  }
  if (!matchesChallenge(content, c.challenge_token!)) {
    throw new RepoConnectError(
      'ChallengeMismatch',
      `${CONNECT_FILE_PATH} is in the repo but does not carry this build's connection code. ` +
        'If you have two builds, check you used the code from this one — copy it again and push.',
      { path: CONNECT_FILE_PATH },
    );
  }

  connection.repo_owner = ref.owner;
  connection.repo_name = ref.repo;
  connection.repo_url = ref.url;
  const status = { ...(connection.status_json ?? {}) };
  // `provisioned` is the legacy marker the rest of the platform reads to mean
  // "there is a usable repo here" — usable meaning the platform can WRITE it.
  //
  // This was an unconditional `true`, which is how a repo the platform holds
  // read access to came to be recorded, and reported, as a working connection it
  // did not have. Four of the five live workspace connections were in that state
  // on 2026-08-17. `state: 'connected'` stays true either way, because reading
  // genuinely works and downgrading it would send the student back to the
  // paste-your-repo step for a repo that is correctly connected.
  //
  // Unknown (a legacy row with no permission recorded) keeps the old `true`.
  status.provisioned = c.platform_can_push !== false;
  status.access = { ok: true, error_class: null, checked_at: new Date().toISOString() };
  connection.status_json = status;
  writeConnect(connection, {
    state: 'connected',
    method: 'byo',
    challenge_token: undefined,        // spent; keeping it would invite reuse
    challenge_issued_at: undefined,
    connected_at: new Date().toISOString(),
  });
  await connection.save();

  return connectViewFrom(connection);
}

// ── door B: provision, then adopt ────────────────────────────────────────────

/**
 * Create an empty private repo and hand back the commands that point the
 * student's EXISTING folder at it. Their history and files survive because
 * nothing is pushed by us and the far end starts empty.
 *
 * The repo is not usable for platform writes until they push — `awaiting_push`
 * says so, and `markPushObserved` flips it the first time a sync finds commits.
 */
export async function adoptProvisionedRepo(
  enrollmentId: string, projectId: string, githubLogin: string,
): Promise<ConnectStateView> {
  await requireOwnedProject(enrollmentId, projectId);

  const existing = await loadConnection(projectId);
  const priorState = storedConnect(existing).state;
  if (existing?.repo_owner && existing?.repo_name && priorState === 'connected') {
    // Already has a live repo. Provisioning a second one behind their back is
    // exactly the "two homes for one project" failure this step exists to end.
    throw new RepoConnectError(
      'RepoRebindRefused',
      `This build is already connected to github.com/${existing.repo_owner}/${existing.repo_name}. ` +
        'Disconnect it first if you want the platform to create a new one.',
      { current_owner: existing.repo_owner, current_repo: existing.repo_name },
    );
  }

  const { provisionWorkspaceRepo } = await import('../../studentWorkspaceService');
  await provisionWorkspaceRepo(enrollmentId, projectId, githubLogin, { seedInitialCommit: false });

  const connection = await loadConnection(projectId);
  if (!connection) {
    throw new RepoConnectError('UpstreamError', 'The repo was created but the platform could not record it. Try again.');
  }
  writeConnect(connection, {
    state: 'awaiting_push',
    method: 'provisioned',
    owner: connection.repo_owner,
    repo: connection.repo_name,
    url: connection.repo_url,
    private: true,
    connected_at: undefined,
  });
  await connection.save();

  return connectViewFrom(connection);
}

/**
 * The student pushed. Called from the sync path, which is the first moment the
 * platform can observe commits on a repo it provisioned.
 *
 * Idempotent and narrow: it only ever moves `awaiting_push` → `connected`, so
 * it can never resurrect a repo the student deliberately left behind.
 */
export async function markPushObserved(projectId: string): Promise<void> {
  const connection = await loadConnection(projectId);
  if (!connection) return;
  if (storedConnect(connection).state !== 'awaiting_push') return;
  writeConnect(connection, { state: 'connected', connected_at: new Date().toISOString() });
  await connection.save();
}

export { CONNECT_FILE_PATH };
