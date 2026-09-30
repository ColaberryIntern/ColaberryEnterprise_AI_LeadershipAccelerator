/**
 * githubRepoClient — the GitHub read boundary for the connect step.
 *
 * Every call here is bounded (explicit timeout), capped (three attempts, only
 * transient statuses retried) and CLASSIFIED — a caller never sees a raw status
 * code, it sees `RepoNotFound` or `RateLimited` or `Unauthorized`, because those
 * three mean completely different things to the student and only one of them is
 * their problem.
 *
 * The token is read from env at call time and never persisted, never returned,
 * and never logged. `log()` below takes a fixed context shape for that reason:
 * there is no spread of an arbitrary object that could carry a header through.
 *
 * Read-only by construction. Nothing in this file writes to a repo — the connect
 * step establishes a POINTER, and the only writer in the system is repoWriter.
 */
import { RepoConnectError, RepoConnectErrorClass } from './connectErrors';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

export interface RepoFacts {
  owner: string;
  repo: string;
  /** GitHub's canonical casing, which may differ from what the student typed. */
  full_name: string;
  html_url: string;
  private: boolean;
  default_branch: string;
  /** Whether the PLATFORM token can push. Never evidence about the student. */
  platform_can_push: boolean;
  archived: boolean;
  fork: boolean;
}

export interface GitHubReadOptions {
  /** Injected in tests. Production uses global fetch. */
  fetchImpl?: typeof fetch;
  correlationId?: string;
}

function apiBase(): string {
  return process.env.GITHUB_API_URL || 'https://api.github.com';
}

function requireToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token?.trim()) {
    throw new RepoConnectError(
      'ConfigError',
      'The platform cannot reach GitHub right now. This is our side, not yours — tell your instructor.',
    );
  }
  return token;
}

function log(event: string, correlationId: string | undefined, outcome: string, ctx: {
  owner?: string; repo?: string; path?: string; status?: number; error_class?: string; duration_ms?: number;
}): void {
  // Fixed field list, deliberately. A spread here is how a token ends up in a log.
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-repo-connect',
    event,
    correlation_id: correlationId ?? null,
    outcome,
    context: ctx,
  }));
}

/** GitHub says 403 for both "forbidden" and "rate limited"; the headers disambiguate. */
function isRateLimited(status: number, headers: Headers | undefined, body: string): boolean {
  if (status === 429) return true;
  if (status !== 403) return false;
  const remaining = headers?.get?.('x-ratelimit-remaining');
  if (remaining === '0') return true;
  return /rate limit|secondary rate|abuse detection/i.test(body);
}

export interface RawResult {
  status: number;
  ok: boolean;
  body: string;
  headers?: Headers;
}

/**
 * One bounded request. Retries 429/5xx only — a 4xx is terminal and retrying
 * burns quota.
 *
 * The METHOD is a parameter, which is the one crack in this file's read-only
 * posture and is deliberately narrow. Accepting a repository invitation is a
 * PATCH on `/user/repository_invitations/{id}` — an action on the PLATFORM's own
 * account membership, not a write to anybody's repo — and it has to share this
 * function's timeout, retry cap and rate-limit handling rather than grow a
 * second, subtly different copy of them next door. Nothing here may be used to
 * mutate repository CONTENT; that remains repoWriter's sole job.
 */
