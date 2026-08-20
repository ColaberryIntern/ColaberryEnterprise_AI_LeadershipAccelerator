/**
 * repoProgressReader — the I/O half of the verification loop.
 *
 * Reads two things out of a student's workspace repo:
 *   1. `.colaberry/progress.json`, raw. Parsing is somebody else's job.
 *   2. Recent commits, with the FULL message and a real changed-file count.
 *
 * A NEW EXTERNAL BOUNDARY, so it carries the full set: an explicit timeout on
 * every request, capped retries on transient failures only, and a distinct
 * `error_class` per failure so "GitHub is rate-limiting us" never gets reported
 * to a student as "you have not done the work".
 *
 * WHY IT DOES NOT REUSE studentWorkspaceService's commit read: that one keeps
 * `message.split('\n')[0]` — the subject line only — and no file counts. The
 * `Story:` trailer lives below the subject, and "the commit changed a file" is
 * half the completion rule. Both facts are destroyed by the existing summary,
 * so this reader fetches its own.
 */
import { CommitFact } from './verifyDecision';
import { PROGRESS_FILE_PATH } from './progressContract';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
/** Commits per page. GitHub's own maximum for the commits list. */
export const COMMIT_WINDOW = 100;
/**
 * How many pages of history we will walk.
 *
 * One page used to be the whole window, so a student past their 100th commit
 * silently lost every commit before it — the story they finished in week two
 * stopped being provable in week six, and the verdict moved BACKWARDS through no
 * fault of theirs. Five pages is 500 commits, comfortably past the busiest repo
 * on the platform (the largest today is 20), and the walk stops early on the
 * first short page so a small repo still costs exactly one call.
 *
 * Bounded rather than unbounded on purpose: a fork of a large upstream would
 * otherwise turn one Sync into hundreds of API calls against a shared rate limit.
 * `window_truncated` still reports honestly when we stopped early.
 */
export const MAX_COMMIT_PAGES = 5;
/**
 * How many non-default branches we will probe when the default branch shows no
 * evidence at all. Bounded because a repo with 50 dependabot branches must not
 * turn a "you have not started yet" verdict into 50 API calls.
 */
export const MAX_BRANCH_PROBES = 10;
/**
 * Cap on per-commit detail fetches. The list endpoint gives us messages but no
 * file counts, so each candidate costs one more call. Only commits whose
 * message already names a story are worth the call, and even then the count is
 * bounded — a student mid-rebase must not turn one Sync into 100 API calls.
 */
export const MAX_DETAIL_FETCHES = 40;

export type RepoReadErrorClass =
  | 'ConfigError'
  | 'RepoNotFound'
  | 'Unauthorized'
  | 'RateLimited'
  | 'UpstreamTimeout'
  | 'UpstreamError';

export class RepoReadError extends Error {
  constructor(
    public readonly error_class: RepoReadErrorClass,
    message: string,
    /** Seconds until the rate limit resets, when GitHub told us. */
    public readonly retry_after_s?: number | null,
  ) {
    super(message);
    this.name = 'RepoReadError';
  }
}

export interface RepoReadTarget {
  owner: string;
  repo: string;
  branch?: string | null;
}

export interface VerificationInputs {
  /** Raw file contents, or null when the repo does not have it. */
  progressRaw: string | null;
  commits: CommitFact[];
  /** How many commits we looked at — the window the verdict was reached inside. */
  commits_scanned: number;
  /** True when the window was full, i.e. older commits exist that we did not read. */
  window_truncated: boolean;
  /**
   * Every blob path in the default branch's tree, or NULL when the tree could
   * not be read.
   *
   * The null is load-bearing and is not the same as an empty set. An empty set
   * means "we looked and the repo has no files"; null means "we did not find
   * out", and the decision must enforce nothing on the strength of it. See
   * criterionPaths.RepoTreeContext.
   */
  treePaths: Set<string> | null;
  /** True when GitHub told us it truncated the tree — see readTreePaths. */
  tree_truncated: boolean;
  /**
   * The branch this verdict was reached on, or null when the caller did not name
   * one and GitHub's own default was used.
   *
   * Recorded because "which branch did you read?" was previously unanswerable
   * from the logs, and it is the first question worth asking when a student says
   * the portal cannot see work they have certainly done. Null is reported
   * faithfully rather than guessed at — naming a branch we did not pin would be
   * worse than admitting we did not pin one.
   */
  branch_read: string | null;
  /**
   * Non-default branches carrying commits that name a story, when the default
   * branch carried none. Empty on the normal path — this is only populated when
   * the student would otherwise be told they have done nothing.
   *
   * NOT evidence. The verdict is still reached on the default branch alone (see
   * `readVerificationInputs`); this exists so the student can be told WHERE their
   * work is instead of being told it does not exist.
   */
  unmerged_branches: string[];
}

