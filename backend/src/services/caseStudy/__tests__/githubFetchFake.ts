/**
 * githubFetchFake — the one GitHub double the Case Study analyzer suites use.
 *
 * NOT A TEST FILE (jest's `testMatch` is `__tests__/**\/*.test.ts`, so this is
 * never collected as a suite). It lives here rather than being copied into both
 * analyzer suites because a fetch double that drifts between two files is how
 * two suites end up quietly asserting different things about the same seam.
 *
 * IT IS AN `AnalyzeRepositoryInput.fetchImpl`, NOT A PATCHED GLOBAL. That is the
 * whole point: `githubRepoClient.ts` takes `opts.fetchImpl ?? fetch`, so a test
 * that injects here exercises the real client — its 15s abort, its three capped
 * attempts, its 403 disambiguation — while never touching `globalThis.fetch`.
 * The analyzer suites install a THROWING global fetch and assert it was never
 * called, which is what turns "we injected a seam" into a proof.
 *
 * Every reply is a literal. Nothing here reads a clock, a file or a network.
 */

/** The token every analyzer suite exports to GitHub and to nowhere else. */
export const SENTINEL_TOKEN = 'ghp_SENTINEL_DO_NOT_LOG_abc123';

export interface FakeReply {
  readonly status: number;
  readonly body?: string;
  readonly headers?: Record<string, string>;
  /** Thrown instead of answered — the abort and network-layer paths. */
  readonly throws?: Error;
}

/** A reply, or a function of the attempt number so retries can be observed. */
export type ReplyFor = FakeReply | ((attempt: number) => FakeReply);

export interface FakeRoutes {
  /** `GET /repos/{owner}/{repo}` */
  readonly repo?: ReplyFor;
  /** `GET /repos/{owner}/{repo}/commits?per_page=1` */
  readonly commits?: ReplyFor;
  /** `GET /repos/{owner}/{repo}/languages` */
  readonly languages?: ReplyFor;
  /** `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1` */
  readonly tree?: ReplyFor;
  /** `GET /repos/{owner}/{repo}/contents/{path}` — keyed by the decoded path. */
  readonly file?: (path: string) => FakeReply;
}

export interface GitHubFake {
  /** Hand this to `AnalyzeRepositoryInput.fetchImpl`. */
  readonly impl: typeof fetch;
  /** Every URL requested, in order. */
  readonly urls: string[];
  /** Decoded paths requested from the contents endpoint, in order. */
  readonly filePaths: string[];
  /** Every `Authorization` header the client sent. */
  readonly authorizations: string[];
  countMatching(fragment: string): number;
}

/* ─────────────────────────────────────────────────────────── reply builders ─ */

export function json(value: unknown): FakeReply {
  return { status: 200, body: JSON.stringify(value) };
}

/** The contents endpoint's shape: base64 in a `content` field. */
export function fileReply(text: string): FakeReply {
  return { status: 200, body: JSON.stringify({ content: Buffer.from(text, 'utf8').toString('base64') }) };
}

export function notFound(): FakeReply {
  return { status: 404, body: '{"message":"Not Found"}' };
}

/** What `fetch` rejects with when the client's own AbortController fires. */
export function abortError(): Error {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
}

/** A plausible `GET /repos/:owner/:repo` payload. Every field overridable. */
export function repoPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'atlas',
    full_name: 'acme/atlas',
    owner: { login: 'acme' },
    description: 'Claims triage copilot',
    homepage: 'https://atlas.example.com',
    private: false,
    default_branch: 'main',
    topics: ['rag', 'ai'],
    language: 'TypeScript',
    created_at: '2026-01-02T03:04:05Z',
    updated_at: '2026-02-03T04:05:06Z',
    pushed_at: '2026-03-04T05:06:07Z',
    license: { key: 'mit', name: 'MIT License', spdx_id: 'MIT' },
    fork: false,
    archived: false,
    ...overrides,
  };
}

export interface TreeEntry { path: string; type?: string; size?: number }

export function treePayload(entries: readonly TreeEntry[], truncated = false): Record<string, unknown> {
  return { sha: 'tree-sha', tree: entries, truncated };
}

/* ────────────────────────────────────────────────────────────── the double ── */

const DEFAULT_REPO = json(repoPayload());
const DEFAULT_COMMITS = json([{ sha: 'c0ffee0000000000000000000000000000000000' }]);
const DEFAULT_LANGUAGES = json({ TypeScript: 90_000, Python: 12_000 });
const DEFAULT_TREE = json(treePayload([]));

function makeResponse(reply: FakeReply): Response {
  const lower: Record<string, string> = {};
  for (const [key, value] of Object.entries(reply.headers ?? {})) lower[key.toLowerCase()] = value;
  return {
    status: reply.status,
    ok: reply.status >= 200 && reply.status < 300,
    headers: { get: (name: string) => lower[String(name).toLowerCase()] ?? null } as unknown as Headers,
    text: async () => reply.body ?? '',
  } as unknown as Response;
}

export function makeGitHubFake(routes: FakeRoutes = {}): GitHubFake {
  const urls: string[] = [];
  const filePaths: string[] = [];
  const authorizations: string[] = [];
  const attempts: Record<string, number> = {};

  function resolve(reply: ReplyFor, kind: string): FakeReply {
    attempts[kind] = (attempts[kind] ?? 0) + 1;
    return typeof reply === 'function' ? reply(attempts[kind]) : reply;
  }

  const impl = (async (input: unknown, init?: { headers?: Record<string, string> }) => {
    const url = String(input);
    urls.push(url);
    authorizations.push(init?.headers?.Authorization ?? '');

    let reply: FakeReply;
    if (url.includes('/contents/')) {
      const raw = url.slice(url.indexOf('/contents/') + '/contents/'.length);
      const decoded = raw.split('/').map((segment) => decodeURIComponent(segment)).join('/');
      filePaths.push(decoded);
      reply = routes.file ? routes.file(decoded) : notFound();
    } else if (url.includes('/git/trees/')) {
      reply = resolve(routes.tree ?? DEFAULT_TREE, 'tree');
    } else if (url.includes('/commits')) {
      reply = resolve(routes.commits ?? DEFAULT_COMMITS, 'commits');
    } else if (url.endsWith('/languages')) {
      reply = resolve(routes.languages ?? DEFAULT_LANGUAGES, 'languages');
    } else {
      reply = resolve(routes.repo ?? DEFAULT_REPO, 'repo');
    }

    if (reply.throws) throw reply.throws;
    return makeResponse(reply);
  }) as unknown as typeof fetch;

  return {
    impl,
    urls,
    filePaths,
    authorizations,
    countMatching: (fragment: string) => urls.filter((u) => u.includes(fragment)).length,
  };
}