async function request(
  method: 'GET' | 'PATCH', path: string, token: string, opts: GitHubReadOptions,
): Promise<RawResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${apiBase()}${path}`;
  let last: RawResult = { status: 0, ok: false, body: '' };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const startedAt = Date.now();
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method,
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        log('sbp_connect_github_timeout', opts.correlationId, 'failure', { path, duration_ms: Date.now() - startedAt });
        throw new RepoConnectError(
          'UpstreamTimeout',
          'GitHub did not answer in time. Nothing was changed — try again in a moment.',
        );
      }
      // A network-layer failure is transient often enough to be worth one more go,
      // but never worth an unbounded loop.
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 300 * attempt));
        continue;
      }
      log('sbp_connect_github_network_error', opts.correlationId, 'failure', { path, error_class: 'UpstreamError' });
      throw new RepoConnectError(
        'UpstreamError',
        'The platform could not reach GitHub. Nothing was changed — try again in a moment.',
      );
    } finally {
      clearTimeout(timer);
    }

    const body = await res.text().catch(() => '');
    last = { status: res.status, ok: res.ok, body, headers: res.headers };
    if (res.ok) return last;
    if (res.status !== 429 && res.status < 500 && !isRateLimited(res.status, res.headers, body)) return last;
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 300 * attempt));
  }
  return last;
}

/** The read path, which is everything else in this file. */
const get = (path: string, token: string, opts: GitHubReadOptions): Promise<RawResult> =>
  request('GET', path, token, opts);

/**
 * The same bounded, retry-capped request, for the ONE sibling that needs a verb
 * other than GET. See `request` above for why the exception is drawn here and
 * nowhere wider. Reads the platform token itself so no caller has to hold it.
 */
export function githubApiRequest(
  method: 'GET' | 'PATCH', path: string, opts: GitHubReadOptions = {},
): Promise<RawResult> {
  return request(method, path, requireToken(), opts);
}

/** Exposed so a sibling can tell "rate limited" from "genuinely forbidden". */
export function isRateLimitedResult(result: RawResult): boolean {
  return isRateLimited(result.status, result.headers, result.body);
}

/** Turn a non-ok result into the class that tells the student the right thing. */
function classify(result: RawResult, owner: string, repo: string): RepoConnectError {
  if (isRateLimited(result.status, result.headers, result.body)) {
    const retryAfter = result.headers?.get?.('retry-after');
    return new RepoConnectError(
      'RateLimited',
      `GitHub is rate-limiting the platform right now. Your repo is fine${retryAfter ? ` — try again in about ${retryAfter}s` : ' — try again shortly'}.`,
      { retry_after_seconds: retryAfter ? Number(retryAfter) : null },
    );
  }
  if (result.status === 401) {
    return new RepoConnectError(
      'Unauthorized',
      'The platform\'s GitHub credential was rejected. This is our side, not yours — tell your instructor.',
    );
  }
  if (result.status === 404) {
    // GitHub answers 404 for "does not exist" AND for "private, and you are not
    // on it". Saying only the first would tell a student their real repo is
    // imaginary, so the message covers both and names the fix for each.
    return new RepoConnectError(
      'RepoNotFound',
      `The platform cannot see github.com/${owner}/${repo}. Either the address is wrong, or the repo is private — ` +
        'check the spelling, and if it is private make it public or add the platform as a collaborator.',
      { owner, repo },
    );
  }
  if (result.status === 403) {
    return new RepoConnectError(
      'NoPushAccess',
      `GitHub refused the platform access to github.com/${owner}/${repo}.`,
      { owner, repo },
    );
  }
  return new RepoConnectError(
    'UpstreamError',
    `GitHub returned an unexpected error (${result.status}) for github.com/${owner}/${repo}. Nothing was changed.`,
    { owner, repo, status: result.status },
  );
}

/** Read the repo. Throws a classified error rather than returning a status. */
export async function fetchRepoFacts(owner: string, repo: string, opts: GitHubReadOptions = {}): Promise<RepoFacts> {
  const token = requireToken();
  const result = await get(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token, opts);
  if (!result.ok) {
    const err = classify(result, owner, repo);
    log('sbp_connect_repo_read_failed', opts.correlationId, 'failure', {
      owner, repo, status: result.status, error_class: err.error_class,
    });
    throw err;
  }
  let data: any;
  try {
    data = JSON.parse(result.body);
  } catch {
    throw new RepoConnectError('UpstreamError', 'GitHub returned something the platform could not read. Nothing was changed.');
  }
  log('sbp_connect_repo_read', opts.correlationId, 'success', { owner, repo, status: result.status });
  return {
    owner: data.owner?.login ?? owner,
    repo: data.name ?? repo,
    full_name: data.full_name ?? `${owner}/${repo}`,
    html_url: data.html_url ?? `https://github.com/${owner}/${repo}`,
    private: Boolean(data.private),
    default_branch: data.default_branch || 'main',
    platform_can_push: Boolean(data.permissions?.push),
    archived: Boolean(data.archived),
    fork: Boolean(data.fork),
  };
}

/**
 * Read one file from the default branch. `null` means "not there", which is a
 * normal answer during the connect flow — the student simply has not pushed yet.
 * Every OTHER failure throws, because "we could not read it" and "it is not
 * there" must never collapse into the same answer: one says push, the other says
 * wait.
 */
export async function fetchRepoFile(
  owner: string, repo: string, path: string, opts: GitHubReadOptions = {},
): Promise<string | null> {
  const token = requireToken();
  const result = await get(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,
    token, opts,
  );
  if (result.status === 404) return null;
  if (!result.ok) {
    const err = classify(result, owner, repo);
    log('sbp_connect_file_read_failed', opts.correlationId, 'failure', {
      owner, repo, path, status: result.status, error_class: err.error_class,
    });
    throw err;
  }
  try {
    const data = JSON.parse(result.body);
    if (typeof data?.content !== 'string') return null;
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch {
    throw new RepoConnectError('UpstreamError', `The platform could not read ${path} from your repo. Nothing was changed.`);
  }
}

/**
 * Does this repo have any commits?
 *
 * Load-bearing for the rebind refusal: a project already pointed at a repo with
 * real commits in it must not be silently re-pointed somewhere else, because
 * that orphans work. GitHub answers 409 on the commits endpoint for a repo with
 * no commits at all, which is the cleanest empty-repo signal it gives.
 */
export async function repoHasCommits(owner: string, repo: string, opts: GitHubReadOptions = {}): Promise<boolean> {
  const token = requireToken();
  const result = await get(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=1`, token, opts,
  );
  if (result.status === 409) return false;   // documented "Git Repository is empty"
  if (result.status === 404) return false;   // gone; the caller decides what that means
  if (!result.ok) throw classify(result, owner, repo);
  try {
    return Array.isArray(JSON.parse(result.body)) && JSON.parse(result.body).length > 0;
  } catch {
    // Unreadable is NOT empty. Refusing to guess here is the whole point — a
    // wrong "no commits" would clear the rebind guard on a repo full of work.
    throw new RepoConnectError(
      'UpstreamError',
      'The platform could not tell whether that repo has any commits, so it stopped rather than guess. Try again.',
    );
  }
}

export type { RepoConnectErrorClass };