/**
 * A repo big enough for GitHub to truncate the recursive tree response.
 *
 * GitHub caps `git/trees?recursive=1` at 100k entries / 7MB and sets
 * `truncated: true` rather than paginating. A truncated tree is a tree we
 * cannot prove a path is ABSENT from, so it is discarded entirely rather than
 * used partially — "the file is missing" drawn from an incomplete listing is
 * exactly the false negative that would fail a student for our own limit.
 */
const treeIsUsable = (truncated: boolean): boolean => !truncated;

export interface ReadOptions {
  correlationId?: string;
  /** Injected in tests. Production uses global fetch. */
  fetchImpl?: typeof fetch;
  /** Story ids worth fetching detail for. Everything else is skipped unread. */
  storyIds?: string[];
}

function apiBase(): string {
  return process.env.GITHUB_API_URL || 'https://api.github.com';
}

function requireToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token?.trim()) {
    throw new RepoReadError('ConfigError', 'GITHUB_TOKEN is not configured — cannot read a student repo');
  }
  return token;
}

function log(event: string, correlationId: string | undefined, outcome: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-verification-reader',
    event,
    correlation_id: correlationId ?? null,
    outcome,
    // Never spread caller context here — the token must not reach a log line.
    context: ctx,
  }));
}

interface GhResponse { status: number; body: unknown; headers: Headers | null; }

/**
 * One bounded GitHub call. Retries 429 and 5xx up to MAX_RETRIES with linear
 * backoff; every other status is terminal, because retrying a request GitHub
 * already refused just burns the rate limit that refused it.
 *
 * Returns 404 as a value rather than throwing — "the file is not there" is a
 * normal answer to a question this module asks, not a failure.
 */
async function gh(path: string, token: string, fetchImpl: typeof fetch): Promise<GhResponse> {
  const url = `${apiBase()}${path}`;
  let lastStatus = 0;
  let lastBody = '';
  let retryAfter: number | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e?.name === 'AbortError') {
        throw new RepoReadError('UpstreamTimeout', `GitHub read timed out after ${REQUEST_TIMEOUT_MS}ms: ${path}`);
      }
      throw new RepoReadError('UpstreamError', `GitHub read failed (${e?.message ?? 'network error'}): ${path}`);
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) {
      return { status: res.status, body: res.status === 204 ? {} : await res.json(), headers: res.headers };
    }
    if (res.status === 404) return { status: 404, body: null, headers: res.headers };

    lastStatus = res.status;
    lastBody = await res.text().catch(() => '');
    retryAfter = readRetryAfter(res.headers);

    const transient = res.status === 429 || res.status >= 500;
    if (!transient) break;
    if (attempt < MAX_RETRIES) await sleep(300 * attempt);
  }

  if (lastStatus === 401 || lastStatus === 403) {
    // 403 with a rate-limit marker is a rate limit, not a permission problem.
    // Telling a student "you do not have access to your own repo" when the real
    // answer is "try again in four minutes" sends them to support for nothing.
    const rateLimited = /rate limit|secondary rate/i.test(lastBody) || retryAfter !== null;
    throw rateLimited
      ? new RepoReadError('RateLimited', `GitHub rate limit hit reading ${path}`, retryAfter)
      : new RepoReadError('Unauthorized', `GitHub refused the read (${lastStatus}): ${path}`);
  }
  if (lastStatus === 429) {
    throw new RepoReadError('RateLimited', `GitHub rate limit hit reading ${path}`, retryAfter);
  }
  throw new RepoReadError('UpstreamError', `GitHub ${path} failed (${lastStatus}): ${lastBody.slice(0, 300)}`);
}

function readRetryAfter(headers: Headers | null): number | null {
  const raw = headers?.get?.('retry-after');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Read everything the decision needs. Never throws on a missing progress file
 * (that is a legitimate state the decision handles); throws a classified
 * RepoReadError on anything else, so the caller can tell a rate limit from a
 * deleted repo.
 */
export async function readVerificationInputs(
  target: RepoReadTarget,
  opts: ReadOptions = {},
): Promise<VerificationInputs> {
  const token = requireToken();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const { owner, repo } = target;
  const started = Date.now();

  /**
   * WHICH BRANCH. Named by the caller, never assumed to be `main`.
   *
   * `buildVerificationService` passes the `default_branch` the connect flow
   * recorded on the connection row, so the branch is stated rather than left to
   * GitHub to guess — which is what makes it loggable, and "which branch did you
   * read?" is the first question worth asking when a student says the portal
   * cannot see work they have certainly done.
   *
   * DELIBERATELY NOT resolved with an extra `GET /repos/{owner}/{repo}` call.
   * The row already holds this fact; spending a request per sync to re-derive it
   * would add an API call to every verification on the platform to learn
   * something we wrote down at connect time.
   *
   * DELIBERATELY NOT defaulted to `main` when unrecorded.
   * `Pamy77/colaberry-architect-workspace` has a default branch of `master`, so
   * a hardcoded `main` would have broken a live student. Unrecorded falls back to
   * the pre-existing behaviour — omit the ref and let GitHub use the repo default
   * — which is correct, just not self-describing. `branch_read` is null there,
   * and says so honestly rather than naming a branch we did not actually pin.
   */
  const branch = target.branch?.trim() || null;

  const ref = branch ? `?ref=${encodeURIComponent(branch)}` : '';
  const contentsPath = `/repos/${owner}/${repo}/contents/${PROGRESS_FILE_PATH.split('/').map(encodeURIComponent).join('/')}${ref}`;
  const fileRes = await gh(contentsPath, token, fetchImpl);
  const progressRaw = decodeContents(fileRes.body);

  const { commits: rawCommits, truncated } = await listCommits(owner, repo, branch, token, fetchImpl);

  // Cheap filter first: only commits whose message already mentions one of the
  // plan's story ids can possibly be evidence, and only those are worth a
  // second call. With no story ids supplied we fetch nothing and return counts
  // of zero — the decision then finds no evidence, which is the honest answer
  // for a caller that did not say what it was looking for.
  const ids = opts.storyIds ?? [];
  const candidates = rawCommits
    .filter((c) => mentionsAnyStory(String(c?.commit?.message ?? ''), ids))
    .slice(0, MAX_DETAIL_FETCHES);

  /**
   * NOTHING ON THE DEFAULT BRANCH. Before telling a student they have done no
   * work, find out whether they have simply done it somewhere else.
   *
   * WHY THE VERDICT IS STILL DEFAULT-BRANCH ONLY. Verifying "any branch" is the
   * more forgiving rule and the wrong one: it lets an abandoned experiment
   * satisfy a story permanently, it awards Builder XP for work that never
   * reached the mainline, and it makes the verdict depend on which branch
   * happened to be scanned first. Story completion should mean the work is in the
   * branch the project actually ships from.
   *
   * So this does not change the verdict. It changes the MESSAGE: instead of
   * "none of your criteria are passing", the student can be told their commits
   * are sitting on `feature/x` and need merging. That is the difference between
   * a dead end and an instruction.
   *
   * Costs nothing on the happy path — only reached when the default branch
   * yielded no candidate at all.
   */
  const unmerged_branches = candidates.length === 0 && ids.length > 0 && branch !== null
    ? await findStoryBranches(owner, repo, branch, ids, token, fetchImpl)
    : [];

  const commits: CommitFact[] = [];
  for (const c of candidates) {
    const sha = String(c?.sha ?? '');
    if (!sha) continue;
    const detail = await gh(`/repos/${owner}/${repo}/commits/${encodeURIComponent(sha)}`, token, fetchImpl);
    if (detail.status === 404 || !detail.body) continue;
    const d = detail.body as Record<string, any>;
    commits.push({
      sha,
      message: String(d?.commit?.message ?? c?.commit?.message ?? ''),
      // `files` is the authority; `stats` is a fallback for a commit GitHub
      // truncated (it caps the files array at 300). Either way a commit that
      // changed nothing must not read as one that changed something.
      changed_files: Array.isArray(d?.files)
        ? d.files.length
        : Number(d?.stats?.total ?? 0) > 0 ? 1 : 0,
      committed_at: d?.commit?.author?.date ?? d?.commit?.committer?.date ?? null,
      author: d?.commit?.author?.name ?? null,
    });
  }

  const tree = await readTreePaths(target, token, fetchImpl, opts.correlationId);

  log('sbp_verification_repo_read', opts.correlationId, 'success', {
    owner, repo, branch,
    duration_ms: Date.now() - started,
    progress_present: progressRaw !== null,
    commits_scanned: rawCommits.length,
    detail_fetched: commits.length,
    tree_paths: tree.paths?.size ?? null,
    tree_truncated: tree.truncated,
    window_truncated: truncated,
    unmerged_branches,
  });

  return {
    progressRaw,
    commits,
    commits_scanned: rawCommits.length,
    window_truncated: truncated,
    treePaths: tree.paths,
    tree_truncated: tree.truncated,
    branch_read: branch,
    unmerged_branches,
  };
}

/**
 * The repo's file listing, for the criterion path check.
 *
 * ONE extra API call on a run that already makes between two and forty-two, so
 * the cost is real but marginal. It is made last, after everything the verdict
 * strictly needs, for the reason below.
 *
 * ── IT NEVER THROWS, AND THAT IS THE WHOLE DESIGN ───────────────────────────
 *
 * Every other read in this module is load-bearing: without the progress file or
 * the commits there is no verdict to reach, so a failure there is correctly
 * fatal and correctly surfaced to the student. The tree is different. It can
 * only ever WITHHOLD credit — a criterion passes without it and may fail with it
 * — so a failure to read it must degrade to "we did not check", never to "the
 * file is missing". A rate limit, a timeout or an empty repo would otherwise
 * start failing criteria for students whose repos are fine.
 *
 * So the whole call is wrapped: any error, any status, returns
 * `{paths: null}` and the decision enforces nothing. The failure is logged at
 * `partial` because it is worth knowing the check is not running, but it does
 * not reach the student and does not fail the sync.
 *
 * Only blobs are collected. A tree entry of type `tree` is a directory, and a
 * criterion naming a directory is not something `repoPathsNamedIn` produces
 * anyway (it requires a file extension).
 */
async function readTreePaths(
  target: RepoReadTarget,
  token: string,
  fetchImpl: typeof fetch,
  correlationId?: string,
): Promise<{ paths: Set<string> | null; truncated: boolean }> {
  const { owner, repo } = target;
  const ref = target.branch?.trim() || 'HEAD';
  try {
    const res = await gh(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
      token,
      fetchImpl,
    );
    // 404 is a real answer for a repo with no commits on the branch yet. It is
    // NOT "the repo has no files we should credit" — there is nothing to compare
    // against, so it degrades like any other unread tree.
    if (res.status === 404 || !res.body) return { paths: null, truncated: false };

    const body = res.body as { tree?: unknown; truncated?: unknown };
    const truncated = body.truncated === true;
    if (!treeIsUsable(truncated)) {
      log('sbp_verification_tree_truncated', correlationId, 'partial', {
        owner, repo, note: 'tree too large to prove absence; path checks skipped for this run',
      });
      return { paths: null, truncated: true };
    }

    const entries = Array.isArray(body.tree) ? (body.tree as Array<Record<string, unknown>>) : [];
    const paths = new Set<string>();
    for (const e of entries) {
      if (e?.type !== 'blob') continue;
      const p = typeof e.path === 'string' ? e.path : '';
      if (p) paths.add(p);
    }
    return { paths, truncated: false };
  } catch (err: unknown) {
    log('sbp_verification_tree_read_failed', correlationId, 'partial', {
      owner, repo,
      error_class: err instanceof RepoReadError ? err.error_class : 'UpstreamError',
      note: 'path checks skipped for this run; no criterion was failed for a file we could not look for',
    });
    return { paths: null, truncated: false };
  }
}

/** Does this commit message name one of the plan's stories? */
function mentionsAnyStory(message: string, ids: string[]): boolean {
  return ids.some((id) =>
    new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(message));
}

/**
 * Walk up to `MAX_COMMIT_PAGES` pages of history, oldest page last.
 *
 * `truncated` means "there is more we did not read", which is now only true at
 * the page cap rather than at the first 100 commits.
 *
 * A null branch omits `sha` entirely, which is what the reader did before any of
 * this and leaves GitHub to use the repo default.
 */
async function listCommits(
  owner: string, repo: string, branch: string | null, token: string, fetchImpl: typeof fetch,
): Promise<{ commits: Array<Record<string, any>>; truncated: boolean }> {
  const all: Array<Record<string, any>> = [];

  for (let page = 1; page <= MAX_COMMIT_PAGES; page++) {
    const path = `/repos/${owner}/${repo}/commits`
      + `?per_page=${COMMIT_WINDOW}&page=${page}`
      + (branch ? `&sha=${encodeURIComponent(branch)}` : '');
    const res = await gh(path, token, fetchImpl);
    if (res.status === 404) {
      // Page 1 means the repo (or branch) is not there. A later page 404 is just
      // the end of history on some GitHub responses, and is not an error.
      if (page === 1) {
        throw new RepoReadError('RepoNotFound', `GitHub has no repo ${owner}/${repo}, or the platform token cannot see it`);
      }
      return { commits: all, truncated: false };
    }
    const batch = Array.isArray(res.body) ? (res.body as Array<Record<string, any>>) : [];
    all.push(...batch);
    // A short page is the end of history — stop rather than paying for a page we
    // already know is empty.
    if (batch.length < COMMIT_WINDOW) return { commits: all, truncated: false };
  }

  return { commits: all, truncated: true };
}

/**
 * Which non-default branches carry commits naming one of these stories.
 *
 * Deliberately shallow: one page of commits per branch, a bounded number of
 * branches, and no per-commit detail fetch. This answers "where is their work",
 * not "does it count" — the second question is only ever asked of the default
 * branch.
 */
async function findStoryBranches(
  owner: string, repo: string, defaultBranch: string, ids: string[],
  token: string, fetchImpl: typeof fetch,
): Promise<string[]> {
  try {
    const res = await gh(`/repos/${owner}/${repo}/branches?per_page=100`, token, fetchImpl);
    const branches = (Array.isArray(res.body) ? res.body : [])
      .map((b: Record<string, any>) => String(b?.name ?? ''))
      .filter((n: string) => n && n !== defaultBranch)
      .slice(0, MAX_BRANCH_PROBES);

    const found: string[] = [];
    for (const name of branches) {
      const commits = await gh(
        `/repos/${owner}/${repo}/commits?per_page=${COMMIT_WINDOW}&sha=${encodeURIComponent(name)}`,
        token, fetchImpl,
      );
      const list = Array.isArray(commits.body) ? (commits.body as Array<Record<string, any>>) : [];
      if (list.some((c) => mentionsAnyStory(String(c?.commit?.message ?? ''), ids))) found.push(name);
    }
    return found;
  } catch {
    // Best-effort diagnosis only. Failing to enumerate branches must never turn a
    // readable build into a failed verification.
    return [];
  }
}

/** GitHub returns file contents base64-encoded (with newlines inside the payload). */
function decodeContents(body: unknown): string | null {
  const content = (body as { content?: unknown } | null)?.content;
  if (typeof content !== 'string') return null;
  return Buffer.from(content.replace(/\s/g, ''), 'base64').toString('utf8');
}
